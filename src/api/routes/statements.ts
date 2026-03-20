import { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/auth';
import { processStatementUpload, StatementValidationError } from '../../statements/statement-service';
import { prisma } from '../../db/repository';

export async function statementRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('admin'));

  // POST /api/statements/upload — upload ZIP with XML statement files
  app.post('/api/statements/upload', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No se recibió ningún archivo' });
    }

    if (!data.filename.toLowerCase().endsWith('.zip')) {
      return reply.status(400).send({ error: 'El archivo debe ser un .zip' });
    }

    const buffer = await data.toBuffer();
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Usuario no autenticado' });
    }

    try {
      const result = await processStatementUpload(buffer, data.filename, userId);
      return result;
    } catch (err: any) {
      if (err instanceof StatementValidationError) {
        return reply.status(400).send({ error: 'Errores de validación', details: err.errors });
      }
      request.log.error({ err, filename: data.filename }, 'Statement upload failed');
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /api/statements/uploads — upload history with pagination
  app.get('/api/statements/uploads', async (request) => {
    const query = request.query as { page?: string; limit?: string };
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');

    const [data, total] = await Promise.all([
      prisma.statementUpload.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.statementUpload.count(),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  });
}
