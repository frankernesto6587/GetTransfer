import type { TransferenciasResponse, Resumen } from '../types'

export const fetcher = <T>(url: string): Promise<T> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<T>
  })

interface TransferenciasParams {
  page?: number
  limit?: number
  nombre?: string
  fecha?: string
  desde?: number
  hasta?: number
}

export function buildTransferenciasUrl(params: TransferenciasParams): string {
  const sp = new URLSearchParams()
  if (params.page) sp.set('page', String(params.page))
  if (params.limit) sp.set('limit', String(params.limit))
  if (params.nombre) sp.set('nombre', params.nombre)
  if (params.fecha) sp.set('fecha', params.fecha)
  if (params.desde) sp.set('desde', String(params.desde))
  if (params.hasta) sp.set('hasta', String(params.hasta))
  const qs = sp.toString()
  return `/api/transferencias${qs ? `?${qs}` : ''}`
}

export function getResumenKey(): string {
  return '/api/resumen'
}

export const resumenFetcher = () => fetcher<Resumen>(getResumenKey())
export const transferenciasFetcher = (url: string) =>
  fetcher<TransferenciasResponse>(url)
