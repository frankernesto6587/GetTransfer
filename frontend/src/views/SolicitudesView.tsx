import { useState, useCallback } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Calendar, User, Hash, Wallet, Building2 } from 'lucide-react'
import { FilterBar, FilterInput, FilterDateRange, DatePresets, type DatePresetKey } from '../components/filters'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable, type SortingState } from '../components/DataTable'
import { solicitudesQuery } from '../lib/api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useUIStore } from '../stores/uiStore'
import type { Solicitud } from '../types'

function today() {
  return new Date().toISOString().slice(0, 10)
}
function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const col = createColumnHelper<Solicitud>()

const workflowBadge: Record<string, { class: string; label: string }> = {
  pending: { class: 'bg-blue-500/10 text-blue-400', label: 'Pendiente' },
  claimed: { class: 'bg-emerald-500/10 text-emerald-400', label: 'Reclamada' },
  cancelled: { class: 'bg-red-500/10 text-red-400', label: 'Anulada' },
}

const reconBadge: Record<string, { class: string; label: string }> = {
  unmatched: { class: 'bg-yellow-500/10 text-yellow-400', label: 'Sin conciliar' },
  suggested: { class: 'bg-orange-500/10 text-orange-400', label: 'Sugerido' },
  matched: { class: 'bg-emerald-500/10 text-emerald-400', label: 'Conciliada' },
}

