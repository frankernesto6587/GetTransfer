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

  // ── Bank transfers vs solicitudes (PowerQuery) ──
  // Bank-centric: every Transferencia in the date range, with solicitud data when matched
  // and reclamo data (Odoo POS) when claimed.

  const BANCO_COLUMNS = [
    'fecha_banco', 'importe', 'tipo', 'ref_origen', 'ref_corriente',
    'nombre_banco', 'ci_banco', 'cuenta_banco', 'canal_banco',
    'matcheada', 'reclamada',
    'codigo_gt', 'transfer_code', 'nombre_solicitud', 'ci_solicitud',
    'cuenta_solicitud', 'monto_solicitud', 'sede', 'creada_at',
    'workflow_status', 'match_nivel', 'conciliada_at', 'conciliada_por',
    'reclamada_at', 'reclamada_por',
  ];

  app.get('/api/export/banco-solicitudes', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const q = parsed.data;

    const where: Prisma.TransferenciaWhereInput = {};
    if (q.fechaDesde || q.fechaHasta) {
      where.fecha = {};
      if (q.fechaDesde) (where.fecha as any).gte = new Date(q.fechaDesde + 'T00:00:00Z');
      if (q.fechaHasta) (where.fecha as any).lte = new Date(q.fechaHasta + 'T23:59:59Z');
    }

    const transferencias = await prisma.transferencia.findMany({
      where,
      include: { solicitud: true },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    });

    const header = BANCO_COLUMNS.join(',');
    const rows = transferencias.map(t => {
      const sol = t.solicitud;
      const matched = !!sol;
      const claimed = !!sol?.reclamadaAt;
      const row: Record<string, unknown> = {
        fecha_banco: t.fecha instanceof Date ? t.fecha.toISOString().split('T')[0] : t.fecha,
        importe: t.importe,
        tipo: t.tipo,
        ref_origen: t.refOrigen,
        ref_corriente: t.refCorriente,
        nombre_banco: t.nombreOrdenante,
        ci_banco: t.ciOrdenante,
        cuenta_banco: t.cuentaOrdenante,
        canal_banco: t.canalEmision,
        matcheada: matched ? 'true' : 'false',
        reclamada: claimed ? 'true' : 'false',
        codigo_gt: sol?.codigo ?? '',
        transfer_code: sol?.transferCode ?? '',
        nombre_solicitud: sol?.clienteNombre ?? '',
        ci_solicitud: sol?.clienteCi ?? '',
        cuenta_solicitud: sol?.clienteCuenta ?? '',
        monto_solicitud: sol ? Number(sol.monto) : '',
        sede: sol?.sedeId ?? '',
        creada_at: sol?.creadoAt instanceof Date ? sol.creadoAt.toISOString() : '',
        workflow_status: sol?.workflowStatus ?? '',
        match_nivel: sol?.matchNivel ?? (sol?.conciliadaPor === 'auto' ? 'Auto' : ''),
        conciliada_at: sol?.conciliadaAt instanceof Date ? sol.conciliadaAt.toISOString() : '',
        conciliada_por: sol?.conciliadaPor ?? '',
        reclamada_at: sol?.reclamadaAt instanceof Date ? sol.reclamadaAt.toISOString() : '',
        reclamada_por: sol?.reclamadaPor ?? '',
      };
      return BANCO_COLUMNS.map(col => escapeCsvField(row[col])).join(',');
    });

    const csv = '﻿' + header + '\r\n' + rows.join('\r\n') + '\r\n';
    const today = new Date().toISOString().split('T')[0];

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="banco-solicitudes-${today}.csv"`)
      .send(csv);
  });
}
