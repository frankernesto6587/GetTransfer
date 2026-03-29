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
  confirmedBy: string | null
  claimedAt: string | null
  claimedBy: string | null
  searchAttempts: number
  matchType: string | null
  nivelConfianza: number | null
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

export interface TotalsInfo {
  importe: number
  cantidad: number
  importeCreditos?: number
  cantidadCreditos?: number
  importeDebitos?: number
  cantidadDebitos?: number
}

export interface TransferenciasResponse {
  data: Transferencia[]
  pagination: PaginationInfo
  totals?: TotalsInfo
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
  dias_diferencia: number | null
  similitud_nombre: number | null
}

export interface OdooMatchResponse {
  match_auto: boolean
  nivel_confianza: number | null
  resultado: OdooPaymentMatch | null
  candidatos: OdooPaymentMatch[]
}

// ── Transferencias Odoo types ──

export interface TransferenciaOdooItem {
  payment_id: number
  order_name: string | null
  order_date: string | null
  session_name: string | null
  amount: number
  payment_type: string | null
  transfer_code: string | null
  card_holder_name: string | null
  card_holder_ci: string | null
  card_number: string | null
  gt_codigo: string | null
  gt_nombre_ordenante: string | null
  gt_ci_ordenante: string | null
  gt_cuenta_ordenante: string | null
  gt_canal_emision: string | null
  gt_ref_origen: string | null
  gt_ref_corriente: string | null
  gt_fecha: string | null
  gt_importe: number | null
}

export interface TransferenciasOdooResponse {
  data: TransferenciaOdooItem[]
  pagination: PaginationInfo
  totals?: TotalsInfo
}

export interface OdooLegacyPaymentMatch extends OdooPaymentMatch {
  partner_name: string | null
  partner_ci: string | null
}

export interface OdooLegacyMatchResponse {
  match_auto: boolean
  nivel_confianza: number | null
  resultado: OdooLegacyPaymentMatch | null
  candidatos: OdooLegacyPaymentMatch[]
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

export type TransferDetailData =
  | { source: 'bandec'; data: Transferencia }
  | { source: 'odoo'; data: TransferenciaOdooItem }

// ── Matches (GT + Odoo combined) ──

export interface MatchedTransfer extends Transferencia {
  odoo_order_date: string | null
  odoo_order_name: string | null
  odoo_card_holder_name: string | null
  odoo_card_holder_ci: string | null
  odoo_card_number: string | null
  odoo_payment_type: string | null
  odoo_session_name: string | null
  odoo_transfer_code: string | null
}

export interface MatchesResponse {
  data: MatchedTransfer[]
  pagination: PaginationInfo
  totals?: TotalsInfo
  odooAvailable: boolean
  statsByType: { auto: number; manual: number; deposito: number; compra: number; revision: number }
}

// ── Statement Upload types ──

export interface StatementUpload {
  id: number
  filename: string
  fileHash: string
  filesProcessed: number
  totalRecords: number
  nuevas: number
  fechaDesde: string
  fechaHasta: string
  saldoInicial: number | null
  saldoFinal: number | null
  createdAt: string
  user: { name: string; email: string }
}

export interface StatementUploadResult {
  uploadId: number
  filesProcessed: number
  totalRecords: number
  nuevas: number
  fechaDesde: string
  fechaHasta: string
}

export interface StatementValidationError {
  file: string
  type: string
  message: string
  details?: Record<string, unknown>
}

export interface StatementUploadsResponse {
  data: StatementUpload[]
  pagination: PaginationInfo
}

// ── Solicitudes GT ──

export interface Solicitud {
  id: number
  codigo: string
  sedeId: string
  version: number
  clienteNombre: string
  clienteCi: string
  clienteCuenta: string
  clienteTelefono: string | null
  monto: number | string
  canalEmision: string | null
  transferCode: string | null
  notas: string | null
  fingerprint: string | null
  workflowStatus: 'pending' | 'claimed' | 'cancelled'
  reconStatus: 'unmatched' | 'suggested' | 'matched'
  creadoAt: string
  creadoPor: string
  reclamadaAt: string | null
  reclamadaPor: string | null
  transferenciaId: number | null
  conciliadaAt: string | null
  conciliadaPor: string | null
  matchNivel: number | null
  anuladaAt: string | null
  crossDupOf: string | null
  syncReceivedAt: string
}

export interface SolicitudesResponse {
  data: Solicitud[]
  pagination: PaginationInfo
}

export interface SolicitudCandidate {
  id: number
  codigo: string
  sedeId: string
  clienteNombre: string
  clienteCi: string
  clienteCuenta: string
  monto: number | string
  canalEmision: string | null
  transferCode: string | null
  workflowStatus: string
  reconStatus: string
  creadoAt: string
  reclamadaPor: string | null
  nivel: number
  diasDiferencia: number | null
}

export interface ConciliarBuscarResponse {
  transfer: Transferencia
  candidates: SolicitudCandidate[]
}

export interface SyncMetrics {
  solicitudes: { workflowStatus: string; reconStatus: string; _count: number }[]
  events: { sedeId: string; _count: number; _max: { receivedAt: string | null } }[]
  bySede: { sedeId: string; workflowStatus: string; _count: number; _sum: { monto: number | null } }[]
}

// ── Dashboard ──

export interface DashboardDailySeries {
  fecha: string
  gtCreditos: number
  gtDebitos: number
  matchImporte: number
}

export interface DashboardResponse {
  gtTotals: {
    importe: number
    cantidad: number
    importeCreditos: number
    cantidadCreditos: number
    importeDebitos: number
    cantidadDebitos: number
  }
  matchStats: {
    total: number
    auto: number
    manual: number
    deposito: number
    compra: number
    revision: number
  }
  pendientes: {
    cantidad: number
    importe: number
  }
  porDia: DashboardDailySeries[]
  recentMatches: MatchedTransfer[]
  odooAvailable: boolean
}
