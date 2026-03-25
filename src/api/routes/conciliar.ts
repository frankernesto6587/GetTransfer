import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { prisma } from '../../db/repository';
import { Prisma } from '@prisma/client';

// ── Schemas ──

const idSchema = z.object({ id: z.coerce.number().int().min(1) });

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  sedeId: z.string().optional(),
  clienteCi: z.string().optional(),
  clienteCuenta: z.string().optional(),
  clienteNombre: z.string().optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
});

const confirmarSchema = z.object({
  transferenciaId: z.number().int().min(1),
  matchNivel: z.number().int().min(1).max(5).optional(),
});

// ── Match levels ──
// 1: monto exacto + transferCode + cuenta + CI → AUTO
// 2: monto exacto + cuenta + CI (sin transferCode) → manual
// 3: monto exacto + CI → manual
// 4: monto exacto + cuenta → manual
// 5: monto exacto + nombre similar → manual

interface MatchCandidate {
  id: number;
  fecha: Date;
  refOrigen: string;
  refCorriente: string;
  importe: number;
  nombreOrdenante: string;
  ciOrdenante: string;
  cuentaOrdenante: string;
  canalEmision: string;
  nivel: number;
}

function findMatches(
  transferencias: any[],
  solicitud: { monto: number; transferCode: string | null; clienteCuenta: string; clienteCi: string; clienteNombre: string },
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  const montoSol = Number(solicitud.monto);

  for (const t of transferencias) {
    const montoExacto = t.importe === montoSol;
    if (!montoExacto) continue;

    const codeMatch = solicitud.transferCode && t.refOrigen === solicitud.transferCode;
    const cuentaMatch = solicitud.clienteCuenta && t.cuentaOrdenante === solicitud.clienteCuenta;
    const ciMatch = solicitud.clienteCi && t.ciOrdenante === solicitud.clienteCi;

    let nivel = 0;
    if (codeMatch && cuentaMatch && ciMatch) nivel = 1;
    else if (cuentaMatch && ciMatch) nivel = 2;
    else if (ciMatch) nivel = 3;
    else if (cuentaMatch) nivel = 4;
    else {
      // Nivel 5: nombre similar (>= 50%)
      const sim = nameSimilarity(solicitud.clienteNombre, t.nombreOrdenante);
      if (sim >= 50) nivel = 5;
    }

    if (nivel > 0) {
      candidates.push({
        id: t.id,
        fecha: t.fecha,
        refOrigen: t.refOrigen,
        refCorriente: t.refCorriente,
        importe: t.importe,
        nombreOrdenante: t.nombreOrdenante,
        ciOrdenante: t.ciOrdenante,
        cuentaOrdenante: t.cuentaOrdenante,
        canalEmision: t.canalEmision,
        nivel,
      });
    }
  }

  // Sort: best match first
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
      // Prefix match (truncated names)
      if (ta.length >= 2 && tb.startsWith(ta)) { matched += 0.8; break; }
      if (tb.length >= 2 && ta.startsWith(tb)) { matched += 0.8; break; }
    }
  }
  return (matched / Math.max(tokensA.length, tokensB.length)) * 100;
}

// ── Routes ──

