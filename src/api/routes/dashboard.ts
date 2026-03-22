import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as repo from '../../db/repository';
import { requireRole } from '../middleware/auth';

async function odooFetch(path: string, body: Record<string, unknown>) {
  const config = await repo.getOdooConfig();
  if (!config.api_url || !config.api_key) return null;

  const res = await fetch(`${config.api_url}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.api_key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

async function odooFetchWithTimeout(path: string, body: Record<string, unknown>, timeoutMs = 5000) {
  try {
    const result = await Promise.race([
      odooFetch(path, body),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return result;
  } catch {
    return null;
  }
}

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

    // Fetch Odoo data for recent matches
    const gtCodes = result.recentMatches
      .map((t: any) => t.codigoConfirmacion)
      .filter(Boolean) as string[];

    let odooAvailable = false;
    const odooMap = new Map<string, any>();

    if (gtCodes.length > 0) {
      const odooPromises = gtCodes.map(code =>
        odooFetchWithTimeout('/api/pos/gettransfer/transferencias', {
          page: 1,
          limit: 1,
          gt_codigo: code,
        }).then(r => r?.data?.[0] ? { code, item: r.data[0] } : null)
      );

      const results = await Promise.all(odooPromises);
      for (const r of results) {
        if (r) {
          odooAvailable = true;
          odooMap.set(r.code, r.item);
        }
      }

      // Fallback: try by transfer_code = refOrigen
      const unmatched = result.recentMatches.filter((gt: any) =>
        gt.codigoConfirmacion && !odooMap.has(gt.codigoConfirmacion) && gt.refOrigen
      );

      if (unmatched.length > 0) {
        const fallbackPromises = unmatched.map((gt: any) =>
          odooFetchWithTimeout('/api/pos/gettransfer/transferencias', {
            page: 1,
            limit: 1,
            transfer_code: gt.refOrigen,
          }).then(r => r?.data?.[0]
            ? { code: gt.codigoConfirmacion, item: r.data[0] }
            : null
          )
        );

        const fallbackResults = await Promise.all(fallbackPromises);
        for (const r of fallbackResults) {
          if (r) {
            odooAvailable = true;
            odooMap.set(r.code, r.item);
          }
        }
      }
    }

    // Merge Odoo data into recent matches
    const recentMatches = result.recentMatches.map((gt: any) => {
      const odoo = gt.codigoConfirmacion ? odooMap.get(gt.codigoConfirmacion) : null;
      return {
        ...gt,
        odoo_order_date: odoo?.order_date ?? null,
        odoo_order_name: odoo?.order_name ?? null,
        odoo_card_holder_name: odoo?.card_holder_name ?? null,
        odoo_card_holder_ci: odoo?.card_holder_ci ?? null,
        odoo_card_number: odoo?.card_number ?? null,
        odoo_payment_type: odoo?.payment_type ?? null,
        odoo_session_name: odoo?.session_name ?? null,
        odoo_transfer_code: odoo?.transfer_code ?? null,
      };
    });

    return {
      gtTotals: result.gtTotals,
      matchStats: result.matchStats,
      pendientes: result.pendientes,
      porDia: result.porDia,
      recentMatches,
      odooAvailable,
    };
  });
}
