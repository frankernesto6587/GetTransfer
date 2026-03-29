import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { prisma } from '../../db/repository';
import { Prisma } from '@prisma/client';

// ── Schemas ──

const idSchema = z.object({ id: z.coerce.number().int().min(1) });

const bancoQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  nombre: z.string().optional(),
  ci: z.string().optional(),
  cuenta: z.string().optional(),
  canal: z.string().optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  estado: z.string().optional(), // pendiente | revision | todos
});

const solicitudesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  sedeId: z.string().optional(),
  clienteCi: z.string().optional(),
  clienteCuenta: z.string().optional(),
  clienteNombre: z.string().optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  orderBy: z.string().optional(),
  orderDir: z.enum(['asc', 'desc']).optional(),
});

const solicitudSortableColumns = [
  'codigo', 'sedeId', 'clienteNombre', 'clienteCi', 'clienteCuenta',
  'monto', 'workflowStatus', 'reconStatus', 'creadoAt', 'reclamadaPor',
] as const;

const confirmarSchema = z.object({
  solicitudId: z.number().int().min(1),
  matchNivel: z.number().int().min(1).max(5).optional(),
});

const accionSchema = z.object({
  accion: z.enum(['CONFIRMED_DEPOSIT', 'CONFIRMED_BUY', 'REVIEW_REQUIRED']),
});

// ── Match: Transferencia → Solicitud ──
// Niveles manuales (auto-conciliar ocurre en sync, no aquí):
// 1: monto exacto + refOrigen↔transferCode
// 2: monto exacto + cuenta + CI
// 3: monto exacto + CI
// 4: monto exacto + cuenta
// 5: monto exacto + nombre similar ≥50%

interface SolicitudCandidate {
  id: number;
  codigo: string;
  sedeId: string;
  clienteNombre: string;
  clienteCi: string;
  clienteCuenta: string;
  monto: any;
  canalEmision: string | null;
  transferCode: string | null;
  workflowStatus: string;
  reconStatus: string;
  creadoAt: Date;
  reclamadaPor: string | null;
  nivel: number;
  diasDiferencia: number | null;
}

function findSolicitudMatches(
  solicitudes: any[],
  transfer: { importe: number; refOrigen: string; cuentaOrdenante: string; ciOrdenante: string; nombreOrdenante: string; fecha: Date },
): SolicitudCandidate[] {
  const candidates: SolicitudCandidate[] = [];

  for (const sol of solicitudes) {
    const montoExacto = Number(sol.monto) === transfer.importe;
    if (!montoExacto) continue;

    const codeMatch = transfer.refOrigen && sol.transferCode && transfer.refOrigen === sol.transferCode;
    const cuentaMatch = transfer.cuentaOrdenante && sol.clienteCuenta && transfer.cuentaOrdenante === sol.clienteCuenta;
    const ciMatch = transfer.ciOrdenante && sol.clienteCi && transfer.ciOrdenante === sol.clienteCi;

    let nivel = 0;
    if (codeMatch) nivel = 1;
    else if (cuentaMatch && ciMatch) nivel = 2;
    else if (ciMatch) nivel = 3;
    else if (cuentaMatch) nivel = 4;
    else {
      const sim = nameSimilarity(transfer.nombreOrdenante, sol.clienteNombre);
      if (sim >= 50) nivel = 5;
    }

    if (nivel > 0) {
      candidates.push({
        id: sol.id,
        codigo: sol.codigo,
        sedeId: sol.sedeId,
        clienteNombre: sol.clienteNombre,
        clienteCi: sol.clienteCi,
        clienteCuenta: sol.clienteCuenta,
        monto: sol.monto,
        canalEmision: sol.canalEmision,
        transferCode: sol.transferCode,
        workflowStatus: sol.workflowStatus,
        reconStatus: sol.reconStatus,
        creadoAt: sol.creadoAt,
        reclamadaPor: sol.reclamadaPor,
        nivel,
        diasDiferencia: sol.creadoAt && transfer.fecha
          ? Math.round((new Date(transfer.fecha).getTime() - new Date(sol.creadoAt).getTime()) / (1000 * 60 * 60 * 24))
          : null,
      });
    }
  }

  candidates.sort((a, b) => a.nivel - b.nivel);
  return candidates;
}

