import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as repo from '../../db/repository';

const querySchema = z.object({
  fecha: z.string().optional(),
  nombre: z.string().optional(),
  desde: z.coerce.number().optional(),
  hasta: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  orderBy: z.string().optional(),
  orderDir: z.enum(['asc', 'desc']).optional(),
});

export async function transferenciaRoutes(app: FastifyInstance) {
  app.get('/api/transferencias', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const result = await repo.getAll(parsed.data);
    return result;
  });

  app.get('/api/transferencias/:refOrigen', async (request, reply) => {
    const { refOrigen } = request.params as { refOrigen: string };
    const transfer = await repo.getByRefOrigen(refOrigen);
    if (!transfer) {
      return reply.status(404).send({ error: 'Transferencia no encontrada' });
    }
    return transfer;
  });

  app.get('/api/resumen', async () => {
    return repo.getResumen();
  });
}
