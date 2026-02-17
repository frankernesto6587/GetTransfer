import { useState, useEffect, useRef, useCallback } from 'react'
import useSWR from 'swr'
import {
  ArrowLeftRight,
  DollarSign,
  TrendingUp,
  CalendarCheck,
} from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { MetricCard } from './components/MetricCard'
import { DailyChart } from './components/DailyChart'
import { TransferTable } from './components/TransferTable'
import { Pagination } from './components/Pagination'
import {
  buildTransferenciasUrl,
  getResumenKey,
  transferenciasFetcher,
  fetcher,
} from './lib/api'
import type { TransferenciasResponse, Resumen } from './types'

export function App() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Debounce search — 300ms
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // SWR — dedup + revalidation
  const transferenciasUrl = buildTransferenciasUrl({
    page,
    limit: 20,
    nombre: debouncedSearch || undefined,
  })

  const { data: transferencias, isLoading: loadingTransferencias } =
    useSWR<TransferenciasResponse>(transferenciasUrl, transferenciasFetcher)

  const { data: resumen, isLoading: loadingResumen } = useSWR<Resumen>(
    getResumenKey(),
    (url: string) => fetcher<Resumen>(url),
  )

  // Loading state
  if (loadingResumen && loadingTransferencias) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="ml-[260px] flex-1 flex items-center justify-center">
          <div className="text-secondary animate-pulse">Cargando datos...</div>
        </main>
      </div>
    )
  }

  // Compute metrics
  const totalTransfers = resumen?.totales.cantidad ?? 0
  const totalImporte = resumen?.totales.total ?? 0
  const promedio = totalTransfers > 0 ? totalImporte / totalTransfers : 0

  const diaPico = resumen?.porDia.reduce<{
    fecha: string
    cantidad: number
  } | null>(
    (best, d) =>
      !best || d.cantidad > best.cantidad
        ? { fecha: d.fecha, cantidad: d.cantidad }
        : best,
    null,
  )

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="ml-[260px] flex-1 overflow-y-auto">
        <div className="p-8 max-w-[1400px]">
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-headline text-3xl font-bold text-white">
              Dashboard
            </h1>
            <p className="text-secondary mt-1">
              Resumen de transferencias BANDEC
            </p>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <MetricCard
              label="Total Transferencias"
              value={totalTransfers.toLocaleString('es-CU')}
              icon={ArrowLeftRight}
              highlight
            />
            <MetricCard
              label="Importe Total"
              value={`$${totalImporte.toLocaleString('es-CU', { minimumFractionDigits: 2 })}`}
              icon={DollarSign}
            />
            <MetricCard
              label="Promedio"
              value={`$${promedio.toLocaleString('es-CU', { minimumFractionDigits: 2 })}`}
              icon={TrendingUp}
            />
            <MetricCard
              label="Día Pico"
              value={diaPico ? String(diaPico.cantidad) : '—'}
              delta={diaPico ? diaPico.fecha : undefined}
              icon={CalendarCheck}
            />
          </div>

          {/* Daily Chart */}
          <div className="mb-8">
            <DailyChart data={resumen?.porDia ?? []} />
          </div>

          {/* Transfer Table */}
          <div className="mb-4">
            <TransferTable
              data={transferencias?.data ?? []}
              search={search}
              onSearchChange={handleSearchChange}
            />
          </div>

          {/* Pagination */}
          {transferencias?.pagination ? (
            <Pagination
              pagination={transferencias.pagination}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      </main>
    </div>
  )
}
