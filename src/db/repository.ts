import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { customAlphabet } from 'nanoid';
import { TransferenciaEntrada } from '../scraper/parser';
import { classifyDebit } from '../scraper/debit-classifier';

const generateCode = customAlphabet('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 8);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

export { prisma };

const sortableColumns = ['fecha', 'importe', 'nombreOrdenante', 'canalEmision', 'refOrigen', 'refCorriente', 'ciOrdenante', 'cuentaOrdenante', 'codigoConfirmacion', 'confirmedAt', 'claimedAt'] as const;
type SortableColumn = typeof sortableColumns[number];

export interface TransferenciaFilters {
  fecha?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  nombre?: string;
  desde?: number;
  hasta?: number;
  canal?: string;
  ci?: string;
  cuenta?: string;
  refOrigen?: string;
  codigo?: string;
  estado?: 'pendiente' | 'confirmada' | 'reclamada' | 'matched';
  matchType?: string;
  tipo?: string;
  source?: string;
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

function compositeKey(t: { refCorriente: string; refOrigen: string; importe: number; fecha: Date; tipo: string }): string {
  return `${t.refCorriente}|${t.refOrigen}|${t.importe}|${t.fecha.toISOString().slice(0, 10)}|${t.tipo}`;
}

export type TransferenciaNueva = TransferenciaEntrada & { categoria: string };

export async function upsertMany(
  transfers: TransferenciaEntrada[],
  opts?: { source?: string }
): Promise<{ total: number; nuevas: number; nuevasList: TransferenciaNueva[] }> {
  const withCategoria: TransferenciaNueva[] = transfers.map(t => ({
    ...t,
    categoria: t.tipo === 'Db' ? classifyDebit(t.observacionesRaw, t.refCorriente) : '',
  }));

  // Find which composite keys already exist
  const refs = transfers.map(t => t.refOrigen);
  const existing = await prisma.transferencia.findMany({
    where: { refOrigen: { in: refs } },
    select: { refCorriente: true, refOrigen: true, importe: true, fecha: true, tipo: true },
  });
  const existingKeys = new Set(existing.map(e => compositeKey(e)));

  const source = opts?.source || 'scraper';

  const result = await prisma.transferencia.createMany({
    data: withCategoria.map(t => ({
      fecha: t.fecha,
      refCorriente: t.refCorriente,
      refOrigen: t.refOrigen,
      importe: t.importe,
      tipo: t.tipo,
      source,
      nombreOrdenante: t.nombreOrdenante,
      ciOrdenante: t.ciOrdenante,
      tarjetaOrdenante: t.tarjetaOrdenante,
      cuentaOrdenante: t.cuentaOrdenante,
      idCubacel: t.idCubacel,
      telefonoOrdenante: t.telefonoOrdenante,
      canalEmision: t.canalEmision,
      sucursalOrdenante: t.sucursalOrdenante,
      numDebito: t.numDebito,
      tipoServicio: t.tipoServicio,
      fechaFactura: t.fechaFactura,
      formato: t.formato,
      observacionesRaw: t.observacionesRaw,
      categoria: t.categoria,
    })),
    skipDuplicates: true,
  });

  const nuevasList = withCategoria.filter(t => !existingKeys.has(compositeKey(t)));

  // Auto-match new transfers with pending solicitudes
  if (result.count > 0) {
    try {
      const matched = await tryAutoMatch();
      if (matched > 0) console.log(`[AutoMatch] ${matched} solicitudes auto-conciliadas tras insertar transferencias`);
    } catch (err) {
      console.error('[AutoMatch] Error:', err);
    }
  }

  return { total: transfers.length, nuevas: result.count, nuevasList };
}

const BANDEC_PREFIX = 'KW';        // los codigos de BANDEC siempre empiezan por "KW"
const AUTO_MATCH_MAX_DIAS = 7;     // solo se auto-concilian solicitudes recientes; las viejas quedan a revision manual

/** Un transferCode es de BANDEC solo si empieza por "KW" (ignora espacios y mayus/minus). */
function esCodigoBandec(code: string | null | undefined): code is string {
  return !!code && code.trim().toUpperCase().startsWith(BANDEC_PREFIX);
}

/**
 * Auto-conciliar solicitudes pendientes con transferencias del banco.
 * Match estricto: monto exacto + transferCode/refOrigen + cuenta + CI (4 campos).
 * Solo procesa solicitudes recientes (ventana AUTO_MATCH_MAX_DIAS): las viejas
 * sin conciliar se dejan tal cual, a revision manual.
 */
export async function tryAutoMatch(): Promise<number> {
  const cutoff = new Date(Date.now() - AUTO_MATCH_MAX_DIAS * 86_400_000);
  const solicitudes = await prisma.solicitud.findMany({
    where: {
      workflowStatus: { not: 'cancelled' },
      reconStatus: 'unmatched',
      transferCode: { not: '' },
      creadoAt: { gte: cutoff },
    },
  });

  let matched = 0;
  for (const sol of solicitudes) {
    if (!sol.transferCode) continue;
    // Regla BANDEC: los codigos de BANDEC siempre empiezan por "KW". Una solicitud
    // cuyo transferCode NO empieza por KW no puede casar con una transferencia BANDEC.
    if (!esCodigoBandec(sol.transferCode)) continue;
    const transfer = await prisma.transferencia.findFirst({
      where: {
        solicitud: { is: null },
        tipo: 'Cr',
        importe: Number(sol.monto),
        // trim(): los datos de la solicitud llegan a veces con espacios sobrantes
        // (p.ej. clienteCi "12345678901 "), lo que rompia el match exacto.
        refOrigen: { equals: sol.transferCode.trim(), mode: 'insensitive' },
        cuentaOrdenante: sol.clienteCuenta.trim(),
        ciOrdenante: sol.clienteCi.trim(),
      },
    });
    if (transfer) {
      await prisma.solicitud.update({
        where: { id: sol.id },
        data: {
          transferenciaId: transfer.id,
          reconStatus: 'matched',
          conciliadaAt: new Date(),
          conciliadaPor: 'auto',
          matchNivel: null,
          sedeNotified: false,
        },
      });
      // Mark transferencia as confirmed
      await prisma.transferencia.update({
        where: { id: transfer.id },
        data: {
          codigoConfirmacion: sol.codigo,
          confirmedAt: new Date(),
          confirmedBy: 'auto',
        },
      });
      matched++;
    }
  }

  // Pase 2: regla BPA (canal BANCAMOVIL-BPA; estos NO traen CI ni codigo).
  matched += await tryAutoMatchBpa(cutoff);

  return matched;
}

const BPA_CANAL = 'BANCAMOVIL-BPA';
const BPA_NOMBRE_SIM_MIN = 90;   // % minimo de similitud de nombre
const BPA_VENTANA_DIAS = 5;      // +- dias entre fecha de la transferencia y creadoAt de la solicitud

/**
 * Similitud de nombre por tokens (0-100), normalizando mayusculas/acentos/simbolos.
 * Compartida con la conciliacion manual nivel 5 (conciliar.ts).
 */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  const tokensA = normalize(a).split(/\s+/).filter(Boolean);
  const tokensB = normalize(b).split(/\s+/).filter(Boolean);
  if (!tokensA.length || !tokensB.length) return 0;
  let matched = 0;
  for (const ta of tokensA) {
    for (const tb of tokensB) {
      if (ta === tb) { matched++; break; }
      if (ta.length >= 2 && tb.startsWith(ta)) { matched += 0.8; break; }
      if (tb.length >= 2 && ta.startsWith(tb)) { matched += 0.8; break; }
    }
  }
  return (matched / Math.max(tokensA.length, tokensB.length)) * 100;
}

/**
 * Auto-conciliar solicitudes con transferencias BPA (canalEmision BANCAMOVIL-BPA),
 * que NO traen CI ni codigo de transferencia. Regla menos estricta que la de BANDEC:
 * tipo 'Cr' + monto exacto + cuenta + nombre similar >= 90% + fecha dentro de +-5 dias
 * del creadoAt de la solicitud.
 *
 * Cuando un cliente hace varios pagos identicos (misma cuenta+monto+nombre) y tiene
 * varias solicitudes, hay multiples candidatos validos. En vez de descartarlos por
 * ambiguedad, se emparejan 1:1 por CERCANIA DE FECHA: se procesan las solicitudes de
 * la mas antigua a la mas reciente y cada una toma la transferencia disponible mas
 * cercana a su creadoAt (la diferencia nunca excede +-5 dias, garantizado por la
 * ventana de busqueda). Una transferencia ya asignada en esta pasada no se reutiliza.
 */
async function tryAutoMatchBpa(cutoff: Date): Promise<number> {
  const solicitudes = await prisma.solicitud.findMany({
    where: {
      workflowStatus: { not: 'cancelled' },
      reconStatus: 'unmatched',
      creadoAt: { gte: cutoff },
    },
    orderBy: { creadoAt: 'asc' },
  });

  let matched = 0;
  const usadas = new Set<number>(); // transferencias ya asignadas en esta pasada
  for (const sol of solicitudes) {
    if (!sol.clienteCuenta || !sol.clienteNombre) continue;

    // BANDEC tiene prioridad sobre BPA: si la solicitud trae un codigo BANDEC ("KW...")
    // y existe una transferencia que casa por refOrigen<->transferCode + monto (dominio
    // del pase BANDEC), esta solicitud pertenece a BANDEC y NO se auto-confirma por BPA
    // aunque haya un candidato; se deja al pase BANDEC / revision manual para no confirmar
    // con la transferencia equivocada. (Los codigos no-KW, p.ej. BPA "BR...", no aplican.)
    if (esCodigoBandec(sol.transferCode)) {
      const bandec = await prisma.transferencia.findFirst({
        where: {
          solicitud: { is: null },
          tipo: 'Cr',
          importe: Number(sol.monto),
          refOrigen: { equals: sol.transferCode.trim(), mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (bandec) continue;
    }

    const desde = new Date(sol.creadoAt.getTime() - BPA_VENTANA_DIAS * 86_400_000);
    const hasta = new Date(sol.creadoAt.getTime() + BPA_VENTANA_DIAS * 86_400_000);

    const candidatos = await prisma.transferencia.findMany({
      where: {
        solicitud: { is: null },
        tipo: 'Cr',
        canalEmision: BPA_CANAL,
        importe: Number(sol.monto),
        cuentaOrdenante: sol.clienteCuenta.trim(),
        fecha: { gte: desde, lte: hasta },
        ...(usadas.size ? { id: { notIn: [...usadas] } } : {}),
      },
    });

    const porNombre = candidatos.filter(
      (t) => nameSimilarity(t.nombreOrdenante, sol.clienteNombre) >= BPA_NOMBRE_SIM_MIN
    );
    if (porNombre.length === 0) continue;

    // Varios candidatos validos -> tomar el de fecha mas cercana al creadoAt
    // (desempate por id para que sea determinista).
    porNombre.sort((a, b) => {
      const da = Math.abs(a.fecha.getTime() - sol.creadoAt.getTime());
      const db = Math.abs(b.fecha.getTime() - sol.creadoAt.getTime());
      return da - db || a.id - b.id;
    });

    const transfer = porNombre[0];
    usadas.add(transfer.id);
    await prisma.solicitud.update({
      where: { id: sol.id },
      data: {
        transferenciaId: transfer.id,
        reconStatus: 'matched',
        conciliadaAt: new Date(),
        conciliadaPor: 'auto',
        matchNivel: null,
        sedeNotified: false,
      },
    });
    await prisma.transferencia.update({
      where: { id: transfer.id },
      data: {
        codigoConfirmacion: sol.codigo,
        confirmedAt: new Date(),
        confirmedBy: 'auto',
        matchType: 'AUTO_BPA',
      },
    });
    matched++;
  }
  return matched;
}

export async function getAll(filters: TransferenciaFilters = {}) {
  const { fecha, fechaDesde, fechaHasta, nombre, desde, hasta, canal, ci, cuenta, refOrigen, codigo, estado, matchType, tipo, source, page = 1, limit = 50, orderBy, orderDir = 'desc' } = filters;

  const where: Prisma.TransferenciaWhereInput = {};

  if (fecha) {
    where.fecha = new Date(fecha + 'T00:00:00Z');
  } else if (fechaDesde || fechaHasta) {
    where.fecha = {};
    if (fechaDesde) (where.fecha as any).gte = new Date(fechaDesde + 'T00:00:00Z');
    if (fechaHasta) (where.fecha as any).lte = new Date(fechaHasta + 'T23:59:59Z');
  }
  if (nombre) where.nombreOrdenante = { contains: nombre, mode: 'insensitive' };
  if (desde !== undefined || hasta !== undefined) {
    where.importe = {};
    if (desde !== undefined) where.importe.gte = desde;
    if (hasta !== undefined) where.importe.lte = hasta;
  }
  if (canal) where.canalEmision = { contains: canal, mode: 'insensitive' };
  if (ci) where.ciOrdenante = { contains: ci, mode: 'insensitive' };
  if (cuenta) where.cuentaOrdenante = { contains: cuenta, mode: 'insensitive' };
  if (refOrigen) where.refOrigen = { contains: refOrigen, mode: 'insensitive' };
  if (codigo) where.codigoConfirmacion = { contains: codigo, mode: 'insensitive' };
  if (estado === 'pendiente') where.codigoConfirmacion = null;
  if (estado === 'confirmada') { where.codigoConfirmacion = { not: null }; where.claimedAt = null; }
  if (estado === 'reclamada') where.claimedAt = { not: null };
  if (estado === 'matched') where.codigoConfirmacion = { not: null };
  if (matchType) {
    if (matchType === 'CONFIRMED_MANUAL') {
      where.matchType = { startsWith: 'CONFIRMED_MANUAL' };
    } else {
      where.matchType = matchType;
    }
  }
  if (tipo) where.tipo = tipo;
  if (source) where.source = source;

  const standardOrderBy = orderBy && sortableColumns.includes(orderBy as SortableColumn)
    ? [{ [orderBy]: orderDir }, { id: 'desc' as const }]
    : [{ fecha: 'desc' as const }, { id: 'desc' as const }];

  const [data, total, aggregates, aggCreditos, aggDebitos] = await Promise.all([
    prisma.transferencia.findMany({
      where,
      orderBy: standardOrderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transferencia.count({ where }),
    prisma.transferencia.aggregate({
      where,
      _sum: { importe: true },
      _count: { id: true },
    }),
    prisma.transferencia.aggregate({
      where: { ...where, tipo: 'Cr' },
      _sum: { importe: true },
      _count: { id: true },
    }),
    prisma.transferencia.aggregate({
      where: { ...where, tipo: 'Db' },
      _sum: { importe: true },
      _count: { id: true },
    }),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    totals: {
      importe: aggregates._sum.importe ?? 0,
      cantidad: aggregates._count.id,
      importeCreditos: aggCreditos._sum.importe ?? 0,
      cantidadCreditos: aggCreditos._count.id,
      importeDebitos: aggDebitos._sum.importe ?? 0,
      cantidadDebitos: aggDebitos._count.id,
    },
  };
}

export async function getByRefOrigen(refOrigen: string) {
  return prisma.transferencia.findFirst({ where: { refOrigen } });
}

export async function getResumen() {
  const porDia = await prisma.transferencia.groupBy({
    by: ['fecha'],
    _count: { id: true },
    _sum: { importe: true },
    orderBy: { fecha: 'asc' },
  });

  const totales = await prisma.transferencia.aggregate({
    _count: { id: true },
    _sum: { importe: true },
  });

  return {
    porDia: porDia.map(d => ({
      fecha: d.fecha,
      cantidad: d._count.id,
      total: d._sum.importe ?? 0,
    })),
    totales: {
      cantidad: totales._count.id,
      total: totales._sum.importe ?? 0,
    },
  };
}

export interface BuscarPendientesParams {
  importe?: number;
  nombre?: string;
  ci?: string;
  cuentaOrdenante?: string;
  refCorriente?: string;
}

export async function getById(id: number) {
  return prisma.transferencia.findUnique({ where: { id } });
}

export interface PendientesFilters {
  nombre?: string;
  ci?: string;
  cuenta?: string;
  canal?: string;
  fechaDesde?: string;  // YYYY-MM-DD
  fechaHasta?: string;  // YYYY-MM-DD
  estado?: 'pendiente' | 'revision' | 'todos';
}

export async function getPendientesPorFecha(limitOrFilters?: number | (PendientesFilters & { page?: number; limit?: number }), filters?: PendientesFilters) {
  // Support both old signature (limit, filters) and new signature (filtersWithPagination)
  let page = 1;
  let limit = 0;
  let filterParams: PendientesFilters = {};

  if (typeof limitOrFilters === 'number') {
    limit = limitOrFilters;
    filterParams = filters || {};
  } else if (limitOrFilters) {
    const { page: p, limit: l, ...rest } = limitOrFilters;
    page = p || 1;
    limit = l ?? 0;
    filterParams = rest;
  }

  const where: Prisma.TransferenciaWhereInput = {};
  const estado = filterParams.estado || 'pendiente';
  if (estado === 'pendiente') {
    where.codigoConfirmacion = null;
  } else if (estado === 'revision') {
    where.matchType = 'REVIEW_REQUIRED';
  }
  // 'todos' = no filter on confirmation status
  if (filterParams.nombre) where.nombreOrdenante = { contains: filterParams.nombre, mode: 'insensitive' };
  if (filterParams.ci) where.ciOrdenante = { contains: filterParams.ci, mode: 'insensitive' };
  if (filterParams.cuenta) where.cuentaOrdenante = { contains: filterParams.cuenta, mode: 'insensitive' };
  if (filterParams.canal) where.canalEmision = { contains: filterParams.canal, mode: 'insensitive' };
  if (filterParams.fechaDesde || filterParams.fechaHasta) {
    where.fecha = {};
    if (filterParams.fechaDesde) (where.fecha as Record<string, Date>).gte = new Date(filterParams.fechaDesde + 'T00:00:00Z');
    if (filterParams.fechaHasta) (where.fecha as Record<string, Date>).lte = new Date(filterParams.fechaHasta + 'T23:59:59Z');
  }

  const [data, total, aggregates] = await Promise.all([
    prisma.transferencia.findMany({
      where,
      orderBy: [{ searchAttempts: 'asc' }, { fecha: 'desc' }, { id: 'desc' }],
      ...(limit > 0 ? { skip: (page - 1) * limit, take: limit } : {}),
    }),
    prisma.transferencia.count({ where }),
    prisma.transferencia.aggregate({
      where,
      _sum: { importe: true },
      _count: { id: true },
    }),
  ]);

  return {
    data,
    pagination: { page, limit, total, pages: limit > 0 ? Math.ceil(total / limit) : 1 },
    totals: {
      importe: aggregates._sum.importe ?? 0,
      cantidad: aggregates._count.id,
    },
  };
}

const LEGACY_CUTOFF = new Date('2026-03-12');

export async function getPendientesLegacy(filtersWithPagination?: PendientesFilters & { page?: number; limit?: number }) {
  let page = 1;
  let limit = 0;
  let filterParams: PendientesFilters = {};

  if (filtersWithPagination) {
    const { page: p, limit: l, ...rest } = filtersWithPagination;
    page = p || 1;
    limit = l ?? 0;
    filterParams = rest;
  }

  const where: Prisma.TransferenciaWhereInput = {
    codigoConfirmacion: null,
    claimedAt: null,
    fecha: { lt: LEGACY_CUTOFF },
  };
  if (filterParams.nombre) where.nombreOrdenante = { contains: filterParams.nombre, mode: 'insensitive' };
  if (filterParams.ci) where.ciOrdenante = { contains: filterParams.ci, mode: 'insensitive' };
  if (filterParams.cuenta) where.cuentaOrdenante = { contains: filterParams.cuenta, mode: 'insensitive' };
  if (filterParams.canal) where.canalEmision = { contains: filterParams.canal, mode: 'insensitive' };

  const [data, total, aggregates] = await Promise.all([
    prisma.transferencia.findMany({
      where,
      orderBy: [{ searchAttempts: 'asc' }, { fecha: 'desc' }, { id: 'desc' }],
      ...(limit > 0 ? { skip: (page - 1) * limit, take: limit } : {}),
    }),
    prisma.transferencia.count({ where }),
    prisma.transferencia.aggregate({
      where,
      _sum: { importe: true },
      _count: { id: true },
    }),
  ]);

  return {
    data,
    pagination: { page, limit, total, pages: limit > 0 ? Math.ceil(total / limit) : 1 },
    totals: {
      importe: aggregates._sum.importe ?? 0,
      cantidad: aggregates._count.id,
    },
  };
}

export async function incrementSearchAttempts(id: number) {
  return prisma.transferencia.update({
    where: { id },
    data: { searchAttempts: { increment: 1 } },
  });
}

export async function buscarPendientes(params: BuscarPendientesParams) {
  const where: Prisma.TransferenciaWhereInput = {
    codigoConfirmacion: null,
  };

  if (params.importe) where.importe = params.importe;
  if (params.nombre) where.nombreOrdenante = { contains: params.nombre, mode: 'insensitive' };
  if (params.ci) where.ciOrdenante = { contains: params.ci, mode: 'insensitive' };
  if (params.cuentaOrdenante) where.cuentaOrdenante = { contains: params.cuentaOrdenante, mode: 'insensitive' };
  if (params.refCorriente) where.refCorriente = { contains: params.refCorriente, mode: 'insensitive' };

  return prisma.transferencia.findMany({
    where,
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    take: 20,
  });
}

export async function confirmarTransferencia(
  id: number,
  opts?: { matchType?: string; nivelConfianza?: number; prefix?: string; confirmedBy?: string }
) {
  const transfer = await prisma.transferencia.findUnique({ where: { id } });
  if (!transfer) throw new Error('Transferencia no encontrada');
  if (transfer.codigoConfirmacion) throw new Error('Transferencia ya confirmada');

  const prefix = opts?.prefix || 'GT';
  const codigo = `${prefix}-${generateCode()}`;

  return prisma.transferencia.update({
    where: { id },
    data: {
      codigoConfirmacion: codigo,
      confirmedAt: new Date(),
      confirmedBy: opts?.confirmedBy || null,
      matchType: opts?.matchType || null,
      nivelConfianza: opts?.nivelConfianza ?? null,
    },
  });
}

export async function specialAction(
  id: number,
  action: 'CONFIRMED_DEPOSIT' | 'CONFIRMED_BUY' | 'REVIEW_REQUIRED',
  confirmedBy?: string
) {
  const transfer = await prisma.transferencia.findUnique({ where: { id } });
  if (!transfer) throw new Error('Transferencia no encontrada');
  if (transfer.codigoConfirmacion) throw new Error('Transferencia ya tiene código asignado');

  const prefixMap = { CONFIRMED_DEPOSIT: 'DEP', CONFIRMED_BUY: 'BUY', REVIEW_REQUIRED: 'REV' };
  const codigo = `${prefixMap[action]}-${generateCode()}`;
  const isReview = action === 'REVIEW_REQUIRED';

  return prisma.transferencia.update({
    where: { id },
    data: {
      codigoConfirmacion: codigo,
      confirmedAt: isReview ? null : new Date(),
      confirmedBy: confirmedBy || null,
      matchType: action,
    },
  });
}

export async function desmacharTransferencia(id: number) {
  return prisma.transferencia.update({
    where: { id },
    data: {
      codigoConfirmacion: null,
      confirmedAt: null,
      confirmedBy: null,
      claimedAt: null,
      claimedBy: null,
      matchType: null,
      nivelConfianza: null,
    },
  });
}

export async function resetAllConfirmaciones() {
  const result = await prisma.transferencia.updateMany({
    where: { codigoConfirmacion: { not: null } },
    data: {
      codigoConfirmacion: null,
      confirmedAt: null,
      confirmedBy: null,
      claimedAt: null,
      claimedBy: null,
      searchAttempts: 0,
      matchType: null,
      nivelConfianza: null,
    },
  });
  return result.count;
}

export async function buscarPorCodigo(codigo: string) {
  return prisma.transferencia.findUnique({
    where: { codigoConfirmacion: codigo },
  });
}

// ── Reclamar ──

export async function buscarParaReclamar(codigo: string) {
  const transfer = await prisma.transferencia.findUnique({
    where: { codigoConfirmacion: codigo },
  });
  if (!transfer) throw new Error('Codigo no encontrado');
  if (!transfer.codigoConfirmacion || !transfer.confirmedAt) throw new Error('Esta transferencia no ha sido confirmada');
  if (transfer.claimedAt) throw new Error('Esta transferencia ya fue reclamada');
  return transfer;
}

export async function reclamarTransferencia(codigo: string, odooRef: string) {
  const transfer = await buscarParaReclamar(codigo);
  return prisma.transferencia.update({
    where: { id: transfer.id },
    data: {
      claimedAt: new Date(),
      claimedBy: odooRef,
    },
  });
}

export async function liberarTransferencia(codigo: string) {
  const transfer = await prisma.transferencia.findUnique({
    where: { codigoConfirmacion: codigo },
  });
  if (!transfer) throw new Error('Codigo no encontrado');
  if (!transfer.claimedAt) throw new Error('Esta transferencia no esta reclamada');
  return prisma.transferencia.update({
    where: { id: transfer.id },
    data: {
      claimedAt: null,
      claimedBy: null,
    },
  });
}

// ── Saldo Inicial ──

export async function getSaldoInicial() {
  return prisma.transferencia.findFirst({ where: { source: 'saldo_inicial' } });
}

export async function upsertSaldoInicial(importe: number) {
  const existing = await getSaldoInicial();
  if (existing) {
    return prisma.transferencia.update({
      where: { id: existing.id },
      data: { importe },
    });
  }
  return prisma.transferencia.create({
    data: {
      fecha: new Date('1987-04-09T00:00:00Z'),
      tipo: 'Cr',
      source: 'saldo_inicial',
      nombreOrdenante: 'Saldo Inicial',
      importe,
      refCorriente: 'SALDO-INICIAL',
      refOrigen: 'SALDO-INICIAL',
      canalEmision: '',
    },
  });
}

export async function deleteSaldoInicial() {
  return prisma.transferencia.deleteMany({ where: { source: 'saldo_inicial' } });
}

// ── ApiToken ──

export async function getActiveToken() {
  return prisma.apiToken.findFirst({ where: { active: true } });
}

export async function verifyToken(token: string) {
  // Check ApiToken (legacy) and Sede token
  const [apiToken, sede] = await Promise.all([
    prisma.apiToken.findFirst({ where: { token, active: true } }),
    prisma.sede.findFirst({ where: { token, active: true } }),
  ]);
  return !!(apiToken || sede);
}

export async function generateToken(name: string = '') {
  const { randomUUID } = await import('crypto');
  // Deactivate any existing active tokens
  await prisma.apiToken.updateMany({ where: { active: true }, data: { active: false } });
  return prisma.apiToken.create({
    data: { token: randomUUID(), name, active: true },
  });
}

export async function deleteToken(id: number) {
  return prisma.apiToken.delete({ where: { id } });
}

// ── OdooConfig ──

export async function getOdooConfig() {
  return prisma.odooConfig.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

export async function updateOdooConfig(data: {
  api_url?: string;
  api_key?: string;
}) {
  return prisma.odooConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
}

// ── MonitorConfig ──

export async function getMonitorConfig() {
  return prisma.monitorConfig.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

export async function updateMonitorConfig(data: {
  enabled?: boolean;
  interval_minutes?: number;
  telegram_bot_token?: string | null;
  telegram_chat_id?: string | null;
  telegram_topic_id?: number | null;
  telegram_webhook_url?: string | null;
  telegram_creditos_chat_id?: string | null;
  telegram_creditos_topic_id?: number | null;
  telegram_debitos_chat_id?: string | null;
  telegram_debitos_topic_id?: number | null;
}) {
  return prisma.monitorConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
}

// ── BankStatus ──

export async function getBankStatus() {
  return prisma.bankStatus.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

export async function updateBankStatus(data: {
  online: boolean;
  last_check: Date;
  last_online?: Date | null;
  fecha_contable?: string | null;
}) {
  return prisma.bankStatus.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
}

// ── DailyBalance (saldo de apertura/cierre del banco por día) ──

/** Normaliza una fecha a medianoche UTC (igual clave que Transferencia.fecha). */
function diaUTC(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

export async function upsertDailyBalance(fecha: Date, saldoApertura: number | null, saldoCierre: number | null) {
  if (saldoApertura == null) return; // sin apertura no sirve de ancla
  const dia = diaUTC(fecha);
  await prisma.dailyBalance.upsert({
    where: { fecha: dia },
    create: { fecha: dia, saldoApertura, saldoCierre },
    update: { saldoApertura, saldoCierre },
  });
}

/**
 * Saldo de la cuenta justo después de la operación `refCorriente` de ese día.
 * saldo = apertura_del_día + Σ(Cr−Db de las operaciones del día con refCorriente <= ref).
 * Devuelve null si no hay saldo de apertura capturado para ese día.
 * (Validado contra el "Saldo Contable Final" real del banco.)
 */
export async function getSaldoDespues(fecha: Date, refCorriente: string): Promise<number | null> {
  const dia = diaUTC(fecha);
  const daily = await prisma.dailyBalance.findUnique({ where: { fecha: dia } });
  if (!daily) return null;

  const finDia = new Date(dia.getTime() + 86_400_000);
  const rows = await prisma.transferencia.findMany({
    where: { fecha: { gte: dia, lt: finDia }, refCorriente: { lte: refCorriente } },
    select: { importe: true, tipo: true },
  });
  const acumulado = rows.reduce((s, r) => s + (r.tipo === 'Cr' ? r.importe : -r.importe), 0);
  return Math.round((daily.saldoApertura + acumulado) * 100) / 100;
}

/**
 * Verifica el saldo de un día contra el cierre REAL del banco:
 *  - cuadre:  apertura + Σ(Cr−Db del día) debe == cierre. Si no, faltan/sobran operaciones
 *             ese día (los saldos por operación estarían desfasados).
 *  - cadena:  la apertura de hoy debe == el cierre del último día con datos (hueco de días).
 * Devuelve null si aún no hay saldo de cierre capturado para el día (nada que comparar).
 */
export async function verificarSaldoDia(fecha: Date): Promise<{
  apertura: number; cierre: number; calculado: number;
  desfaseCuadre: number; desfaseCadena: number | null;
} | null> {
  const dia = diaUTC(fecha);
  const daily = await prisma.dailyBalance.findUnique({ where: { fecha: dia } });
  if (!daily || daily.saldoCierre == null) return null;

  const finDia = new Date(dia.getTime() + 86_400_000);
  const rows = await prisma.transferencia.findMany({
    where: { fecha: { gte: dia, lt: finDia } },
    select: { importe: true, tipo: true },
  });
  const neto = rows.reduce((s, r) => s + (r.tipo === 'Cr' ? r.importe : -r.importe), 0);
  const calculado = Math.round((daily.saldoApertura + neto) * 100) / 100;
  const desfaseCuadre = Math.round((calculado - daily.saldoCierre) * 100) / 100;

  const prev = await prisma.dailyBalance.findFirst({
    where: { fecha: { lt: dia }, saldoCierre: { not: null } },
    orderBy: { fecha: 'desc' },
  });
  const desfaseCadena = prev?.saldoCierre != null
    ? Math.round((daily.saldoApertura - prev.saldoCierre) * 100) / 100
    : null;

  return { apertura: daily.saldoApertura, cierre: daily.saldoCierre, calculado, desfaseCuadre, desfaseCadena };
}

// ── User ──

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function getUserById(id: number) {
  return prisma.user.findUnique({ where: { id } });
}

export async function createUser(data: { email: string; name: string; picture: string; role: string }) {
  return prisma.user.create({ data });
}

export async function getAllUsers() {
  return prisma.user.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } });
}

export async function updateUser(id: number, data: { role?: string; active?: boolean; name?: string; picture?: string }) {
  return prisma.user.update({ where: { id }, data });
}

export async function deactivateUser(id: number) {
  return prisma.user.update({ where: { id }, data: { active: false } });
}

// ── Invitation ──

export async function createInvitation(email: string, role: string, invitedBy: number) {
  return prisma.invitation.create({ data: { email, role, invitedBy } });
}

export async function getInvitationByEmail(email: string) {
  return prisma.invitation.findUnique({ where: { email } });
}

export async function markInvitationUsed(email: string) {
  return prisma.invitation.update({ where: { email }, data: { usedAt: new Date() } });
}

export async function getAllInvitations() {
  return prisma.invitation.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function deleteInvitation(id: number) {
  return prisma.invitation.delete({ where: { id } });
}

// ── Dashboard ──

export interface DashboardFilters {
  fechaDesde?: string;
  fechaHasta?: string;
}

export async function getDashboardData(filters: DashboardFilters = {}) {
  const dateWhere: Prisma.TransferenciaWhereInput = {};
  if (filters.fechaDesde || filters.fechaHasta) {
    dateWhere.fecha = {};
    if (filters.fechaDesde) (dateWhere.fecha as any).gte = new Date(filters.fechaDesde + 'T00:00:00Z');
    if (filters.fechaHasta) (dateWhere.fecha as any).lte = new Date(filters.fechaHasta + 'T23:59:59Z');
  }

  const pendingWhere: Prisma.TransferenciaWhereInput = { ...dateWhere, solicitud: { is: null } };

  const [
    aggTotal,
    aggCreditos,
    aggDebitos,
    matchAutoCount,
    matchManualCount,
    matchTotalCount,
    aggPendientes,
    dailyGt,
    recentMatchSolicitudes,
    dailyMatches,
  ] = await Promise.all([
    // GT Totals
    prisma.transferencia.aggregate({ where: dateWhere, _sum: { importe: true }, _count: { id: true } }),
    prisma.transferencia.aggregate({ where: { ...dateWhere, tipo: 'Cr' }, _sum: { importe: true }, _count: { id: true } }),
    prisma.transferencia.aggregate({ where: { ...dateWhere, tipo: 'Db' }, _sum: { importe: true }, _count: { id: true } }),
    // Match stats from Solicitud
    prisma.solicitud.count({ where: { reconStatus: 'matched', conciliadaPor: 'auto' } }),
    prisma.solicitud.count({ where: { reconStatus: 'matched', matchNivel: { not: null }, conciliadaPor: { not: 'auto' } } }),
    prisma.solicitud.count({ where: { reconStatus: 'matched' } }),
    // Pendientes (transfers without solicitud)
    prisma.transferencia.aggregate({ where: pendingWhere, _sum: { importe: true }, _count: { id: true } }),
    // Daily GT series (by tipo)
    prisma.transferencia.groupBy({ by: ['fecha', 'tipo'], where: dateWhere, _sum: { importe: true }, orderBy: { fecha: 'asc' } }),
    // Recent matches (from Solicitud with transferencia)
    prisma.solicitud.findMany({
      where: { reconStatus: 'matched', transferenciaId: { not: null } },
      include: { transferencia: true },
      orderBy: { conciliadaAt: 'desc' },
      take: 15,
    }),
    // Daily match totals (all matched solicitudes grouped by transferencia fecha)
    prisma.$queryRaw<{ fecha: Date; total: bigint | number }[]>`
      SELECT t.fecha, SUM(s.monto)::bigint as total
      FROM "Solicitud" s
      JOIN "Transferencia" t ON s."transferenciaId" = t.id
      WHERE s."reconStatus" = 'matched'
      GROUP BY t.fecha
      ORDER BY t.fecha ASC
    `,
  ]);

  // Build match stats
  const matchStats = {
    total: matchTotalCount,
    auto: matchAutoCount,
    manual: matchManualCount,
    deposito: 0,
    compra: 0,
    revision: 0,
  };

  // Build recentMatches as flat objects
  const recentMatches = recentMatchSolicitudes.map(sol => {
    const t = sol.transferencia;
    return {
      // Transferencia banco
      id: t?.id ?? sol.id,
      fecha: t?.fecha ?? null,
      refOrigen: t?.refOrigen ?? '',
      refCorriente: t?.refCorriente ?? '',
      importe: t?.importe ?? 0,
      tipo: t?.tipo ?? 'Cr',
      nombreOrdenante: t?.nombreOrdenante ?? '',
      ciOrdenante: t?.ciOrdenante ?? '',
      cuentaOrdenante: t?.cuentaOrdenante ?? '',
      tarjetaOrdenante: t?.tarjetaOrdenante ?? '',
      canalEmision: t?.canalEmision ?? '',
      codigoConfirmacion: sol.codigo,
      confirmedAt: sol.conciliadaAt,
      confirmedBy: sol.conciliadaPor,
      matchType: sol.conciliadaPor === 'auto' ? 'CONFIRMED_AUTO' : (sol.matchNivel ? `MANUAL_L${sol.matchNivel}` : null),
      // Solicitud
      solicitud_codigo: sol.codigo,
      solicitud_clienteNombre: sol.clienteNombre,
      solicitud_clienteCi: sol.clienteCi,
      solicitud_clienteCuenta: sol.clienteCuenta,
      solicitud_monto: Number(sol.monto),
      solicitud_canalEmision: sol.canalEmision,
      solicitud_transferCode: sol.transferCode,
      solicitud_sedeId: sol.sedeId,
      solicitud_creadoAt: sol.creadoAt,
      solicitud_reclamadaPor: sol.reclamadaPor,
      solicitud_matchNivel: sol.matchNivel,
      solicitud_conciliadaAt: sol.conciliadaAt,
      solicitud_conciliadaPor: sol.conciliadaPor,
    };
  });

  // Build daily series — Cr/Db by fecha + match count from solicitudes
  const dayMap = new Map<string, { fecha: string; gtCreditos: number; gtDebitos: number; matchImporte: number }>();
  for (const row of dailyGt) {
    const key = row.fecha.toISOString().slice(0, 10);
    if (!dayMap.has(key)) dayMap.set(key, { fecha: key, gtCreditos: 0, gtDebitos: 0, matchImporte: 0 });
    const entry = dayMap.get(key)!;
    if (row.tipo === 'Cr') entry.gtCreditos = row._sum.importe ?? 0;
    else if (row.tipo === 'Db') entry.gtDebitos = row._sum.importe ?? 0;
  }
  // Add match amounts from ALL matched solicitudes grouped by transferencia fecha
  for (const row of dailyMatches) {
    const key = row.fecha.toISOString().slice(0, 10);
    if (!dayMap.has(key)) dayMap.set(key, { fecha: key, gtCreditos: 0, gtDebitos: 0, matchImporte: 0 });
    dayMap.get(key)!.matchImporte = Number(row.total);
  }
  const porDia = Array.from(dayMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    gtTotals: {
      importe: aggTotal._sum.importe ?? 0,
      cantidad: aggTotal._count.id,
      importeCreditos: aggCreditos._sum.importe ?? 0,
      cantidadCreditos: aggCreditos._count.id,
      importeDebitos: aggDebitos._sum.importe ?? 0,
      cantidadDebitos: aggDebitos._count.id,
    },
    matchStats,
    pendientes: {
      cantidad: aggPendientes._count.id,
      importe: aggPendientes._sum.importe ?? 0,
    },
    porDia,
    recentMatches,
  };
}
