import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { customAlphabet } from 'nanoid';
import { TransferenciaEntrada } from '../scraper/parser';

const generateCode = customAlphabet('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 8);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

export { prisma };

const sortableColumns = ['fecha', 'importe', 'nombreOrdenante', 'canalEmision', 'refOrigen', 'refCorriente', 'ciOrdenante', 'cuentaOrdenante', 'confirmedAt'] as const;
type SortableColumn = typeof sortableColumns[number];

export interface TransferenciaFilters {
  fecha?: string;
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
  const { fecha, nombre, desde, hasta, page = 1, limit = 50, orderBy, orderDir = 'desc' } = filters;

  const where: Prisma.TransferenciaWhereInput = {};

  if (fecha) where.fecha = fecha;
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
  refCorriente?: string;
}

export async function buscarPendientes(params: BuscarPendientesParams) {
  const where: Prisma.TransferenciaWhereInput = {
    codigoConfirmacion: null,
  };

  if (params.importe) where.importe = params.importe;
  if (params.nombre) where.nombreOrdenante = { contains: params.nombre, mode: 'insensitive' };
  if (params.ci) where.ciOrdenante = { contains: params.ci, mode: 'insensitive' };
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
