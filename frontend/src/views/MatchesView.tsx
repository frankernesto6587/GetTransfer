import { useState, useCallback } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Calendar, User, Hash, Wallet, Code, DollarSign, Eye, Download } from 'lucide-react'
import { FilterBar, FilterInput, FilterSelect, FilterDateRange, DatePresets, type DatePresetKey } from '../components/filters'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable, type SortingState } from '../components/DataTable'
import { matchesQuery } from '../lib/api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useUIStore } from '../stores/uiStore'
import { displayFecha, formatCurrency, CanalBadge } from '../components/TransferShared'
import { MatchDetailModal } from '../components/MatchDetailModal'
import type { MatchedTransfer } from '../types'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const MATCH_TYPE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'manual', label: 'Manual (todos)' },
  { value: 'CONFIRMED_DEPOSIT', label: 'Deposito' },
  { value: 'CONFIRMED_BUY', label: 'Compra' },
  { value: 'REVIEW_REQUIRED', label: 'Revision' },
]

const MATCH_TYPE_COLORS: Record<string, string> = {
  CONFIRMED_AUTO: 'bg-emerald-500/15 text-emerald-400',
  CONFIRMED_MANUAL_REF_ACCOUNT_CI: 'bg-blue-500/15 text-blue-400',
  CONFIRMED_MANUAL_CI_ACCOUNT_DATE: 'bg-blue-500/15 text-blue-400',
  CONFIRMED_MANUAL_CI: 'bg-cyan-500/15 text-cyan-400',
  CONFIRMED_MANUAL_ACCOUNT: 'bg-cyan-500/15 text-cyan-400',
  CONFIRMED_MANUAL_NAME_DATE: 'bg-cyan-500/15 text-cyan-400',
  CONFIRMED_DEPOSIT: 'bg-violet-500/15 text-violet-400',
  CONFIRMED_BUY: 'bg-amber-500/15 text-amber-400',
  REVIEW_REQUIRED: 'bg-rose-500/15 text-rose-400',
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  CONFIRMED_AUTO: 'Auto',
  CONFIRMED_MANUAL_REF_ACCOUNT_CI: 'Manual L1',
  CONFIRMED_MANUAL_CI_ACCOUNT_DATE: 'Manual L2',
  CONFIRMED_MANUAL_CI: 'Manual L3',
  CONFIRMED_MANUAL_ACCOUNT: 'Manual L4',
  CONFIRMED_MANUAL_NAME_DATE: 'Manual L5',
  CONFIRMED_DEPOSIT: 'Deposito',
  CONFIRMED_BUY: 'Compra',
  REVIEW_REQUIRED: 'Revision',
}

function MatchTypeBadge({ matchType, conciliadaPor, matchNivel }: { matchType: string | null; conciliadaPor?: string | null; matchNivel?: number | null }) {
  // New flow: use conciliadaPor + matchNivel
  if (conciliadaPor === 'auto') {
    return <span className="text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap bg-emerald-500/15 text-emerald-400">Auto</span>
  }
  if (matchNivel) {
    const nivelColors: Record<number, string> = {
      1: 'bg-blue-500/15 text-blue-400',
      2: 'bg-blue-500/15 text-blue-400',
      3: 'bg-cyan-500/15 text-cyan-400',
      4: 'bg-cyan-500/15 text-cyan-400',
      5: 'bg-cyan-500/15 text-cyan-400',
    }
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${nivelColors[matchNivel] || 'bg-white/10 text-secondary'}`}>Manual L{matchNivel}</span>
  }
  // Legacy: use matchType from transferencia
  if (matchType) {
    const colorClass = MATCH_TYPE_COLORS[matchType] || 'bg-white/10 text-secondary'
    const label = MATCH_TYPE_LABELS[matchType] || matchType
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${colorClass}`}>{label}</span>
  }
  return <span className="text-tertiary">—</span>
}

const col = createColumnHelper<MatchedTransfer>()

