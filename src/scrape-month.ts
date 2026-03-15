import dotenv from 'dotenv';
import { Page } from 'playwright';
import { launchBrowser } from './scraper/browser';
import path from 'path';
import fs from 'fs';
import { getMatrixValue } from './scraper/matrix';
import { TransferenciaEntrada, parseOperacionRow } from './scraper/parser';
import { upsertMany, prisma } from './db/repository';

dotenv.config();

const ACCOUNT = '0659834001469612';
const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');

function extractPinPositions(pin: string, pregpin: string): string {
  const positions = pregpin.split('-').map((p) => parseInt(p.trim(), 10));
  return positions.map(pos => pin[pos - 1] || '').join('');
}

async function loginBandec(page: Page) {
  const url = process.env.BANDEC_URL || 'http://www.bandec.cu/VirtualBANDEC/';
  const username = process.env.BANDEC_USERNAME!;
  const password = process.env.BANDEC_PASSWORD!;
  const pin = process.env.BANDEC_PIN!;

  console.log('Logueando en BANDEC...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  await page.fill('input[name="Usuario"]', username);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Aceptar"), input[type="submit"]');
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle').catch(() => {});

  if (page.url().includes('Matriz')) {
    const pregpin = await page.$eval('#pregpin', (el) => (el as HTMLInputElement).value).catch(() => '');
    const pregpos = await page.$eval('#pregpos', (el) => (el as HTMLInputElement).value).catch(() => '');

    const pinValue = extractPinPositions(pin, pregpin);
    const coordCleaned = pregpos.replace(/[.\s-]/g, '').toUpperCase();
    const matrixValue = getMatrixValue(coordCleaned) || '';

    await page.fill('#pin', pinValue);
    await page.fill('#matriz', matrixValue);
    await page.click('button:has-text("Aceptar"), input[type="submit"]');
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle').catch(() => {});
  }

  const ok = !page.url().includes('Autenticacion');
  console.log(ok ? 'Login OK!' : 'Login FALLO');
  return ok;
}

async function fillAndSubmitForm(page: Page, dateStr: string): Promise<void> {
  // Llenar cuenta
  // Cuenta - Kendo ComboBox: seleccionar via JS del widget
  await page.evaluate((account) => {
    const combo = (window as any).jQuery('#cuenta').data('kendoComboBox');
    if (combo) {
      combo.value(account);
      combo.trigger('change');
    }
  }, ACCOUNT);
  await page.waitForTimeout(300);

  // Fecha - Kendo DatePicker: setear via JS del widget
  await page.evaluate((dateVal) => {
    const picker = (window as any).jQuery('#start').data('kendoDatePicker');
    if (picker) {
      const parts = dateVal.split('/');
      picker.value(new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])));
      picker.trigger('change');
    }
  }, dateStr);
  await page.waitForTimeout(300);

  // Créditos
  await page.check('#creditos');

  // Submit
  await page.click('button:has-text("Aceptar"), input[type="submit"]', { timeout: 10000 });
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle').catch(() => {});
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

