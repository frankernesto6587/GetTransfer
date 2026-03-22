import { useState, useCallback } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Calendar, User, Hash, Wallet, FileText, Code, DollarSign, Eye } from 'lucide-react'
import { FilterBar, FilterInput, FilterSelect, FilterDateRange, DatePresets, type DatePresetKey } from '../components/filters'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable, type SortingState } from '../components/DataTable'
import { transferenciasOdooQuery } from '../lib/api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useUIStore } from '../stores/uiStore'
import { TransferDetailModal } from '../components/TransferShared'
import type { TransferenciaOdooItem } from '../types'

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

function formatOdooDate(dateStr: string | null) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr.replace(' ', 'T'))
    return d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return dateStr
  }
}

const col = createColumnHelper<TransferenciaOdooItem>()

function makeOdooColumns(onView: (t: TransferenciaOdooItem) => void) {
return [
  col.accessor('order_date', {
    header: 'Fecha',
    cell: (info) => <span className="text-secondary whitespace-nowrap">{formatOdooDate(info.getValue())}</span>,
  }),
  col.accessor('order_name', {
    header: 'Orden',
    cell: (info) => <span className="text-white font-mono whitespace-nowrap">{info.getValue() || '-'}</span>,
  }),
  col.accessor('session_name', {
    header: 'Sesion',
    cell: (info) => <span className="text-secondary whitespace-nowrap">{info.getValue() || '-'}</span>,
  }),
  col.accessor('payment_type', {
    header: 'Tipo',
    cell: (info) => {
      const v = info.getValue()
      return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          v === 'gettransfer' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
        }`}>
          {v || '-'}
        </span>
      )
    },
  }),
  col.accessor('card_holder_name', {
    id: 'nombre',
    header: 'Nombre',
    cell: (info) => {
      const name = info.getValue() || info.row.original.gt_nombre_ordenante || '-'
      return <span className="text-white whitespace-nowrap max-w-[180px] truncate block" title={name}>{name}</span>
    },
  }),
  col.accessor('card_holder_ci', {
    id: 'ci',
    header: 'CI',
    cell: (info) => <span className="text-secondary font-mono whitespace-nowrap">{info.getValue() || info.row.original.gt_ci_ordenante || '-'}</span>,
  }),
  col.accessor('card_number', {
    id: 'cuenta',
    header: 'Cuenta',
    cell: (info) => {
      const v = info.getValue() || info.row.original.gt_cuenta_ordenante || '-'
      return <span className="text-secondary font-mono whitespace-nowrap max-w-[140px] truncate block" title={v}>{v}</span>
    },
  }),
  col.accessor('transfer_code', {
    header: 'Transfer Code',
    cell: (info) => <span className="text-secondary font-mono whitespace-nowrap">{info.getValue() || '-'}</span>,
  }),
  col.accessor('gt_codigo', {
    header: 'GT Codigo',
    cell: (info) => {
      const v = info.getValue()
      return v
        ? <span className="text-emerald-400 font-mono">{v}</span>
        : <span className="text-tertiary">-</span>
    },
  }),
  col.accessor('gt_canal_emision', {
    id: 'canal',
    header: 'Canal',
    cell: (info) => <span className="text-secondary whitespace-nowrap">{info.getValue() || '-'}</span>,
  }),
  col.accessor('amount', {
    header: 'Importe',
    meta: { align: 'right' },
    cell: (info) => <span className="text-white font-mono whitespace-nowrap">${info.getValue().toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>,
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

export function TransferenciasOdooView() {
  const queryClient = useQueryClient()
  const { pageSize, setPageSize } = useUIStore()
  const limit = pageSize['transferencias-odoo'] || 50
  const [selected, setSelected] = useState<TransferenciaOdooItem | null>(null)
  const [page, setPage] = useState(1)
  const [sorting, setSorting] = useState<SortingState>([])
  const [fechaDesde, setFechaDesde] = useState(firstOfMonth())
  const [fechaHasta, setFechaHasta] = useState(today())
  const [activePreset, setActivePreset] = useState<DatePresetKey>('month')

  const [nombre, setNombre] = useState('')
  const [ci, setCi] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [refOrigen, setRefOrigen] = useState('')
  const [gtCodigo, setGtCodigo] = useState('')
  const [transferCode, setTransferCode] = useState('')
  const [canal, setCanal] = useState('')
  const [paymentType, setPaymentType] = useState('')
  const [matchStatus, setMatchStatus] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const debouncedNombre = useDebouncedValue(nombre)
  const debouncedCi = useDebouncedValue(ci)
  const debouncedCuenta = useDebouncedValue(cuenta)
  const debouncedRefOrigen = useDebouncedValue(refOrigen)
  const debouncedGtCodigo = useDebouncedValue(gtCodigo)
  const debouncedTransferCode = useDebouncedValue(transferCode)

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
    setNombre(''); setCi(''); setCuenta(''); setRefOrigen('')
    setGtCodigo(''); setTransferCode(''); setCanal('')
    setPaymentType(''); setMatchStatus(''); setDesde(''); setHasta('')
    setPage(1)
  }, [])

  // Map column ids to API field names for server-side sort
  const colIdToSortField: Record<string, string> = {
    nombre: 'card_holder_name',
    ci: 'card_holder_ci',
    cuenta: 'card_number',
    canal: 'gt_canal_emision',
  }
  const sort = sorting[0]
  const orderBy = sort ? (colIdToSortField[sort.id] ?? sort.id) : undefined
  const orderDir = sort ? (sort.desc ? 'desc' as const : 'asc' as const) : undefined

  const { data, isLoading, isFetching } = useQuery({
    ...transferenciasOdooQuery({
      page,
      limit,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      nombre: debouncedNombre || undefined,
      ci: debouncedCi || undefined,
      cuenta: debouncedCuenta || undefined,
      canal: canal || undefined,
      refOrigen: debouncedRefOrigen || undefined,
      gtCodigo: debouncedGtCodigo || undefined,
      transferCode: debouncedTransferCode || undefined,
      desde: desde ? Number(desde) : undefined,
      hasta: hasta ? Number(hasta) : undefined,
      paymentType: paymentType || undefined,
      matchStatus: matchStatus || undefined,
      orderBy,
      orderDir,
    }),
    placeholderData: keepPreviousData,
  })

  const total = data?.pagination?.total ?? 0
  const activeFilterCount = [debouncedNombre, debouncedCi, debouncedCuenta, debouncedRefOrigen, debouncedGtCodigo, debouncedTransferCode, canal, paymentType, matchStatus, desde, hasta].filter(Boolean).length

  const pageData = data?.data ?? []
  const pageTotals = pageData.length > 0
    ? {
        importe: pageData.reduce((sum, t) => sum + t.amount, 0),
        cantidad: pageData.length,
      }
    : undefined

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Transferencias Odoo</h1>
        <p className="text-secondary mt-1">
          {total > 0 ? (
            <>
              <span className="text-white font-medium">{total.toLocaleString('es-CU')}</span> pagos transfer/gettransfer en Odoo
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

      {/* Filter bar */}
      <FilterBar
        activeFilterCount={activeFilterCount}
        onClear={clearFilters}
        resultCount={total}
        resultLabel="resultados"
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
            <FilterInput icon={FileText} label="Ref Origen" value={refOrigen} onChange={(v) => { setRefOrigen(v); setPage(1) }} className="w-full md:w-32" />
            <FilterInput icon={Code} label="Transfer Code" value={transferCode} onChange={(v) => { setTransferCode(v); setPage(1) }} className="w-full md:w-32" />
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
              value={paymentType}
              onChange={(v) => { setPaymentType(v); setPage(1) }}
              options={[
                { value: 'transfer', label: 'Transfer' },
                { value: 'gettransfer', label: 'GetTransfer' },
              ]}
              className="w-full md:w-36"
            />
            <FilterSelect
              value={matchStatus}
              onChange={(v) => { setMatchStatus(v); setPage(1) }}
              options={[
                { value: 'pending', label: 'Pendientes' },
                { value: 'matched', label: 'Matcheados' },
              ]}
              className="w-full md:w-36"
            />
            <FilterInput icon={DollarSign} label="Importe min" type="number" value={desde} onChange={(v) => { setDesde(v); setPage(1) }} className="w-full md:w-28" />
            <FilterInput icon={DollarSign} label="Importe max" type="number" value={hasta} onChange={(v) => { setHasta(v); setPage(1) }} className="w-full md:w-28" />
            <FilterInput icon={Code} label="GT Codigo" value={gtCodigo} onChange={(v) => { setGtCodigo(v); setPage(1) }} className="w-full md:w-28" />
          </>
        }
      />

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-secondary animate-pulse">Cargando transferencias de Odoo...</div>
        </div>
      ) : (
        <div className={`transition-opacity duration-150 ${isFetching ? 'opacity-50' : ''}`}>
          <DataTable
            tableId="transferencias-odoo"
            data={pageData}
            columns={makeOdooColumns(setSelected)}
            sorting={sorting}
            onSortingChange={(s) => { setSorting(s); setPage(1) }}
            pagination={data?.pagination}
            onPageChange={setPage}
            onLimitChange={(l) => { setPageSize('transferencias-odoo', l); setPage(1) }}
            totals={data?.totals}
            pageTotals={pageTotals}
            alwaysVisibleColumns={['order_date', 'amount']}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['transferencias-odoo'] })}
            title="Transferencias Odoo"
            loading={isFetching}
            mobileCard={(item) => (
              <div className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-white font-mono text-sm">{item.order_name || '-'}</span>
                  <span className="text-secondary text-xs">{formatOdooDate(item.order_date)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm truncate mr-2">{item.card_holder_name || item.gt_nombre_ordenante || '-'}</span>
                  <span className="text-secondary font-mono text-xs shrink-0">{item.card_holder_ci || item.gt_ci_ordenante || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      item.payment_type === 'gettransfer' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {item.payment_type || '-'}
                    </span>
                    {item.gt_canal_emision && <span className="text-tertiary text-xs">{item.gt_canal_emision}</span>}
                  </div>
                  <span className="text-white font-mono font-medium">${item.amount.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>
                </div>
                {(item.gt_codigo || item.transfer_code) && (
                  <div className="flex items-center gap-2 text-xs">
                    {item.gt_codigo && <span className="text-emerald-400 font-mono">GT: {item.gt_codigo}</span>}
                    {item.transfer_code && <span className="text-secondary font-mono">TX: {item.transfer_code}</span>}
                  </div>
                )}
              </div>
            )}
          />
        </div>
      )}

      {selected && (
        <TransferDetailModal
          transfer={{ source: 'odoo', data: selected }}
          onClose={() => setSelected(null)}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['transferencias-odoo'] })}
        />
      )}
    </div>
  )
}
