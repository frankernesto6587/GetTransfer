import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Calendar, Filter, RotateCcw } from 'lucide-react'
import { Pagination } from '../components/Pagination'
import { transferenciasOdooQuery } from '../lib/api'
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

type DatePreset = 'today' | 'week' | 'month' | 'all'

export function TransferenciasOdooView() {
  const [page, setPage] = useState(1)
  const [fechaDesde, setFechaDesde] = useState(firstOfMonth())
  const [fechaHasta, setFechaHasta] = useState(today())
  const [activePreset, setActivePreset] = useState<DatePreset>('month')

  // Text filters with debounce
  const [nombre, setNombre] = useState('')
  const [debouncedNombre, setDebouncedNombre] = useState('')
  const [ci, setCi] = useState('')
  const [debouncedCi, setDebouncedCi] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [debouncedCuenta, setDebouncedCuenta] = useState('')
  const [refOrigen, setRefOrigen] = useState('')
  const [debouncedRefOrigen, setDebouncedRefOrigen] = useState('')
  const [gtCodigo, setGtCodigo] = useState('')
  const [debouncedGtCodigo, setDebouncedGtCodigo] = useState('')
  const [transferCode, setTransferCode] = useState('')
  const [debouncedTransferCode, setDebouncedTransferCode] = useState('')

  // Select / number filters
  const [canal, setCanal] = useState('')
  const [paymentType, setPaymentType] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  // Debounce refs
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function debounced(key: string, setter: (v: string) => void, value: string) {
    if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => { setter(value); setPage(1) }, 300)
  }

  useEffect(() => {
    return () => {
      Object.values(debounceRefs.current).forEach(clearTimeout)
    }
  }, [])

  const applyPreset = useCallback((preset: DatePreset) => {
    setActivePreset(preset)
    setPage(1)
    const t = new Date()
    switch (preset) {
      case 'today':
        setFechaDesde(today())
        setFechaHasta(today())
        break
      case 'week': {
        const weekAgo = new Date(t)
        weekAgo.setDate(weekAgo.getDate() - 6)
        setFechaDesde(weekAgo.toISOString().slice(0, 10))
        setFechaHasta(today())
        break
      }
      case 'month':
        setFechaDesde(firstOfMonth())
        setFechaHasta(today())
        break
      case 'all':
        setFechaDesde('')
        setFechaHasta('')
        break
    }
  }, [])

  const hasActiveFilters = useMemo(() => {
    return debouncedNombre || debouncedCi || debouncedCuenta || debouncedRefOrigen ||
      debouncedGtCodigo || debouncedTransferCode || canal || paymentType || desde || hasta
  }, [debouncedNombre, debouncedCi, debouncedCuenta, debouncedRefOrigen, debouncedGtCodigo, debouncedTransferCode, canal, paymentType, desde, hasta])

  const clearFilters = useCallback(() => {
    setNombre(''); setDebouncedNombre('')
    setCi(''); setDebouncedCi('')
    setCuenta(''); setDebouncedCuenta('')
    setRefOrigen(''); setDebouncedRefOrigen('')
    setGtCodigo(''); setDebouncedGtCodigo('')
    setTransferCode(''); setDebouncedTransferCode('')
    setCanal('')
    setPaymentType('')
    setDesde('')
    setHasta('')
    setPage(1)
  }, [])

  const { data, isLoading, isFetching } = useQuery({
    ...transferenciasOdooQuery({
      page,
      limit: 50,
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
    }),
    placeholderData: keepPreviousData,
  })

  const total = data?.pagination?.total ?? 0

  const inputClass = 'bg-page border border-border rounded-lg px-2.5 py-1 text-xs text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors'

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-headline text-3xl font-bold text-white">Transferencias Odoo</h1>
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
      <div className="rounded-xl border border-border bg-surface mb-6">
        {/* Date presets + range */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
          <Calendar size={16} className="text-tertiary shrink-0" />
          <div className="flex items-center gap-1 bg-page rounded-lg p-0.5">
            {([
              ['today', 'Hoy'],
              ['week', '7 dias'],
              ['month', 'Este mes'],
              ['all', 'Todo'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  activePreset === key
                    ? 'bg-gold/20 text-gold'
                    : 'text-tertiary hover:text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-border">|</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => { setFechaDesde(e.target.value); setActivePreset('' as DatePreset); setPage(1) }}
              className={`${inputClass} [color-scheme:dark]`}
            />
            <span className="text-tertiary text-xs">—</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => { setFechaHasta(e.target.value); setActivePreset('' as DatePreset); setPage(1) }}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
        </div>

        {/* Nombre + Importe + payment type */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
          <Filter size={16} className="text-tertiary shrink-0" />

          <div className="flex items-center gap-2">
            <label className="text-xs text-tertiary whitespace-nowrap">Nombre</label>
            <input
              type="text"
              placeholder="Buscar nombre..."
              value={nombre}
              onChange={(e) => { setNombre(e.target.value); debounced('nombre', setDebouncedNombre, e.target.value) }}
              className={`w-40 ${inputClass}`}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-tertiary whitespace-nowrap">Importe</label>
            <input
              type="number"
              placeholder="Min"
              value={desde}
              onChange={(e) => { setDesde(e.target.value); setPage(1) }}
              className={`w-24 ${inputClass}`}
            />
            <span className="text-tertiary text-xs">—</span>
            <input
              type="number"
              placeholder="Max"
              value={hasta}
              onChange={(e) => { setHasta(e.target.value); setPage(1) }}
              className={`w-24 ${inputClass}`}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-tertiary whitespace-nowrap">Tipo</label>
            <select
              value={paymentType}
              onChange={(e) => { setPaymentType(e.target.value); setPage(1) }}
              className={`${inputClass} [color-scheme:dark]`}
            >
              <option value="">Todos</option>
              <option value="transfer">Transfer</option>
              <option value="gettransfer">GetTransfer</option>
            </select>
          </div>

          {hasActiveFilters && (
            <>
              <span className="text-border">|</span>
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-1 text-xs text-tertiary hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw size={12} />
                Limpiar filtros
              </button>
            </>
          )}
        </div>

        {/* CI, Cuenta, Canal, Ref Origen, GT Código, Transfer Code */}
        <div className="flex items-center gap-3 px-5 py-3">
          <Filter size={16} className="text-tertiary shrink-0" />

          <div className="flex items-center gap-2">
            <label className="text-xs text-tertiary whitespace-nowrap">CI</label>
            <input
              type="text"
              placeholder="Buscar CI..."
              value={ci}
              onChange={(e) => { setCi(e.target.value); debounced('ci', setDebouncedCi, e.target.value) }}
              className={`w-32 ${inputClass}`}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-tertiary whitespace-nowrap">Cuenta</label>
            <input
              type="text"
              placeholder="Buscar cuenta..."
              value={cuenta}
              onChange={(e) => { setCuenta(e.target.value); debounced('cuenta', setDebouncedCuenta, e.target.value) }}
              className={`w-40 ${inputClass}`}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-tertiary whitespace-nowrap">Canal</label>
            <select
              value={canal}
              onChange={(e) => { setCanal(e.target.value); setPage(1) }}
              className={`${inputClass} [color-scheme:dark]`}
            >
              <option value="">Todos</option>
              <option value="BANCA MOVIL">BANCA MOVIL</option>
              <option value="BANCAMOVIL-BPA">BANCAMOVIL-BPA</option>
              <option value="TRANSFERMOVIL">TRANSFERMOVIL</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-tertiary whitespace-nowrap">Ref Origen</label>
            <input
              type="text"
              placeholder="Buscar ref..."
              value={refOrigen}
              onChange={(e) => { setRefOrigen(e.target.value); debounced('refOrigen', setDebouncedRefOrigen, e.target.value) }}
              className={`w-32 ${inputClass}`}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-tertiary whitespace-nowrap">GT Codigo</label>
            <input
              type="text"
              placeholder="Buscar GT..."
              value={gtCodigo}
              onChange={(e) => { setGtCodigo(e.target.value); debounced('gtCodigo', setDebouncedGtCodigo, e.target.value) }}
              className={`w-28 ${inputClass}`}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-tertiary whitespace-nowrap">Transfer Code</label>
            <input
              type="text"
              placeholder="Buscar code..."
              value={transferCode}
              onChange={(e) => { setTransferCode(e.target.value); debounced('transferCode', setDebouncedTransferCode, e.target.value) }}
              className={`w-28 ${inputClass}`}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-secondary animate-pulse">Cargando transferencias de Odoo...</div>
        </div>
      ) : (
        <>
          <div className={`mb-4 transition-opacity duration-150 ${isFetching ? 'opacity-50' : ''}`}>
            <div className="rounded-xl border border-border bg-surface overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-tertiary">
                    <th className="px-3 py-2.5 text-left font-medium">Fecha</th>
                    <th className="px-3 py-2.5 text-left font-medium">Orden</th>
                    <th className="px-3 py-2.5 text-left font-medium">Sesion</th>
                    <th className="px-3 py-2.5 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2.5 text-left font-medium">Nombre</th>
                    <th className="px-3 py-2.5 text-left font-medium">CI</th>
                    <th className="px-3 py-2.5 text-left font-medium">Cuenta</th>
                    <th className="px-3 py-2.5 text-left font-medium">Transfer Code</th>
                    <th className="px-3 py-2.5 text-left font-medium">GT Codigo</th>
                    <th className="px-3 py-2.5 text-left font-medium">Canal</th>
                    <th className="px-3 py-2.5 text-right font-medium">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.data ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-8 text-center text-tertiary">
                        No se encontraron transferencias
                      </td>
                    </tr>
                  ) : (
                    (data?.data ?? []).map((item: TransferenciaOdooItem) => (
                      <tr key={item.payment_id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                        <td className="px-3 py-2 text-secondary whitespace-nowrap">{formatOdooDate(item.order_date)}</td>
                        <td className="px-3 py-2 text-white font-mono whitespace-nowrap">{item.order_name || '-'}</td>
                        <td className="px-3 py-2 text-secondary whitespace-nowrap">{item.session_name || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            item.payment_type === 'gettransfer'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-blue-500/10 text-blue-400'
                          }`}>
                            {item.payment_type || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-white whitespace-nowrap max-w-[180px] truncate" title={item.card_holder_name || item.gt_nombre_ordenante || ''}>
                          {item.card_holder_name || item.gt_nombre_ordenante || '-'}
                        </td>
                        <td className="px-3 py-2 text-secondary font-mono whitespace-nowrap">{item.card_holder_ci || item.gt_ci_ordenante || '-'}</td>
                        <td className="px-3 py-2 text-secondary font-mono whitespace-nowrap max-w-[140px] truncate" title={item.card_number || item.gt_cuenta_ordenante || ''}>
                          {item.card_number || item.gt_cuenta_ordenante || '-'}
                        </td>
                        <td className="px-3 py-2 text-secondary font-mono whitespace-nowrap">{item.transfer_code || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {item.gt_codigo ? (
                            <span className="text-emerald-400 font-mono">{item.gt_codigo}</span>
                          ) : (
                            <span className="text-tertiary">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-secondary whitespace-nowrap">{item.gt_canal_emision || '-'}</td>
                        <td className="px-3 py-2 text-right text-white font-mono whitespace-nowrap">
                          ${item.amount.toLocaleString('es-CU', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {data?.pagination ? (
            <Pagination
              pagination={data.pagination}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
