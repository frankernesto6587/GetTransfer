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
  nombre: z.string().optional(),
  ci: z.string().optional(),
  cuenta: z.string().optional(),
  codigo: z.string().optional(),
  canal: z.string().optional(),
  matchType: z.string().optional(),
  desde: z.coerce.number().optional(),
  hasta: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  orderBy: z.string().optional(),
  orderDir: z.enum(['asc', 'desc']).optional(),
});

export async function matchesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('admin', 'confirmer'));

  app.get('/api/matches', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const q = parsed.data;

    // 1. Query local DB for matched transfers
    const gtResult = await repo.getAll({
      estado: 'matched',
      matchType: q.matchType || undefined,
      fechaDesde: q.fechaDesde,
      fechaHasta: q.fechaHasta,
      nombre: q.nombre,
      ci: q.ci,
      cuenta: q.cuenta,
      codigo: q.codigo,
      canal: q.canal,
      desde: q.desde,
      hasta: q.hasta,
      page: q.page,
      limit: q.limit,
      orderBy: q.orderBy,
      orderDir: q.orderDir,
    });

    // 2. Extract GT codes from current page
    const gtCodes = gtResult.data
      .map((t: any) => t.codigoConfirmacion)
      .filter(Boolean) as string[];

    // 3. Fetch Odoo data for matching date range (with timeout)
    let odooAvailable = false;
    const odooMap = new Map<string, any>();

    if (gtCodes.length > 0) {
      // Fetch Odoo payments individually by gt_codigo for each GT code on this page
      // Use parallel requests with timeout for performance
      const odooPromises = gtCodes.map(code =>
        odooFetchWithTimeout('/api/pos/gettransfer/transferencias', {
          page: 1,
          limit: 1,
          gt_codigo: code,
        }).then(result => {
          if (result?.data?.[0]) {
            return { code, item: result.data[0] };
          }
          return null;
        })
      );

      const results = await Promise.all(odooPromises);
      const anySuccess = results.some(r => r !== null);

      if (anySuccess) {
        odooAvailable = true;
        for (const r of results) {
          if (r) odooMap.set(r.code, r.item);
        }
      }
    }

    // 4. Merge GT + Odoo data
    const mergedData = gtResult.data.map((gt: any) => {
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
      data: mergedData,
      pagination: gtResult.pagination,
      totals: gtResult.totals,
      odooAvailable,
    };
  });
}
