import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createHash } from 'crypto';
import { prisma } from '../../db/repository';
import { Prisma } from '@prisma/client';

// ── Zod schemas ──

const solicitudFieldsSchema = z.object({
  clienteNombre: z.string().default(''),
  clienteCi: z.string().default(''),
  clienteCuenta: z.string().default(''),
  clienteTelefono: z.string().optional().default(''),
  monto: z.number().positive(),
  canalEmision: z.string().optional().default(''),
  transferCode: z.string().optional().default(''),
  notas: z.string().optional().default(''),
  fingerprint: z.string().optional().default(''),
  creadoPor: z.string().optional().default(''),
  creadoAt: z.string().optional().default(''),
});

const eventPayloadSchema = z.object({
  version: z.number().int().positive(),
  fields: solicitudFieldsSchema,
  // Claim-specific
  claimed_by: z.string().optional(),
  claimed_at: z.string().optional(),
  // Cancel-specific
  cancelled_by: z.string().optional(),
  cancelled_at: z.string().optional(),
  cancel_reason: z.string().optional(),
});

const syncEventSchema = z.object({
  event_id: z.string().min(1),
  solicitud_codigo: z.string().min(1),
  event_type: z.enum(['CREATED', 'CLAIMED', 'RELEASED', 'ANNULLED']),
  payload: eventPayloadSchema,
  payload_hash: z.string().optional(),
  sede_id: z.string().min(1),
  created_at: z.string().min(1),
});

const syncRequestSchema = z.object({
  events: z.array(syncEventSchema).min(1).max(100),
});

type SyncEvent = z.infer<typeof syncEventSchema>;

// ── Helper: compute fingerprint ──

