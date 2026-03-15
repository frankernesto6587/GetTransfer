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
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export async function upsertMany(transfers: TransferenciaEntrada[]): Promise<{ total: number; nuevas: number }> {
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

  return { total: transfers.length, nuevas: result.count };
}

export async function getAll(filters: TransferenciaFilters = {}) {
  const { fecha, fechaDesde, fechaHasta, nombre, desde, hasta, page = 1, limit = 50, orderBy, orderDir = 'desc' } = filters;

  const where: Prisma.TransferenciaWhereInput = {};

  if (fecha) {
    where.fecha = fecha;
  } else if (fechaDesde || fechaHasta) {
    where.fecha = {};
    if (fechaDesde) where.fecha.gte = fechaDesde;
    if (fechaHasta) where.fecha.lte = fechaHasta;
  }
  if (nombre) where.nombreOrdenante = { contains: nombre, mode: 'insensitive' };
  if (desde !== undefined || hasta !== undefined) {
    where.importe = {};
    if (desde !== undefined) where.importe.gte = desde;
    if (hasta !== undefined) where.importe.lte = hasta;
  }

  const [data, total] = await Promise.all([
    prisma.transferencia.findMany({
      where,
      orderBy: orderBy && sortableColumns.includes(orderBy as SortableColumn)
        ? [{ [orderBy]: orderDir }, { id: 'desc' }]
        : [{ fecha: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transferencia.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
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

export async function confirmarTransferencia(id: number) {
  const transfer = await prisma.transferencia.findUnique({ where: { id } });
  if (!transfer) throw new Error('Transferencia no encontrada');
  if (transfer.codigoConfirmacion) throw new Error('Transferencia ya confirmada');

  const codigo = `GT-${generateCode()}`;

  return prisma.transferencia.update({
    where: { id },
    data: {
      codigoConfirmacion: codigo,
      confirmedAt: new Date(),
    },
  });
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
