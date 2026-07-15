/**
 * Backfill de la columna Transferencia.categoria para los débitos existentes.
 *
 * Uso:
 *   pnpm backfill:categorias            # solo débitos sin categoría
 *   pnpm backfill:categorias -- --all   # reclasifica TODOS los débitos
 *   pnpm backfill:categorias -- --dry   # no escribe, solo muestra el resumen
 */
import 'dotenv/config';
import { prisma } from '../src/db/repository';
import { classifyDebit } from '../src/scraper/debit-classifier';

async function main() {
  const all = process.argv.includes('--all');
  const dry = process.argv.includes('--dry');

  const debitos = await prisma.transferencia.findMany({
    where: { tipo: 'Db', ...(all ? {} : { categoria: '' }) },
    select: { id: true, refCorriente: true, observacionesRaw: true, importe: true, fecha: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Débitos a clasificar: ${debitos.length}${all ? ' (todos)' : ' (sin categoría)'}${dry ? ' [DRY RUN]' : ''}`);

  const resumen = new Map<string, { count: number; total: number }>();
  const otros: { id: number; obs: string }[] = [];
  const updates: { id: number; categoria: string }[] = [];

  for (const d of debitos) {
    const categoria = classifyDebit(d.observacionesRaw, d.refCorriente);
    updates.push({ id: d.id, categoria });

    const agg = resumen.get(categoria) || { count: 0, total: 0 };
    agg.count++;
    agg.total += d.importe;
    resumen.set(categoria, agg);

    if (categoria === 'OTRO') {
      otros.push({ id: d.id, obs: d.observacionesRaw.replace(/\s+/g, ' ').slice(0, 120) });
    }
  }

  if (!dry) {
    const CHUNK = 100;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map(u => prisma.transferencia.update({ where: { id: u.id }, data: { categoria: u.categoria } }))
      );
      console.log(`  actualizados ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
    }
  }

  console.log('\nResumen por categoría:');
  for (const [cat, agg] of [...resumen.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${cat.padEnd(16)} ${String(agg.count).padStart(5)} ops   $${agg.total.toLocaleString('es-CU', { minimumFractionDigits: 2 })}`);
  }

  if (otros.length > 0) {
    console.log('\nMuestras de OTRO (revisar si merecen categoría propia):');
    for (const o of otros.slice(0, 10)) {
      console.log(`  #${o.id}: ${o.obs}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
