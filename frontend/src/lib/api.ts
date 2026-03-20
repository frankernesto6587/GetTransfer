import type { Transferencia, TransferenciasResponse, TransferenciasOdooResponse, Resumen, ApiToken, MonitorConfig, BankStatus, ScrapeResult, WebhookInfo, User, Invitation, OdooMatchResponse, OdooLegacyMatchResponse, AutoConfirmarResult, OdooConfig, PaginationInfo, TotalsInfo, StatementUploadResult, StatementUploadsResponse } from '../types'

// ── Base fetch helper with credentials + 401 handling ──

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: 'include', ...init })
  if (res.status === 401) {
    // Session expired — reload to trigger login
    window.location.href = '/'
    throw new Error('Sesion expirada')
  }
  return res
}

export const fetcher = <T>(url: string): Promise<T> =>
  apiFetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<T>
  })

// ── Transferencias ──

export interface TransferenciasParams {
  page?: number
  limit?: number
  nombre?: string
  fecha?: string
  fechaDesde?: string
  fechaHasta?: string
  desde?: number
  hasta?: number
  canal?: string
  ci?: string
  cuenta?: string
  refOrigen?: string
  codigo?: string
  estado?: string
  tipo?: string
  source?: string
  orderBy?: string
  orderDir?: 'asc' | 'desc'
}

export function buildTransferenciasUrl(params: TransferenciasParams): string {
  const sp = new URLSearchParams()
  if (params.page) sp.set('page', String(params.page))
  if (params.limit) sp.set('limit', String(params.limit))
  if (params.nombre) sp.set('nombre', params.nombre)
  if (params.fecha) sp.set('fecha', params.fecha)
  if (params.fechaDesde) sp.set('fechaDesde', params.fechaDesde)
  if (params.fechaHasta) sp.set('fechaHasta', params.fechaHasta)
  if (params.desde) sp.set('desde', String(params.desde))
  if (params.hasta) sp.set('hasta', String(params.hasta))
  if (params.canal) sp.set('canal', params.canal)
  if (params.ci) sp.set('ci', params.ci)
  if (params.cuenta) sp.set('cuenta', params.cuenta)
  if (params.refOrigen) sp.set('refOrigen', params.refOrigen)
  if (params.codigo) sp.set('codigo', params.codigo)
  if (params.estado) sp.set('estado', params.estado)
  if (params.tipo) sp.set('tipo', params.tipo)
  if (params.source) sp.set('source', params.source)
  if (params.orderBy) sp.set('orderBy', params.orderBy)
  if (params.orderDir) sp.set('orderDir', params.orderDir)
  const qs = sp.toString()
  return `/api/transferencias${qs ? `?${qs}` : ''}`
}

export const transferenciasQuery = (params: TransferenciasParams) => {
  const url = buildTransferenciasUrl(params)
  return {
    queryKey: ['transferencias', params] as const,
    queryFn: () => fetcher<TransferenciasResponse>(url),
  }
}

export const resumenQuery = () => ({
  queryKey: ['resumen'] as const,
  queryFn: () => fetcher<Resumen>('/api/resumen'),
})

// ── GetCode (formerly Confirmar) ──

export interface BuscarGetCodeParams {
  importe?: number
  nombre?: string
  ci?: string
  cuentaOrdenante?: string
  refCorriente?: string
}

