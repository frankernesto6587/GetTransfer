import type { Transferencia, TransferenciasResponse, Resumen, ApiToken } from '../types'

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
