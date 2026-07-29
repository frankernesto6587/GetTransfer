import { getMonitorConfig, getBankStatus, updateBankStatus, upsertMany, getSaldoDespues, verificarSaldoDia, TransferenciaNueva } from '../db/repository';
import { sendNotification, sendBatch, TelegramConfig } from './telegram';
import { formatCreditosList, formatDebitoMessage, escapeHtml } from './format-messages';
import { loginAndCheck, scrapeDay, navigateToOperaciones, scrapeMonth as scrapeMonthFn } from './scrape-day';
import { launchBrowser } from '../scraper/browser';

// Tope de mensajes detallados de débitos por ciclo (evita avalanchas tras días offline
// y mantiene el envío bajo el límite de ~20 msg/min por grupo de Telegram).
const MAX_DEBITOS_DETALLADOS = 20;
const DEBITOS_MUESTRA_SI_EXCESO = 10;

// Anti-spam de alertas del scraper: solo avisa cuando el fallo es sostenido
// (N ciclos seguidos ≈ N*intervalo), no en cada blip de conectividad.
const ALERTAR_SCRAPER_TRAS_FALLOS = 3;

// Desfase de saldo: alerta si el descuadre persiste N ciclos (evita blips por un
// scrape parcial de un solo ciclo, que se auto-corrige al re-scrapear el día).
const ALERTAR_DESFASE_TRAS = 2;
const TOL_SALDO = 0.01;

function fmt(n: number): string {
  return n.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Traduce el error crudo de Playwright a un mensaje entendible. */
function describirErrorScraper(msg: string): string {
  if (/ERR_NAME_NOT_RESOLVED/i.test(msg)) return 'No se pudo resolver bandec.cu (DNS). El servidor no está alcanzando al banco.';
  if (/ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ECONNRESET|ECONNREFUSED/i.test(msg)) return 'Conexión con el banco reseteada o rechazada.';
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK/i.test(msg)) return 'Sin conexión a internet desde el servidor.';
  if (/timeout/i.test(msg)) return 'El banco no respondió a tiempo (timeout).';
  if (/login fallido/i.test(msg)) return 'Falló el login en BANDEC.';
  return msg.slice(0, 200);
}

interface DestinosConfig {
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  telegram_topic_id: number | null;
  telegram_creditos_chat_id: string | null;
  telegram_creditos_topic_id: number | null;
  telegram_debitos_chat_id: string | null;
  telegram_debitos_topic_id: number | null;
}

/**
 * Destinos de notificación:
 *  - creditos: grupo/tema registrado con /creditos (sin destino = no se notifica).
 *  - debitos: grupo/tema registrado con /debitos (sin destino = no se notifica).
 *  - status: el legacy /setchat, único destino de los avisos online/offline del banco.
 */
export function resolveDestinos(config: DestinosConfig): {
  creditos: TelegramConfig | null;
  debitos: TelegramConfig | null;
  status: TelegramConfig | null;
} {
  const token = config.telegram_bot_token;
  if (!token) return { creditos: null, debitos: null, status: null };

  const legacy: TelegramConfig | null = config.telegram_chat_id
    ? { bot_token: token, chat_id: config.telegram_chat_id, topic_id: config.telegram_topic_id }
    : null;

  const creditos: TelegramConfig | null = config.telegram_creditos_chat_id
    ? { bot_token: token, chat_id: config.telegram_creditos_chat_id, topic_id: config.telegram_creditos_topic_id }
    : null;

  const debitos: TelegramConfig | null = config.telegram_debitos_chat_id
    ? { bot_token: token, chat_id: config.telegram_debitos_chat_id, topic_id: config.telegram_debitos_topic_id }
    : null;

  return { creditos, debitos, status: legacy };
}