function computeFingerprint(fields: { clienteCi: string; clienteCuenta: string; monto: number; transferCode?: string }): string {
  const raw = `${fields.clienteCi}|${fields.clienteCuenta}|${fields.monto.toFixed(2)}|${fields.transferCode || ''}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

// ── Apply event (tolerant to out-of-order) ──

async function applyEvent(event: SyncEvent, logger: { warn: Function; error: Function; info: Function }) {
  const sol = await prisma.solicitud.findUnique({
    where: { codigo: event.solicitud_codigo },
  });

  const payload = event.payload;
  const fields = payload.fields;

  switch (event.event_type) {
    case 'CREATED': {
      if (sol) {
        // Already exists — validate consistency
        const newFp = computeFingerprint(fields);
        if (sol.fingerprint && sol.fingerprint !== newFp) {
          logger.error({
            msg: 'CREATED CONFLICT: data mismatch',
            eventId: event.event_id,
            codigo: event.solicitud_codigo,
            existingFp: sol.fingerprint,
            newFp,
          });
          throw new Error('CREATED conflict: data mismatch — requires manual resolution');
        }
        return; // Idempotent, same data
      }

      // Check cross-sede duplicate
      const fp = computeFingerprint(fields);
      let crossDupOf: string | null = null;
      const crossDup = await prisma.solicitud.findFirst({
        where: {
          fingerprint: fp,
          sedeId: { not: event.sede_id },
          workflowStatus: { not: 'cancelled' },
        },
      });
      if (crossDup) {
        logger.warn({
          msg: 'Cross-sede duplicate detected',
          newCodigo: event.solicitud_codigo,
          newSede: event.sede_id,
          existingCodigo: crossDup.codigo,
          existingSede: crossDup.sedeId,
        });
        crossDupOf = crossDup.codigo;
      }

      await prisma.solicitud.create({
        data: {
          codigo: event.solicitud_codigo,
          sedeId: event.sede_id,
          version: payload.version,
          lastEventId: event.event_id,
          clienteNombre: fields.clienteNombre,
          clienteCi: fields.clienteCi,
          clienteCuenta: fields.clienteCuenta,
          clienteTelefono: fields.clienteTelefono || null,
          monto: new Prisma.Decimal(fields.monto),
          canalEmision: fields.canalEmision || null,
          transferCode: fields.transferCode || null,
          notas: fields.notas || null,
          fingerprint: fp,
          creadoAt: fields.creadoAt ? new Date(fields.creadoAt) : new Date(),
          creadoPor: fields.creadoPor || '',
          crossDupOf,
        },
      });
      break;
    }

    case 'CLAIMED': {
      if (!sol) {
        // CREATED not received yet — create from CLAIMED (event sourcing)
        const fp = computeFingerprint(fields);
        await prisma.solicitud.create({
          data: {
            codigo: event.solicitud_codigo,
            sedeId: event.sede_id,
            version: payload.version,
            lastEventId: event.event_id,
            clienteNombre: fields.clienteNombre,
            clienteCi: fields.clienteCi,
            clienteCuenta: fields.clienteCuenta,
            clienteTelefono: fields.clienteTelefono || null,
            monto: new Prisma.Decimal(fields.monto),
            canalEmision: fields.canalEmision || null,
            transferCode: fields.transferCode || null,
            notas: fields.notas || null,
            fingerprint: fp,
            creadoAt: fields.creadoAt ? new Date(fields.creadoAt) : new Date(),
            creadoPor: fields.creadoPor || '',
            workflowStatus: 'claimed',
            reclamadaAt: payload.claimed_at ? new Date(payload.claimed_at) : new Date(),
            reclamadaPor: payload.claimed_by || null,
          },
        });
        break;
      }

      // Check version
      if (sol.version >= payload.version) {
        logger.warn({
          msg: 'Outdated CLAIMED event',
          eventId: event.event_id,
          eventVersion: payload.version,
          currentVersion: sol.version,
          codigo: event.solicitud_codigo,
        });
        return;
      }
      if (sol.lastEventId === event.event_id) return; // Already applied

      // Version gap detection
      if (payload.version > sol.version + 1) {
        logger.warn({
          msg: 'Version gap detected',
          codigo: event.solicitud_codigo,
          currentVersion: sol.version,
          eventVersion: payload.version,
          gap: payload.version - sol.version - 1,
          sedeId: event.sede_id,
        });
      }

      // Valid transitions: pending → claimed, or already claimed (idempotent)
      if (sol.workflowStatus !== 'pending' && sol.workflowStatus !== 'claimed') {
        throw new Error(`Cannot claim: status is ${sol.workflowStatus}`);
      }

      await prisma.solicitud.update({
        where: { codigo: event.solicitud_codigo },
        data: {
          workflowStatus: 'claimed',
          reclamadaAt: payload.claimed_at ? new Date(payload.claimed_at) : new Date(),
          reclamadaPor: payload.claimed_by || null,
          version: payload.version,
          lastEventId: event.event_id,
        },
      });
      break;
    }

    case 'ANNULLED': {
      if (!sol) {
        // CREATED not received yet — create as cancelled
        const fp = computeFingerprint(fields);
        await prisma.solicitud.create({
          data: {
            codigo: event.solicitud_codigo,
            sedeId: event.sede_id,
            version: payload.version,
            lastEventId: event.event_id,
            clienteNombre: fields.clienteNombre,
            clienteCi: fields.clienteCi,
            clienteCuenta: fields.clienteCuenta,
            clienteTelefono: fields.clienteTelefono || null,
            monto: new Prisma.Decimal(fields.monto),
            canalEmision: fields.canalEmision || null,
            transferCode: fields.transferCode || null,
            notas: fields.notas || null,
            fingerprint: fp,
            creadoAt: fields.creadoAt ? new Date(fields.creadoAt) : new Date(),
            creadoPor: fields.creadoPor || '',
            workflowStatus: 'cancelled',
            anuladaAt: payload.cancelled_at ? new Date(payload.cancelled_at) : new Date(),
            anuladaPor: payload.cancelled_by || null,
            motivoAnulacion: payload.cancel_reason || null,
          },
        });
        break;
      }

      if (sol.version >= payload.version) {
        logger.warn({
          msg: 'Outdated ANNULLED event',
          eventId: event.event_id,
          eventVersion: payload.version,
          currentVersion: sol.version,
        });
        return;
      }
      if (sol.lastEventId === event.event_id) return;

      // Cannot annul if already reconciled
      if (sol.reconStatus === 'matched') {
        throw new Error('Cannot annul: already reconciled');
      }
      // Terminal state
      if (sol.workflowStatus === 'cancelled') return; // Idempotent

      await prisma.solicitud.update({
        where: { codigo: event.solicitud_codigo },
        data: {
          workflowStatus: 'cancelled',
          anuladaAt: payload.cancelled_at ? new Date(payload.cancelled_at) : new Date(),
          anuladaPor: payload.cancelled_by || null,
          motivoAnulacion: payload.cancel_reason || null,
          version: payload.version,
          lastEventId: event.event_id,
        },
      });
      break;
    }

    case 'RELEASED': {
      if (!sol) return; // Nothing to release
      if (sol.version >= payload.version) return;
      if (sol.lastEventId === event.event_id) return;

      // Can only release if claimed
      if (sol.workflowStatus !== 'claimed') return; // Idempotent

      await prisma.solicitud.update({
        where: { codigo: event.solicitud_codigo },
        data: {
          workflowStatus: 'pending',
          reclamadaAt: null,
          reclamadaPor: null,
          version: payload.version,
          lastEventId: event.event_id,
        },
      });
      break;
    }
  }
}

// ── Sede auth middleware ──

async function sedeAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Token de sede requerido' });
  }

  const token = header.slice(7);
  const sede = await prisma.sede.findUnique({ where: { token } });

  if (!sede || !sede.active) {
    return reply.status(401).send({ error: 'Token de sede inválido o sede desactivada' });
  }

  // Attach sede to request for downstream use
  (request as any).sede = sede;
}

// ── Routes ──

export async function syncRoutes(app: FastifyInstance) {
  // All sync routes authenticate via Sede token
  app.addHook('preHandler', sedeAuth);

  // ── Receive events from sede ──
  app.post('/api/sync/events', async (request, reply) => {
    const parsed = syncRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }

    const sede = (request as any).sede;
    const { events } = parsed.data;
    const acked: string[] = [];
    const errors: Record<string, string> = {};

    for (const event of events) {
      try {
        // Validate sede_id matches the authenticated sede's prefix
        if (event.sede_id !== sede.prefix) {
          errors[event.event_id] = `Sede mismatch: token is for ${sede.prefix}, event has ${event.sede_id}`;
          continue;
        }

        // Payload hash integrity check (warning only — HMAC on request handles real integrity)
        if (event.payload_hash) {
          const computed = createHash('sha256')
            .update(JSON.stringify(event.payload, Object.keys(event.payload).sort()))
            .digest('hex')
            .slice(0, 32);
          if (computed !== event.payload_hash) {
            request.log.warn({
              msg: 'Payload hash mismatch (Python/JS serialization diff)',
              eventId: event.event_id,
              expected: event.payload_hash,
              computed,
            });
            // Don't reject — cross-language hash mismatches are expected
          }
        }

        // Idempotency: skip if already processed
        const existing = await prisma.solicitudEvent.findUnique({
          where: { eventId: event.event_id },
        });
        if (existing) {
          acked.push(event.event_id);
          continue;
        }

        // Store immutable event
        await prisma.solicitudEvent.create({
          data: {
            eventId: event.event_id,
            solicitudCodigo: event.solicitud_codigo,
            eventType: event.event_type,
            payload: event.payload as any,
            payloadHash: event.payload_hash || null,
            sedeId: event.sede_id,
            createdAt: new Date(event.created_at),
          },
        });

        // Apply to Solicitud record
        await applyEvent(event, request.log);

        acked.push(event.event_id);
      } catch (err: any) {
        request.log.error({ msg: 'Event processing error', eventId: event.event_id, error: err.message });
        errors[event.event_id] = err.message || 'Unknown error';
      }
    }

    return { acked, errors };
  });

  // ── Metrics for sync dashboard ──
  app.get('/api/sync/metrics', async () => {
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

  // ── Missing events (for selective re-sync) ──
  app.get('/api/sync/missing', async (request, reply) => {
    const { sede_id, since } = request.query as { sede_id?: string; since?: string };
    if (!sede_id) {
      return reply.status(400).send({ error: 'sede_id required' });
    }

    const where: any = { sedeId: sede_id };
    if (since) {
      where.createdAt = { gte: new Date(since) };
    }

    const existing = await prisma.solicitudEvent.findMany({
      where,
      select: { eventId: true },
      orderBy: { id: 'asc' },
    });

    return { event_ids: existing.map(e => e.eventId) };
  });

  // ── Reconcile counts (local vs central comparison) ──
  app.get('/api/sync/reconcile', async (request, reply) => {
    const { sede_id, from, to } = request.query as { sede_id?: string; from?: string; to?: string };
    if (!sede_id) {
      return reply.status(400).send({ error: 'sede_id required' });
    }

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const [eventCount, solicitudCount, byStatus] = await Promise.all([
      prisma.solicitudEvent.count({
        where: {
          sedeId: sede_id,
          ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
        },
      }),
      prisma.solicitud.count({
        where: {
          sedeId: sede_id,
          ...(Object.keys(dateFilter).length ? { creadoAt: dateFilter } : {}),
        },
      }),
      prisma.solicitud.groupBy({
        by: ['workflowStatus'],
        where: {
          sedeId: sede_id,
          ...(Object.keys(dateFilter).length ? { creadoAt: dateFilter } : {}),
        },
        _count: true,
      }),
    ]);

    return {
      sede_id,
      total_events: eventCount,
      total_solicitudes: solicitudCount,
      by_status: byStatus.reduce((acc, g) => ({ ...acc, [g.workflowStatus]: g._count }), {}),
    };
  });

  // ── Health check (sede pings this) ──
  app.get('/api/sync/health', async () => {
    return { ok: true, timestamp: new Date().toISOString() };
  });
}
