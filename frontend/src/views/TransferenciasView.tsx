import { useState, useCallback } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { Calendar, Eye, User, Hash, Wallet, FileText, DollarSign } from 'lucide-react'
import { FilterBar, FilterInput, FilterSelect, FilterDateRange, DatePresets, type DatePresetKey } from '../components/filters'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable, type SortingState } from '../components/DataTable'
import { transferenciasQuery } from '../lib/api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useUIStore } from '../stores/uiStore'
import { TransferDetailModal, CanalBadge, formatCurrency, displayFecha } from '../components/TransferShared'
import type { Transferencia } from '../types'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function displayDate(iso: string) {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

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
      cell: (info) => <span className="font-mono text-secondary whitespace-nowrap">{info.getValue()}</span>,
    }),
    col.accessor('refCorriente', {
      header: 'Ref Destino',
      cell: (info) => <span className="font-mono text-secondary whitespace-nowrap">{info.getValue()}</span>,
    }),
    col.accessor('nombreOrdenante', {
      header: 'Ordenante',
      cell: (info) => <span className="text-white whitespace-nowrap max-w-[200px] truncate block" title={info.getValue() || ''}>{info.getValue() || '—'}</span>,
    }),
    col.accessor('canalEmision', {
      header: 'Canal',
      cell: (info) => <CanalBadge canal={info.getValue()} />,
    }),
    col.accessor('importe', {
      header: 'Importe',
      cell: (info) => (
        <span className="font-mono text-white whitespace-nowrap">{formatCurrency(info.getValue())}</span>
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
    col.accessor('claimedAt', {
      header: 'Reclamada',
      cell: (info) => {
        const val = info.getValue()
        const by = info.row.original.claimedBy
        if (!val) return <span className="text-tertiary">—</span>
        const d = new Date(val)
        return (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-500/15 text-violet-400 font-mono whitespace-nowrap" title={by || ''}>
            {d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit' })}{' '}
            {d.toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}
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

export function TransferenciasView() {
  const queryClient = useQueryClient()
  const searchParams = useSearch({ from: '/transferencias' })
  const { pageSize, setPageSize } = useUIStore()
  const limit = pageSize['transferencias'] || 50

  // Local state synced with URL search params
  const [search, setSearch] = useState(searchParams.nombre)
  const [fechaDesde, setFechaDesde] = useState(searchParams.fechaDesde || firstOfMonth())
  const [fechaHasta, setFechaHasta] = useState(searchParams.fechaHasta || today())
  const [desde, setDesde] = useState(searchParams.desde)
  const [hasta, setHasta] = useState(searchParams.hasta)
  const [canal, setCanal] = useState(searchParams.canal)
  const [ci, setCi] = useState(searchParams.ci)
  const [cuenta, setCuenta] = useState(searchParams.cuenta)
  const [refOrigen, setRefOrigen] = useState(searchParams.refOrigen)
  const [estado, setEstado] = useState(searchParams.estado)
  const [sorting, setSorting] = useState<SortingState>([])
  const [activePreset, setActivePreset] = useState<DatePresetKey | ''>(
    searchParams.fechaDesde || searchParams.fechaHasta ? '' : 'month',
  )
  const [page, setPage] = useState(searchParams.page)
  const [selected, setSelected] = useState<Transferencia | null>(null)

  // Debounce text filters
  const debouncedSearch = useDebouncedValue(search)
  const debouncedCi = useDebouncedValue(ci)
  const debouncedCuenta = useDebouncedValue(cuenta)
  const debouncedRefOrigen = useDebouncedValue(refOrigen)

  const applyPreset = useCallback((preset: DatePresetKey) => {
    setActivePreset(preset)
    setPage(1)
    const t = new Date()
    let fd = '', fh = ''
    switch (preset) {
      case 'today':
        fd = today(); fh = today()
        break
      case 'week': {
        const weekAgo = new Date(t)
        weekAgo.setDate(weekAgo.getDate() - 6)
        fd = weekAgo.toISOString().slice(0, 10); fh = today()
        break
      }
      case 'month':
        fd = firstOfMonth(); fh = today()
        break
      case 'all':
        fd = ''; fh = ''
        break
    }
    setFechaDesde(fd)
    setFechaHasta(fh)
  }, [])

  const activeFilterCount = [debouncedSearch, desde, hasta, canal, debouncedCi, debouncedCuenta, debouncedRefOrigen, estado].filter(Boolean).length

  const clearFilters = useCallback(() => {
    setSearch('')
    setDesde('')
    setHasta('')
    setCanal('')
    setCi('')
    setCuenta('')
    setRefOrigen('')
    setEstado('')
    setPage(1)
  }, [])

  const sort = sorting[0]
  const { data: transferencias, isLoading, isFetching } = useQuery({
    ...transferenciasQuery({
      page,
      limit,
      nombre: debouncedSearch || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      desde: desde ? Number(desde) : undefined,
      hasta: hasta ? Number(hasta) : undefined,
      canal: canal || undefined,
      ci: debouncedCi || undefined,
      cuenta: debouncedCuenta || undefined,
      refOrigen: debouncedRefOrigen || undefined,
      estado: estado || undefined,
      orderBy: sort?.id,
      orderDir: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
    }),
    placeholderData: keepPreviousData,
  })

  const total = transferencias?.pagination?.total ?? 0
  const columns = makeColumns(setSelected)

  const pageData = transferencias?.data ?? []
  const pageTotals = pageData.length > 0
    ? {
        importe: pageData.reduce((sum, t) => sum + t.importe, 0),
        cantidad: pageData.length,
      }
    : undefined

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Transferencias</h1>
          <p className="text-secondary mt-1">
            {total > 0 ? (
              <>
                <span className="text-white font-medium">{total.toLocaleString('es-CU')}</span> transferencias
                {fechaDesde && fechaHasta && fechaDesde === fechaHasta
                  ? <> del <span className="text-white">{displayDate(fechaDesde)}</span></>
                  : fechaDesde || fechaHasta
                    ? <> del <span className="text-white">{displayDate(fechaDesde) || '...'}</span> al <span className="text-white">{displayDate(fechaHasta) || '...'}</span></>
                    : <> en total</>
                }
              </>
            ) : 'Sin resultados para los filtros seleccionados'}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar
        activeFilterCount={activeFilterCount}
        onClear={clearFilters}
        resultCount={total}
        resultLabel="transferencias"
        dateRow={
          <>
            <Calendar size={16} className="text-tertiary shrink-0" />
            <DatePresets active={activePreset} onSelect={applyPreset} />
            <span className="text-border hidden md:inline">|</span>
            <FilterDateRange
              desde={fechaDesde}
              hasta={fechaHasta}
              onDesdeChange={(v) => { setFechaDesde(v); setActivePreset(''); setPage(1) }}
              onHastaChange={(v) => { setFechaHasta(v); setActivePreset(''); setPage(1) }}
            />
          </>
        }
        primaryFilters={
          <>
            <FilterInput icon={User} label="Nombre" value={search} onChange={(v) => { setSearch(v); setPage(1) }} className="w-full md:w-40" />
            <FilterInput icon={Hash} label="CI" value={ci} onChange={(v) => { setCi(v); setPage(1) }} className="w-full md:w-32" />
            <FilterInput icon={Wallet} label="Cuenta" value={cuenta} onChange={(v) => { setCuenta(v); setPage(1) }} className="w-full md:w-40" />
            <FilterInput icon={FileText} label="Ref Origen" value={refOrigen} onChange={(v) => { setRefOrigen(v); setPage(1) }} className="w-full md:w-32" />
          </>
        }
        secondaryFilters={
          <>
            <FilterSelect
              value={canal}
              onChange={(v) => { setCanal(v); setPage(1) }}
              options={[
                { value: 'BANCA MOVIL', label: 'BANCA MOVIL' },
                { value: 'BANCAMOVIL-BPA', label: 'BANCAMOVIL-BPA' },
                { value: 'TRANSFERMOVIL', label: 'TRANSFERMOVIL' },
              ]}
              className="w-full md:w-40"
            />
            <FilterSelect
              value={estado}
              onChange={(v) => { setEstado(v); setPage(1) }}
              options={[
                { value: 'pendiente', label: 'Pendiente' },
                { value: 'confirmada', label: 'Confirmada' },
                { value: 'reclamada', label: 'Reclamada' },
              ]}
              className="w-full md:w-36"
            />
            <FilterInput icon={DollarSign} label="Importe min" type="number" value={desde} onChange={(v) => { setDesde(v); setPage(1) }} className="w-full md:w-28" />
            <FilterInput icon={DollarSign} label="Importe max" type="number" value={hasta} onChange={(v) => { setHasta(v); setPage(1) }} className="w-full md:w-28" />
          </>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-secondary animate-pulse">Cargando transferencias...</div>
        </div>
      ) : (
        <div className={`transition-opacity duration-150 ${isFetching ? 'opacity-50' : ''}`}>
          <DataTable
            tableId="transferencias"
            data={pageData}
            columns={columns}
            title="Transferencias BANDEC"
            sorting={sorting}
            onSortingChange={(s) => { setSorting(s); setPage(1) }}
            pagination={transferencias?.pagination}
            onPageChange={setPage}
            onLimitChange={(l) => { setPageSize('transferencias', l); setPage(1) }}
            totals={transferencias?.totals}
            pageTotals={pageTotals}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['transferencias'] })}
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
      )}

      {selected && <TransferDetailModal transfer={{ source: 'bandec', data: selected }} onClose={() => setSelected(null)} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['transferencias'] })} />}
    </div>
  )
}
