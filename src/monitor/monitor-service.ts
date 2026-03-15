import { getMonitorConfig, getBankStatus, updateBankStatus, upsertMany } from '../db/repository';
import { sendNotification, TelegramConfig } from './telegram';
import { loginAndCheck, scrapeDay, navigateToOperaciones, scrapeMonth as scrapeMonthFn } from './scrape-day';
import { launchBrowser } from '../scraper/browser';

class MonitorService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

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
      if (check.online) {
        const ok = await navigateToOperaciones(page);
        if (ok) {
          const transfers = await scrapeDay(page, new Date());
          if (transfers.length > 0) {
            const result = await upsertMany(transfers);
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

      if (config.telegram_bot_token && config.telegram_chat_id) {
        const telegramConfig: TelegramConfig = {
          bot_token: config.telegram_bot_token,
          chat_id: config.telegram_chat_id,
          topic_id: config.telegram_topic_id,
        };
        const message = check.online
          ? `🔍 <b>Chequeo manual - BANDEC Online</b>\nFecha contable: ${check.fechaContable || 'N/A'}${scrapeMessage}`
          : `🔍 <b>Chequeo manual - BANDEC Offline</b>\nÚltimo chequeo: ${new Date().toLocaleString('es-CU')}`;
        await sendNotification(telegramConfig, message);
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

  async scrapeMonth(month: number, year: number): Promise<{ total: number; nuevas: number }> {
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
      if (transfers.length > 0) {
        const result = await upsertMany(transfers);
        nuevas = result.nuevas;
      }

      return { total: transfers.length, nuevas };
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
        return;
      }

      const statusChanged = previousStatus.online !== check.online;
      let scrapeMessage = '';
      let nuevasCount = 0;

      if (check.online) {
        const ok = await navigateToOperaciones(page);
        if (ok) {
          const transfers = await scrapeDay(page, new Date());

          if (transfers.length > 0) {
            const result = await upsertMany(transfers);
            nuevasCount = result.nuevas;
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

      // Notify on status change or new transfers
      if (config.telegram_bot_token && config.telegram_chat_id) {
        const telegramConfig: TelegramConfig = {
          bot_token: config.telegram_bot_token,
          chat_id: config.telegram_chat_id,
          topic_id: config.telegram_topic_id,
        };

        if (statusChanged) {
          const message = check.online
            ? `✅ <b>BANDEC Online</b>\nFecha contable: ${check.fechaContable || 'N/A'}${scrapeMessage}`
            : `⚠️ <b>BANDEC Offline</b>\nÚltimo chequeo: ${new Date().toLocaleString('es-CU')}`;
          await sendNotification(telegramConfig, message);
          console.log(`[Monitor] Telegram: ${check.online ? 'Online' : 'Offline'}`);
        } else if (nuevasCount > 0) {
          const message = `🆕 <b>${nuevasCount} nueva${nuevasCount > 1 ? 's' : ''} transferencia${nuevasCount > 1 ? 's' : ''}</b>${scrapeMessage}`;
          await sendNotification(telegramConfig, message);
          console.log(`[Monitor] Telegram: ${nuevasCount} nuevas transferencias`);
        }
      }

      console.log(`[Monitor] Estado: ${check.online ? 'Online' : 'Offline'}${check.fechaContable ? ` (${check.fechaContable})` : ''}`);
    } catch (err: any) {
      console.error(`[Monitor] Error: ${err.message}`);

      await updateBankStatus({
        online: false,
        last_check: new Date(),
      }).catch(() => {});
    } finally {
      await browser.close().catch(() => {});
      this.running = false;
    }
  }
}

export const monitorService = new MonitorService();
