import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { bearerAuth } from '../middleware/auth';
import { prisma } from '../../db/repository';
import * as repo from '../../db/repository';

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

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const querySchema = z.object({
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
});

const CSV_COLUMNS = [
  'fecha_gt', 'fecha_odoo', 'nombre_gt', 'nombre_odoo', 'codigo_gt', 'codigo_odoo',
  'cuenta_gt', 'cuenta_odoo', 'ci_gt', 'ci_odoo', 'monto_gt', 'monto_odoo',
  'tipo_match', 'orden_odoo', 'confirmedBy',
];

export async function exportRoutes(app: FastifyInstance) {
  app.addHook('onRequest', bearerAuth);

  app.get('/api/export/matches', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const q = parsed.data;

    // Build where clause
    const where: any = { codigoConfirmacion: { not: null } };
    if (q.fechaDesde || q.fechaHasta) {
      where.fecha = {};
      if (q.fechaDesde) where.fecha.gte = new Date(q.fechaDesde + 'T00:00:00Z');
      if (q.fechaHasta) where.fecha.lte = new Date(q.fechaHasta + 'T23:59:59Z');
    }

    // Fetch all matches (no pagination)
    const transfers = await prisma.transferencia.findMany({
      where,
      orderBy: { fecha: 'desc' },
    });

    // Fetch Odoo data in a single bulk request
    const odooMap = new Map<string, any>();
    const gtCodes = transfers
      .map((t: any) => t.codigoConfirmacion)
      .filter(Boolean) as string[];

    if (gtCodes.length > 0) {
      const bulkResult = await odooFetchWithTimeout(
        '/api/pos/gettransfer/bulk-by-codes',
        { gt_codigos: gtCodes },
        30000,
      );

      if (bulkResult?.data) {
        for (const item of bulkResult.data) {
          if (item.gt_codigo) {
            odooMap.set(item.gt_codigo, item);
          }
        }

        // Fallback: for unmatched, try matching by transfer_code = refOrigen
        for (const t of transfers) {
          if (t.codigoConfirmacion && !odooMap.has(t.codigoConfirmacion) && t.refOrigen) {
            const match = bulkResult.data.find((item: any) => item.transfer_code === t.refOrigen);
            if (match) {
              odooMap.set(t.codigoConfirmacion, match);
            }
          }
        }
      }
    }

    // Build CSV
    const header = CSV_COLUMNS.join(',');
    const rows = transfers.map((gt: any) => {
      const odoo = gt.codigoConfirmacion ? odooMap.get(gt.codigoConfirmacion) : null;
      const row: Record<string, unknown> = {
        fecha_gt: gt.fecha instanceof Date ? gt.fecha.toISOString().split('T')[0] : gt.fecha,
        fecha_odoo: odoo?.order_date?.split(' ')[0] ?? null,
        nombre_gt: gt.nombreOrdenante,
        nombre_odoo: odoo?.card_holder_name ?? null,
        codigo_gt: gt.refOrigen,
        codigo_odoo: odoo?.transfer_code ?? null,
        cuenta_gt: gt.cuentaOrdenante,
        cuenta_odoo: odoo?.card_number ?? null,
        ci_gt: gt.ciOrdenante,
        ci_odoo: odoo?.card_holder_ci ?? null,
        monto_gt: gt.importe,
        monto_odoo: odoo?.amount ?? null,
        tipo_match: gt.matchType,
        orden_odoo: odoo?.order_name ?? null,
        confirmedBy: gt.confirmedBy ?? 'System',
      };
      return CSV_COLUMNS.map(col => escapeCsvField(row[col])).join(',');
    });

    const csv = '\uFEFF' + header + '\r\n' + rows.join('\r\n') + '\r\n';
    const today = new Date().toISOString().split('T')[0];

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="matches-${today}.csv"`)
      .send(csv);
  });
}
