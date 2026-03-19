import { useState, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import {
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Zap,
  Search,
  Loader2,
  XCircle,
  User,
  Hash,
  Wallet,
} from 'lucide-react'
import { FilterBar, FilterInput, FilterSelect } from '../components/filters'
import {
  getPendientesOdoo,
  buscarOdooMatch,
  confirmarOdoo,
  autoConfirmarOdoo,
} from '../lib/api'
import type { Transferencia, OdooMatchResponse, OdooPaymentMatch, AutoConfirmarResult } from '../types'

/** YYYY-MM-DD → DD/MM/YYYY */
function displayFecha(f: string) {
  const iso = f?.slice(0, 10)
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : f
}

const nivelLabels: Record<number, string> = {
  1: 'Ref + Cuenta + CI + Monto',
  2: 'CI + Cuenta + Monto + Fecha',
  3: 'CI + Monto',
  4: 'Cuenta + Monto',
  5: 'Cuenta + Monto + Fecha',
  6: 'Nombre + Monto + Fecha',
}

export function ConfirmarOdooView() {
  const [pendientes, setPendientes] = useState<Transferencia[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [odooResult, setOdooResult] = useState<OdooMatchResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  // Confirmation state
  const [confirmado, setConfirmado] = useState<{ gt_codigo: string; odoo_order?: string } | null>(null)

  // Auto result
  const [autoResult, setAutoResult] = useState<AutoConfirmarResult | null>(null)
  const [autoCantidad, setAutoCantidad] = useState(20)

  // Filters
  const [filterNombre, setFilterNombre] = useState('')
  const [filterCi, setFilterCi] = useState('')
  const [filterCuenta, setFilterCuenta] = useState('')
  const [filterCanal, setFilterCanal] = useState('')

  const transfer = pendientes[currentIndex] ?? null

  const loadPendientes = useCallback(async (filters?: { nombre?: string; ci?: string; cuenta?: string; canal?: string }) => {
    setLoading(true)
    setError('')
    setOdooResult(null)
    setConfirmado(null)
    try {
      const result = await getPendientesOdoo(filters)
      setPendientes(result.data)
      setCurrentIndex(0)
      if (result.data.length === 0) {
        setError('No hay transferencias pendientes')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error'
      setPendientes([])
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const currentFilters = useCallback(() => {
    const f: { nombre?: string; ci?: string; cuenta?: string; canal?: string } = {}
    if (filterNombre) f.nombre = filterNombre
    if (filterCi) f.ci = filterCi
    if (filterCuenta) f.cuenta = filterCuenta
    if (filterCanal) f.canal = filterCanal
    return Object.keys(f).length > 0 ? f : undefined
  }, [filterNombre, filterCi, filterCuenta, filterCanal])

  const debouncedReload = useDebouncedCallback((filters?: { nombre?: string; ci?: string; cuenta?: string; canal?: string }) => {
    loadPendientes(filters)
  }, 300)

  const clearFilters = useCallback(() => {
    setFilterNombre('')
    setFilterCi('')
    setFilterCuenta('')
    setFilterCanal('')
    loadPendientes()
  }, [loadPendientes])

  // Auto-search when transfer changes
  const searchOdoo = useCallback(async (transferId: number) => {
    setSearching(true)
    setOdooResult(null)
    setError('')
    try {
      const result = await buscarOdooMatch(transferId)
      setOdooResult(result.odoo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error buscando en Odoo')
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    loadPendientes()
  }, [loadPendientes])

  useEffect(() => {
    if (transfer && !confirmado) {
      searchOdoo(transfer.id)
    }
  }, [transfer, confirmado, searchOdoo])

  const confirmarMut = useMutation({
    mutationFn: async ({ transferId, paymentId }: { transferId: number; paymentId: number }) => {
      return confirmarOdoo(transferId, paymentId)
    },
    onSuccess: (data) => {
      setConfirmado({
        gt_codigo: data.confirmed?.codigoConfirmacion || '?',
        odoo_order: data.odoo?.order_name,
      })
    },
  })

  const autoMut = useMutation({
    mutationFn: (cantidad: number) => autoConfirmarOdoo(cantidad),
    onSuccess: (data) => {
      setAutoResult(data)
    },
  })

  const handleConfirmar = (paymentId: number) => {
    if (!transfer) return
    confirmarMut.mutate({ transferId: transfer.id, paymentId })
  }

  const navigateTo = (index: number) => {
    setConfirmado(null)
    setOdooResult(null)
    confirmarMut.reset()
    setCurrentIndex(index)
  }

  const handleSiguiente = () => {
    if (confirmado) {
      // After confirming, remove from list and stay at same index
      const newList = pendientes.filter((_, i) => i !== currentIndex)
      setPendientes(newList)
      const nextIndex = Math.min(currentIndex, newList.length - 1)
      setCurrentIndex(-1) // force re-render
      setConfirmado(null)
      setOdooResult(null)
      confirmarMut.reset()
      setTimeout(() => setCurrentIndex(Math.max(0, nextIndex)), 0)
      if (newList.length === 0) setError('No hay transferencias pendientes')
      return
    }
    if (currentIndex < pendientes.length - 1) {
      navigateTo(currentIndex + 1)
    }
  }

  const handleAnterior = () => {
    if (currentIndex > 0) {
      navigateTo(currentIndex - 1)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3">
          <Loader2 size={20} className="animate-spin text-gold" />
          <span className="text-secondary text-sm">Cargando...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-[1000px] w-full">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Confirmar en Odoo</h1>
          <p className="text-secondary mt-1">Vincular transferencias GT con pagos POS en Odoo</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={100}
            value={autoCantidad}
            onChange={(e) => setAutoCantidad(Math.max(1, Math.min(100, parseInt(e.target.value) || 20)))}
            className="w-16 bg-page border border-border rounded-lg px-2 py-2 text-sm text-white text-center focus:outline-none focus:border-gold/50 transition-colors"
          />
          <button
            onClick={() => autoMut.mutate(autoCantidad)}
            disabled={autoMut.isPending}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/15 text-amber-400 rounded-lg hover:bg-amber-500/25 transition-colors disabled:opacity-40 cursor-pointer text-sm font-medium"
          >
            <Zap size={16} />
            {autoMut.isPending ? 'Procesando...' : 'Auto'}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar
        activeFilterCount={[filterNombre, filterCi, filterCuenta, filterCanal].filter(Boolean).length}
        onClear={clearFilters}
        resultCount={pendientes.length}
        resultLabel="pendientes"
        primaryFilters={
          <>
            <FilterInput
              icon={User}
              label="Nombre"
              value={filterNombre}
              onChange={(v) => { setFilterNombre(v); debouncedReload({ ...currentFilters(), nombre: v || undefined }) }}
              className="w-full md:w-40"
            />
            <FilterInput
              icon={Hash}
              label="CI"
              value={filterCi}
              onChange={(v) => { setFilterCi(v); debouncedReload({ ...currentFilters(), ci: v || undefined }) }}
              className="w-full md:w-32"
            />
            <FilterInput
              icon={Wallet}
              label="Cuenta"
              value={filterCuenta}
              onChange={(v) => { setFilterCuenta(v); debouncedReload({ ...currentFilters(), cuenta: v || undefined }) }}
              className="w-full md:w-40"
            />
            <FilterSelect
              value={filterCanal}
              onChange={(v) => { setFilterCanal(v); loadPendientes({ ...currentFilters(), canal: v || undefined }) }}
              options={[
                { value: 'BANCA MOVIL', label: 'BANCA MOVIL' },
                { value: 'BANCAMOVIL-BPA', label: 'BANCAMOVIL-BPA' },
                { value: 'TRANSFERMOVIL', label: 'TRANSFERMOVIL' },
              ]}
              allLabel="Todos los canales"
              className="w-full md:w-44"
            />
          </>
        }
      />

      {/* Auto result modal */}
      {autoResult && (
        <div className="rounded-xl border border-border bg-surface p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-headline text-lg font-semibold text-white">Resultado Auto-Confirmacion</h3>
            <button
              onClick={() => { setAutoResult(null); loadPendientes(currentFilters()); }}
              className="text-tertiary hover:text-white transition-colors cursor-pointer"
            >
              <XCircle size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 rounded-lg bg-emerald-500/10">
              <p className="text-2xl font-bold text-emerald-400">{autoResult.confirmadas}</p>
              <p className="text-xs text-tertiary mt-1">Confirmadas</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-amber-500/10">
              <p className="text-2xl font-bold text-amber-400">{autoResult.candidatos}</p>
              <p className="text-xs text-tertiary mt-1">Con candidatos</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-white/5">
              <p className="text-2xl font-bold text-secondary">{autoResult.sin_match}</p>
              <p className="text-xs text-tertiary mt-1">Sin match</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-500/10">
              <p className="text-2xl font-bold text-red-400">{autoResult.errores}</p>
              <p className="text-xs text-tertiary mt-1">Errores</p>
            </div>
          </div>
          {autoResult.detalle.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto divide-y divide-border/50">
              {autoResult.detalle.map((d) => (
                <div key={d.id} className="py-2 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-tertiary font-mono text-xs w-5">{d.searchAttempts}</span>
                    <span className="text-secondary">{d.nombreOrdenante}</span>
                    <span className="text-tertiary font-mono">${d.importe.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.resultado === 'confirmada' && (
                      <>
                        <span className="text-emerald-400 font-mono text-xs">{d.gt_codigo}</span>
                        <CheckCircle size={14} className="text-emerald-400" />
                      </>
                    )}
                    {d.resultado === 'candidatos' && (
                      <span className="text-amber-400 text-xs">Candidatos</span>
                    )}
                    {d.resultado === 'sin_match' && (
                      <span className="text-tertiary text-xs">Sin match</span>
                    )}
                    {d.resultado === 'error' && (
                      <span className="text-red-400 text-xs">{d.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No pending transfers */}
      {pendientes.length === 0 && !loading && (
        <div className="rounded-xl border border-border bg-surface p-12 text-center">
          <CheckCircle size={48} className="mx-auto text-emerald-400/50 mb-4" />
          <p className="text-secondary text-lg">{error || 'No hay transferencias pendientes'}</p>
        </div>
      )}

      {/* Current transfer card */}
      {transfer && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr] gap-6">
          {/* Left: GT Transfer data */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="font-headline text-lg font-semibold text-white mb-4">Transferencia GT</h3>
            {(() => {
              const bestMatch = odooResult?.resultado || odooResult?.candidatos?.[0] || null
              const m = bestMatch ? getMatchingFields(transfer, bestMatch) : null
              return (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-tertiary">Nombre</span>
                    <span className={`font-medium ${m ? nombreClass(m.nombre) : noMatchClass}`}>
                      {transfer.nombreOrdenante || '—'}
                      {m?.similitud_nombre !== null && m?.similitud_nombre !== undefined && m.similitud_nombre < 100 && m.similitud_nombre > 0 && (
                        <span className="text-xs ml-1 opacity-70">({m.similitud_nombre}%)</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">CI</span>
                    <span className={`font-mono ${m?.ci ? matchClass : noMatchClass}`}>{transfer.ciOrdenante || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Cuenta</span>
                    <span className={`font-mono text-xs ${m?.cuenta ? matchClass : noMatchClass}`}>{transfer.cuentaOrdenante || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Importe</span>
                    <span className={`font-mono font-medium ${m?.importe ? matchClass : noMatchClass}`}>${transfer.importe.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Fecha</span>
                    <span className={fechaDiffClass(bestMatch?.dias_diferencia)}>{displayFecha(transfer.fecha)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Canal</span>
                    <span className="text-secondary">{transfer.canalEmision || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Ref Origen</span>
                    <span className={`font-mono text-xs ${m?.ref ? matchClass : noMatchClassSecondary}`}>{transfer.refOrigen || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Intentos</span>
                    <span className={`font-mono ${transfer.searchAttempts > 0 ? 'text-amber-400' : 'text-tertiary'}`}>{transfer.searchAttempts}</span>
                  </div>
                </div>
              )
            })()}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
              <button
                onClick={handleAnterior}
                disabled={currentIndex === 0}
                className="flex items-center gap-1 text-sm text-secondary hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
                Anterior
              </button>
              <span className="text-xs text-tertiary">
                {currentIndex + 1} / {pendientes.length}
              </span>
              <button
                onClick={() => navigateTo(currentIndex + 1)}
                disabled={currentIndex >= pendientes.length - 1}
                className="flex items-center gap-1 text-sm text-secondary hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Siguiente
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Right: Odoo match result */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline text-lg font-semibold text-white">Resultado Odoo</h3>
              {!searching && !confirmado && (
                <button
                  onClick={() => transfer && searchOdoo(transfer.id)}
                  className="flex items-center gap-1 text-xs text-tertiary hover:text-white transition-colors cursor-pointer"
                >
                  <Search size={12} />
                  Re-buscar
                </button>
              )}
            </div>

            {/* Post-confirmation state */}
            {confirmado && (
              <div className="text-center py-8">
                <CheckCircle size={48} className="mx-auto text-emerald-400 mb-4" />
                <p className="font-mono text-2xl font-bold text-white tracking-wider mb-2">
                  {confirmado.gt_codigo}
                </p>
                <p className="text-emerald-400 text-sm mb-1">Confirmado en Odoo</p>
                {confirmado.odoo_order && (
                  <p className="text-tertiary text-xs">Orden: {confirmado.odoo_order}</p>
                )}
                <button
                  onClick={handleSiguiente}
                  className="mt-6 px-4 py-2 bg-gold/20 text-gold rounded-lg hover:bg-gold/30 transition-colors cursor-pointer text-sm"
                >
                  Siguiente pendiente
                </button>
              </div>
            )}

            {/* Searching */}
            {searching && !confirmado && (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-gold mr-3" />
                <span className="text-secondary text-sm">Buscando en Odoo...</span>
              </div>
            )}

            {/* Error */}
            {error && !searching && !confirmado && (
              <div className="flex items-center gap-2 text-red-400 text-sm py-4">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {/* Auto match */}
            {odooResult && !searching && !confirmado && odooResult.match_auto && odooResult.resultado && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400">
                    Auto (Nivel {odooResult.nivel_confianza})
                  </span>
                  <span className="text-tertiary text-xs">
                    {nivelLabels[odooResult.nivel_confianza || 0] || ''}
                  </span>
                </div>
                <PaymentCard
                  match={odooResult.resultado}
                  transfer={transfer}
                  onConfirmar={() => handleConfirmar(odooResult.resultado!.payment_id)}
                  confirming={confirmarMut.isPending}
                />
              </div>
            )}

            {/* Candidates */}
            {odooResult && !searching && !confirmado && !odooResult.match_auto && odooResult.candidatos.length > 0 && (
              <div>
                <p className="text-amber-400 text-sm mb-3">
                  {odooResult.candidatos.length} candidato{odooResult.candidatos.length > 1 ? 's' : ''} encontrado{odooResult.candidatos.length > 1 ? 's' : ''}
                </p>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {odooResult.candidatos.map((c) => (
                    <PaymentCard
                      key={c.payment_id}
                      match={c}
                      transfer={transfer}
                      onConfirmar={() => handleConfirmar(c.payment_id)}
                      confirming={confirmarMut.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* No match */}
            {odooResult && !searching && !confirmado && !odooResult.match_auto && odooResult.candidatos.length === 0 && (
              <div className="text-center py-12">
                <XCircle size={36} className="mx-auto text-tertiary mb-3" />
                <p className="text-secondary text-sm">Sin coincidencia en Odoo</p>
              </div>
            )}

            {/* Mutation error */}
            {confirmarMut.isError && (
              <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={14} />
                {confirmarMut.error?.message || 'Error al confirmar'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Compare two strings case-insensitively, treating empty/null as no match */
function fieldsMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function amountMatches(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1
}

/** Get which fields match between a GT transfer and an Odoo payment */
function getMatchingFields(transfer: Transferencia | null, match: OdooPaymentMatch) {
  if (!transfer) return { ci: false, cuenta: false, nombre: 'none' as const, importe: false, ref: false, similitud_nombre: null as number | null }
  const sim = match.similitud_nombre
  const nombre: 'exact' | 'similar' | 'none' = sim === 100 ? 'exact' : (sim !== null && sim >= 50) ? 'similar' : 'none'
  return {
    ci: fieldsMatch(transfer.ciOrdenante, match.card_holder_ci),
    cuenta: fieldsMatch(transfer.cuentaOrdenante, match.card_number),
    nombre,
    similitud_nombre: sim,
    importe: amountMatches(transfer.importe, match.amount),
    ref: fieldsMatch(transfer.refOrigen, match.transfer_code),
  }
}

const matchClass = 'text-emerald-400'
const similarClass = 'text-cyan-400'
const noMatchClass = 'text-white'
const noMatchClassSecondary = 'text-secondary'

function nombreClass(nombre: 'exact' | 'similar' | 'none'): string {
  if (nombre === 'exact') return matchClass
  if (nombre === 'similar') return similarClass
  return noMatchClass
}

/** Color de fecha según dias_diferencia: 0 días = azul, >2 días = ámbar, 1-2 = normal */
function fechaDiffClass(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return noMatchClass
  if (dias === 0) return 'text-blue-400'
  if (dias > 2) return 'text-amber-400'
  return noMatchClass
}

function PaymentCard({
  match,
  transfer,
  onConfirmar,
  confirming,
}: {
  match: OdooPaymentMatch
  transfer: Transferencia | null
  onConfirmar: () => void
  confirming: boolean
}) {
  const m = getMatchingFields(transfer, match)

  return (
    <div className="rounded-lg border border-border/50 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-medium">{match.order_name}</span>
          {match.dias_diferencia !== null && match.dias_diferencia !== undefined && (
            <span className={`px-2.5 py-0.5 rounded-full text-sm font-bold ${
              match.dias_diferencia === 0 ? 'bg-blue-500/20 text-blue-400' :
              match.dias_diferencia <= 2 ? 'bg-emerald-500/20 text-emerald-400' :
              'bg-amber-500/20 text-amber-400'
            }`}>
              {match.dias_diferencia}
            </span>
          )}
        </div>
        <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-tertiary">
          Nivel {match.nivel_confianza}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div>
          <span className="text-tertiary">Monto</span>
          <p className={`font-mono ${m.importe ? matchClass : noMatchClass}`}>
            ${match.amount.toLocaleString('es-CU', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <span className="text-tertiary">Fecha{match.dias_diferencia !== null ? ` (${match.dias_diferencia}d)` : ''}</span>
          <p className={fechaDiffClass(match.dias_diferencia)}>{match.order_date}</p>
        </div>
        {match.card_holder_ci && (
          <div>
            <span className="text-tertiary">CI</span>
            <p className={`font-mono ${m.ci ? matchClass : noMatchClassSecondary}`}>{match.card_holder_ci}</p>
          </div>
        )}
        {match.card_holder_name && (
          <div>
            <span className="text-tertiary">Nombre{match.similitud_nombre !== null && match.similitud_nombre < 100 && match.similitud_nombre > 0 ? ` (${match.similitud_nombre}%)` : ''}</span>
            <p className={m.nombre === 'none' ? noMatchClassSecondary : nombreClass(m.nombre)}>{match.card_holder_name}</p>
          </div>
        )}
        {match.card_number && (
          <div>
            <span className="text-tertiary">Cuenta</span>
            <p className={`font-mono text-[11px] ${m.cuenta ? matchClass : noMatchClassSecondary}`}>{match.card_number}</p>
          </div>
        )}
        {match.transfer_code && (
          <div>
            <span className="text-tertiary">Codigo TX</span>
            <p className={`font-mono text-[11px] ${m.ref ? matchClass : noMatchClassSecondary}`}>{match.transfer_code}</p>
          </div>
        )}
      </div>
      <button
        onClick={onConfirmar}
        disabled={confirming}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/15 text-emerald-400 rounded-lg hover:bg-emerald-500/25 transition-colors disabled:opacity-40 cursor-pointer text-sm font-medium"
      >
        <CheckCircle size={14} />
        {confirming ? 'Confirmando...' : 'Confirmar'}
      </button>
    </div>
  )
}
