import { useState, useCallback } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Calendar, User, Hash, Wallet, Building2, Eye, X } from 'lucide-react'
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

function makeColumns(onView: (s: Solicitud) => void) {
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

export function SolicitudesView() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Solicitud | null>(null)
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

  const sort = sorting[0]
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
      orderBy: sort?.id,
      orderDir: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
    }),
    placeholderData: keepPreviousData,
  })

  const total = data?.pagination?.total ?? 0
  const activeFilterCount = [debouncedNombre, debouncedCi, debouncedCuenta, sedeId].filter(Boolean).length

  const pageData = data?.data ?? []
  const pageTotals = pageData.length > 0
    ? {
        importe: pageData.reduce((sum, t) => sum + Number(t.monto), 0),
        cantidad: pageData.length,
      }
    : undefined

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
            columns={makeColumns(setSelected)}
            sorting={sorting}
            onSortingChange={(s) => { setSorting(s); setPage(1) }}
            pagination={data?.pagination}
            onPageChange={setPage}
            onLimitChange={(l) => { setPageSize('solicitudes', l); setPage(1) }}
            alwaysVisibleColumns={['codigo', 'monto']}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['solicitudes'] })}
            title="Solicitudes"
            loading={isFetching}
            totals={data?.totals}
            pageTotals={pageTotals}
          />
        </div>
      )}

      {/* Detail Modal */}
      {selected && <SolicitudDetailModal solicitud={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-b-0">
      <span className="text-secondary text-sm">{label}</span>
      <span className={`text-white text-sm ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}

function formatDate(val: string | null | undefined) {
  if (!val) return '—'
  const d = new Date(val)
  return `${d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}`
}

function formatCurrency(amount: number) {
  return amount.toLocaleString('es-CU', { minimumFractionDigits: 2 })
}

function SolicitudDetailModal({ solicitud: s, onClose }: { solicitud: Solicitud; onClose: () => void }) {
  const wfBadge = workflowBadge[s.workflowStatus] ?? workflowBadge.pending
  const rcBadge = reconBadge[s.reconStatus] ?? reconBadge.unmatched

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface border border-border rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface rounded-t-2xl">
          <div>
            <h3 className="font-headline text-lg font-semibold text-white">Detalle de Solicitud</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-gold text-sm">{s.codigo}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${wfBadge!.class}`}>{wfBadge!.label}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${rcBadge!.class}`}>{rcBadge!.label}</span>
              <span className="text-tertiary text-xs">{s.sedeId}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-secondary hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Importe destacado */}
          <div className="text-center py-3 rounded-xl bg-gold/10 border border-gold/20">
            <div className="text-tertiary text-xs uppercase tracking-wider mb-1">Monto</div>
            <div className="font-mono text-2xl font-bold text-gold">{formatCurrency(Number(s.monto))}</div>
          </div>

          {/* Cliente */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-tertiary mb-2 font-medium">Datos del Cliente</h4>
            <div className="bg-page rounded-lg px-4 py-1">
              <DetailRow label="Nombre" value={s.clienteNombre} />
              <DetailRow label="CI" value={s.clienteCi} mono />
              <DetailRow label="Cuenta" value={s.clienteCuenta} mono />
              <DetailRow label="Teléfono" value={s.clienteTelefono} mono />
            </div>
          </div>

          {/* Transferencia */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-tertiary mb-2 font-medium">Datos de la Transferencia</h4>
            <div className="bg-page rounded-lg px-4 py-1">
              <DetailRow label="Transfer Code" value={s.transferCode} mono />
              <DetailRow label="Canal" value={s.canalEmision} />
              <DetailRow label="Creada" value={formatDate(s.creadoAt)} mono />
              <DetailRow label="Creada por" value={s.creadoPor} />
            </div>
          </div>

          {/* Estado */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-tertiary mb-2 font-medium">Estado</h4>
            <div className="bg-page rounded-lg px-4 py-1">
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-secondary text-sm">Reclamada</span>
                {s.reclamadaAt ? (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-500/15 text-violet-400 font-mono">
                    {formatDate(s.reclamadaAt)}
                  </span>
                ) : (
                  <span className="text-tertiary text-sm">—</span>
                )}
              </div>
              <DetailRow label="Reclamada por" value={s.reclamadaPor} />
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-secondary text-sm">Conciliada</span>
                {s.conciliadaAt ? (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400 font-mono">
                    {formatDate(s.conciliadaAt)}
                  </span>
                ) : (
                  <span className="text-tertiary text-sm">—</span>
                )}
              </div>
              <DetailRow label="Conciliada por" value={s.conciliadaPor} />
              {s.matchNivel && <DetailRow label="Nivel Match" value={String(s.matchNivel)} mono />}
              {s.transferenciaId && <DetailRow label="Transferencia ID" value={String(s.transferenciaId)} mono />}
            </div>
          </div>

          {/* Anulación */}
          {s.anuladaAt && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-tertiary mb-2 font-medium">Anulación</h4>
              <div className="bg-page rounded-lg px-4 py-1">
                <DetailRow label="Anulada en" value={formatDate(s.anuladaAt)} mono />
              </div>
            </div>
          )}

          {/* Cross-sede duplicate */}
          {s.crossDupOf && (
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="text-xs text-amber-400">Posible duplicado de: <span className="font-mono">{s.crossDupOf}</span></p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