async function main() {
  const headed = !process.argv.includes('--headless');

  const browser = await launchBrowser({
    headless: !headed,
    slowMo: headed ? 50 : 0,
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    const loggedIn = await loginBandec(page);
    if (!loggedIn) {
      await browser.close();
      return;
    }

    // Verificar conexión del banco antes de continuar
    const fechaContable = await page.$eval(
      'td:has-text("Fecha Contable en Banco")',
      (el) => el.textContent || ''
    ).catch(() => '');

    if (fechaContable.includes('Sin Conexión')) {
      console.log('BANCO SIN CONEXIÓN: El servidor del banco está apagado (fuera de horario o sin corriente).');
      await browser.close();
      return;
    }
    console.log(`Banco conectado: ${fechaContable.replace(/.*Fecha Contable en Banco:\s*/, '').replace(/\s*\|.*/, '').trim()}`);

    // Navegar a Operaciones Diarias UNA sola vez
    await page.click('a:has-text("Operaciones Diarias")');
    await page.waitForTimeout(1500);
    await page.waitForLoadState('networkidle').catch(() => {});
    console.log(`En: ${page.url()}`);

    // Verificar que estamos en la página correcta
    const submitExists = await page.$('button[type="submit"]');
    if (!submitExists) {
      console.log('ERROR: No estamos en la pagina de Operaciones Diarias');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'debug-no-submit.png'), fullPage: true });
      await browser.close();
      return;
    }
    console.log('Formulario detectado OK');

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const allTransfers: TransferenciaEntrada[] = [];

    // Primera consulta
    const firstDate = `01/${String(month).padStart(2, '0')}/${year}`;
    process.stdout.write(`  ${firstDate} -> `);
    try {
      await fillAndSubmitForm(page, firstDate);
      const rows = await extractRows(page);
      const transfers = parseRows(rows);
      console.log(`${transfers.length} creditos`);
      allTransfers.push(...transfers);
    } catch (err: any) {
      console.log(`ERROR: ${err.message?.substring(0, 80)}`);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'debug-day1-error.png'), fullPage: true });
    }

    // Días siguientes - la página de resultados tiene el formulario arriba
    // Solo necesito cambiar la fecha y re-enviar
    for (let d = 2; d <= day; d++) {
      const dateStr = `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
      process.stdout.write(`  ${dateStr} -> `);

      try {
        // Verificar si el formulario sigue en la página
        const formSubmit = await page.$('button[type="submit"]');
        if (!formSubmit) {
          await page.click('a:has-text("Operaciones Diarias")');
          await page.waitForTimeout(1500);
          await page.waitForLoadState('networkidle').catch(() => {});
        }

        await fillAndSubmitForm(page, dateStr);
        const rows = await extractRows(page);
        const transfers = parseRows(rows);
        console.log(`${transfers.length} creditos`);
        allTransfers.push(...transfers);
      } catch (err: any) {
        console.log(`ERROR: ${err.message?.substring(0, 80)}`);
        // Tomar screenshot de debug
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `debug-day${d}-error.png`),
          fullPage: true
        }).catch(() => {});

        // Intentar recuperar
        const currentUrl = page.url();
        console.log(`  (URL: ${currentUrl})`);

        if (currentUrl.includes('Autenticacion') || currentUrl.includes('Matriz')) {
          console.log('  Sesion expirada, re-logueando...');
          const relogged = await loginBandec(page);
          if (relogged) {
            await page.click('a:has-text("Operaciones Diarias")');
            await page.waitForTimeout(1500);
            await page.waitForLoadState('networkidle').catch(() => {});
          }
        }
      }
    }

    console.log(`\n${'='.repeat(160)}`);
    const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    console.log(`TOTAL: ${allTransfers.length} transferencias de entrada en ${monthNames[month - 1]} ${year}`);
    console.log(`${'='.repeat(160)}\n`);

    if (allTransfers.length > 0) {
      const header = [
        'FECHA'.padEnd(10),
        'IMPORTE'.padStart(12),
        'NOMBRE ORDENANTE'.padEnd(35),
        'TARJETA/PAN'.padEnd(20),
        'CUENTA ORDENANTE'.padEnd(20),
        'CANAL'.padEnd(18),
        'ID CUBACEL'.padEnd(12),
        'TELEFONO'.padEnd(12),
        'SUC'.padEnd(4),
      ].join(' | ');
      const sep = header.replace(/[^|]/g, '-');

      console.log(header);
      console.log(sep);

      for (const t of allTransfers) {
        console.log([
          t.fecha.padEnd(10),
          t.importe.toFixed(2).padStart(12),
          (t.nombreOrdenante || '-').substring(0, 35).padEnd(35),
          (t.tarjetaOrdenante || '-').padEnd(20),
          (t.cuentaOrdenante || '-').padEnd(20),
          (t.canalEmision || '-').padEnd(18),
          (t.idCubacel || '-').padEnd(12),
          (t.telefonoOrdenante || '-').padEnd(12),
          (t.sucursalOrdenante || '-').padEnd(4),
        ].join(' | '));
      }

      const total = allTransfers.reduce((s, t) => s + t.importe, 0);
      console.log(sep);
      console.log(`${'TOTAL'.padEnd(10)} | ${total.toFixed(2).padStart(12)} | ${allTransfers.length} transferencias\n`);
    }

    // Guardar
    const outputPath = path.join(__dirname, '../data');
    if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });

    const monthStr = String(month).padStart(2, '0');
    const jsonPath = path.join(outputPath, `creditos-${year}-${monthStr}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(allTransfers, null, 2), 'utf-8');
    console.log(`JSON: ${jsonPath}`);

    const csvHeader = 'fecha,importe,nombre_ordenante,ci_ordenante,tarjeta_ordenante,cuenta_ordenante,canal_emision,id_cubacel,telefono_ordenante,sucursal_ordenante,num_debito,tipo_servicio,fecha_factura,formato,ref_corriente,ref_origen';
    const csvRows = allTransfers.map(t =>
      [
        t.fecha, t.importe, `"${t.nombreOrdenante}"`, t.ciOrdenante, t.tarjetaOrdenante,
        t.cuentaOrdenante, `"${t.canalEmision}"`, t.idCubacel, t.telefonoOrdenante,
        t.sucursalOrdenante, t.numDebito, t.tipoServicio, t.fechaFactura, t.formato,
        t.refCorriente, t.refOrigen,
      ].join(',')
    );
    const csvPath = path.join(outputPath, `creditos-${year}-${monthStr}.csv`);
    fs.writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'), 'utf-8');
    console.log(`CSV: ${csvPath}`);

    // Guardar en base de datos
    try {
      const { total, nuevas } = await upsertMany(allTransfers);
      console.log(`\nBD: ${nuevas} nuevas de ${total} totales (${total - nuevas} ya existían)`);
    } catch (dbErr: any) {
      console.log(`\nBD: No se pudo guardar (${dbErr.message?.substring(0, 80)})`);
      console.log('   Asegúrate de que PostgreSQL esté corriendo: docker compose up -d');
    }

  } catch (error) {
    console.error('Error fatal:', error);
  } finally {
    await prisma.$disconnect();
    await browser.close();
  }
}

main().catch(console.error);
