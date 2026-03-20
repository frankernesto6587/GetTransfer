import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as repo from '../../db/repository';
import { requireRole } from '../middleware/auth';

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

const querySchema = z.object({
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  nombre: z.string().optional(),
  ci: z.string().optional(),
  cuenta: z.string().optional(),
  canal: z.string().optional(),
  refOrigen: z.string().optional(),
  gtCodigo: z.string().optional(),
  transferCode: z.string().optional(),
  desde: z.coerce.number().optional(),
  hasta: z.coerce.number().optional(),
  paymentType: z.string().optional(),
  orderBy: z.string().optional(),
  orderDir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function transferenciasOdooRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('admin', 'confirmer'));

  // POST proxy — update payment fields (CI, cuenta, transfer_code)
  app.post('/api/transferencias-odoo/:paymentId/editar', async (request, reply) => {
    const { paymentId } = request.params as { paymentId: string };
    const body = request.body as Record<string, unknown>;

    const allowed = ['card_holder_name', 'card_holder_ci', 'card_number', 'transfer_code'];
    const fields: Record<string, unknown> = { payment_id: Number(paymentId) };
    for (const key of allowed) {
      if (body[key] !== undefined) fields[key] = body[key];
    }

    if (Object.keys(fields).length <= 1) {
      return reply.status(400).send({ error: 'Debe enviar al menos un campo: card_holder_name, card_holder_ci, card_number, transfer_code' });
    }

    try {
      const result = await odooFetch('/api/pos/gettransfer/editar-payment', fields);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return reply.status(502).send({ error: `Error actualizando payment en Odoo: ${message}` });
    }
  });

  app.get('/api/transferencias-odoo', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Parametros invalidos', details: parsed.error.issues });
    }

    const q = parsed.data;
    const body: Record<string, unknown> = {
      page: q.page || 1,
      limit: q.limit || 50,
    };

    if (q.fechaDesde) body.fecha_desde = q.fechaDesde;
    if (q.fechaHasta) body.fecha_hasta = q.fechaHasta;
    if (q.nombre) body.nombre = q.nombre;
    if (q.ci) body.ci = q.ci;
    if (q.cuenta) body.cuenta = q.cuenta;
    if (q.canal) body.canal = q.canal;
    if (q.refOrigen) body.ref_origen = q.refOrigen;
    if (q.gtCodigo) body.gt_codigo = q.gtCodigo;
    if (q.transferCode) body.transfer_code = q.transferCode;
    if (q.desde !== undefined) body.importe_min = q.desde;
    if (q.hasta !== undefined) body.importe_max = q.hasta;
    if (q.paymentType) body.payment_type = q.paymentType;
    if (q.orderBy) body.order_by = q.orderBy;
    if (q.orderDir) body.order_dir = q.orderDir;

    try {
      const result = await odooFetch('/api/pos/gettransfer/transferencias', body);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return reply.status(502).send({ error: `Error consultando Odoo: ${message}` });
    }
  });
}
