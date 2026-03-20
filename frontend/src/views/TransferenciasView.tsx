import { useState, useCallback } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { Calendar, Eye, User, Hash, Wallet, FileText, DollarSign, Code, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
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

const MATCH_TYPE_CONFIG: Record<string, { label: string; class: string; codeClass: string }> = {
  CONFIRMED_AUTO: { label: 'Auto', class: 'bg-emerald-500/15 text-emerald-400', codeClass: 'bg-emerald-500/15 text-emerald-400' },
  CONFIRMED_MANUAL_REF_ACCOUNT_CI: { label: 'Manual L1', class: 'bg-blue-500/15 text-blue-400', codeClass: 'bg-blue-500/15 text-blue-400' },
  CONFIRMED_MANUAL_CI_ACCOUNT_DATE: { label: 'Manual L2', class: 'bg-blue-500/15 text-blue-400', codeClass: 'bg-blue-500/15 text-blue-400' },
  CONFIRMED_MANUAL_CI_AMOUNT: { label: 'Manual L3', class: 'bg-cyan-500/15 text-cyan-400', codeClass: 'bg-cyan-500/15 text-cyan-400' },
  CONFIRMED_MANUAL_ACCOUNT_AMOUNT: { label: 'Manual L4', class: 'bg-cyan-500/15 text-cyan-400', codeClass: 'bg-cyan-500/15 text-cyan-400' },
  CONFIRMED_MANUAL_NAME_DATE: { label: 'Manual L5', class: 'bg-cyan-500/15 text-cyan-400', codeClass: 'bg-cyan-500/15 text-cyan-400' },
  CONFIRMED_DEPOSIT: { label: 'Deposito', class: 'bg-violet-500/15 text-violet-400', codeClass: 'bg-violet-500/15 text-violet-400' },
  CONFIRMED_BUY: { label: 'Compra', class: 'bg-amber-500/15 text-amber-400', codeClass: 'bg-amber-500/15 text-amber-400' },
  REVIEW_REQUIRED: { label: 'Revision', class: 'bg-rose-500/15 text-rose-400', codeClass: 'bg-rose-500/15 text-rose-400' },
}

function matchTypeBadgeClass(matchType: string | null): string {
  if (!matchType) return 'bg-emerald-500/15 text-emerald-400'
  return MATCH_TYPE_CONFIG[matchType]?.codeClass || 'bg-emerald-500/15 text-emerald-400'
}

function MatchTypeBadge({ matchType }: { matchType: string }) {
  const config = MATCH_TYPE_CONFIG[matchType]
  if (!config) return null
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${config.class}`}>
      {config.label}
    </span>
  )
}

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
    col.display({
      id: 'credito',
      header: 'Crédito',
      cell: (info) => {
        const t = info.row.original
        if (t.tipo !== 'Cr') return <span className="text-tertiary">—</span>
        return <span className="font-mono whitespace-nowrap text-emerald-400">{formatCurrency(t.importe)}</span>
      },
      meta: { align: 'right' },
    }),
    col.display({
      id: 'debito',
      header: 'Débito',
      cell: (info) => {
        const t = info.row.original
        if (t.tipo !== 'Db') return <span className="text-tertiary">—</span>
        return <span className="font-mono whitespace-nowrap text-red-400">{formatCurrency(t.importe)}</span>
      },
      meta: { align: 'right' },
    }),
    col.accessor('codigoConfirmacion', {
      header: 'Estado',
      enableSorting: false,
      cell: (info) => {
        const codigo = info.getValue()
        const matchType = info.row.original.matchType
        if (!codigo) {
          return (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/5 text-tertiary">
              Pendiente
            </span>
          )
        }
        return (
          <div className="flex items-center gap-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${matchTypeBadgeClass(matchType)}`} title={codigo}>
              {codigo}
            </span>
            {matchType && <MatchTypeBadge matchType={matchType} />}
          </div>
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
  const [codigo, setCodigo] = useState(searchParams.codigo)
  const [estado, setEstado] = useState(searchParams.estado)
  const [tipo, setTipo] = useState('')
  const [source, setSource] = useState('')
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
  const debouncedCodigo = useDebouncedValue(codigo)

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

  const activeFilterCount = [debouncedSearch, desde, hasta, canal, debouncedCi, debouncedCuenta, debouncedRefOrigen, debouncedCodigo, estado, tipo, source].filter(Boolean).length

  const clearFilters = useCallback(() => {
    setSearch('')
    setDesde('')
    setHasta('')
    setCanal('')
    setCi('')
    setCuenta('')
    setRefOrigen('')
    setCodigo('')
    setEstado('')
    setTipo('')
    setSource('')
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
      codigo: debouncedCodigo || undefined,
      estado: estado || undefined,
      tipo: tipo || undefined,
      source: source || undefined,
      orderBy: sort?.id,
      orderDir: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
    }),
    placeholderData: keepPreviousData,
  })

  const total = transferencias?.pagination?.total ?? 0
  const columns = makeColumns(setSelected)

  const rawData = transferencias?.data ?? []
  const pageData = rawData
  const pageTotals = pageData.length > 0
    ? {
        importe: pageData.reduce((sum, t) => sum + (t.tipo === 'Cr' ? t.importe : -t.importe), 0),
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
            <FilterInput icon={Code} label="GT Codigo" value={codigo} onChange={(v) => { setCodigo(v); setPage(1) }} className="w-full md:w-32" />
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
            <FilterSelect
              value={tipo}
              onChange={(v) => { setTipo(v); setPage(1) }}
              options={[
                { value: 'Cr', label: 'Crédito' },
                { value: 'Db', label: 'Débito' },
              ]}
              className="w-full md:w-32"
            />
            <FilterSelect
              value={source}
              onChange={(v) => { setSource(v); setPage(1) }}
              options={[
                { value: 'scraper', label: 'Scraper' },
                { value: 'statement', label: 'Estado de Cuenta' },
              ]}
              className="w-full md:w-40"
            />
            <FilterInput icon={DollarSign} label="Importe min" type="number" value={desde} onChange={(v) => { setDesde(v); setPage(1) }} className="w-full md:w-28" />
            <FilterInput icon={DollarSign} label="Importe max" type="number" value={hasta} onChange={(v) => { setHasta(v); setPage(1) }} className="w-full md:w-28" />
          </>
        }
      />

      {/* Summary card */}
      {transferencias?.totals && (transferencias.totals.importeCreditos !== undefined || transferencias.totals.importeDebitos !== undefined) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2 text-secondary text-sm mb-1">
              <ArrowDownLeft size={14} className="text-emerald-400" />
              Créditos
            </div>
            <div className="font-mono text-emerald-400 text-lg font-semibold">
              {formatCurrency(transferencias.totals.importeCreditos ?? 0)}
            </div>
            <div className="text-tertiary text-xs">{(transferencias.totals.cantidadCreditos ?? 0).toLocaleString('es-CU')} transferencias</div>
          </div>
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2 text-secondary text-sm mb-1">
              <ArrowUpRight size={14} className="text-red-400" />
              Débitos
            </div>
            <div className="font-mono text-red-400 text-lg font-semibold">
              {formatCurrency(transferencias.totals.importeDebitos ?? 0)}
            </div>
            <div className="text-tertiary text-xs">{(transferencias.totals.cantidadDebitos ?? 0).toLocaleString('es-CU')} transferencias</div>
          </div>
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2 text-secondary text-sm mb-1">
              <DollarSign size={14} className="text-gold" />
              Balance
            </div>
            <div className="font-mono text-white text-lg font-semibold">
              {formatCurrency((transferencias.totals.importeCreditos ?? 0) - (transferencias.totals.importeDebitos ?? 0))}
            </div>
            <div className="text-tertiary text-xs">{(transferencias.totals.cantidad ?? 0).toLocaleString('es-CU')} transferencias</div>
          </div>
        </div>
      )}

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
                  <span className={`font-mono font-medium ${t.tipo === 'Cr' ? 'text-emerald-400' : t.tipo === 'Db' ? 'text-red-400' : 'text-white'}`}>
                    {t.tipo === 'Db' ? '- ' : ''}{formatCurrency(t.importe)}
                  </span>
                </div>
                <p className="text-white text-sm truncate">{t.nombreOrdenante || '—'}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CanalBadge canal={t.canalEmision} />
                    {t.codigoConfirmacion ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${matchTypeBadgeClass(t.matchType)}`}>{t.codigoConfirmacion}</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/5 text-tertiary">Pendiente</span>
                    )}
                    {t.matchType && <MatchTypeBadge matchType={t.matchType} />}
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