/** Notifica créditos (lista resumida) y débitos (un mensaje por operación, con tope). */
async function notifyNuevas(
  destinos: { creditos: TelegramConfig | null; debitos: TelegramConfig | null },
  nuevasList: TransferenciaNueva[]
): Promise<void> {
  const creditos = nuevasList.filter(t => t.tipo === 'Cr');
  const debitos = nuevasList.filter(t => t.tipo === 'Db');

  if (creditos.length > 0 && destinos.creditos) {
    const plural = creditos.length > 1 ? 's' : '';
    const message = `🆕 <b>${creditos.length} nueva${plural} transferencia${plural}</b>\n${formatCreditosList(creditos)}`;
    await sendNotification(destinos.creditos, message);
    console.log(`[Monitor] Telegram: ${creditos.length} créditos notificados`);
  }

  if (debitos.length > 0 && destinos.debitos) {
    let detallados = debitos;
    if (debitos.length > MAX_DEBITOS_DETALLADOS) {
      const total = debitos.reduce((s, t) => s + t.importe, 0);
      await sendNotification(
        destinos.debitos,
        `🔻 <b>${debitos.length} débitos nuevos</b> — total $${total.toLocaleString('es-CU', { minimumFractionDigits: 2 })}\n` +
        `Demasiados para detallar: se muestran los primeros ${DEBITOS_MUESTRA_SI_EXCESO}. Revisa el panel para el resto.`
      );
      detallados = debitos.slice(0, DEBITOS_MUESTRA_SI_EXCESO);
    }
    const mensajes = await Promise.all(detallados.map(async t => {
      const saldo = await getSaldoDespues(t.fecha, t.refCorriente).catch(() => null);
      return formatDebitoMessage(t, saldo);
    }));
    const sent = await sendBatch(destinos.debitos, mensajes);
    console.log(`[Monitor] Telegram: ${sent}/${detallados.length} débitos notificados (${debitos.length} nuevos)`);
  }
}

