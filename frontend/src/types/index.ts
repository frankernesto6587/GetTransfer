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

export interface MonitorConfig {
  enabled: boolean
  interval_minutes: number
  telegram_bot_token: string | null
  telegram_chat_id: string | null
  telegram_topic_id: number | null
  telegram_webhook_url: string | null
}

export interface WebhookInfo {
  registered: boolean
  url: string | null
  bot_username: string | null
}

export interface BankStatus {
  online: boolean
  last_check: string | null
  last_online: string | null
  fecha_contable: string | null
}

export interface ScrapeResult {
  month: number
  year: number
  total: number
  nuevas: number
  message: string
}
