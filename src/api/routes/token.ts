import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as repo from '../../db/repository';

const generateSchema = z.object({
  name: z.string().optional().default(''),
});

export async function tokenRoutes(app: FastifyInstance) {
  // Get active token
  app.get('/api/token', async () => {
    const token = await repo.getActiveToken();
    return { token: token || null };
  });

  // Generate or regenerate token
  app.post('/api/token', async (request) => {
    const parsed = generateSchema.safeParse(request.body || {});
    const name = parsed.success ? parsed.data.name : '';
    const token = await repo.generateToken(name);
    return { token };
  });

  // Delete a token
  app.delete('/api/token/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return reply.status(400).send({ error: 'ID invalido' });
    try {
      await repo.deleteToken(numId);
      return { ok: true };
    } catch {
      return reply.status(404).send({ error: 'Token no encontrado' });
    }
  });
}
