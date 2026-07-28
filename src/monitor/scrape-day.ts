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

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

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
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
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

async function fillAndSubmitForm(page: Page, dateStr: string, checkboxId: '#creditos' | '#debitos' = '#creditos'): Promise<void> {
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

  const otherCheckbox = checkboxId === '#creditos' ? '#debitos' : '#creditos';
  await page.uncheck(otherCheckbox).catch(() => {});
  await page.check(checkboxId);
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
  let loggedShape = false;
  for (const row of rows) {
    if (row.length < 6) continue;
    if (!row[0] || row[0] === '') continue;
    if (row[3]?.includes('Saldo')) {
      // DIAG-SALDO: volcar filas de saldo para diseñar la captura del saldo por operación
      console.log(`[Scrape][DIAG-SALDO] cells=${row.length} ${JSON.stringify(row)}`);
      continue;
    }
    if (!loggedShape) {
      // DIAG-SALDO: forma de la primera fila de operación (¿hay columna de saldo extra?)
      console.log(`[Scrape][DIAG-OPSHAPE] cells=${row.length} ${JSON.stringify(row)}`);
      loggedShape = true;
    }
    const parsed = parseOperacionRow(row);
    if (parsed) results.push(parsed);
  }
  return results;
}

export async function navigateToOperaciones(page: Page): Promise<boolean> {
  // Si el formulario de busqueda ya esta en pantalla (p.ej. justo despues de
  // una busqueda previa) no hace falta navegar: se puede re-enviar directo.
  // Esto evita el timeout al re-clickear "Operaciones Diarias" en la vista de
  // resultados, que es lo que hacia fallar siempre el pase de debitos.
  if (await page.$('button[type="submit"]')) return true;

  const opLink = page.locator('a:has-text("Operaciones Diarias")').first();
  try {
    await opLink.click({ timeout: 15000 });
  } catch {
    // Desde una vista de resultados el link del menu puede quedar inalcanzable.
    // Recargamos el portal (la cookie de sesion nos mantiene logueados) y reintentamos.
    const url = process.env.BANDEC_URL || 'http://www.bandec.cu/VirtualBANDEC/';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await opLink.click({ timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

  return !!(await page.$('button[type="submit"]'));
}

async function scrapeDayOnePass(page: Page, dateStr: string, checkboxId: '#creditos' | '#debitos'): Promise<TransferenciaEntrada[]> {
  await fillAndSubmitForm(page, dateStr, checkboxId);
  const rows = await extractRows(page);
  return parseRows(rows);
}

export async function scrapeDay(page: Page, date: Date): Promise<TransferenciaEntrada[]> {
  const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

  const formSubmit = await page.$('button[type="submit"]');
  if (!formSubmit) {
    const ok = await navigateToOperaciones(page);
    if (!ok) return [];
  }

  let creditos: TransferenciaEntrada[] = [];
  try {
    creditos = await scrapeDayOnePass(page, dateStr, '#creditos');
  } catch (err: any) {
    console.error(`scrapeDay creditos error (${dateStr}): ${err.message?.substring(0, 80)}`);
  }

  let debitos: TransferenciaEntrada[] = [];
  try {
    const ok = await navigateToOperaciones(page);
    if (ok) {
      debitos = await scrapeDayOnePass(page, dateStr, '#debitos');
    }
  } catch (err: any) {
    console.error(`scrapeDay debitos error (${dateStr}): ${err.message?.substring(0, 80)}`);
  }

  // DIAG-SALDO: buscar cualquier "Saldo" en TODA la página (fuera de la tabla de ops)
  try {
    const saldos = await page.evaluate(() => {
      const out: string[] = [];
      const seen = new Set<string>();
      document.querySelectorAll('td, span, div, label, th').forEach(el => {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && /saldo/i.test(t) && t.length < 120 && !seen.has(t)) { seen.add(t); out.push(t); }
      });
      return out.slice(0, 25);
    });
    console.log(`[Scrape][DIAG-PAGESALDO] ${JSON.stringify(saldos)}`);
  } catch { /* noop */ }

  return [...creditos, ...debitos];
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
    console.log(`  ${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year} -> ${transfers.length} operaciones`);
    allTransfers.push(...transfers);
  }

  return allTransfers;
}
