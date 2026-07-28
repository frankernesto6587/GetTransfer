/**
 * Notifica por Telegram todos los débitos de un mes (por defecto el mes actual)
 * al destino de débitos configurado con /debitos. Uso puntual para poner al día
 * el grupo; a partir de ahí el monitor notifica los nuevos automáticamente.
 *
 * Uso:
 *   pnpm notify:debitos-mes                           # mes actual
 *   pnpm notify:debitos-mes -- --month=6 --year=2026  # mes específico
 *   pnpm notify:debitos-mes -- --dry                  # imprime sin enviar
 */
import 'dotenv/config';
import { prisma, getMonitorConfig, getSaldoDespues } from '../src/db/repository';
import { formatDebitoMessage } from '../src/monitor/format-messages';
import { sendNotification, sendBatch } from '../src/monitor/telegram';
import { TransferenciaEntrada } from '../src/scraper/parser';

// Spacing amplio: es un envío en ráfaga fuera del ciclo normal del monitor
// y Telegram limita ~20 msg/min por grupo.
const DELAY_MS = 3500;

async function main() {
  const dry = process.argv.includes('--dry');
  const argVal = (name: string) => {
    const arg = process.argv.find(a => a.startsWith(`--${name}=`));
    return arg ? parseInt(arg.split('=')[1]) : null;
  };
  const now = new Date();
  const month = argVal('month') ?? now.getUTCMonth() + 1;
  const year = argVal('year') ?? now.getUTCFullYear();

  const desde = new Date(Date.UTC(year, month - 1, 1));
  const hasta = new Date(Date.UTC(year, month, 1));

  const debitos = await prisma.transferencia.findMany({
    where: { tipo: 'Db', fecha: { gte: desde, lt: hasta } },
    orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
  });

  console.log(`Débitos de ${month}/${year}: ${debitos.length}${dry ? ' [DRY RUN]' : ''}`);
  if (debitos.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const mensajes = await Promise.all(debitos.map(async d => {
    const saldo = await getSaldoDespues(d.fecha, d.refCorriente).catch(() => null);
    return formatDebitoMessage(d as unknown as TransferenciaEntrada, saldo);
  }));
  const total = debitos.reduce((s, d) => s + d.importe, 0);
  const encabezado = `📋 <b>Débitos de ${String(month).padStart(2, '0')}/${year}</b> — ${debitos.length} operaciones, total $${total.toLocaleString('es-CU', { minimumFractionDigits: 2 })}`;

  if (dry) {
    console.log('\n' + encabezado.replace(/<[^>]+>/g, ''));
    for (const m of mensajes) console.log('\n' + m.replace(/<[^>]+>/g, ''));
    console.log(`\n[DRY] ${mensajes.length} mensajes NO enviados`);
  } else {
    const config = await getMonitorConfig();
    if (!config.telegram_bot_token || !config.telegram_debitos_chat_id) {
      console.error('No hay destino de débitos configurado: usa /debitos en el grupo o el panel de configuración.');
      process.exit(1);
    }
    const dest = {
      bot_token: config.telegram_bot_token,
      chat_id: config.telegram_debitos_chat_id,
      topic_id: config.telegram_debitos_topic_id,
    };
    await sendNotification(dest, encabezado);
    const sent = await sendBatch(dest, mensajes, DELAY_MS);
    console.log(`Enviados ${sent}/${mensajes.length}`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
