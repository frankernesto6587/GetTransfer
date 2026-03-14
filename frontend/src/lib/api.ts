import type { Transferencia, TransferenciasResponse, Resumen, ApiToken, MonitorConfig, BankStatus, ScrapeResult, WebhookInfo } from '../types'

export const fetcher = <T>(url: string): Promise<T> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<T>
  })

export interface TransferenciasParams {
  page?: number
  limit?: number
  nombre?: string
  fecha?: string
  fechaDesde?: string
  fechaHasta?: string
  desde?: number
  hasta?: number
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

export interface BuscarConfirmacionParams {
  importe?: number
  nombre?: string
  ci?: string
  cuentaOrdenante?: string
  refCorriente?: string
}

export async function buscarPendientes(params: BuscarConfirmacionParams): Promise<Transferencia[]> {
  const res = await fetch('/api/confirmar/buscar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function confirmarTransferencia(id: number): Promise<Transferencia> {
  const res = await fetch(`/api/confirmar/${id}`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function liberarTransferencia(codigo: string): Promise<Transferencia> {
  const res = await fetch(`/api/confirmar/${encodeURIComponent(codigo)}/liberar`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Token API ──

export async function getActiveToken(): Promise<{ token: ApiToken | null }> {
  const res = await fetch('/api/token')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function generateToken(name: string = ''): Promise<{ token: ApiToken }> {
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function deleteToken(id: number): Promise<void> {
  const res = await fetch(`/api/token/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ── Monitor API ──

export async function getMonitorConfig(): Promise<MonitorConfig> {
  const res = await fetch('/api/monitor/config')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function updateMonitorConfig(data: Partial<MonitorConfig>): Promise<MonitorConfig> {
  const res = await fetch('/api/monitor/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getMonitorStatus(): Promise<BankStatus> {
  const res = await fetch('/api/monitor/status')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function forceCheck(): Promise<{ online: boolean; fecha_contable: string | null; message: string }> {
  const res = await fetch('/api/monitor/check', { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function triggerScrape(month: number, year: number): Promise<ScrapeResult> {
  const res = await fetch(`/api/scrape?month=${month}&year=${year}`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Webhook API ──

export async function getWebhookInfo(): Promise<WebhookInfo> {
  const res = await fetch('/api/monitor/webhook/info')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function registerWebhook(): Promise<{ ok: boolean; webhook_url?: string }> {
  const res = await fetch('/api/monitor/webhook/register', { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function unregisterWebhook(): Promise<{ ok: boolean }> {
  const res = await fetch('/api/monitor/webhook/unregister', { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}
