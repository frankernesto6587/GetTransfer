import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as repo from '../../db/repository';
import { requireRole } from '../middleware/auth';

const idSchema = z.object({
  id: z.coerce.number().int().min(1),
});

function nivelToManualMatchType(nivel?: number): string {
  const map: Record<number, string> = {
    1: 'CONFIRMED_MANUAL_REF_ACCOUNT_CI',
    2: 'CONFIRMED_MANUAL_CI_ACCOUNT_DATE',
    3: 'CONFIRMED_MANUAL_CI',
    4: 'CONFIRMED_MANUAL_ACCOUNT',
    5: 'CONFIRMED_MANUAL_NAME_DATE',
  };
  return nivel ? (map[nivel] || 'CONFIRMED_MANUAL_CI') : 'CONFIRMED_MANUAL_CI';
}

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

export async function confirmarOdooRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('admin', 'confirmer'));

  // GET /api/confirmar-odoo/config
  app.get('/api/confirmar-odoo/config', async () => {
    const config = await repo.getOdooConfig();
    return { api_url: config.api_url, api_key: config.api_key };
  });

  // PUT /api/confirmar-odoo/config (admin only)
  app.put('/api/confirmar-odoo/config', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as { api_url?: string; api_key?: string };
    if (!body.api_url && !body.api_key) {
      return reply.status(400).send({ error: 'Nada que actualizar' });
    }
    const config = await repo.updateOdooConfig(body);
    return { api_url: config.api_url, api_key: config.api_key };
  });

  // POST /api/confirmar-odoo/config/test — test Odoo connection with provided values
  app.post('/api/confirmar-odoo/config/test', async (request, reply) => {
    const body = request.body as { api_url?: string; api_key?: string } | null;
    const api_url = body?.api_url?.replace(/\/+$/, '');
    const api_key = body?.api_key;

    if (!api_url) {
      return reply.status(400).send({ error: 'URL de Odoo no proporcionada' });
    }

    try {
      const res = await fetch(`${api_url}/health`, {
        headers: api_key ? { 'X-API-Key': api_key } : {},
      });
      if (!res.ok) {
        return { ok: false, message: `Odoo respondio ${res.status}` };
      }
      return { ok: true, message: 'Conexion exitosa' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Error de conexion' };
    }
  });

  // Get all pending transfers (most recent by bank date)
  app.get('/api/confirmar-odoo/pendientes', async (request, _reply) => {
    const query = request.query as Record<string, string | undefined>;
    const page = query.page ? parseInt(query.page) : undefined;
    const limit = query.limit ? parseInt(query.limit) : undefined;
    const estado = query.estado as 'pendiente' | 'revision' | 'todos' | undefined;
    const result = await repo.getPendientesPorFecha({
      page,
      limit,
      nombre: query.nombre,
      ci: query.ci,
      cuenta: query.cuenta,
      canal: query.canal,
      fechaDesde: query.fechaDesde,
      fechaHasta: query.fechaHasta,
      estado,
    });
    return result;
  });

  // Search Odoo match for a specific pending transfer
  app.post('/api/confirmar-odoo/pendiente/:id/buscar', async (request, reply) => {
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
      const result = await odooFetch('/api/pos/gettransfer/buscar', {
        referencia: transfer.refOrigen || undefined,
        ci_ordenante: transfer.ciOrdenante || undefined,
        cuenta_ordenante: transfer.cuentaOrdenante || undefined,
        nombre_ordenante: transfer.nombreOrdenante || undefined,
        importe: transfer.importe,
        fecha: formatDate(transfer.fecha),
        canal_emision: transfer.canalEmision || undefined,
        dias_atras: 7,
      });
      return { transfer, odoo: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return reply.status(502).send({ error: `Error consultando Odoo: ${message}` });
    }
  });

  // Confirm in GT + write to Odoo
  app.post('/api/confirmar-odoo/pendiente/:id/confirmar', async (request, reply) => {
    const parsed = idSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ID invalido' });
    }

    const bodySchema = z.object({
      payment_id: z.number().int().min(1),
      nivel_confianza: z.number().int().min(1).max(6).optional(),
      match_auto: z.boolean().optional(),
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

    // Derive matchType
    const matchType = bodyParsed.data.match_auto
      ? 'CONFIRMED_AUTO'
      : nivelToManualMatchType(bodyParsed.data.nivel_confianza);
    const nivelConfianza = bodyParsed.data.nivel_confianza;

    // Step 1: Confirm in GT (generates GT code)
    let confirmed;
    try {
      confirmed = await repo.confirmarTransferencia(parsed.data.id, { matchType, nivelConfianza, confirmedBy: request.user?.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return reply.status(409).send({ error: message });
    }

    // Step 2: Write GT data to Odoo
    try {
      const odooResult = await odooFetch('/api/pos/gettransfer/confirmar', {
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

  // Desmachar: undo confirm (clear both Odoo gt_* and GT confirmation fields)
  app.post('/api/confirmar-odoo/pendiente/:id/desmachar', async (request, reply) => {
    const parsed = idSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ID invalido' });
    }

    const transfer = await repo.getById(parsed.data.id);
    if (!transfer) {
      return reply.status(404).send({ error: 'Transferencia no encontrada' });
    }
    if (!transfer.codigoConfirmacion) {
      return reply.status(409).send({ error: 'Transferencia no esta confirmada' });
    }

    // Step 1: Clear Odoo gt_* fields only if it was a GT- code (written to Odoo)
    if (transfer.codigoConfirmacion?.startsWith('GT-')) {
      try {
        await odooFetch('/api/pos/gettransfer/desmachar', {
          gt_codigo: transfer.codigoConfirmacion,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return reply.status(502).send({ error: `Error desmachando en Odoo: ${message}` });
      }
    }

    // Step 2: Clear GT confirmation fields
    const updated = await repo.desmacharTransferencia(parsed.data.id);
    return updated;
  });

  // Auto-process pending transfers
  app.post('/api/confirmar-odoo/auto', async (request, _reply) => {
    const bodySchema = z.object({
      nombre: z.string().optional(),
      ci: z.string().optional(),
      cuenta: z.string().optional(),
      canal: z.string().optional(),
      fechaDesde: z.string().optional(),
      fechaHasta: z.string().optional(),
    });
    const parsed = bodySchema.safeParse(request.body || {});

    const result = await repo.getPendientesPorFecha({
      nombre: parsed.success ? parsed.data.nombre : undefined,
      ci: parsed.success ? parsed.data.ci : undefined,
      cuenta: parsed.success ? parsed.data.cuenta : undefined,
      canal: parsed.success ? parsed.data.canal : undefined,
      fechaDesde: parsed.success ? parsed.data.fechaDesde : undefined,
      fechaHasta: parsed.success ? parsed.data.fechaHasta : undefined,
    });
    const pendientes = result.data;
    const resultados = {
      total: pendientes.length,
      confirmadas: 0,
      candidatos: 0,
      sin_match: 0,
      errores: 0,
      detalle: [] as Array<{
        id: number;
        nombreOrdenante: string;
        importe: number;
        searchAttempts: number;
        resultado: 'confirmada' | 'candidatos' | 'sin_match' | 'error';
        gt_codigo?: string;
        odoo_order?: string;
        error?: string;
      }>,
    };

    for (const transfer of pendientes) {
      try {
        // Search in Odoo
        const busqueda = await odooFetch('/api/pos/gettransfer/buscar', {
          referencia: transfer.refOrigen || undefined,
          ci_ordenante: transfer.ciOrdenante || undefined,
          cuenta_ordenante: transfer.cuentaOrdenante || undefined,
          nombre_ordenante: transfer.nombreOrdenante || undefined,
          importe: transfer.importe,
          fecha: formatDate(transfer.fecha),
          canal_emision: transfer.canalEmision || undefined,
          dias_atras: 7,
        });

        if (busqueda.match_auto && busqueda.resultado) {
          // Auto-confirm: GT + Odoo
          const confirmed = await repo.confirmarTransferencia(transfer.id, {
            matchType: 'CONFIRMED_AUTO',
            nivelConfianza: busqueda.nivel_confianza ?? undefined,
            confirmedBy: request.user?.name,
          });
          const odooResult = await odooFetch('/api/pos/gettransfer/confirmar', {
            payment_id: busqueda.resultado.payment_id,
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

          // Mark as claimed
          const orderName = odooResult.order_name || `payment:${busqueda.resultado.payment_id}`;
          await repo.reclamarTransferencia(confirmed.codigoConfirmacion!, orderName);

          resultados.confirmadas++;
          resultados.detalle.push({
            id: transfer.id,
            nombreOrdenante: transfer.nombreOrdenante,
            importe: transfer.importe,
            searchAttempts: transfer.searchAttempts,
            resultado: 'confirmada',
            gt_codigo: confirmed.codigoConfirmacion!,
            odoo_order: odooResult.order_name,
          });
        } else if (busqueda.candidatos && busqueda.candidatos.length > 0) {
          await repo.incrementSearchAttempts(transfer.id);
          resultados.candidatos++;
          resultados.detalle.push({
            id: transfer.id,
            nombreOrdenante: transfer.nombreOrdenante,
            importe: transfer.importe,
            searchAttempts: transfer.searchAttempts + 1,
            resultado: 'candidatos',
          });
        } else {
          await repo.incrementSearchAttempts(transfer.id);
          resultados.sin_match++;
          resultados.detalle.push({
            id: transfer.id,
            nombreOrdenante: transfer.nombreOrdenante,
            importe: transfer.importe,
            searchAttempts: transfer.searchAttempts + 1,
            resultado: 'sin_match',
          });
        }
      } catch (err) {
        resultados.errores++;
        resultados.detalle.push({
          id: transfer.id,
          nombreOrdenante: transfer.nombreOrdenante,
          importe: transfer.importe,
          searchAttempts: transfer.searchAttempts,
          resultado: 'error',
          error: err instanceof Error ? err.message : 'Error desconocido',
        });
      }
    }

    return resultados;
  });

  // Special action: deposit, buy, or review
  app.post('/api/confirmar-odoo/pendiente/:id/accion-especial', async (request, reply) => {
    const parsed = idSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ID invalido' });
    }

    const bodySchema = z.object({
      accion: z.enum(['CONFIRMED_DEPOSIT', 'CONFIRMED_BUY', 'REVIEW_REQUIRED']),
    });
    const bodyParsed = bodySchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.status(400).send({ error: 'accion invalida (CONFIRMED_DEPOSIT | CONFIRMED_BUY | REVIEW_REQUIRED)' });
    }

    try {
      const updated = await repo.specialAction(parsed.data.id, bodyParsed.data.accion, request.user?.name);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return reply.status(409).send({ error: message });
    }
  });
}
