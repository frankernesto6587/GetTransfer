import { chromium, Page } from 'playwright';
import path from 'path';
import { getMatrixValue } from './matrix';

const SCREENSHOTS_DIR = path.join(__dirname, '../../screenshots');

export interface LoginOptions {
  url: string;
  username: string;
  password: string;
  pin: string;
  headed?: boolean;
}

async function screenshot(page: Page, name: string) {
  const filepath = path.join(SCREENSHOTS_DIR, name);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  screenshot: ${name}`);
}

async function logPageInfo(page: Page) {
  console.log(`  URL: ${page.url()}`);
  console.log(`  Titulo: ${await page.title()}`);
}

/**
 * Extrae las posiciones del PIN pedidas.
 * pregpin contiene algo como "1-2" o "2-3" -> devuelve los dígitos correspondientes del PIN.
 * PIN = "9453", pregpin = "1-2" -> "94" (posición 1 y 2)
 */
function extractPinPositions(pin: string, pregpin: string): string {
  // pregpin viene como "1-2", "2-3", "3-4", etc.
  const positions = pregpin.split('-').map((p) => parseInt(p.trim(), 10));
  let result = '';
  for (const pos of positions) {
    if (pos >= 1 && pos <= pin.length) {
      result += pin[pos - 1]; // posiciones son 1-based
    }
  }
  console.log(`  PIN ${pin} posiciones [${pregpin}] -> ${result}`);
  return result;
}

/**
 * Extrae la coordenada de la matriz.
 * pregpos contiene algo como "B.8" -> busca B8 en la matriz.
 */
function extractMatrixCoordinate(pregpos: string): string {
  // pregpos viene como "B.8", "A.2", etc. Limpiar el punto
  const cleaned = pregpos.replace(/[.\s-]/g, '').toUpperCase();
  const value = getMatrixValue(cleaned);
  console.log(`  Coordenada ${pregpos} -> ${cleaned} -> ${value}`);
  return value || '';
}

export async function login(options: LoginOptions) {
  const { url, username, password, pin, headed = true } = options;

  console.log(`\n=== BANDEC Virtual - Login ===`);
  console.log(`Navegando a: ${url}\n`);

  const browser = await chromium.launch({
    headless: !headed,
    slowMo: headed ? 300 : 50,
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    // === PASO 1: Cargar página ===
    console.log('[1/3] Cargando pagina...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await logPageInfo(page);
    await screenshot(page, '01-pagina-inicial.png');

    // === PASO 2: Login con usuario y contraseña ===
    console.log('\n[2/3] Login con usuario y contrasena...');

    const userField = await page.$('input[name="Usuario"]');
    const passField = await page.$('input[name="Contraseña"], input[type="password"]');

    if (!userField || !passField) {
      console.log('  ERROR: No se encontraron campos de login.');
      const html = await page.$eval('body', (el) => el.innerHTML.substring(0, 5000));
      console.log(html);
      await keepOpen(page, headed);
      return { browser, context, page };
    }

    console.log(`  Usuario: ${username}`);
    await userField.fill(username);
    await passField.fill(password);
    console.log(`  Contrasena: ****`);

    await screenshot(page, '02-credenciales.png');

    const submitBtn = await page.$('input[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      console.log('  Enviado!');
    }

    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle').catch(() => {});

    await logPageInfo(page);
    await screenshot(page, '03-post-login.png');

    // === PASO 3: Página de Matriz (PIN + Coordenada) ===
    console.log('\n[3/3] Resolviendo autenticacion Multibanca...');

    // Verificar que estamos en la página de matriz
    if (!page.url().includes('Matriz')) {
      console.log('  No estamos en pagina de matriz. Verificando estado...');
      const bodyText = await page.$eval('body', (el) => el.innerText.substring(0, 500));
      console.log(`  Texto: ${bodyText}`);
      await keepOpen(page, headed);
      return { browser, context, page };
    }

    // Leer los campos hidden que dicen qué posiciones pedir
    const pregpin = await page.$eval('#pregpin', (el) => (el as HTMLInputElement).value).catch(() => '');
    const pregpos = await page.$eval('#pregpos', (el) => (el as HTMLInputElement).value).catch(() => '');

    console.log(`  pregpin (posiciones del PIN pedidas): "${pregpin}"`);
    console.log(`  pregpos (coordenada de matriz pedida): "${pregpos}"`);

    if (!pregpin || !pregpos) {
      console.log('  ERROR: No se pudieron leer pregpin/pregpos');
      await keepOpen(page, headed);
      return { browser, context, page };
    }

    // Calcular los valores
    const pinValue = extractPinPositions(pin, pregpin);
    const matrixValue = extractMatrixCoordinate(pregpos);

    // Llenar los campos
    const pinField = await page.$('#pin');
    const matrizField = await page.$('#matriz');

    if (pinField && matrizField) {
      await pinField.fill(pinValue);
      console.log(`  Campo PIN llenado: ${pinValue}`);

      await matrizField.fill(matrixValue);
      console.log(`  Campo Matriz llenado: ${matrixValue}`);

      await screenshot(page, '04-matriz-llena.png');

      // Enviar
      const matrixSubmit = await page.$('input[type="submit"]');
      if (matrixSubmit) {
        await matrixSubmit.click();
        console.log('  Enviado!');
      }

      await page.waitForTimeout(3000);
      await page.waitForLoadState('networkidle').catch(() => {});

      await logPageInfo(page);
      await screenshot(page, '05-resultado-final.png');
    } else {
      console.log('  ERROR: No se encontraron campos pin/matriz');
    }

    // === Resultado ===
    const currentUrl = page.url();
    const pageText = await page.$eval('body', (el) => el.innerText.substring(0, 500));
    console.log(`\n=== Resultado ===`);
    console.log(`URL: ${currentUrl}`);
    console.log(`Texto:\n${pageText}`);

    const loginOk = !currentUrl.includes('Autenticacion') && !currentUrl.includes('Matriz');
    console.log(`\nLogin exitoso: ${loginOk ? 'SI' : 'NO'}`);

    await keepOpen(page, headed);
    return { browser, context, page };
  } catch (error) {
    console.error('\nError:', error);
    await screenshot(page, 'error.png').catch(() => {});
    await keepOpen(page, headed);
    return { browser, context, page };
  }
}

async function keepOpen(page: Page, headed: boolean) {
  if (headed) {
    console.log('\nNavegador abierto. Presiona Ctrl+C para cerrar.');
    await page.waitForTimeout(300000);
  }
}
