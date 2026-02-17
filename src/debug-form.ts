import dotenv from 'dotenv';
import { chromium, Page } from 'playwright';
import path from 'path';
import { getMatrixValue } from './scraper/matrix';

dotenv.config();

function extractPinPositions(pin: string, pregpin: string): string {
  const positions = pregpin.split('-').map((p) => parseInt(p.trim(), 10));
  return positions.map(pos => pin[pos - 1] || '').join('');
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const url = process.env.BANDEC_URL!;
  const username = process.env.BANDEC_USERNAME!;
  const password = process.env.BANDEC_PASSWORD!;
  const pin = process.env.BANDEC_PIN!;

  // Login
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[name="Usuario"]', username);
  await page.fill('input[type="password"]', password);
  await page.click('input[type="submit"]');
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle').catch(() => {});

  if (page.url().includes('Matriz')) {
    const pregpin = await page.$eval('#pregpin', (el) => (el as HTMLInputElement).value).catch(() => '');
    const pregpos = await page.$eval('#pregpos', (el) => (el as HTMLInputElement).value).catch(() => '');
    await page.fill('#pin', extractPinPositions(pin, pregpin));
    await page.fill('#matriz', getMatrixValue(pregpos.replace(/[.\s-]/g, '').toUpperCase()) || '');
    await page.click('input[type="submit"]');
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle').catch(() => {});
  }

  console.log('Login OK, yendo a Operaciones Diarias...');

  await page.click('a:has-text("Operaciones Diarias")');
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle').catch(() => {});

  // Dump del HTML del formulario
  const formHTML = await page.$eval('body', (el) => {
    // Buscar el formulario o el area de contenido principal
    const form = el.querySelector('form') || el.querySelector('.container') || el;
    return form.innerHTML.substring(0, 8000);
  });
  console.log('\n=== HTML DEL FORMULARIO ===');
  console.log(formHTML);

  // Todos los elementos interactivos
  const elements = await page.$$eval('input, select, button, a.btn', (els) =>
    els.map(el => ({
      tag: el.tagName,
      type: (el as HTMLInputElement).type || '',
      name: el.getAttribute('name') || '',
      id: el.id,
      class: el.className.substring(0, 50),
      text: el.textContent?.trim().substring(0, 30) || '',
      value: (el as HTMLInputElement).value || '',
    }))
  );
  console.log('\n=== ELEMENTOS INTERACTIVOS ===');
  console.table(elements);

  await browser.close();
}

main().catch(console.error);
