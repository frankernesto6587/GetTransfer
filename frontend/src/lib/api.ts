import type { TransferenciasResponse, Resumen } from '../types'

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
