/**
 * Backfill de Transferencia.comisionDescontada para los créditos ya scrapeados.
 *
 * El BPA empezó a descontar 0,8% el 2026-08-06. El dato ya viene en el mensaje
 * del banco ("COMISI N DESCONTADA: 40.00"), que se guarda íntegro en
 * observacionesRaw — aquí solo se extrae a su columna, sin volver al banco.
 *
 * Sin esto, las transferencias con comisión anteriores al despliegue no casan
 * con su solicitud (el neto acreditado no coincide con el monto pedido) y
 * quedan colgadas.
 *
 * Uso:
 *   pnpm backfill:comisiones           # rellena las que estén en 0
 *   pnpm backfill:comisiones -- --all  # recalcula TODAS
 *   pnpm backfill:comisiones -- --dry  # no escribe, solo muestra el resumen
 */
import 'dotenv/config';
import { prisma } from '../src/db/repository';
import { decodeHtmlEntities, extractComision } from '../src/scraper/parser';

async function main() {
  const all = process.argv.includes('--all');
  const dry = process.argv.includes('--dry');

  const creditos = await prisma.transferencia.findMany({
    where: { tipo: 'Cr', ...(all ? {} : { comisionDescontada: 0 }) },
    select: { id: true, fecha: true, importe: true, canalEmision: true, observacionesRaw: true },
    orderBy: { id: 'asc' },
  });

  console.log(
    `Créditos a revisar: ${creditos.length}` +
    `${all ? ' (todos)' : ' (con comisión en 0)'}${dry ? ' [DRY RUN]' : ''}`
  );

  const updates: { id: number; comision: number }[] = [];
  const porCanal = new Map<string, { count: number; total: number }>();

  for (const t of creditos) {
    // observacionesRaw se guarda SIN decodificar (ver parseOperacionRow), así que
    // hay que aplicar la misma decodificación que usa el parser en vivo.
    const comision = extractComision(decodeHtmlEntities(t.observacionesRaw));
    if (comision <= 0) continue;

    updates.push({ id: t.id, comision });
    const canal = t.canalEmision || '(sin canal)';
    const agg = porCanal.get(canal) || { count: 0, total: 0 };
    agg.count++;
    agg.total += comision;
    porCanal.set(canal, agg);

    const bruto = t.importe + comision;
    const pct = bruto > 0 ? (comision / bruto) * 100 : 0;
    console.log(
      `  #${t.id} ${t.fecha.toISOString().slice(0, 10)} ${canal.padEnd(16)}` +
      ` neto=${t.importe.toFixed(2)} comision=${comision.toFixed(2)}` +
      ` bruto=${bruto.toFixed(2)} (${pct.toFixed(3)}%)`
    );
  }

  if (!dry) {
    const CHUNK = 100;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map(u => prisma.transferencia.update({
          where: { id: u.id },
          data: { comisionDescontada: u.comision },
        }))
      );
      console.log(`  actualizados ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
    }
  }

  console.log(`\nCon comisión: ${updates.length} de ${creditos.length} revisados`);
  for (const [canal, agg] of [...porCanal.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${canal.padEnd(18)} ${String(agg.count).padStart(4)} ops   $${agg.total.toFixed(2)}`);
  }
  if (dry) console.log('\n[DRY RUN] No se escribió nada.');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
