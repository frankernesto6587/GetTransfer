import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as repo from '../../db/repository';

const buscarSchema = z.object({
  importe: z.number().optional(),
  nombre: z.string().min(6, 'El nombre debe tener al menos 6 caracteres').optional(),
  ci: z.string().regex(/^\d{11}$/, 'El CI debe ser exactamente 11 digitos').optional(),
  cuentaOrdenante: z.string().transform(v => v.replace(/[\s-]/g, '')).pipe(z.string().regex(/^\d{16}$/, 'La cuenta debe ser exactamente 16 digitos')).optional(),
  refCorriente: z.string().min(1).optional(),
}).refine(
  (d) => {
    // nombre requires importe
    if (d.nombre && !d.importe) return false;
    // ci alone requires importe
    if (d.ci && !d.refCorriente && !d.importe) return false;
    // cuenta requires importe
    if (d.cuentaOrdenante && !d.importe) return false;
    // at least one valid combination
    return !!(d.refCorriente || (d.nombre && d.importe) || (d.ci && d.importe) || (d.cuentaOrdenante && d.importe));
  },
  { message: 'Combinacion de parametros invalida' },
);

const idSchema = z.object({
  id: z.coerce.number().int().min(1),
});

const codigoSchema = z.object({
  codigo: z.string().min(1),
});

export async function confirmarRoutes(app: FastifyInstance) {
  app.post('/api/confirmar/buscar', async (request, reply) => {
    const parsed = buscarSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const results = await repo.buscarPendientes(parsed.data);
    return results;
  });

  app.post('/api/confirmar/:id', async (request, reply) => {
    const parsed = idSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ID invalido' });
    }
    try {
      const result = await repo.confirmarTransferencia(parsed.data.id);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      const status = message.includes('no encontrada') ? 404 : 409;
      return reply.status(status).send({ error: message });
    }
  });

  app.get('/api/confirmar/:codigo', async (request, reply) => {
    const parsed = codigoSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Codigo invalido' });
    }
    const transfer = await repo.buscarPorCodigo(parsed.data.codigo);
    if (!transfer) {
      return reply.status(404).send({ error: 'Codigo no encontrado' });
    }
    return transfer;
  });

  // Release a claimed transfer (admin dashboard, no token required)
  app.post('/api/confirmar/:codigo/liberar', async (request, reply) => {
    const parsed = codigoSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Codigo invalido' });
    }
    try {
      const result = await repo.liberarTransferencia(parsed.data.codigo);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      if (message.includes('no encontrado')) return reply.status(404).send({ error: message });
      if (message.includes('no esta reclamada')) return reply.status(409).send({ error: message });
      return reply.status(500).send({ error: message });
    }
  });
}
