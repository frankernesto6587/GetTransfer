import { useState } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  DollarSign,
  TrendingUp,
  CalendarCheck,
  Eye,
} from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { MetricCard } from '../components/MetricCard'
import { DataTable, type SortingState } from '../components/DataTable'
import { transferenciasQuery, resumenQuery } from '../lib/api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useUIStore } from '../stores/uiStore'
import type { Transferencia } from '../types'
import { TransferDetailModal, CanalBadge, formatCurrency, displayFecha } from '../components/TransferShared'

const col = createColumnHelper<Transferencia>()

function makeColumns(onView: (t: Transferencia) => void) {
  return [
    col.accessor('fecha', {
      header: 'Fecha',
      cell: (info) => {
        const v = info.getValue()?.slice(0, 10)
        const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (!m) return <span className="font-mono text-secondary">{v}</span>
        const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
        const day = parseInt(m[3]!)
        const mon = months[parseInt(m[2]!) - 1]
        return (
          <span className="text-secondary text-xs">
            <span className="font-mono font-medium text-white">{day}</span>{' '}
            <span className="uppercase">{mon}</span>
          </span>
        )
      },
    }),
    col.accessor('refOrigen', {
      header: 'Ref Origen',
      cell: (info) => <span className="font-mono text-secondary">{info.getValue()}</span>,
    }),
    col.accessor('nombreOrdenante', {
      header: 'Ordenante',
      cell: (info) => <span className="text-white">{info.getValue() || '—'}</span>,
    }),
    col.accessor('canalEmision', {
      header: 'Canal',
      cell: (info) => <CanalBadge canal={info.getValue()} />,
    }),
    col.accessor('importe', {
      header: 'Importe',
      cell: (info) => (
        <span className="font-mono text-white">{formatCurrency(info.getValue())}</span>
      ),
      meta: { align: 'right' },
    }),
    col.accessor('codigoConfirmacion', {
      header: 'Estado',
      enableSorting: false,
      cell: (info) => {
        const codigo = info.getValue()
        return codigo ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400" title={codigo}>
            {codigo}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/5 text-tertiary">
            Pendiente
          </span>
        )
      },
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        <button
          onClick={(e) => { e.stopPropagation(); onView(info.row.original) }}
          className="p-1.5 rounded-lg hover:bg-gold/15 text-tertiary hover:text-gold transition-colors"
          title="Ver detalle"
        >
          <Eye size={16} />
        </button>
      ),
    }),
  ]
}

export function DashboardView() {
  const queryClient = useQueryClient()
  const { pageSize, setPageSize } = useUIStore()
  const limit = pageSize['dashboard'] || 20
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [sorting, setSorting] = useState<SortingState>([])
  const [selected, setSelected] = useState<Transferencia | null>(null)

  const sort = sorting[0]
  const { data: transferencias, isLoading: loadingTransferencias, isFetching: fetchingTransferencias } = useQuery({
    ...transferenciasQuery({
      page,
      limit,
      nombre: debouncedSearch || undefined,
      orderBy: sort?.id,
      orderDir: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
    }),
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

  const columns = makeColumns(setSelected)

  // Compute page totals from current data
  const pageData = transferencias?.data ?? []
  const pageTotals = pageData.length > 0
    ? {
        importe: pageData.reduce((sum, t) => sum + t.importe, 0),
        cantidad: pageData.length,
      }
    : undefined

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-secondary mt-1">Resumen de transferencias BANDEC</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
          label="Dia Pico"
          value={diaPico ? String(diaPico.cantidad) : '—'}
          delta={diaPico ? diaPico.fecha.slice(0, 10) : undefined}
          icon={CalendarCheck}
        />
      </div>

      <div className={`transition-opacity duration-150 ${fetchingTransferencias ? 'opacity-50' : ''}`}>
        <DataTable
          tableId="dashboard"
          data={pageData}
          columns={columns}
          sorting={sorting}
          onSortingChange={(s) => { setSorting(s); setPage(1) }}
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Buscar por nombre..."
          pagination={transferencias?.pagination}
          onPageChange={setPage}
          onLimitChange={(l) => { setPageSize('dashboard', l); setPage(1) }}
          totals={transferencias?.totals}
          pageTotals={pageTotals}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['transferencias'] })}
          title="Transferencias Recientes"
          mobileCard={(t) => (
            <div className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-secondary text-sm font-mono">{displayFecha(t.fecha)}</span>
                <span className="font-mono text-white font-medium">{formatCurrency(t.importe)}</span>
              </div>
              <p className="text-white text-sm truncate">{t.nombreOrdenante || '—'}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CanalBadge canal={t.canalEmision} />
                  {t.codigoConfirmacion ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400">{t.codigoConfirmacion}</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/5 text-tertiary">Pendiente</span>
                  )}
                </div>
                <button
                  onClick={() => setSelected(t)}
                  className="px-3 py-1.5 rounded-lg text-xs text-gold hover:bg-gold/15 transition-colors min-h-[44px] flex items-center"
                >
                  <Eye size={16} className="mr-1" />
                  Ver
                </button>
              </div>
            </div>
          )}
        />
      </div>

      {selected && <TransferDetailModal transfer={{ source: 'bandec', data: selected }} onClose={() => setSelected(null)} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['transferencias'] })} />}
    </div>
  )
}
