import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as repo from '../../db/repository';
import { requireRole } from '../middleware/auth';

const idSchema = z.object({
  id: z.coerce.number().int().min(1),
});

/** Format Date to YYYY-MM-DD string */
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function odooFetch(path: string, body: Record<string, unknown>) {
  const config = await repo.getOdooConfig();
  if (!config.api_url || !config.api_key) {
    throw new Error('Odoo API no configurada. Ve a Configuracion para ingresar URL y API Key.');
  }
  const res = await fetch(`${config.api_url}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.api_key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Odoo API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function confirmarOdooLegacyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('admin', 'confirmer'));

  // Get legacy pending transfers (pre-9 marzo 2025)
  app.get('/api/confirmar-odoo-legacy/pendientes', async (request, _reply) => {
    const query = request.query as Record<string, string | undefined>;
    const page = query.page ? parseInt(query.page) : undefined;
    const limit = query.limit ? parseInt(query.limit) : undefined;
    const result = await repo.getPendientesLegacy({
      page,
      limit,
      nombre: query.nombre,
      ci: query.ci,
      cuenta: query.cuenta,
      canal: query.canal,
    });
    return result;
  });

  // Search Odoo legacy match for a specific pending transfer
  app.post('/api/confirmar-odoo-legacy/pendiente/:id/buscar', async (request, reply) => {
    const parsed = idSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ID invalido' });
    }

    const transfer = await repo.getById(parsed.data.id);
    if (!transfer) {
      return reply.status(404).send({ error: 'Transferencia no encontrada' });
    }
    if (transfer.codigoConfirmacion) {
      return reply.status(409).send({ error: 'Transferencia ya confirmada' });
    }

    try {
      const result = await odooFetch('/api/pos/gettransfer/buscar-legacy', {
        referencia: transfer.refOrigen || undefined,
        nombre_ordenante: transfer.nombreOrdenante || undefined,
        importe: transfer.importe,
        fecha: formatDate(transfer.fecha),
        canal_emision: transfer.canalEmision || undefined,
        dias_atras: 14,
      });
      return { transfer, odoo: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return reply.status(502).send({ error: `Error consultando Odoo: ${message}` });
    }
  });

  // Confirm legacy in GT + write to Odoo
  app.post('/api/confirmar-odoo-legacy/pendiente/:id/confirmar', async (request, reply) => {
    const parsed = idSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ID invalido' });
    }

    const bodySchema = z.object({
      payment_id: z.number().int().min(1),
    });
    const bodyParsed = bodySchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.status(400).send({ error: 'payment_id requerido' });
    }

    const transfer = await repo.getById(parsed.data.id);
    if (!transfer) {
      return reply.status(404).send({ error: 'Transferencia no encontrada' });
    }
    if (transfer.codigoConfirmacion) {
      return reply.status(409).send({ error: 'Transferencia ya confirmada' });
    }

    // Step 1: Confirm in GT (generates GT code)
    let confirmed;
    try {
      confirmed = await repo.confirmarTransferencia(parsed.data.id, { confirmedBy: request.user?.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return reply.status(409).send({ error: message });
    }

    // Step 2: Write GT data to Odoo (legacy endpoint with backfill)
    try {
      const odooResult = await odooFetch('/api/pos/gettransfer/confirmar-legacy', {
        payment_id: bodyParsed.data.payment_id,
        gt_codigo: confirmed.codigoConfirmacion,
        gt_nombre_ordenante: confirmed.nombreOrdenante || undefined,
        gt_ci_ordenante: confirmed.ciOrdenante || undefined,
        gt_cuenta_ordenante: confirmed.cuentaOrdenante || undefined,
        gt_canal_emision: confirmed.canalEmision || undefined,
        gt_ref_corriente: confirmed.refCorriente || undefined,
        gt_ref_origen: confirmed.refOrigen || undefined,
        gt_fecha: formatDate(confirmed.fecha),
        gt_importe: confirmed.importe,
      });

      // Step 3: Mark as claimed in GT
      const orderName = odooResult.order_name || `payment:${bodyParsed.data.payment_id}`;
      await repo.reclamarTransferencia(confirmed.codigoConfirmacion!, orderName);

      return { confirmed: { ...confirmed, claimedAt: new Date(), claimedBy: orderName }, odoo: odooResult };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      // GT was confirmed but Odoo write failed - return partial success
      return {
        confirmed,
        odoo: { success: false, message: `GT confirmado pero error en Odoo: ${message}` },
      };
    }
  });
}