function makeColumns(onView: (t: MatchedTransfer) => void) {
  return [
    col.accessor('confirmedAt', {
      header: 'Fecha Match',
      cell: (info) => {
        const v = info.getValue()
        if (!v) return <span className="text-tertiary">—</span>
        const d = new Date(v)
        return <span className="text-secondary text-xs whitespace-nowrap font-mono">{d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
      },
    }),
    col.accessor('codigoConfirmacion', {
      header: 'Codigo GT',
      cell: (info) => {
        const v = info.getValue()
        return v
          ? <span className="text-emerald-400 font-mono text-xs whitespace-nowrap">{v}</span>
          : <span className="text-tertiary">—</span>
      },
    }),
    col.accessor('matchType', {
      header: 'Tipo',
      cell: (info) => {
        const row = info.row.original
        return <MatchTypeBadge matchType={info.getValue()} conciliadaPor={row.solicitud_conciliadaPor} matchNivel={row.solicitud_matchNivel} />
      },
    }),
    col.accessor('importe', {
      header: 'Monto',
      meta: { align: 'right' },
      cell: (info) => {
        const row = info.row.original
        const isCredit = row.tipo === 'Cr'
        return (
          <span className={`font-mono whitespace-nowrap ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
            {isCredit ? '+' : '-'}${formatCurrency(info.getValue())}
          </span>
        )
      },
    }),
    col.accessor('fecha', {
      header: 'Fecha GT',
      cell: (info) => <span className="text-secondary whitespace-nowrap text-xs font-mono">{displayFecha(info.getValue())}</span>,
    }),
    col.accessor('solicitud_creadoAt', {
      header: 'Fecha Solicitud',
      cell: (info) => {
        const v = info.getValue()
        if (!v) return <span className="text-tertiary">—</span>
        return <span className="text-blue-400/80 whitespace-nowrap text-xs font-mono">{new Date(v).toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
      },
    }),
    col.accessor('nombreOrdenante', {
      header: 'Ordenante Banco',
      cell: (info) => {
        const name = info.getValue() || '—'
        return <span className="text-white whitespace-nowrap max-w-[150px] truncate block text-sm" title={name}>{name}</span>
      },
    }),
    col.accessor('solicitud_clienteNombre', {
      header: 'Cliente Solicitud',
      cell: (info) => {
        const name = info.getValue() || '—'
        return <span className="text-blue-400/80 whitespace-nowrap max-w-[150px] truncate block text-sm" title={name}>{name}</span>
      },
    }),
    col.accessor('solicitud_sedeId', {
      header: 'Sede',
      cell: (info) => <span className="text-secondary text-xs">{info.getValue() || '—'}</span>,
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

export function MatchesView() {
  const queryClient = useQueryClient()
  const { pageSize, setPageSize } = useUIStore()
  const limit = pageSize['matches'] || 50
  const [selected, setSelected] = useState<MatchedTransfer | null>(null)
  const [page, setPage] = useState(1)
  const [sorting, setSorting] = useState<SortingState>([])
  const [fechaDesde, setFechaDesde] = useState(firstOfMonth())
  const [fechaHasta, setFechaHasta] = useState(today())
  const [activePreset, setActivePreset] = useState<DatePresetKey>('month')

  const [nombre, setNombre] = useState('')
  const [ci, setCi] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [codigo, setCodigo] = useState('')
  const [canal, setCanal] = useState('')
  const [matchType, setMatchType] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const debouncedNombre = useDebouncedValue(nombre)
  const debouncedCi = useDebouncedValue(ci)
  const debouncedCuenta = useDebouncedValue(cuenta)
  const debouncedCodigo = useDebouncedValue(codigo)

  const applyPreset = useCallback((preset: DatePresetKey) => {
    setActivePreset(preset)
    setPage(1)
    const t = new Date()
    switch (preset) {
      case 'today':
        setFechaDesde(today()); setFechaHasta(today())
        break
      case 'week': {
        const weekAgo = new Date(t)
        weekAgo.setDate(weekAgo.getDate() - 6)
        setFechaDesde(weekAgo.toISOString().slice(0, 10)); setFechaHasta(today())
        break
      }
      case 'month':
        setFechaDesde(firstOfMonth()); setFechaHasta(today())
        break
      case 'all':
        setFechaDesde(''); setFechaHasta('')
        break
    }
  }, [])

  const clearFilters = useCallback(() => {
    setNombre(''); setCi(''); setCuenta(''); setCodigo('')
    setCanal(''); setMatchType(''); setDesde(''); setHasta('')
    setPage(1)
  }, [])

  const colIdToSortField: Record<string, string> = {
    ci: 'ciOrdenante',
    cuenta: 'cuentaOrdenante',
    canal: 'canalEmision',
  }
  const sort = sorting[0]
  const orderBy = sort ? (colIdToSortField[sort.id] ?? sort.id) : undefined
  const orderDir = sort ? (sort.desc ? 'desc' as const : 'asc' as const) : undefined

  const { data, isLoading, isFetching } = useQuery({
    ...matchesQuery({
      page,
      limit,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      nombre: debouncedNombre || undefined,
      ci: debouncedCi || undefined,
      cuenta: debouncedCuenta || undefined,
      codigo: debouncedCodigo || undefined,
      canal: canal || undefined,
      matchType: matchType || undefined,
      desde: desde ? Number(desde) : undefined,
      hasta: hasta ? Number(hasta) : undefined,
      orderBy,
      orderDir,
    }),
    placeholderData: keepPreviousData,
  })

  const total = data?.pagination?.total ?? 0
  // const odooAvailable removed — data comes from GT central only
  const activeFilterCount = [debouncedNombre, debouncedCi, debouncedCuenta, debouncedCodigo, canal, matchType, desde, hasta].filter(Boolean).length

  const allData = data?.data ?? []

  // Summary stats by match type (from backend — covers full filtered dataset)
  const statsByType = data?.statsByType ?? { auto: 0, manual: 0, deposito: 0, compra: 0, revision: 0 }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Matches</h1>
          <a
            href="/Matches.xlsx"
            download="Matches.xlsx"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
          >
            <Download size={14} />
            Plantilla Excel
          </a>
        </div>
        <p className="text-secondary mt-1">
          {total > 0 ? (
            <>
              <span className="text-white font-medium">{total.toLocaleString('es-CU')}</span> transferencias confirmadas
              {fechaDesde && fechaHasta && fechaDesde === fechaHasta
                ? <> del <span className="text-white">{displayFecha(fechaDesde)}</span></>
                : fechaDesde || fechaHasta
                  ? <> del <span className="text-white">{displayFecha(fechaDesde) || '...'}</span> al <span className="text-white">{displayFecha(fechaHasta) || '...'}</span></>
                  : <> en total</>
              }
            </>
          ) : 'Sin matches para los filtros seleccionados'}
        </p>
      </div>

      {/* Summary cards */}
      {allData.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="rounded-lg border border-border bg-surface p-3 text-center">
            <p className="text-lg font-bold text-emerald-400">{statsByType.auto || 0}</p>
            <p className="text-[10px] text-tertiary mt-0.5">Auto</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3 text-center">
            <p className="text-lg font-bold text-blue-400">{statsByType.manual || 0}</p>
            <p className="text-[10px] text-tertiary mt-0.5">Manual</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3 text-center">
            <p className="text-lg font-bold text-violet-400">{statsByType.deposito || 0}</p>
            <p className="text-[10px] text-tertiary mt-0.5">Deposito</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3 text-center">
            <p className="text-lg font-bold text-amber-400">{statsByType.compra || 0}</p>
            <p className="text-[10px] text-tertiary mt-0.5">Compra</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3 text-center">
            <p className="text-lg font-bold text-rose-400">{statsByType.revision || 0}</p>
            <p className="text-[10px] text-tertiary mt-0.5">Revision</p>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <FilterBar
        activeFilterCount={activeFilterCount}
        onClear={clearFilters}
        resultCount={total}
        resultLabel="matches"
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
            <FilterInput icon={Code} label="Codigo GT" value={codigo} onChange={(v) => { setCodigo(v); setPage(1) }} className="w-full md:w-32" />
          </>
        }
        secondaryFilters={
          <>
            <FilterSelect
              value={matchType}
              onChange={(v) => { setMatchType(v); setPage(1) }}
              options={MATCH_TYPE_OPTIONS}
              allLabel="Todos los tipos"
              className="w-full md:w-44"
            />
            <FilterSelect
              value={canal}
              onChange={(v) => { setCanal(v); setPage(1) }}
              options={[
                { value: 'BANCA MOVIL', label: 'BANCA MOVIL' },
                { value: 'BANCAMOVIL-BPA', label: 'BANCAMOVIL-BPA' },
                { value: 'TRANSFERMOVIL', label: 'TRANSFERMOVIL' },
              ]}
              allLabel="Todos los canales"
              className="w-full md:w-44"
            />
            <FilterInput icon={DollarSign} label="Importe min" type="number" value={desde} onChange={(v) => { setDesde(v); setPage(1) }} className="w-full md:w-28" />
            <FilterInput icon={DollarSign} label="Importe max" type="number" value={hasta} onChange={(v) => { setHasta(v); setPage(1) }} className="w-full md:w-28" />
          </>
        }
      />

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-secondary animate-pulse">Cargando matches...</div>
        </div>
      ) : (
        <div className={`transition-opacity duration-150 ${isFetching ? 'opacity-50' : ''}`}>
          <DataTable
            tableId="matches"
            data={allData}
            columns={makeColumns(setSelected)}
            onRowClick={setSelected}
            sorting={sorting}
            onSortingChange={(s) => { setSorting(s); setPage(1) }}
            pagination={data?.pagination}
            onPageChange={setPage}
            onLimitChange={(l) => { setPageSize('matches', l); setPage(1) }}
            totals={data?.totals}
            alwaysVisibleColumns={['confirmedAt', 'importe', 'codigoConfirmacion']}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ['matches'] })
              queryClient.invalidateQueries({ queryKey: ['confirmar-odoo'] })
              queryClient.invalidateQueries({ queryKey: ['transferencias'] })
            }}
            title="Matches"
            loading={isFetching}
            mobileCard={(item) => (
              <div className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-mono text-xs">{item.codigoConfirmacion}</span>
                    <MatchTypeBadge matchType={item.matchType} />
                  </div>
                  <span className="text-secondary text-xs font-mono">
                    {item.confirmedAt ? new Date(item.confirmedAt).toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit' }) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm truncate" title={item.nombreOrdenante || undefined}>{item.nombreOrdenante || '—'}</div>
                    <div className="text-blue-400/70 text-xs truncate" title={item.solicitud_clienteNombre || undefined}>{item.solicitud_clienteNombre || '—'}</div>
                  </div>
                  <span className={`font-mono font-medium shrink-0 ${item.tipo === 'Cr' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {item.tipo === 'Cr' ? '+' : '-'}${formatCurrency(item.importe)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-tertiary">GT: {displayFecha(item.fecha)}</span>
                    <span className="text-blue-400/60">Sol: {item.solicitud_creadoAt ? new Date(item.solicitud_creadoAt).toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit' }) : '—'}</span>
                  </div>
                  <CanalBadge canal={item.canalEmision} />
                </div>
              </div>
            )}
          />
        </div>
      )}

      {selected && (
        <MatchDetailModal
          match={selected}
          onClose={() => setSelected(null)}
          onRefresh={() => {
            queryClient.invalidateQueries({ queryKey: ['matches'] })
            queryClient.invalidateQueries({ queryKey: ['confirmar-odoo'] })
            queryClient.invalidateQueries({ queryKey: ['transferencias'] })
          }}
        />
      )}
    </div>
  )
}
