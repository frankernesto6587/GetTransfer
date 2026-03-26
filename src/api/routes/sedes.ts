import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID, randomBytes } from 'crypto';
import { requireRole } from '../middleware/auth';
import { prisma } from '../../db/repository';

const createSchema = z.object({
  prefix: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/, 'Solo letras mayúsculas y números'),
  name: z.string().min(1),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

export async function sedeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('admin'));

  // List all sedes
  app.get('/api/sedes', async () => {
    const sedes = await prisma.sede.findMany({
      orderBy: { prefix: 'asc' },
    });
    // Don't expose full token/secret in list — show masked
    return sedes.map(s => ({
      ...s,
      token: s.token.slice(0, 8) + '...',
      secret: s.secret ? '***' : '',
    }));
  });

  // Get sede detail (with full token + secret — for copying to Odoo)
  app.get('/api/sedes/:id', async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const sede = await prisma.sede.findUnique({ where: { id } });
    if (!sede) return reply.status(404).send({ error: 'Sede no encontrada' });
    return sede;
  });

  // Create sede — generates token + secret
  app.post('/api/sedes', async (request, reply) => {
    const body = createSchema.parse(request.body);

    // Check prefix unique
    const existing = await prisma.sede.findUnique({ where: { prefix: body.prefix } });
    if (existing) {
      return reply.status(409).send({ error: `Ya existe una sede con prefijo ${body.prefix}` });
    }

    const token = randomUUID();
    const secret = randomBytes(32).toString('hex');

    const sede = await prisma.sede.create({
      data: {
        prefix: body.prefix,
        name: body.name,
        token,
        secret,
      },
    });

    return sede;
  });

  // Update sede
  app.put('/api/sedes/:id', async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const body = updateSchema.parse(request.body);

    const sede = await prisma.sede.findUnique({ where: { id } });
    if (!sede) return reply.status(404).send({ error: 'Sede no encontrada' });

    const updated = await prisma.sede.update({
      where: { id },
      data: body,
    });
    return updated;
  });

  // Regenerate token
  app.post('/api/sedes/:id/regenerar-token', async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);

    const sede = await prisma.sede.findUnique({ where: { id } });
    if (!sede) return reply.status(404).send({ error: 'Sede no encontrada' });

    const token = randomUUID();
    const updated = await prisma.sede.update({
      where: { id },
      data: { token },
    });
    return updated;
  });

  // Regenerate HMAC secret
  app.post('/api/sedes/:id/regenerar-secret', async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);

    const sede = await prisma.sede.findUnique({ where: { id } });
    if (!sede) return reply.status(404).send({ error: 'Sede no encontrada' });

    const secret = randomBytes(32).toString('hex');
    const updated = await prisma.sede.update({
      where: { id },
      data: { secret },
    });
    return updated;
  });
}
