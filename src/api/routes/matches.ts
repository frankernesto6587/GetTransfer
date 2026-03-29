import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/repository';
import { requireRole } from '../middleware/auth';
import { Prisma } from '@prisma/client';

const querySchema = z.object({
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  nombre: z.string().optional(),
  ci: z.string().optional(),
  cuenta: z.string().optional(),
  codigo: z.string().optional(),
  canal: z.string().optional(),
  matchType: z.string().optional(),
  desde: z.coerce.number().optional(),
  hasta: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  orderBy: z.string().optional(),
  orderDir: z.enum(['asc', 'desc']).optional(),
});

const sortableColumns = [
  'conciliadaAt', 'codigo', 'matchNivel', 'monto',
  'creadoAt', 'clienteNombre', 'clienteCi', 'sedeId',
] as const;

export async function matchesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('admin', 'confirmer'));

  app.get('/api/matches', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const q = parsed.data;

    // Build WHERE for Solicitud with reconStatus = matched
    const where: Prisma.SolicitudWhereInput = {
      reconStatus: 'matched',
      transferenciaId: { not: null },
    };

    // Filters on transferencia fields
    const transferWhere: Prisma.TransferenciaWhereInput = {};
    if (q.fechaDesde || q.fechaHasta) {
      transferWhere.fecha = {};
      if (q.fechaDesde) (transferWhere.fecha as any).gte = new Date(q.fechaDesde + 'T00:00:00Z');
      if (q.fechaHasta) (transferWhere.fecha as any).lte = new Date(q.fechaHasta + 'T23:59:59Z');
    }
    if (q.nombre) {
      where.OR = [
        { clienteNombre: { contains: q.nombre, mode: 'insensitive' } },
        { transferencia: { nombreOrdenante: { contains: q.nombre, mode: 'insensitive' } } },
      ];
    }
    if (q.ci) {
      where.OR = [
        ...(where.OR || []),
        { clienteCi: { contains: q.ci, mode: 'insensitive' } },
        { transferencia: { ciOrdenante: { contains: q.ci, mode: 'insensitive' } } },
      ];
    }
    if (q.cuenta) {
      where.OR = [
        ...(where.OR || []),
        { clienteCuenta: { contains: q.cuenta, mode: 'insensitive' } },
        { transferencia: { cuentaOrdenante: { contains: q.cuenta, mode: 'insensitive' } } },
      ];
    }
    if (q.codigo) where.codigo = { contains: q.codigo, mode: 'insensitive' };
    if (q.canal) where.canalEmision = { contains: q.canal, mode: 'insensitive' };
    if (q.desde !== undefined || q.hasta !== undefined) {
      where.monto = {};
      if (q.desde !== undefined) (where.monto as any).gte = q.desde;
      if (q.hasta !== undefined) (where.monto as any).lte = q.hasta;
    }

    // matchType filter
    if (q.matchType) {
      if (q.matchType === 'auto') {
        where.conciliadaPor = 'auto';
      } else if (q.matchType === 'manual') {
        where.matchNivel = { not: null };
        where.conciliadaPor = { not: 'auto' };
      } else if (q.matchType === 'CONFIRMED_DEPOSIT' || q.matchType === 'CONFIRMED_BUY' || q.matchType === 'REVIEW_REQUIRED') {
        where.transferencia = { ...transferWhere, matchType: q.matchType };
      }
    }

    // Apply transferencia date filter if set
    if (Object.keys(transferWhere).length > 0 && !where.transferencia) {
      where.transferencia = transferWhere;
    } else if (Object.keys(transferWhere).length > 0 && where.transferencia) {
      where.transferencia = { ...(where.transferencia as any), ...transferWhere };
    }

    // Sorting
    const orderBy = q.orderBy && (sortableColumns as readonly string[]).includes(q.orderBy)
      ? [{ [q.orderBy]: q.orderDir || 'desc' }, { id: 'desc' as const }]
      : [{ conciliadaAt: 'desc' as const }, { id: 'desc' as const }];

    // Query
    const [data, total, aggregates] = await Promise.all([
      prisma.solicitud.findMany({
        where,
        include: { transferencia: true },
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

    // Stats by type (full dataset, no pagination)
    const [autoCount, manualCount, depositCount, buyCount, reviewCount] = await Promise.all([
      prisma.solicitud.count({ where: { ...where, conciliadaPor: 'auto' } }),
      prisma.solicitud.count({ where: { ...where, matchNivel: { not: null }, conciliadaPor: { not: 'auto' } } }),
      prisma.solicitud.count({ where: { ...where, transferencia: { matchType: 'CONFIRMED_DEPOSIT' } } }),
      prisma.solicitud.count({ where: { ...where, transferencia: { matchType: 'CONFIRMED_BUY' } } }),
      prisma.solicitud.count({ where: { ...where, transferencia: { matchType: 'REVIEW_REQUIRED' } } }),
    ]);

    const statsByType = {
      auto: autoCount,
      manual: manualCount,
      deposito: depositCount,
      compra: buyCount,
      revision: reviewCount,
    };

    // Merge into flat objects
    const mergedData = data.map(sol => {
      const t = sol.transferencia;
      return {
        // Transfer banco
        id: t?.id ?? sol.id,
        fecha: t?.fecha ?? null,
        refOrigen: t?.refOrigen ?? '',
        refCorriente: t?.refCorriente ?? '',
        importe: t?.importe ?? 0,
        tipo: t?.tipo ?? '',
        nombreOrdenante: t?.nombreOrdenante ?? '',
        ciOrdenante: t?.ciOrdenante ?? '',
        cuentaOrdenante: t?.cuentaOrdenante ?? '',
        canalEmision: t?.canalEmision ?? '',
        matchType: t?.matchType ?? null,
        codigoConfirmacion: sol.codigo,
        confirmedAt: sol.conciliadaAt,
        // Solicitud
        solicitud_codigo: sol.codigo,
        solicitud_clienteNombre: sol.clienteNombre,
        solicitud_clienteCi: sol.clienteCi,
        solicitud_clienteCuenta: sol.clienteCuenta,
        solicitud_monto: Number(sol.monto),
        solicitud_canalEmision: sol.canalEmision,
        solicitud_transferCode: sol.transferCode,
        solicitud_sedeId: sol.sedeId,
        solicitud_creadoAt: sol.creadoAt,
        solicitud_reclamadaPor: sol.reclamadaPor,
        solicitud_matchNivel: sol.matchNivel,
        solicitud_conciliadaAt: sol.conciliadaAt,
        solicitud_conciliadaPor: sol.conciliadaPor,
      };
    });

    return {
      data: mergedData,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        pages: Math.ceil(total / q.limit),
      },
      totals: {
        importe: Number(aggregates._sum.monto ?? 0),
        cantidad: aggregates._count.id,
      },
      statsByType,
    };
  });
}
