import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { bearerAuth } from '../middleware/auth';
import { prisma } from '../../db/repository';
import { Prisma } from '@prisma/client';

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const querySchema = z.object({
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
});

const CSV_COLUMNS = [
  'fecha_banco', 'fecha_solicitud', 'nombre_banco', 'nombre_solicitud',
  'codigo_banco', 'codigo_solicitud', 'codigo_gt',
  'cuenta_banco', 'cuenta_solicitud',
  'ci_banco', 'ci_solicitud', 'monto_banco', 'monto_solicitud',
  'canal_banco', 'sede', 'match_nivel', 'conciliado_por', 'reclamada_por',
];

export async function exportRoutes(app: FastifyInstance) {
  app.addHook('onRequest', bearerAuth);

  app.get('/api/export/matches', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const q = parsed.data;

    // Build where: matched solicitudes with transferencia
    const where: Prisma.SolicitudWhereInput = {
      reconStatus: 'matched',
      transferenciaId: { not: null },
    };

    if (q.fechaDesde || q.fechaHasta) {
      const fechaFilter: any = {};
      if (q.fechaDesde) fechaFilter.gte = new Date(q.fechaDesde + 'T00:00:00Z');
      if (q.fechaHasta) fechaFilter.lte = new Date(q.fechaHasta + 'T23:59:59Z');
      where.transferencia = { fecha: fechaFilter };
    }

    // Fetch all matches (no pagination for export)
    const solicitudes = await prisma.solicitud.findMany({
      where,
      include: { transferencia: true },
      orderBy: { conciliadaAt: 'desc' },
    });

    // Build CSV
    const header = CSV_COLUMNS.join(',');
    const rows = solicitudes.map(sol => {
      const t = sol.transferencia;
      const row: Record<string, unknown> = {
        fecha_banco: t?.fecha instanceof Date ? t.fecha.toISOString().split('T')[0] : (t?.fecha ?? ''),
        fecha_solicitud: sol.creadoAt instanceof Date ? sol.creadoAt.toISOString().split('T')[0] : (sol.creadoAt ?? ''),
        nombre_banco: t?.nombreOrdenante ?? '',
        nombre_solicitud: sol.clienteNombre,
        codigo_banco: t?.refOrigen ?? '',
        codigo_solicitud: sol.transferCode ?? '',
        codigo_gt: sol.codigo,
        cuenta_banco: t?.cuentaOrdenante ?? '',
        cuenta_solicitud: sol.clienteCuenta,
        ci_banco: t?.ciOrdenante ?? '',
        ci_solicitud: sol.clienteCi,
        monto_banco: t?.importe ?? '',
        monto_solicitud: Number(sol.monto),
        canal_banco: t?.canalEmision ?? '',
        sede: sol.sedeId,
        match_nivel: sol.matchNivel ?? (sol.conciliadaPor === 'auto' ? 'Auto' : ''),
        conciliado_por: sol.conciliadaPor ?? '',
        reclamada_por: sol.reclamadaPor ?? '',
      };
      return CSV_COLUMNS.map(col => escapeCsvField(row[col])).join(',');
    });

    const csv = '\uFEFF' + header + '\r\n' + rows.join('\r\n') + '\r\n';
    const today = new Date().toISOString().split('T')[0];

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="matches-${today}.csv"`)
      .send(csv);
  });
}
