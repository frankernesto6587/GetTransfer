import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { customAlphabet } from 'nanoid';
import { TransferenciaEntrada } from '../scraper/parser';

const generateCode = customAlphabet('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 8);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

export { prisma };

const sortableColumns = ['fecha', 'importe', 'nombreOrdenante', 'canalEmision', 'refOrigen', 'refCorriente', 'ciOrdenante', 'cuentaOrdenante', 'confirmedAt', 'claimedAt'] as const;
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
  estado?: 'pendiente' | 'confirmada' | 'reclamada';
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export async function upsertMany(transfers: TransferenciaEntrada[]): Promise<{ total: number; nuevas: number; nuevasList: TransferenciaEntrada[] }> {
  // Find which refOrigen already exist to identify truly new ones
  const refs = transfers.map(t => t.refOrigen);
  const existing = await prisma.transferencia.findMany({
    where: { refOrigen: { in: refs } },
    select: { refOrigen: true },
  });
  const existingRefs = new Set(existing.map(e => e.refOrigen));

  const result = await prisma.transferencia.createMany({
    data: transfers.map(t => ({
      fecha: t.fecha,
      refCorriente: t.refCorriente,
      refOrigen: t.refOrigen,
      importe: t.importe,
      tipo: t.tipo,
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
    })),
    skipDuplicates: true,
  });

  const nuevasList = transfers.filter(t => !existingRefs.has(t.refOrigen));
  return { total: transfers.length, nuevas: result.count, nuevasList };
}

export async function getAll(filters: TransferenciaFilters = {}) {
  const { fecha, fechaDesde, fechaHasta, nombre, desde, hasta, canal, ci, cuenta, refOrigen, codigo, estado, page = 1, limit = 50, orderBy, orderDir = 'desc' } = filters;

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

  const [data, total, aggregates] = await Promise.all([
    prisma.transferencia.findMany({
      where,
      orderBy: orderBy && sortableColumns.includes(orderBy as SortableColumn)
        ? [{ [orderBy]: orderDir }, { id: 'desc' }]
        : [{ fecha: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
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
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    totals: {
      importe: aggregates._sum.importe ?? 0,
      cantidad: aggregates._count.id,
    },
  };
}

export async function getByRefOrigen(refOrigen: string) {
  return prisma.transferencia.findUnique({ where: { refOrigen } });
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
  opts?: { matchType?: string; nivelConfianza?: number; prefix?: string }
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
      matchType: opts?.matchType || null,
      nivelConfianza: opts?.nivelConfianza ?? null,
    },
  });
}

export async function specialAction(
  id: number,
  action: 'CONFIRMED_DEPOSIT' | 'CONFIRMED_BUY' | 'REVIEW_REQUIRED'
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

// ── ApiToken ──

export async function getActiveToken() {
  return prisma.apiToken.findFirst({ where: { active: true } });
}

export async function verifyToken(token: string) {
  const found = await prisma.apiToken.findFirst({ where: { token, active: true } });
  return !!found;
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
