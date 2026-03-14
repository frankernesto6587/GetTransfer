import { getMonitorConfig, updateMonitorConfig } from '../db/repository';
import { sendNotification } from './telegram';

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat: { id: number; title?: string; type: string };
    message_thread_id?: number;
    from?: { first_name?: string };
    new_chat_members?: { id: number; is_bot: boolean; username?: string }[];
  };
  my_chat_member?: {
    chat: { id: number; title?: string; type: string };
    new_chat_member: { status: string; user: { id: number; is_bot: boolean; username?: string } };
  };
}

async function processCommand(update: TelegramUpdate) {
  const msg = update.message;
  if (!msg?.text) return;

  const config = await getMonitorConfig();
  if (!config.telegram_bot_token) return;

  const command = msg.text.split('@')[0].trim();

  if (command === '/setchat') {
    const chatId = String(msg.chat.id);
    await updateMonitorConfig({ telegram_chat_id: chatId });

    await sendNotification(
      { bot_token: config.telegram_bot_token, chat_id: chatId },
      `✅ <b>Chat configurado</b>\nChat ID: <code>${chatId}</code>\nChat: ${msg.chat.title || msg.chat.type}`
    );
    console.log(`[TelegramBot] Chat configurado: ${chatId} (${msg.chat.title || msg.chat.type})`);
  }

  if (command === '/settopic') {
    const chatId = String(msg.chat.id);
    const topicId = msg.message_thread_id || null;

    const updates: { telegram_chat_id: string; telegram_topic_id?: number | null } = {
      telegram_chat_id: chatId,
    };
    if (topicId) {
      updates.telegram_topic_id = topicId;
    }
    await updateMonitorConfig(updates);

    await sendNotification(
      { bot_token: config.telegram_bot_token, chat_id: chatId, topic_id: topicId },
      topicId
        ? `✅ <b>Tema configurado</b>\nChat ID: <code>${chatId}</code>\nTopic ID: <code>${topicId}</code>`
        : `⚠️ Este mensaje no fue enviado en un tema. Usa /settopic dentro de un tema de supergrupo.\nChat ID guardado: <code>${chatId}</code>`
    );
    console.log(`[TelegramBot] Topic configurado: chat=${chatId}, topic=${topicId}`);
  }
}

async function processNewMember(update: TelegramUpdate) {
  const config = await getMonitorConfig();
  if (!config.telegram_bot_token) return;

  // Check if bot was added via new_chat_members in a message
  const newMembers = update.message?.new_chat_members;
  if (newMembers) {
    const botInfo = await getBotInfo(config.telegram_bot_token);
    const botUsername = botInfo.result?.username;
    const botAdded = newMembers.some(m => m.is_bot && m.username === botUsername);

    if (botAdded) {
      const chatId = String(update.message!.chat.id);
      const chatName = update.message!.chat.title || update.message!.chat.type;

      await sendNotification(
        { bot_token: config.telegram_bot_token, chat_id: chatId },
        `👋 <b>¡Hola!</b> Gracias por agregarme a <b>${chatName}</b>.\n\n` +
        `Estos son los comandos disponibles:\n\n` +
        `🔹 /setchat — Configura este chat para recibir notificaciones del monitor BANDEC\n` +
        `🔹 /settopic — Configura un tema específico dentro de un supergrupo para las notificaciones\n\n` +
        `Empieza con /setchat para activar las notificaciones aquí.`
      );
      console.log(`[TelegramBot] Bot agregado al grupo: ${chatName} (${chatId})`);
    }
  }

  // Check if bot was added via my_chat_member update
  const memberUpdate = update.my_chat_member;
  if (memberUpdate && memberUpdate.new_chat_member.user.is_bot && memberUpdate.new_chat_member.status === 'member') {
    const chatId = String(memberUpdate.chat.id);
    const chatName = memberUpdate.chat.title || memberUpdate.chat.type;

    await sendNotification(
      { bot_token: config.telegram_bot_token, chat_id: chatId },
      `👋 <b>¡Hola!</b> Gracias por agregarme a <b>${chatName}</b>.\n\n` +
      `Estos son los comandos disponibles:\n\n` +
      `🔹 /setchat — Configura este chat para recibir notificaciones del monitor BANDEC\n` +
      `🔹 /settopic — Configura un tema específico dentro de un supergrupo para las notificaciones\n\n` +
      `Empieza con /setchat para activar las notificaciones aquí.`
    );
    console.log(`[TelegramBot] Bot agregado al grupo (my_chat_member): ${chatName} (${chatId})`);
  }
}

// Webhook handler — called from the route
export async function handleWebhookUpdate(body: TelegramUpdate) {
  await processNewMember(body);
  await processCommand(body);
}

// Register webhook with Telegram
export async function registerWebhook(botToken: string, webhookUrl: string): Promise<{ ok: boolean; description?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/setWebhook`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'my_chat_member'] }),
  });
  return res.json() as Promise<{ ok: boolean; description?: string }>;
}

// Unregister webhook
export async function unregisterWebhook(botToken: string): Promise<{ ok: boolean; description?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/deleteWebhook`;
  const res = await fetch(url, { method: 'POST' });
  return res.json() as Promise<{ ok: boolean; description?: string }>;
}

// Get current webhook info
export async function getWebhookInfo(botToken: string): Promise<{ ok: boolean; result?: { url: string } }> {
  const url = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
  const res = await fetch(url);
  return res.json() as Promise<{ ok: boolean; result?: { url: string } }>;
}

// Get bot username
export async function getBotInfo(botToken: string): Promise<{ ok: boolean; result?: { username: string; first_name: string } }> {
  const url = `https://api.telegram.org/bot${botToken}/getMe`;
  const res = await fetch(url);
  return res.json() as Promise<{ ok: boolean; result?: { username: string; first_name: string } }>;
}
