export interface Transferencia {
  id: number
  fecha: string
  refCorriente: string
  refOrigen: string
  importe: number
  tipo: string
  nombreOrdenante: string
  ciOrdenante: string
  tarjetaOrdenante: string
  cuentaOrdenante: string
  idCubacel: string
  telefonoOrdenante: string
  canalEmision: string
  sucursalOrdenante: string
  numDebito: string
  tipoServicio: string
  fechaFactura: string
  formato: string
  observacionesRaw: string
  createdAt: string
  codigoConfirmacion: string | null
  confirmedAt: string | null
  claimedAt: string | null
  claimedBy: string | null
}

export interface ApiToken {
  id: number
  token: string
  name: string
  active: boolean
  createdAt: string
}

export interface PaginationInfo {
  page: number
  limit: number
  total: number
  pages: number
}

export interface TransferenciasResponse {
  data: Transferencia[]
  pagination: PaginationInfo
}

export interface DiaStat {
  fecha: string
  cantidad: number
  total: number
}

export interface Resumen {
  porDia: DiaStat[]
  totales: {
    cantidad: number
    total: number
  }
}
