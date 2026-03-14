export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
  topic_id?: number | null;
}

async function trySend(url: string, body: Record<string, unknown>, attempt: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Telegram] Error HTTP ${response.status}: ${error}`);
      return false;
    }

    console.log(`[Telegram] OK - mensaje enviado (intento ${attempt})`);
    return true;
  } catch (err: any) {
    clearTimeout(timeout);
    console.error(`[Telegram] Intento ${attempt} falló: ${err.message}`);
    if (err.cause) {
      console.error(`[Telegram] Causa: ${err.cause.message || JSON.stringify(err.cause)}`);
    }
    return false;
  }
}

export async function sendNotification(config: TelegramConfig, message: string): Promise<boolean> {
  const url = `https://api.telegram.org/bot${config.bot_token}/sendMessage`;

  const body: Record<string, unknown> = {
    chat_id: config.chat_id,
    text: message,
    parse_mode: 'HTML',
  };

  if (config.topic_id) {
    body.message_thread_id = config.topic_id;
  }

  console.log(`[Telegram] Enviando a chat=${config.chat_id} topic=${config.topic_id || 'none'}`);
  console.log(`[Telegram] Mensaje: ${message.substring(0, 120)}...`);

  // Retry up to 3 times with increasing delay
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ok = await trySend(url, body, attempt);
    if (ok) return true;

    if (attempt < 3) {
      const delay = attempt * 3000;
      console.log(`[Telegram] Reintentando en ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.error(`[Telegram] FALLO definitivo después de 3 intentos`);
  return false;
}
