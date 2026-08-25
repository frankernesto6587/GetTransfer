/**
 * Backfill de detección de solicitudes duplicadas (mismo pago, distinto código).
 *
 * Marca `Solicitud.crossDupOf` en las solicitudes que quedaron colgadas por ser
 * duplicadas y que la detección en vivo no alcanzó (antes solo detectaba entre
 * sedes distintas). NO cancela ni borra nada: solo deja el aviso para que el
 * operador revise y cancele la repetida.
 *
 * Duplicado = mismo `fingerprint` (CI|cuenta|monto|transferCode) con transferCode
 * presente. Por cada grupo con >1 no cancelada, se deja la MÁS ANTIGUA como original
 * y las demás apuntan a ella (solo si hoy tienen crossDupOf null).
 *
 * Uso:
 *   pnpm backfill:duplicados            # marca las que estén sin marcar
 *   pnpm backfill:duplicados -- --dry   # no escribe, solo muestra el resumen
 */
import 'dotenv/config';
import { prisma } from '../src/db/repository';
import { computeFingerprint } from '../src/api/routes/sync';

async function main() {
  const dry = process.argv.includes('--dry');

  // Solo candidatas: no canceladas y con transferCode (clave de alta confianza).
  const sols = await prisma.solicitud.findMany({
    where: { workflowStatus: { not: 'cancelled' }, transferCode: { not: null } },
    select: {
      codigo: true, sedeId: true, clienteCi: true, clienteCuenta: true,
      monto: true, transferCode: true, creadoAt: true, crossDupOf: true,
    },
    orderBy: { creadoAt: 'asc' },
  });

  // Agrupar por fingerprint
  const grupos = new Map<string, typeof sols>();
  for (const s of sols) {
    if (!s.transferCode) continue;
    const fp = computeFingerprint({
      clienteCi: s.clienteCi, clienteCuenta: s.clienteCuenta,
      monto: Number(s.monto), transferCode: s.transferCode,
    });
    (grupos.get(fp) ?? grupos.set(fp, []).get(fp)!).push(s);
  }

  const updates: { codigo: string; dupOf: string }[] = [];
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    const original = grupo[0]; // el más antiguo (orderBy creadoAt asc)
    for (const dupe of grupo.slice(1)) {
      if (dupe.crossDupOf) continue; // ya marcada
      updates.push({ codigo: dupe.codigo, dupOf: original.codigo });
    }
  }

  console.log(`Solicitudes candidatas: ${sols.length} · grupos duplicados: ${[...grupos.values()].filter(g => g.length > 1).length}`);
  console.log(`A marcar: ${updates.length}${dry ? ' [DRY RUN]' : ''}`);
  for (const u of updates) console.log(`  ${u.codigo}  →  duplicado de  ${u.dupOf}`);

  if (!dry && updates.length > 0) {
    const CHUNK = 100;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map(u => prisma.solicitud.update({ where: { codigo: u.codigo }, data: { crossDupOf: u.dupOf } })),
      );
      console.log(`  marcadas ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
    }
  }
  if (dry) console.log('\n[DRY RUN] No se escribió nada.');

  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
