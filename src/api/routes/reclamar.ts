import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { bearerAuth } from '../middleware/auth';
import * as repo from '../../db/repository';

const codigoSchema = z.object({
  codigo: z.string().min(1),
});

const reclamarBodySchema = z.object({
  odooRef: z.string().min(1, 'odooRef es requerido'),
});

export async function reclamarRoutes(app: FastifyInstance) {
  // All routes require Bearer token
  app.addHook('onRequest', bearerAuth);

  // Verify token is valid (used by Odoo "Verificar Conexion" button)
  app.get('/api/reclamar/verificar', async () => {
    return { ok: true };
  });

  // Get transfer data by code (read-only, does not modify)
  app.get('/api/reclamar/:codigo', async (request, reply) => {
    const parsed = codigoSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Codigo invalido' });
    }
    try {
      const transfer = await repo.buscarParaReclamar(parsed.data.codigo);
      return transfer;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      if (message.includes('no encontrado')) return reply.status(404).send({ error: message });
      if (message.includes('no ha sido confirmada') || message.includes('ya fue reclamada')) {
        return reply.status(409).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  });

  // Claim a transfer (marks claimedAt + claimedBy)
  app.post('/api/reclamar/:codigo', async (request, reply) => {
    const paramsParsed = codigoSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: 'Codigo invalido' });
    }
    const bodyParsed = reclamarBodySchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.status(400).send({ error: bodyParsed.error.flatten() });
    }
    try {
      const result = await repo.reclamarTransferencia(
        paramsParsed.data.codigo,
        bodyParsed.data.odooRef,
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      if (message.includes('no encontrado')) return reply.status(404).send({ error: message });
      if (message.includes('no ha sido confirmada') || message.includes('ya fue reclamada')) {
        return reply.status(409).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  });
}
