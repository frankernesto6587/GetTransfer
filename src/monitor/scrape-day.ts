import { Page } from 'playwright';
import { TransferenciaEntrada, parseOperacionRow } from '../scraper/parser';

const ACCOUNT = '0659834001469612';

export interface BankCheckResult {
  loggedIn: boolean;
  online: boolean;
  fechaContable: string | null;
}

export async function loginAndCheck(page: Page): Promise<BankCheckResult> {
  const url = process.env.BANDEC_URL || 'http://www.bandec.cu/VirtualBANDEC/';
  const username = process.env.BANDEC_USERNAME!;
  const password = process.env.BANDEC_PASSWORD!;
  const pin = process.env.BANDEC_PIN!;

  const { getMatrixValue } = await import('../scraper/matrix');

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  await page.fill('input[name="Usuario"]', username);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Aceptar"), input[type="submit"]', { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});

  if (page.url().includes('Matriz')) {
    const extractPinPositions = (pinStr: string, pregpin: string): string => {
      const positions = pregpin.split('-').map((p) => parseInt(p.trim(), 10));
      return positions.map(pos => pinStr[pos - 1] || '').join('');
    };

    const pregpin = await page.$eval('#pregpin', (el) => (el as HTMLInputElement).value).catch(() => '');
    const pregpos = await page.$eval('#pregpos', (el) => (el as HTMLInputElement).value).catch(() => '');

    const pinValue = extractPinPositions(pin, pregpin);
    const coordCleaned = pregpos.replace(/[.\s-]/g, '').toUpperCase();
    const matrixValue = getMatrixValue(coordCleaned) || '';

    await page.fill('#pin', pinValue);
    await page.fill('#matriz', matrixValue);
    await page.click('button:has-text("Aceptar"), input[type="submit"]', { timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  }

  return readBankStatus(page);
}

/** Reload and check status without logging in (reuses existing session) */
export async function reloadAndCheck(page: Page): Promise<BankCheckResult> {
  const url = process.env.BANDEC_URL || 'http://www.bandec.cu/VirtualBANDEC/';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  return readBankStatus(page);
}

/** Read bank status from the current page */
function readBankStatus(page: Page): Promise<BankCheckResult> {
  return (async () => {
    const loggedIn = !page.url().includes('Autenticacion') && !page.url().includes('Matriz');
    if (!loggedIn) {
      return { loggedIn: false, online: false, fechaContable: null };
    }

    const fechaContableText = await page.$eval(
      'td:has-text("Fecha Contable en Banco")',
      (el) => el.textContent || ''
    ).catch(() => '');

    if (fechaContableText.includes('Sin Conexión')) {
      return { loggedIn: true, online: false, fechaContable: null };
    }

    const fechaContable = fechaContableText
      .replace(/.*Fecha Contable en Banco:\s*/, '')
      .replace(/\s*\|.*/, '')
      .trim() || null;

    return { loggedIn: true, online: true, fechaContable };
  })();
}

async function fillAndSubmitForm(page: Page, dateStr: string): Promise<void> {
  await page.evaluate((account) => {
    const combo = (window as any).jQuery('#cuenta').data('kendoComboBox');
    if (combo) {
      combo.value(account);
      combo.trigger('change');
    }
  }, ACCOUNT);
  await page.waitForTimeout(300);

  await page.evaluate((dateVal) => {
    const picker = (window as any).jQuery('#start').data('kendoDatePicker');
    if (picker) {
      const parts = dateVal.split('/');
      picker.value(new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])));
      picker.trigger('change');
    }
  }, dateStr);
  await page.waitForTimeout(300);

  await page.check('#creditos');
  await page.click('button:has-text("Aceptar"), input[type="submit"]', { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
}

function extractRows(page: Page): Promise<string[][]> {
  return page.$$eval('#columnasencabezado', (headers) => {
    const table = headers[0]?.closest('table');
    if (!table) return [];
    const trs = table.querySelectorAll('tbody tr');
    return Array.from(trs).map(tr => {
      const cells = Array.from(tr.querySelectorAll('td'));
      return cells.map(cell => cell.textContent?.trim() || '');
    });
  });
}

function parseRows(rows: string[][]): TransferenciaEntrada[] {
  const results: TransferenciaEntrada[] = [];
  for (const row of rows) {
    if (row.length < 6) continue;
    if (!row[0] || row[0] === '') continue;
    if (row[3]?.includes('Saldo')) continue;
    const parsed = parseOperacionRow(row);
    if (parsed) results.push(parsed);
  }
  return results;
}

export async function navigateToOperaciones(page: Page): Promise<boolean> {
  await page.click('a:has-text("Operaciones Diarias")', { timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});

  const submitExists = await page.$('button[type="submit"]');
  return !!submitExists;
}

export async function scrapeDay(page: Page, date: Date): Promise<TransferenciaEntrada[]> {
  const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

  try {
    const formSubmit = await page.$('button[type="submit"]');
    if (!formSubmit) {
      const ok = await navigateToOperaciones(page);
      if (!ok) return [];
    }

    await fillAndSubmitForm(page, dateStr);
    const rows = await extractRows(page);
    return parseRows(rows);
  } catch (err: any) {
    console.error(`scrapeDay error (${dateStr}): ${err.message?.substring(0, 80)}`);
    return [];
  }
}

export async function scrapeMonth(page: Page, month: number, year: number): Promise<TransferenciaEntrada[]> {
  const today = new Date();
  const isCurrentMonth = month === today.getMonth() + 1 && year === today.getFullYear();
  const lastDay = isCurrentMonth ? today.getDate() : new Date(year, month, 0).getDate();

  const allTransfers: TransferenciaEntrada[] = [];

  const ok = await navigateToOperaciones(page);
  if (!ok) return [];

  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month - 1, d);
    const transfers = await scrapeDay(page, date);
    console.log(`  ${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year} -> ${transfers.length} creditos`);
    allTransfers.push(...transfers);
  }

  return allTransfers;
}
