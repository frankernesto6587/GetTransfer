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
  searchAttempts: number
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

export type UserRole = 'root' | 'admin' | 'confirmer' | 'viewer'

export interface User {
  id: number
  email: string
  name: string
  picture: string
  role: UserRole
}

export interface Invitation {
  id: number
  email: string
  role: string
  invitedBy: number | null
  usedAt: string | null
  createdAt: string
}

// ── Odoo Config ──

export interface OdooConfig {
  api_url: string
  api_key: string
}

// ── Confirmar Odoo types ──

export interface OdooPaymentMatch {
  payment_id: number
  order_id: number
  order_name: string
  order_date: string
  amount: number
  transfer_code: string | null
  card_holder_ci: string | null
  card_holder_name: string | null
  card_number: string | null
  nivel_confianza: number
}

export interface OdooMatchResponse {
  match_auto: boolean
  nivel_confianza: number | null
  resultado: OdooPaymentMatch | null
  candidatos: OdooPaymentMatch[]
}

export interface AutoConfirmarDetalle {
  id: number
  nombreOrdenante: string
  importe: number
  searchAttempts: number
  resultado: 'confirmada' | 'candidatos' | 'sin_match' | 'error'
  gt_codigo?: string
  odoo_order?: string
  error?: string
}

export interface AutoConfirmarResult {
  total: number
  confirmadas: number
  candidatos: number
  sin_match: number
  errores: number
  detalle: AutoConfirmarDetalle[]
}
