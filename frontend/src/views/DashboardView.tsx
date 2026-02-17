import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  DollarSign,
  TrendingUp,
  CalendarCheck,
} from 'lucide-react'
import { MetricCard } from '../components/MetricCard'
import { DailyChart } from '../components/DailyChart'
import { TransferTable } from '../components/TransferTable'
import { Pagination } from '../components/Pagination'
import { transferenciasQuery, resumenQuery } from '../lib/api'

export function DashboardView() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

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

  const { data: transferencias, isLoading: loadingTransferencias, isFetching: fetchingTransferencias } = useQuery({
    ...transferenciasQuery({ page, limit: 20, nombre: debouncedSearch || undefined }),
    placeholderData: keepPreviousData,
  })

  const { data: resumen, isLoading: loadingResumen } = useQuery(resumenQuery())

  if (loadingResumen && loadingTransferencias) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-secondary animate-pulse">Cargando datos...</div>
      </div>
    )
  }

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
    <div className="p-8 max-w-[1400px]">
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-secondary mt-1">Resumen de transferencias BANDEC</p>
      </div>

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

      <div className="mb-8">
        <DailyChart data={resumen?.porDia ?? []} />
      </div>

      <div className={`mb-4 transition-opacity duration-150 ${fetchingTransferencias ? 'opacity-50' : ''}`}>
        <TransferTable
          data={transferencias?.data ?? []}
          search={search}
          onSearchChange={handleSearchChange}
        />
      </div>

      {transferencias?.pagination ? (
        <Pagination
          pagination={transferencias.pagination}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  )
}
