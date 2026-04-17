import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  clientPortalAuth,
  checkIpRateLimit,
  isGtcodeBlocked,
  recordGtcodeFailure,
  clearGtcodeFailures,
} from '../middleware/client-portal';
import { prisma } from '../../db/repository';

const consultarSchema = z.object({
  gtcode: z.string().min(1).max(50),
  ci: z.string().min(1).max(50),
});

const GENERIC_ERROR = 'No encontramos una solicitud con esos datos';
const MIN_RESPONSE_MS = 300;

function normalizeCi(ci: string): string {
  return ci.trim().toUpperCase();
}

function clientIp(request: { ip: string; headers: Record<string, string | string[] | undefined> }): string {
  const xff = request.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff[0]) return xff[0].split(',')[0].trim();
  return request.ip;
}

async function padResponseTime(startedAt: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  const remaining = MIN_RESPONSE_MS - elapsed;
  if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
}

export async function clienteRoutes(app: FastifyInstance) {
  app.addHook('onRequest', clientPortalAuth);

  app.post('/api/cliente/consultar', async (request, reply) => {
    const startedAt = Date.now();
    const ip = clientIp(request as unknown as { ip: string; headers: Record<string, string | string[] | undefined> });

    const ipCheck = checkIpRateLimit(ip);
    if (!ipCheck.ok) {
      reply.header('Retry-After', String(ipCheck.retryAfterSec));
      return reply.status(429).send({ error: 'Demasiadas solicitudes. Intente en unos momentos.' });
    }

    const parsed = consultarSchema.safeParse(request.body);
    if (!parsed.success) {
      await padResponseTime(startedAt);
      return reply.status(400).send({ error: 'Datos inválidos' });
    }

    const gtcode = parsed.data.gtcode.trim();
    const ci = normalizeCi(parsed.data.ci);

    const gtCheck = isGtcodeBlocked(gtcode);
    if (gtCheck.blocked) {
      reply.header('Retry-After', String(gtCheck.retryAfterSec));
      return reply.status(429).send({ error: 'Demasiados intentos para este código. Intente más tarde.' });
    }

    const solicitud = await prisma.solicitud.findUnique({ where: { codigo: gtcode } });

    if (!solicitud) {
      recordGtcodeFailure(gtcode);
      await padResponseTime(startedAt);
      return reply.status(404).send({ error: GENERIC_ERROR });
    }

    const solicitudCi = normalizeCi(solicitud.clienteCi || '');
    if (!solicitudCi || solicitudCi !== ci) {
      recordGtcodeFailure(gtcode);
      await padResponseTime(startedAt);
      return reply.status(404).send({ error: GENERIC_ERROR });
    }

    clearGtcodeFailures(gtcode);

    return {
      gtcode: solicitud.codigo,
      estado: solicitud.workflowStatus,
      monto: Number(solicitud.monto),
      moneda: 'CUP',
      creadaEn: solicitud.creadoAt.toISOString(),
      bancoMatch: {
        matched: solicitud.reconStatus === 'matched',
        matchedAt: solicitud.conciliadaAt ? solicitud.conciliadaAt.toISOString() : null,
      },
      reclamadaEn: solicitud.reclamadaAt ? solicitud.reclamadaAt.toISOString() : null,
      motivoCancelacion: solicitud.motivoAnulacion ?? null,
    };
  });
}
