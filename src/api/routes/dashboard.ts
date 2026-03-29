import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as repo from '../../db/repository';
import { requireRole } from '../middleware/auth';

const querySchema = z.object({
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
});

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('admin', 'confirmer'));

  app.get('/api/dashboard', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { fechaDesde, fechaHasta } = parsed.data;
    const result = await repo.getDashboardData({ fechaDesde, fechaHasta });

    return {
      gtTotals: result.gtTotals,
      matchStats: result.matchStats,
      pendientes: result.pendientes,
      porDia: result.porDia,
      recentMatches: result.recentMatches,
      odooAvailable: true,
    };
  });
}
