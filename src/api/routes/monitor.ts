import { FastifyInstance } from 'fastify';
import { getMonitorConfig, updateMonitorConfig, getBankStatus } from '../../db/repository';
import { monitorService } from '../../monitor/monitor-service';
import { handleWebhookUpdate, registerWebhook, unregisterWebhook, getWebhookInfo, getBotInfo } from '../../monitor/telegram-bot';
import { sendNotification } from '../../monitor/telegram';
import { requireRole } from '../middleware/auth';

export async function monitorRoutes(fastify: FastifyInstance) {
  // GET /api/monitor/config
  fastify.get('/api/monitor/config', async () => {
    const config = await getMonitorConfig();
    return {
      enabled: config.enabled,
      interval_minutes: config.interval_minutes,
      telegram_bot_token: config.telegram_bot_token,
      telegram_chat_id: config.telegram_chat_id,
      telegram_topic_id: config.telegram_topic_id,
      telegram_webhook_url: config.telegram_webhook_url,
    };
  });

  // PUT /api/monitor/config (admin only)
  fastify.put('/api/monitor/config', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as {
      enabled?: boolean;
      interval_minutes?: number;
      telegram_bot_token?: string | null;
      telegram_chat_id?: string | null;
      telegram_topic_id?: number | null;
      telegram_webhook_url?: string | null;
    };

    if (body.interval_minutes !== undefined && body.interval_minutes < 1) {
      return reply.status(400).send({ error: 'interval_minutes debe ser >= 1' });
    }

    const config = await updateMonitorConfig(body);

    // Restart monitor with new config
    await monitorService.restart();

    return {
      enabled: config.enabled,
      interval_minutes: config.interval_minutes,
      telegram_bot_token: config.telegram_bot_token,
      telegram_chat_id: config.telegram_chat_id,
      telegram_topic_id: config.telegram_topic_id,
      telegram_webhook_url: config.telegram_webhook_url,
    };
  });

  // POST /api/monitor/webhook/register — register webhook with Telegram (admin only)
  fastify.post('/api/monitor/webhook/register', { preHandler: requireRole('admin') }, async (request, reply) => {
    const config = await getMonitorConfig();
    if (!config.telegram_bot_token) {
      return reply.status(400).send({ error: 'Configura el bot token primero' });
    }
    if (!config.telegram_webhook_url) {
      return reply.status(400).send({ error: 'Configura la webhook URL primero' });
    }

    const webhookEndpoint = `${config.telegram_webhook_url}/api/monitor/webhook/${config.telegram_bot_token}`;
    const result = await registerWebhook(config.telegram_bot_token, webhookEndpoint);

    if (!result.ok) {
      return reply.status(400).send({ error: result.description || 'Error al registrar webhook' });
    }

    // Get bot username for the group invite link
    const botInfo = await getBotInfo(config.telegram_bot_token);
    const botUsername = botInfo.result?.username || null;

    return { ok: true, webhook_url: webhookEndpoint, bot_username: botUsername };
  });

  // POST /api/monitor/webhook/unregister — remove webhook from Telegram (admin only)
  fastify.post('/api/monitor/webhook/unregister', { preHandler: requireRole('admin') }, async (request, reply) => {
    const config = await getMonitorConfig();
    if (!config.telegram_bot_token) {
      return reply.status(400).send({ error: 'Configura el bot token primero' });
    }

    const result = await unregisterWebhook(config.telegram_bot_token);
    return { ok: result.ok };
  });

  // GET /api/monitor/webhook/info — get current webhook status
  fastify.get('/api/monitor/webhook/info', async (request, reply) => {
    const config = await getMonitorConfig();
    if (!config.telegram_bot_token) {
      return { registered: false, url: null, bot_username: null };
    }

    try {
      const [info, botInfo] = await Promise.all([
        getWebhookInfo(config.telegram_bot_token),
        getBotInfo(config.telegram_bot_token),
      ]);
      const url = info.result?.url || null;
      const botUsername = botInfo.result?.username || null;
      return { registered: !!url, url, bot_username: botUsername };
    } catch {
      // Telegram API unreachable — return unknown state instead of 500
      return { registered: false, url: null, bot_username: null };
    }
  });

  // POST /api/monitor/webhook/:token — Telegram sends updates here
  fastify.post('/api/monitor/webhook/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const config = await getMonitorConfig();

    if (!config.telegram_bot_token || token !== config.telegram_bot_token) {
      return reply.status(403).send({ error: 'Token invalido' });
    }

    await handleWebhookUpdate(request.body as any);
    return { ok: true };
  });

  // GET /api/monitor/status
  fastify.get('/api/monitor/status', async () => {
    const status = await getBankStatus();
    return {
      online: status.online,
      last_check: status.last_check,
      last_online: status.last_online,
      fecha_contable: status.fecha_contable,
    };
  });

  // POST /api/monitor/check — force a manual check (admin only)
  fastify.post('/api/monitor/check', { preHandler: requireRole('admin') }, async (request, reply) => {
    const result = await monitorService.forceCheck();
    return result;
  });

  // POST /api/scrape?month=X&year=Y (admin only)
  fastify.post('/api/scrape', { preHandler: requireRole('admin') }, async (request, reply) => {
    const query = request.query as { month?: string; year?: string };
    const month = parseInt(query.month || '');
    const year = parseInt(query.year || '');

    if (!month || !year || month < 1 || month > 12 || year < 2020) {
      return reply.status(400).send({ error: 'Parámetros requeridos: month (1-12) y year (>= 2020)' });
    }

    try {
      const { total, nuevas } = await monitorService.scrapeMonth(month, year);

      // Notify via Telegram
      console.log(`[Scrape] Resultado: ${total} total, ${nuevas} nuevas`);
      const config = await getMonitorConfig();
      if (config.telegram_bot_token && config.telegram_chat_id) {
        const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        const periodo = `${monthNames[month - 1]} ${year}`;
        const msg = nuevas > 0
          ? `🆕 <b>Scraping ${periodo} completado</b>\n📊 ${total} transferencias, <b>${nuevas} nuevas</b>`
          : `📋 <b>Scraping ${periodo} completado</b>\n📊 ${total} transferencias, 0 nuevas`;
        await sendNotification({
          bot_token: config.telegram_bot_token,
          chat_id: config.telegram_chat_id,
          topic_id: config.telegram_topic_id,
        }, msg);
      }

      return {
        month,
        year,
        total,
        nuevas,
        message: `Scraping completado: ${total} transferencias, ${nuevas} nuevas`,
      };
    } catch (err: any) {
      console.warn(`[Scrape] No se pudo completar: ${err.message}`);
      return {
        month,
        year,
        total: 0,
        nuevas: 0,
        message: err.message,
        error: true,
      };
    }
  });
}