export async function buscarPendientesGetCode(params: BuscarGetCodeParams): Promise<Transferencia[]> {
  const res = await apiFetch('/api/getcode/buscar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function confirmarGetCode(id: number): Promise<Transferencia> {
  const res = await apiFetch(`/api/getcode/${id}`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function liberarTransferencia(codigo: string): Promise<Transferencia> {
  const res = await apiFetch(`/api/getcode/${encodeURIComponent(codigo)}/liberar`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Odoo Config ──

export async function getOdooConfig(): Promise<OdooConfig> {
  const res = await apiFetch('/api/confirmar-odoo/config')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function updateOdooConfig(data: Partial<OdooConfig>): Promise<OdooConfig> {
  const res = await apiFetch('/api/confirmar-odoo/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function testOdooConnection(data: { api_url: string; api_key: string }): Promise<{ ok: boolean; message: string }> {
  const res = await apiFetch('/api/confirmar-odoo/config/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Confirmar Odoo ──

export interface PendientesResponse {
  data: Transferencia[]
  pagination: PaginationInfo
  totals: TotalsInfo
}

export async function getPendientesOdoo(filters?: { nombre?: string; ci?: string; cuenta?: string; canal?: string; fechaDesde?: string; fechaHasta?: string; estado?: string; page?: number; limit?: number }): Promise<PendientesResponse> {
  const params = new URLSearchParams()
  if (filters?.nombre) params.set('nombre', filters.nombre)
  if (filters?.ci) params.set('ci', filters.ci)
  if (filters?.cuenta) params.set('cuenta', filters.cuenta)
  if (filters?.canal) params.set('canal', filters.canal)
  if (filters?.fechaDesde) params.set('fechaDesde', filters.fechaDesde)
  if (filters?.fechaHasta) params.set('fechaHasta', filters.fechaHasta)
  if (filters?.estado) params.set('estado', filters.estado)
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.limit) params.set('limit', String(filters.limit))
  const qs = params.toString()
  const res = await apiFetch(`/api/confirmar-odoo/pendientes${qs ? '?' + qs : ''}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function buscarOdooMatch(transferId: number): Promise<{ transfer: Transferencia; odoo: OdooMatchResponse }> {
  const res = await apiFetch(`/api/confirmar-odoo/pendiente/${transferId}/buscar`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function confirmarOdoo(
  transferId: number,
  paymentId: number,
  opts?: { nivelConfianza?: number; matchAuto?: boolean }
): Promise<{ confirmed: Transferencia; odoo: { success: boolean; order_name?: string; message?: string } }> {
  const res = await apiFetch(`/api/confirmar-odoo/pendiente/${transferId}/confirmar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payment_id: paymentId,
      nivel_confianza: opts?.nivelConfianza,
      match_auto: opts?.matchAuto,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function accionEspecial(
  transferId: number,
  accion: 'CONFIRMED_DEPOSIT' | 'CONFIRMED_BUY' | 'REVIEW_REQUIRED'
): Promise<Transferencia> {
  const res = await apiFetch(`/api/confirmar-odoo/pendiente/${transferId}/accion-especial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function desmacharTransferencia(transferId: number): Promise<Transferencia> {
  const res = await apiFetch(`/api/confirmar-odoo/pendiente/${transferId}/desmachar`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function autoConfirmarOdoo(filters?: { nombre?: string; ci?: string; cuenta?: string; canal?: string; fechaDesde?: string; fechaHasta?: string }): Promise<AutoConfirmarResult> {
  const res = await apiFetch('/api/confirmar-odoo/auto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filters || {}),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Confirmar Odoo Legacy ──

export async function getPendientesOdooLegacy(filters?: { nombre?: string; ci?: string; cuenta?: string; canal?: string; page?: number; limit?: number }): Promise<PendientesResponse> {
  const params = new URLSearchParams()
  if (filters?.nombre) params.set('nombre', filters.nombre)
  if (filters?.ci) params.set('ci', filters.ci)
  if (filters?.cuenta) params.set('cuenta', filters.cuenta)
  if (filters?.canal) params.set('canal', filters.canal)
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.limit) params.set('limit', String(filters.limit))
  const qs = params.toString()
  const res = await apiFetch(`/api/confirmar-odoo-legacy/pendientes${qs ? '?' + qs : ''}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function buscarOdooLegacyMatch(transferId: number): Promise<{ transfer: Transferencia; odoo: OdooLegacyMatchResponse }> {
  const res = await apiFetch(`/api/confirmar-odoo-legacy/pendiente/${transferId}/buscar`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function confirmarOdooLegacy(transferId: number, paymentId: number): Promise<{ confirmed: Transferencia; odoo: { success: boolean; order_name?: string; message?: string } }> {
  const res = await apiFetch(`/api/confirmar-odoo-legacy/pendiente/${transferId}/confirmar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_id: paymentId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Transferencias Odoo ──

export interface TransferenciasOdooParams {
  page?: number
  limit?: number
  fechaDesde?: string
  fechaHasta?: string
  nombre?: string
  ci?: string
  cuenta?: string
  canal?: string
  refOrigen?: string
  gtCodigo?: string
  transferCode?: string
  desde?: number
  hasta?: number
  paymentType?: string
  orderBy?: string
  orderDir?: 'asc' | 'desc'
}

export function buildTransferenciasOdooUrl(params: TransferenciasOdooParams): string {
  const sp = new URLSearchParams()
  if (params.page) sp.set('page', String(params.page))
  if (params.limit) sp.set('limit', String(params.limit))
  if (params.fechaDesde) sp.set('fechaDesde', params.fechaDesde)
  if (params.fechaHasta) sp.set('fechaHasta', params.fechaHasta)
  if (params.nombre) sp.set('nombre', params.nombre)
  if (params.ci) sp.set('ci', params.ci)
  if (params.cuenta) sp.set('cuenta', params.cuenta)
  if (params.canal) sp.set('canal', params.canal)
  if (params.refOrigen) sp.set('refOrigen', params.refOrigen)
  if (params.gtCodigo) sp.set('gtCodigo', params.gtCodigo)
  if (params.transferCode) sp.set('transferCode', params.transferCode)
  if (params.desde) sp.set('desde', String(params.desde))
  if (params.hasta) sp.set('hasta', String(params.hasta))
  if (params.paymentType) sp.set('paymentType', params.paymentType)
  if (params.orderBy) sp.set('orderBy', params.orderBy)
  if (params.orderDir) sp.set('orderDir', params.orderDir)
  const qs = sp.toString()
  return `/api/transferencias-odoo${qs ? `?${qs}` : ''}`
}

export const transferenciasOdooQuery = (params: TransferenciasOdooParams) => {
  const url = buildTransferenciasOdooUrl(params)
  return {
    queryKey: ['transferencias-odoo', params] as const,
    queryFn: () => fetcher<TransferenciasOdooResponse>(url),
  }
}

// ── Update Odoo Payment ──

export async function updateOdooPayment(paymentId: number, fields: {
  card_holder_name?: string
  card_holder_ci?: string
  card_number?: string
  transfer_code?: string
}): Promise<{ success: boolean; payment_id: number }> {
  const res = await apiFetch(`/api/transferencias-odoo/${paymentId}/editar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Token API ──

export async function getActiveToken(): Promise<{ token: ApiToken | null }> {
  const res = await apiFetch('/api/token')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function generateToken(name: string = ''): Promise<{ token: ApiToken }> {
  const res = await apiFetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function deleteToken(id: number): Promise<void> {
  const res = await apiFetch(`/api/token/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ── Monitor API ──

export async function getMonitorConfig(): Promise<MonitorConfig> {
  const res = await apiFetch('/api/monitor/config')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function updateMonitorConfig(data: Partial<MonitorConfig>): Promise<MonitorConfig> {
  const res = await apiFetch('/api/monitor/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getMonitorStatus(): Promise<BankStatus> {
  const res = await apiFetch('/api/monitor/status')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function forceCheck(): Promise<{ online: boolean; fecha_contable: string | null; message: string }> {
  const res = await apiFetch('/api/monitor/check', { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function triggerScrape(month: number, year: number): Promise<ScrapeResult> {
  const res = await apiFetch(`/api/scrape?month=${month}&year=${year}`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Webhook API ──

export async function getWebhookInfo(): Promise<WebhookInfo> {
  const res = await apiFetch('/api/monitor/webhook/info')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function registerWebhook(): Promise<{ ok: boolean; webhook_url?: string }> {
  const res = await apiFetch('/api/monitor/webhook/register', { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function unregisterWebhook(): Promise<{ ok: boolean }> {
  const res = await apiFetch('/api/monitor/webhook/unregister', { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Auth API ──

export async function getMe(): Promise<User | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' })
}

// ── Users API ──

export async function getUsers(): Promise<User[]> {
  const res = await apiFetch('/api/users')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function updateUserRole(id: number, role: string): Promise<User> {
  const res = await apiFetch(`/api/users/${id}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function deactivateUser(id: number): Promise<void> {
  const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
}

// ── Invitations API ──

export async function getInvitations(): Promise<Invitation[]> {
  const res = await apiFetch('/api/invitations')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function createInvitation(email: string, role: string): Promise<Invitation> {
  const res = await apiFetch('/api/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function deleteInvitation(id: number): Promise<void> {
  const res = await apiFetch(`/api/invitations/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ── Saldo Inicial API ──

export async function getSaldoInicial(): Promise<Transferencia | null> {
  const res = await apiFetch('/api/saldo-inicial')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function upsertSaldoInicial(importe: number): Promise<Transferencia> {
  const res = await apiFetch('/api/saldo-inicial', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ importe }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function deleteSaldoInicial(): Promise<void> {
  const res = await apiFetch('/api/saldo-inicial', { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ── Statement Upload API ──

export async function uploadStatement(file: File): Promise<StatementUploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiFetch('/api/statements/upload', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw body
  }
  return res.json()
}

export async function getStatementUploads(page = 1, limit = 20): Promise<StatementUploadsResponse> {
  const res = await apiFetch(`/api/statements/uploads?page=${page}&limit=${limit}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const statementUploadsQuery = (page = 1) => ({
  queryKey: ['statement-uploads', page] as const,
  queryFn: () => getStatementUploads(page),
})