class MonitorService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private scraperFailStreak = 0;      // ciclos consecutivos con fallo de scraper
  private scraperAlertSent = false;   // ya se notificó el episodio de fallo actual
  private saldoDesfaseStreak = 0;     // ciclos consecutivos con saldo descuadrado
  private saldoAlertSent = false;     // ya se notificó el descuadre actual

  /** Verifica que el saldo del día cuadre con el cierre del banco; alerta si hay desfase persistente. */
  private async checkSaldo(fecha: Date) {
    let chk;
    try {
      chk = await verificarSaldoDia(fecha);
    } catch (e: any) {
      console.error('[Monitor] checkSaldo error:', e.message);
      return;
    }
    if (!chk) return; // sin cierre capturado aún → nada que comparar

    const hayDesfase = Math.abs(chk.desfaseCuadre) > TOL_SALDO
      || (chk.desfaseCadena != null && Math.abs(chk.desfaseCadena) > TOL_SALDO);

    if (!hayDesfase) {
      // Cuadra: si veníamos alertados, avisar que se resolvió
      if (this.saldoAlertSent) {
        this.saldoAlertSent = false;
        const destinos = resolveDestinos(await getMonitorConfig());
        if (destinos.status) await sendNotification(destinos.status, `✅ <b>Saldo cuadrado nuevamente</b>`).catch(() => {});
      }
      this.saldoDesfaseStreak = 0;
      return;
    }

    this.saldoDesfaseStreak++;
    if (this.saldoDesfaseStreak < ALERTAR_DESFASE_TRAS || this.saldoAlertSent) return;
    this.saldoAlertSent = true;
    try {
      const destinos = resolveDestinos(await getMonitorConfig());
      if (destinos.status) {
        const cadena = (chk.desfaseCadena != null && Math.abs(chk.desfaseCadena) > TOL_SALDO)
          ? `\n🔗 Cadena rota: apertura de hoy no coincide con el cierre del día anterior (dif $${fmt(chk.desfaseCadena)}).`
          : '';
        await sendNotification(destinos.status,
          `⚠️ <b>Saldo descuadrado</b>\n` +
          `Cierre del banco: $${fmt(chk.cierre)}\n` +
          `Calculado (apertura + movimientos): $${fmt(chk.calculado)}\n` +
          `Desfase: <b>$${fmt(chk.desfaseCuadre)}</b> — probablemente faltan operaciones del día.${cadena}\n` +
          `<i>Revisa el día o sube el estado de cuenta.</i>`);
        console.log(`[Monitor] Alerta desfase de saldo: ${chk.desfaseCuadre}`);
      }
    } catch (e: any) {
      console.error('[Monitor] No se pudo enviar alerta de desfase:', e.message);
    }
  }

  /** Registra un fallo del scraper y notifica por Telegram si es sostenido. */
  private async onScraperError(rawMsg: string) {
    this.scraperFailStreak++;
    if (this.scraperFailStreak < ALERTAR_SCRAPER_TRAS_FALLOS || this.scraperAlertSent) return;
    this.scraperAlertSent = true;
    try {
      const destinos = resolveDestinos(await getMonitorConfig());
      if (destinos.status) {
        await sendNotification(destinos.status,
          `🔴 <b>Scraper BANDEC con fallos</b>\n${escapeHtml(describirErrorScraper(rawMsg))}\n` +
          `${this.scraperFailStreak} ciclos seguidos fallidos.\n<i>${new Date().toLocaleString('es-CU')}</i>`);
      }
    } catch (e: any) {
      console.error('[Monitor] No se pudo enviar alerta de error:', e.message);
    }
  }

  /** Marca un ciclo exitoso y, si venía de un episodio de fallo notificado, avisa recuperación. */
  private async onScraperOk() {
    if (this.scraperAlertSent) {
      const ciclos = this.scraperFailStreak;
      this.scraperAlertSent = false;
      try {
        const destinos = resolveDestinos(await getMonitorConfig());
        if (destinos.status) {
          await sendNotification(destinos.status,
            `🟢 <b>Scraper BANDEC recuperado</b>\nVolvió a conectar tras ${ciclos} ciclos con fallos.\n<i>${new Date().toLocaleString('es-CU')}</i>`);
        }
      } catch (e: any) {
        console.error('[Monitor] No se pudo enviar alerta de recuperación:', e.message);
      }
    }
    this.scraperFailStreak = 0;
  }

  async start() {
    const config = await getMonitorConfig();
    if (!config.enabled) {
      console.log('[Monitor] Deshabilitado en configuración');
      return;
    }

    const intervalMs = config.interval_minutes * 60 * 1000;
    console.log(`[Monitor] Iniciando - chequeo cada ${config.interval_minutes} min`);

    setTimeout(() => {
      this.tick().catch(err => console.error('[Monitor] Error en tick inicial:', err.message));
    }, 5000);

    this.timer = setInterval(() => {
      this.tick().catch(err => console.error('[Monitor] Error en tick:', err.message));
    }, intervalMs);
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[Monitor] Detenido');
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  async forceCheck(): Promise<{ online: boolean; fecha_contable: string | null; message: string }> {
    if (this.running) {
      return { online: false, fecha_contable: null, message: 'Chequeo anterior aún en curso, intenta de nuevo' };
    }

    this.running = true;
    const browser = await launchBrowser({ headless: true });

    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();

      const config = await getMonitorConfig();
      const previousStatus = await getBankStatus();
      const check = await loginAndCheck(page);

      if (!check.loggedIn) {
        await updateBankStatus({ online: false, last_check: new Date() });
        return { online: false, fecha_contable: null, message: 'Login fallido en BANDEC' };
      }

      let scrapeMessage = '';
      let nuevasList: TransferenciaNueva[] = [];
      if (check.online) {
        const ok = await navigateToOperaciones(page);
        if (ok) {
          const transfers = await scrapeDay(page, new Date());
          if (transfers.length > 0) {
            const result = await upsertMany(transfers);
            nuevasList = result.nuevasList;
            scrapeMessage = `\n📊 ${transfers.length} operaciones hoy (${result.nuevas} nuevas)`;
          } else {
            scrapeMessage = '\n📊 Sin operaciones hoy';
          }
        }
      }

      await updateBankStatus({
        online: check.online,
        last_check: new Date(),
        last_online: check.online ? new Date() : previousStatus.last_online,
        fecha_contable: check.fechaContable,
      });

      const destinos = resolveDestinos(config);

      if (destinos.status) {
        const message = check.online
          ? `🔍 <b>Chequeo manual - BANDEC Online</b>\nFecha contable: ${check.fechaContable || 'N/A'}${scrapeMessage}`
          : `🔍 <b>Chequeo manual - BANDEC Offline</b>\nÚltimo chequeo: ${new Date().toLocaleString('es-CU')}`;
        await sendNotification(destinos.status, message);
      }

      if (nuevasList.length > 0) {
        await notifyNuevas(destinos, nuevasList);
      }

      const resultMsg = check.online
        ? `BANDEC Online - Fecha contable: ${check.fechaContable || 'N/A'}${scrapeMessage}`
        : 'BANDEC Offline';

      return { online: check.online, fecha_contable: check.fechaContable, message: resultMsg };
    } catch (err: any) {
      console.error(`[Monitor] forceCheck error: ${err.message}`);
      await updateBankStatus({ online: false, last_check: new Date() }).catch(() => {});
      return { online: false, fecha_contable: null, message: `Error: ${err.message}` };
    } finally {
      await browser.close().catch(() => {});
      this.running = false;
    }
  }

  async scrapeMonth(month: number, year: number): Promise<{ total: number; nuevas: number; nuevasList: TransferenciaNueva[] }> {
    if (this.running) {
      throw new Error('Chequeo anterior aún en curso, intenta de nuevo');
    }

    this.running = true;
    const browser = await launchBrowser({ headless: true });

    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();

      console.log(`[Scrape] Logueando en BANDEC...`);
      const check = await loginAndCheck(page);

      if (!check.loggedIn) {
        throw new Error('No se pudo iniciar sesión en BANDEC');
      }
      if (!check.online) {
        throw new Error('BANDEC sin conexión al banco');
      }

      console.log(`[Scrape] Iniciando scrapeMonth ${month}/${year}...`);
      const transfers = await scrapeMonthFn(page, month, year);
      console.log(`[Scrape] Completado: ${transfers.length} transferencias`);

      let nuevas = 0;
      let nuevasList: TransferenciaNueva[] = [];
      if (transfers.length > 0) {
        const result = await upsertMany(transfers);
        nuevas = result.nuevas;
        nuevasList = result.nuevasList;
      }

      return { total: transfers.length, nuevas, nuevasList };
    } finally {
      await browser.close().catch(() => {});
      this.running = false;
    }
  }

  private async tick() {
    if (this.running) {
      console.log('[Monitor] Tick saltado - anterior aún ejecutándose');
      return;
    }

    this.running = true;
    const browser = await launchBrowser({ headless: true });

    try {
      const config = await getMonitorConfig();
      if (!config.enabled) {
        await this.stop();
        return;
      }

      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();

      const previousStatus = await getBankStatus();
      const check = await loginAndCheck(page);

      if (!check.loggedIn) {
        console.log('[Monitor] Login fallido');
        await updateBankStatus({ online: false, last_check: new Date() });
        await this.onScraperError('Login fallido');
        return;
      }

      const statusChanged = previousStatus.online !== check.online;
      let scrapeMessage = '';
      let nuevasList: TransferenciaNueva[] = [];

      if (check.online) {
        const ok = await navigateToOperaciones(page);
        if (ok) {
          const transfers = await scrapeDay(page, new Date());

          if (transfers.length > 0) {
            const result = await upsertMany(transfers);
            nuevasList = result.nuevasList;
            scrapeMessage = `\n📊 ${transfers.length} operaciones hoy (${result.nuevas} nuevas)`;
            console.log(`[Monitor] Scrape: ${transfers.length} transferencias, ${result.nuevas} nuevas`);
          } else {
            scrapeMessage = '\n📊 Sin operaciones hoy';
          }
        }
      }

      await updateBankStatus({
        online: check.online,
        last_check: new Date(),
        last_online: check.online ? new Date() : previousStatus.last_online,
        fecha_contable: check.fechaContable,
      });

      // Estado del banco al chat legacy; créditos y débitos a sus destinos propios
      const destinos = resolveDestinos(config);

      if (statusChanged && destinos.status) {
        const message = check.online
          ? `✅ <b>BANDEC Online</b>\nFecha contable: ${check.fechaContable || 'N/A'}${scrapeMessage}`
          : `⚠️ <b>BANDEC Offline</b>\nÚltimo chequeo: ${new Date().toLocaleString('es-CU')}`;
        await sendNotification(destinos.status, message);
        console.log(`[Monitor] Telegram: ${check.online ? 'Online' : 'Offline'}`);
      }

      if (nuevasList.length > 0) {
        await notifyNuevas(destinos, nuevasList);
      }

      // Verifica que el saldo del día cuadre con el cierre real del banco
      if (check.online) {
        await this.checkSaldo(new Date());
      }

      console.log(`[Monitor] Estado: ${check.online ? 'Online' : 'Offline'}${check.fechaContable ? ` (${check.fechaContable})` : ''}`);

      // Ciclo completado sin excepción → scraper OK (resetea racha; avisa recuperación si aplica)
      await this.onScraperOk();
    } catch (err: any) {
      console.error(`[Monitor] Error: ${err.message}`);

      await updateBankStatus({
        online: false,
        last_check: new Date(),
      }).catch(() => {});

      await this.onScraperError(err.message);
    } finally {
      await browser.close().catch(() => {});
      this.running = false;
    }
  }
}

export const monitorService = new MonitorService();
