import { getOdooConfig } from '../db/repository';

/**
 * Auth Bearer contra la API de Odoo (FastAPI).
 *
 * Los endpoints `/api/partners/*` NO aceptan `X-API-Key` (eso solo vale para
 * `/api/pos/gettransfer/*`): exigen `Authorization: Bearer <token>` de un login
 * real. Aqui hacemos ese login una vez, cacheamos el token en memoria del
 * proceso y lo reusamos hasta que expira; si Odoo responde 401 (token revocado
 * o caducado antes de tiempo) re-logueamos una vez y reintentamos.
 *
 * Las credenciales van en el .env del servidor (no en la BD): ODOO_LOGIN y
 * ODOO_PASSWORD, de un usuario Odoo con permiso para editar clientes.
 */

const ODOO_LOGIN = process.env.ODOO_LOGIN || '';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || '';

let cachedToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms; renovamos 60s antes para evitar carreras

async function login(apiUrl: string): Promise<string> {
  const res = await fetch(`${apiUrl}/api/auth/odoo/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: ODOO_LOGIN, password: ODOO_PASSWORD }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Login Odoo fallo (${res.status}): ${text || 'sin detalle'}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('Login Odoo no devolvio access_token');
  }
  cachedToken = data.access_token;
  const ttlMs = (data.expires_in ?? 3600) * 1000;
  tokenExpiresAt = Date.now() + ttlMs - 60_000;
  return cachedToken;
}

async function getToken(apiUrl: string, force = false): Promise<string> {
  if (!force && cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return login(apiUrl);
}

/**
 * Llama a un endpoint de Odoo autenticando con Bearer token (login + cache).
 * Devuelve la `Response` cruda para que quien llama maneje el status como quiera.
 */
export async function odooBearerFetch(
  path: string,
  body: Record<string, unknown>,
  method = 'POST',
): Promise<Response> {
  const config = await getOdooConfig();
  if (!config.api_url) {
    throw new Error('Odoo API no configurada: falta api_url (ve a Configuracion)');
  }
  if (!ODOO_LOGIN || !ODOO_PASSWORD) {
    throw new Error(
      'Login Odoo no configurado: define ODOO_LOGIN y ODOO_PASSWORD en el .env del servidor',
    );
  }
  const apiUrl = config.api_url;

  const doFetch = (token: string) =>
    fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

  let res = await doFetch(await getToken(apiUrl));
  if (res.status === 401) {
    // token caducado/revocado: re-login una vez y reintentar
    res = await doFetch(await getToken(apiUrl, true));
  }
  return res;
}
