import { chromium } from 'playwright';
import { rename, readdir, unlink } from 'fs/promises';
import { join } from 'path';

const BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const nav = (page) => page.getByRole('navigation');

// Navigate to Dashboard then back to Confirmar to force full re-mount
async function resetToConfirmar(page) {
  await nav(page).getByRole('button', { name: 'Dashboard' }).click();
  await sleep(1500);
  await nav(page).getByRole('button', { name: 'Confirmar' }).click();
  await sleep(2000);
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: './videos/', size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();

  await page.goto(BASE);
  await sleep(2000);

  // Navigate to Confirmar
  await nav(page).getByRole('button', { name: 'Confirmar' }).click();
  await sleep(2000);

  // ============================================
  // DEMO 1: Nombre + Importe
  // ============================================
  console.log('  1/4 Nombre + Importe');
  await page.getByPlaceholder('Monto transferido').click();
  await sleep(300);
  await page.getByPlaceholder('Monto transferido').pressSequentially('9600', { delay: 80 });
  await sleep(600);
  await page.getByRole('textbox', { name: 'Nombre del ordenante' }).click();
  await sleep(300);
  await page.getByRole('textbox', { name: 'Nombre del ordenante' }).pressSequentially('JUAN VERDE', { delay: 60 });
  await sleep(1000);
  await page.getByRole('button', { name: 'Buscar Transferencia' }).click();
  await sleep(3000);

  // Reset: Dashboard → Confirmar
  await resetToConfirmar(page);

  // ============================================
  // DEMO 2: CI + Importe
  // ============================================
  console.log('  2/4 CI + Importe');
  await page.getByPlaceholder('Monto transferido').click();
  await sleep(300);
  await page.getByPlaceholder('Monto transferido').pressSequentially('9940', { delay: 80 });
  await sleep(600);
  await page.getByRole('textbox', { name: '11 digitos' }).click();
  await sleep(300);
  await page.getByRole('textbox', { name: '11 digitos' }).pressSequentially('94042940260', { delay: 60 });
  await sleep(1000);
  await page.getByRole('button', { name: 'Buscar Transferencia' }).click();
  await sleep(3000);

  // Reset: Dashboard → Confirmar
  await resetToConfirmar(page);

  // ============================================
  // DEMO 3: Cuenta + Importe
  // ============================================
  console.log('  3/4 Cuenta + Importe');
  await page.getByPlaceholder('Monto transferido').click();
  await sleep(300);
  await page.getByPlaceholder('Monto transferido').pressSequentially('9600', { delay: 80 });
  await sleep(600);
  await page.getByRole('textbox', { name: '0000-0000-0000-0000' }).click();
  await sleep(300);
  await page.getByRole('textbox', { name: '0000-0000-0000-0000' }).pressSequentially('9234069991141965', { delay: 50 });
  await sleep(1000);
  await page.getByRole('button', { name: 'Buscar Transferencia' }).click();
  await sleep(3000);

  // Reset: Dashboard → Confirmar
  await resetToConfirmar(page);

  // ============================================
  // DEMO 4: Ref Destino sola + Confirmar
  // ============================================
  console.log('  4/4 Ref Destino + Confirmar');
  await page.getByRole('textbox', { name: 'Referencia destino' }).click();
  await sleep(300);
  await page.getByRole('textbox', { name: 'Referencia destino' }).pressSequentially('YY60023602598', { delay: 50 });
  await sleep(1000);
  await page.getByRole('button', { name: 'Buscar Transferencia' }).click();
  await sleep(3000);

  // Click Confirmar on the result (last "Confirmar" button; nav's is first in DOM)
  await page.getByRole('button', { name: 'Confirmar' }).last().click();
  await sleep(3000);

  // Final pause to show the generated code
  await sleep(2000);

  // Save video
  const video = page.video();
  await context.close();
  if (video) {
    const path = await video.path();
    const dest = join('./videos/', 'demo-confirmar-todas-las-variantes.webm');
    await rename(path, dest);
    console.log(`\nVideo saved: ${dest}`);
  }

  await browser.close();

  // Clean leftover temp files
  const files = await readdir('./videos/');
  for (const f of files) {
    if (f.endsWith('.webm') && !f.startsWith('demo')) {
      await unlink(join('./videos/', f)).catch(() => {});
    }
  }
})();