function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  const tokensA = normalize(a).split(/\s+/).filter(Boolean);
  const tokensB = normalize(b).split(/\s+/).filter(Boolean);
  if (!tokensA.length || !tokensB.length) return 0;

  let matched = 0;
  for (const ta of tokensA) {
    for (const tb of tokensB) {
      if (ta === tb) { matched++; break; }
      if (ta.length >= 2 && tb.startsWith(ta)) { matched += 0.8; break; }
      if (tb.length >= 2 && ta.startsWith(tb)) { matched += 0.8; break; }
    }
  }
  return (matched / Math.max(tokensA.length, tokensB.length)) * 100;
}

// ── Routes ──

export async function conciliarRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('admin', 'confirmer'));

  // ── Sync metrics (for SyncDashboardView — uses JWT auth, not sede auth) ──
  app.get('/api/solicitudes/sync-metrics', async () => {
    const [solicitudes, events, bySede] = await Promise.all([
      prisma.solicitud.groupBy({
        by: ['workflowStatus', 'reconStatus'],
        _count: true,
      }),
      prisma.solicitudEvent.groupBy({
        by: ['sedeId'],
        _count: true,
        _max: { receivedAt: true },
      }),
      prisma.solicitud.groupBy({
        by: ['sedeId', 'workflowStatus'],
        _count: true,
        _sum: { monto: true },
      }),
    ]);
    return { solicitudes, events, bySede };
  });

  // ── List ALL solicitudes (for SolicitudesView) ──
  app.get('/api/solicitudes', async (request) => {
    const q = solicitudesQuerySchema.parse(request.query);

    const where: Prisma.SolicitudWhereInput = {};
    if (q.sedeId) where.sedeId = q.sedeId;
    if (q.clienteCi) where.clienteCi = { contains: q.clienteCi, mode: 'insensitive' };
    if (q.clienteCuenta) where.clienteCuenta = { contains: q.clienteCuenta, mode: 'insensitive' };
    if (q.clienteNombre) where.clienteNombre = { contains: q.clienteNombre, mode: 'insensitive' };
    if (q.fechaDesde || q.fechaHasta) {
      where.creadoAt = {};
      if (q.fechaDesde) (where.creadoAt as any).gte = new Date(q.fechaDesde + 'T00:00:00Z');
      if (q.fechaHasta) (where.creadoAt as any).lte = new Date(q.fechaHasta + 'T23:59:59Z');
    }

    const orderBy = q.orderBy && (solicitudSortableColumns as readonly string[]).includes(q.orderBy)
      ? [{ [q.orderBy]: q.orderDir || 'desc' }, { id: 'desc' as const }]
      : [{ creadoAt: 'desc' as const }, { id: 'desc' as const }];

    const [data, total, aggregates] = await Promise.all([
      prisma.solicitud.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.solicitud.count({ where }),
      prisma.solicitud.aggregate({
        where,
        _sum: { monto: true },
        _count: { id: true },
      }),
    ]);

    return {
      data,
      pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
      totals: {
        importe: Number(aggregates._sum.monto ?? 0),
        cantidad: aggregates._count.id,
      },
    };
  });

  // ── List bank transfers without solicitud (pendientes de conciliar) ──
  app.get('/api/conciliar/pendientes', async (request) => {
    const q = bancoQuerySchema.parse(request.query);

    const where: Prisma.TransferenciaWhereInput = {
      solicitud: { is: null },
      tipo: 'Cr',
    };

    if (q.nombre) where.nombreOrdenante = { contains: q.nombre, mode: 'insensitive' };
    if (q.ci) where.ciOrdenante = { contains: q.ci, mode: 'insensitive' };
    if (q.cuenta) where.cuentaOrdenante = { contains: q.cuenta, mode: 'insensitive' };
    if (q.canal) where.canalEmision = { contains: q.canal, mode: 'insensitive' };
    if (q.fechaDesde || q.fechaHasta) {
      where.fecha = {};
      if (q.fechaDesde) (where.fecha as any).gte = new Date(q.fechaDesde + 'T00:00:00Z');
      if (q.fechaHasta) (where.fecha as any).lte = new Date(q.fechaHasta + 'T23:59:59Z');
    }

    const [data, total, aggregates] = await Promise.all([
      prisma.transferencia.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      }),
      prisma.transferencia.count({ where }),
      prisma.transferencia.aggregate({
        where,
        _sum: { importe: true },
        _count: { id: true },
      }),
    ]);

    return {
      data,
      pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
      totals: {
        importe: aggregates._sum.importe ?? 0,
        cantidad: aggregates._count.id,
      },
    };
  });

  // ── Search solicitudes that match a bank transfer ──
  app.post('/api/conciliar/:id/buscar', async (request, reply) => {
    const { id } = idSchema.parse(request.params);

    const transfer = await prisma.transferencia.findUnique({
      where: { id },
      include: { solicitud: true },
    });
    if (!transfer) return reply.status(404).send({ error: 'Transferencia no encontrada' });
    if (transfer.solicitud) {
      return reply.status(409).send({ error: `Ya conciliada con solicitud ${transfer.solicitud.codigo}` });
    }

    // Search unmatched solicitudes with matching amount
    const solicitudes = await prisma.solicitud.findMany({
      where: {
        reconStatus: { in: ['unmatched', 'suggested'] },
        workflowStatus: { not: 'cancelled' },
        monto: transfer.importe,
      },
      orderBy: { creadoAt: 'desc' },
    });

    const candidates = findSolicitudMatches(solicitudes, {
      importe: transfer.importe,
      refOrigen: transfer.refOrigen,
      cuentaOrdenante: transfer.cuentaOrdenante,
      ciOrdenante: transfer.ciOrdenante,
      nombreOrdenante: transfer.nombreOrdenante,
      fecha: transfer.fecha,
    });

    return {
      transfer,
      candidates,
    };
  });

  // ── Confirm: link bank transfer to solicitud ──
  app.post('/api/conciliar/:id/confirmar', async (request, reply) => {
    const { id } = idSchema.parse(request.params); // transferencia ID
    const body = confirmarSchema.parse(request.body);

    const transfer = await prisma.transferencia.findUnique({
      where: { id },
      include: { solicitud: true },
    });
    if (!transfer) return reply.status(404).send({ error: 'Transferencia no encontrada' });
    if (transfer.solicitud) {
      return reply.status(409).send({ error: `Ya conciliada con solicitud ${transfer.solicitud.codigo}` });
    }

    const solicitud = await prisma.solicitud.findUnique({ where: { id: body.solicitudId } });
    if (!solicitud) return reply.status(404).send({ error: 'Solicitud no encontrada' });
    if (solicitud.reconStatus === 'matched') {
      return reply.status(409).send({ error: `Solicitud ${solicitud.codigo} ya está conciliada` });
    }

    const user = (request as any).user;

    const updated = await prisma.solicitud.update({
      where: { id: body.solicitudId },
      data: {
        transferenciaId: id,
        reconStatus: 'matched',
        conciliadaAt: new Date(),
        conciliadaPor: user?.name || 'system',
        matchNivel: body.matchNivel || null,
        sedeNotified: false,
      },
      include: { transferencia: true },
    });

    return { solicitud: updated, transfer };
  });

  // ── Special action on bank transfer (deposit, buy, review) ──
  app.post('/api/conciliar/:id/accion', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const { accion } = accionSchema.parse(request.body);

    // Import the specialAction from repository
    const { specialAction } = await import('../../db/repository');
    const user = (request as any).user;
    const result = await specialAction(id, accion, user?.name);
    return result;
  });

  // ── Undo reconciliation (by transferencia ID) ──
  app.post('/api/conciliar/:id/deshacer', async (request, reply) => {
    const { id } = idSchema.parse(request.params); // transferencia ID

    const solicitud = await prisma.solicitud.findFirst({
      where: { transferenciaId: id },
    });
    if (!solicitud) return reply.status(404).send({ error: 'No hay solicitud vinculada a esta transferencia' });
    if (solicitud.reconStatus !== 'matched') {
      return reply.status(409).send({ error: 'Solicitud no está conciliada' });
    }

    await prisma.solicitud.update({
      where: { id: solicitud.id },
      data: {
        transferenciaId: null,
        reconStatus: 'unmatched',
        conciliadaAt: null,
        conciliadaPor: null,
        matchNivel: null,
      },
    });

    return { success: true };
  });
}