export async function conciliarRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('admin', 'confirmer'));

  // ── List solicitudes pending reconciliation ──
  app.get('/api/conciliar/pendientes', async (request) => {
    const q = querySchema.parse(request.query);

    const where: Prisma.SolicitudWhereInput = {
      workflowStatus: 'claimed',
      reconStatus: { in: ['unmatched', 'suggested'] },
    };

    if (q.sedeId) where.sedeId = q.sedeId;
    if (q.clienteCi) where.clienteCi = { contains: q.clienteCi, mode: 'insensitive' };
    if (q.clienteCuenta) where.clienteCuenta = { contains: q.clienteCuenta, mode: 'insensitive' };
    if (q.clienteNombre) where.clienteNombre = { contains: q.clienteNombre, mode: 'insensitive' };
    if (q.fechaDesde || q.fechaHasta) {
      where.creadoAt = {};
      if (q.fechaDesde) (where.creadoAt as any).gte = new Date(q.fechaDesde + 'T00:00:00Z');
      if (q.fechaHasta) (where.creadoAt as any).lte = new Date(q.fechaHasta + 'T23:59:59Z');
    }

    const [data, total] = await Promise.all([
      prisma.solicitud.findMany({
        where,
        orderBy: [{ creadoAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.solicitud.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        pages: Math.ceil(total / q.limit),
      },
    };
  });

  // ── Search bank transfers that match a solicitud ──
  app.post('/api/conciliar/:id/buscar', async (request, reply) => {
    const { id } = idSchema.parse(request.params);

    const solicitud = await prisma.solicitud.findUnique({ where: { id } });
    if (!solicitud) return reply.status(404).send({ error: 'Solicitud no encontrada' });
    if (solicitud.reconStatus === 'matched') {
      return reply.status(409).send({ error: 'Solicitud ya conciliada' });
    }

    // Search unmatched transfers (no solicitud linked, no codigoConfirmacion from old flow)
    const montoNum = Number(solicitud.monto);
    const transferencias = await prisma.transferencia.findMany({
      where: {
        solicitud: { is: null },
        tipo: 'Cr', // Only credits
        importe: montoNum,
      },
      orderBy: { fecha: 'desc' },
      take: 50,
    });

    const candidates = findMatches(transferencias, {
      monto: montoNum,
      transferCode: solicitud.transferCode,
      clienteCuenta: solicitud.clienteCuenta,
      clienteCi: solicitud.clienteCi,
      clienteNombre: solicitud.clienteNombre,
    });

    // Auto-match: only nivel 1 (all 4 fields exact)
    const autoMatch = candidates.length === 1 && candidates[0].nivel === 1
      ? candidates[0]
      : null;

    // Update reconStatus if we found candidates
    if (candidates.length > 0 && solicitud.reconStatus === 'unmatched') {
      await prisma.solicitud.update({
        where: { id },
        data: { reconStatus: 'suggested' },
      });
    }

    return {
      solicitud,
      autoMatch,
      candidates,
    };
  });

  // ── Confirm match: link solicitud to bank transfer ──
  app.post('/api/conciliar/:id/confirmar', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const body = confirmarSchema.parse(request.body);

    const solicitud = await prisma.solicitud.findUnique({ where: { id } });
    if (!solicitud) return reply.status(404).send({ error: 'Solicitud no encontrada' });
    if (solicitud.reconStatus === 'matched') {
      return reply.status(409).send({ error: 'Solicitud ya conciliada' });
    }
    if (solicitud.workflowStatus === 'cancelled') {
      return reply.status(409).send({ error: 'Solicitud anulada' });
    }

    // Verify transfer exists and is unlinked
    const transfer = await prisma.transferencia.findUnique({
      where: { id: body.transferenciaId },
      include: { solicitud: true },
    });
    if (!transfer) return reply.status(404).send({ error: 'Transferencia no encontrada' });
    if (transfer.solicitud) {
      return reply.status(409).send({ error: `Transferencia ya conciliada con solicitud ${transfer.solicitud.codigo}` });
    }

    const user = (request as any).user;

    // Link solicitud ↔ transferencia
    const updated = await prisma.solicitud.update({
      where: { id },
      data: {
        transferenciaId: body.transferenciaId,
        reconStatus: 'matched',
        conciliadaAt: new Date(),
        conciliadaPor: user?.name || 'system',
        matchNivel: body.matchNivel || null,
      },
      include: { transferencia: true },
    });

    return { solicitud: updated };
  });

  // ── Undo reconciliation ──
  app.post('/api/conciliar/:id/deshacer', async (request, reply) => {
    const { id } = idSchema.parse(request.params);

    const solicitud = await prisma.solicitud.findUnique({ where: { id } });
    if (!solicitud) return reply.status(404).send({ error: 'Solicitud no encontrada' });
    if (solicitud.reconStatus !== 'matched') {
      return reply.status(409).send({ error: 'Solicitud no está conciliada' });
    }

    await prisma.solicitud.update({
      where: { id },
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

  // ── Auto-conciliar batch ──
  app.post('/api/conciliar/auto', async (request) => {
    const solicitudes = await prisma.solicitud.findMany({
      where: {
        workflowStatus: 'claimed',
        reconStatus: { in: ['unmatched', 'suggested'] },
      },
      orderBy: { creadoAt: 'asc' },
      take: 100,
    });

    let matched = 0;
    let noMatch = 0;
    let errors = 0;
    const detalle: { codigo: string; resultado: string; transferId?: number }[] = [];

    for (const sol of solicitudes) {
      try {
        const montoNum = Number(sol.monto);
        // Strict auto-match: all 4 fields exact
        const autoMatch = sol.transferCode
          ? await prisma.transferencia.findFirst({
              where: {
                solicitud: { is: null },
                tipo: 'Cr',
                importe: montoNum,
                refOrigen: sol.transferCode,
                cuentaOrdenante: sol.clienteCuenta,
                ciOrdenante: sol.clienteCi,
              },
            })
          : null;

        if (autoMatch) {
          await prisma.solicitud.update({
            where: { id: sol.id },
            data: {
              transferenciaId: autoMatch.id,
              reconStatus: 'matched',
              conciliadaAt: new Date(),
              conciliadaPor: 'auto',
              matchNivel: 1,
            },
          });
          matched++;
          detalle.push({ codigo: sol.codigo, resultado: 'matched', transferId: autoMatch.id });
        } else {
          noMatch++;
          detalle.push({ codigo: sol.codigo, resultado: 'no_match' });
        }
      } catch (err: any) {
        errors++;
        detalle.push({ codigo: sol.codigo, resultado: 'error' });
      }
    }

    return {
      total: solicitudes.length,
      matched,
      noMatch,
      errors,
      detalle,
    };
  });
}