function makeColumns() {
  return [
    col.accessor('codigo', {
      header: 'Código',
      cell: (info) => <span className="text-gold font-mono font-medium">{info.getValue()}</span>,
    }),
    col.accessor('sedeId', {
      header: 'Sede',
      cell: (info) => <span className="text-secondary">{info.getValue()}</span>,
    }),
    col.accessor('clienteNombre', {
      header: 'Cliente',
      cell: (info) => <span className="text-white whitespace-nowrap max-w-[180px] truncate block" title={info.getValue()}>{info.getValue()}</span>,
    }),
    col.accessor('clienteCi', {
      header: 'CI',
      cell: (info) => <span className="text-secondary font-mono">{info.getValue()}</span>,
    }),
    col.accessor('clienteCuenta', {
      header: 'Cuenta',
      cell: (info) => <span className="text-secondary font-mono whitespace-nowrap max-w-[140px] truncate block" title={info.getValue()}>{info.getValue()}</span>,
    }),
    col.accessor('monto', {
      header: 'Monto',
      meta: { align: 'right' },
      cell: (info) => <span className="text-white font-mono">${Number(info.getValue()).toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>,
    }),
    col.accessor('workflowStatus', {
      header: 'Estado',
      cell: (info) => {
        const b = workflowBadge[info.getValue()] ?? workflowBadge.pending
        return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${b!.class}`}>{b!.label}</span>
      },
    }),
    col.accessor('reconStatus', {
      header: 'Conciliación',
      cell: (info) => {
        const b = reconBadge[info.getValue()] ?? reconBadge.unmatched
        return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${b!.class}`}>{b!.label}</span>
      },
    }),
    col.accessor('creadoAt', {
      header: 'Creada',
      cell: (info) => {
        const v = info.getValue()
        if (!v) return '-'
        try {
          return <span className="text-secondary whitespace-nowrap">{new Date(v).toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
        } catch { return v }
      },
    }),
    col.accessor('reclamadaPor', {
      header: 'Reclamada por',
      cell: (info) => <span className="text-secondary whitespace-nowrap">{info.getValue() || '-'}</span>,
    }),
  ]
}

export function SolicitudesView() {
  const queryClient = useQueryClient()
  const { pageSize, setPageSize } = useUIStore()
  const limit = pageSize['solicitudes'] || 50
  const [page, setPage] = useState(1)
  const [sorting, setSorting] = useState<SortingState>([])
  const [fechaDesde, setFechaDesde] = useState(firstOfMonth())
  const [fechaHasta, setFechaHasta] = useState(today())
  const [activePreset, setActivePreset] = useState<DatePresetKey>('month')

  const [nombre, setNombre] = useState('')
  const [ci, setCi] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [sedeId, setSedeId] = useState('')
  const debouncedNombre = useDebouncedValue(nombre)
  const debouncedCi = useDebouncedValue(ci)
  const debouncedCuenta = useDebouncedValue(cuenta)

  const applyPreset = useCallback((preset: DatePresetKey) => {
    setActivePreset(preset)
    setPage(1)
    const t = new Date()
    switch (preset) {
      case 'today':
        setFechaDesde(today()); setFechaHasta(today()); break
      case 'week': {
        const w = new Date(t); w.setDate(w.getDate() - 6)
        setFechaDesde(w.toISOString().slice(0, 10)); setFechaHasta(today()); break
      }
      case 'month':
        setFechaDesde(firstOfMonth()); setFechaHasta(today()); break
      case 'all':
        setFechaDesde(''); setFechaHasta(''); break
    }
  }, [])

  const clearFilters = useCallback(() => {
    setNombre(''); setCi(''); setCuenta(''); setSedeId('')
    setPage(1)
  }, [])

  const { data, isLoading, isFetching } = useQuery({
    ...solicitudesQuery({
      page,
      limit,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      clienteNombre: debouncedNombre || undefined,
      clienteCi: debouncedCi || undefined,
      clienteCuenta: debouncedCuenta || undefined,
      sedeId: sedeId || undefined,
    }),
    placeholderData: keepPreviousData,
  })

  const total = data?.pagination?.total ?? 0
  const activeFilterCount = [debouncedNombre, debouncedCi, debouncedCuenta, sedeId].filter(Boolean).length

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Solicitudes GT</h1>
        <p className="text-secondary mt-1">
          {total > 0
            ? <><span className="text-white font-medium">{total.toLocaleString('es-CU')}</span> solicitudes pendientes de conciliación</>
            : 'Sin solicitudes para los filtros seleccionados'}
        </p>
      </div>

      <FilterBar
        activeFilterCount={activeFilterCount}
        onClear={clearFilters}
        resultCount={total}
        resultLabel="solicitudes"
        dateRow={
          <>
            <Calendar size={16} className="text-tertiary shrink-0" />
            <DatePresets active={activePreset} onSelect={applyPreset} />
            <span className="text-border hidden md:inline">|</span>
            <FilterDateRange
              desde={fechaDesde}
              hasta={fechaHasta}
              onDesdeChange={(v) => { setFechaDesde(v); setActivePreset('' as DatePresetKey); setPage(1) }}
              onHastaChange={(v) => { setFechaHasta(v); setActivePreset('' as DatePresetKey); setPage(1) }}
            />
          </>
        }
        primaryFilters={
          <>
            <FilterInput icon={User} label="Nombre" value={nombre} onChange={(v) => { setNombre(v); setPage(1) }} className="w-full md:w-40" />
            <FilterInput icon={Hash} label="CI" value={ci} onChange={(v) => { setCi(v); setPage(1) }} className="w-full md:w-32" />
            <FilterInput icon={Wallet} label="Cuenta" value={cuenta} onChange={(v) => { setCuenta(v); setPage(1) }} className="w-full md:w-40" />
            <FilterInput icon={Building2} label="Sede" value={sedeId} onChange={(v) => { setSedeId(v); setPage(1) }} className="w-full md:w-24" />
          </>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-secondary animate-pulse">Cargando solicitudes...</div>
        </div>
      ) : (
        <div className={`transition-opacity duration-150 ${isFetching ? 'opacity-50' : ''}`}>
          <DataTable
            tableId="solicitudes"
            data={data?.data ?? []}
            columns={makeColumns()}
            sorting={sorting}
            onSortingChange={(s) => { setSorting(s); setPage(1) }}
            pagination={data?.pagination}
            onPageChange={setPage}
            onLimitChange={(l) => { setPageSize('solicitudes', l); setPage(1) }}
            alwaysVisibleColumns={['codigo', 'monto']}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['solicitudes'] })}
            title="Solicitudes"
            loading={isFetching}
          />
        </div>
      )}
    </div>
  )
}
