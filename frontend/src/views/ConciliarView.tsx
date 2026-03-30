import { useState, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import {
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  XCircle,
  User,
  Hash,
  Wallet,
  Calendar,
  MoreVertical,
  Landmark,
  ShoppingCart,
  AlertTriangle,
} from 'lucide-react'
import { FilterBar, FilterInput, FilterSelect, FilterDateRange, DatePresets, type DatePresetKey } from '../components/filters'
import {
  getPendientesBancoConciliar,
  buscarSolicitudesMatch,
  confirmarConciliacion,
  accionConciliar,
} from '../lib/api'
import type { Transferencia, SolicitudCandidate } from '../types'

function displayFecha(f: string) {
  const iso = f?.slice(0, 10)
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : f
}

const nivelLabels: Record<number, string> = {
  1: 'Ref Origen + Monto',
  2: 'Cuenta + CI + Monto',
  3: 'CI + Monto',
  4: 'Cuenta + Monto',
  5: 'Nombre + Monto',
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function ConciliarView() {
  const [pendientes, setPendientes] = useState<Transferencia[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [candidates, setCandidates] = useState<SolicitudCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  const [actionMenuOpen, setActionMenuOpen] = useState(false)

  // Filters
  const [filterNombre, setFilterNombre] = useState('')
  const [filterCi, setFilterCi] = useState('')
  const [filterCuenta, setFilterCuenta] = useState('')
  const [filterCanal, setFilterCanal] = useState('')
  const [fechaDesde, setFechaDesde] = useState(firstOfMonth())
  const [fechaHasta, setFechaHasta] = useState(today())
  const [activePreset, setActivePreset] = useState<DatePresetKey | ''>('month')

  const transfer = pendientes[currentIndex] ?? null

  const loadPendientes = useCallback(async (filters?: { nombre?: string; ci?: string; cuenta?: string; canal?: string; fechaDesde?: string; fechaHasta?: string }) => {
    setLoading(true)
    setError('')
    setCandidates([])

    try {
      const result = await getPendientesBancoConciliar(filters)
      setPendientes(result.data)
      setCurrentIndex(0)
      if (result.data.length === 0) {
        setError('No hay transferencias pendientes de conciliar')
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
    const f: Record<string, string | undefined> = {}
    if (filterNombre) f.nombre = filterNombre
    if (filterCi) f.ci = filterCi
    if (filterCuenta) f.cuenta = filterCuenta
    if (filterCanal) f.canal = filterCanal
    if (fechaDesde) f.fechaDesde = fechaDesde
    if (fechaHasta) f.fechaHasta = fechaHasta
    return Object.keys(f).length > 0 ? f : undefined
  }, [filterNombre, filterCi, filterCuenta, filterCanal, fechaDesde, fechaHasta])

  const debouncedReload = useDebouncedCallback((filters?: Record<string, string | undefined>) => {
    loadPendientes(filters)
  }, 300)

  const clearFilters = useCallback(() => {
    setFilterNombre(''); setFilterCi(''); setFilterCuenta(''); setFilterCanal('')
    setFechaDesde(firstOfMonth()); setFechaHasta(today()); setActivePreset('month')
    loadPendientes({ fechaDesde: firstOfMonth(), fechaHasta: today() })
  }, [loadPendientes])

  const applyPreset = useCallback((preset: DatePresetKey) => {
    setActivePreset(preset)
    const t = new Date()
    let fd = '', fh = ''
    switch (preset) {
      case 'today': fd = today(); fh = today(); break
      case 'week': { const w = new Date(t); w.setDate(w.getDate() - 6); fd = w.toISOString().slice(0, 10); fh = today(); break }
      case 'month': fd = firstOfMonth(); fh = today(); break
      case 'all': fd = ''; fh = ''; break
    }
    setFechaDesde(fd); setFechaHasta(fh)
    loadPendientes({ ...currentFilters(), fechaDesde: fd || undefined, fechaHasta: fh || undefined })
  }, [loadPendientes, currentFilters])

  // Auto-search when transfer changes
  const searchSolicitudes = useCallback(async (transferId: number) => {
    setSearching(true)
    setCandidates([])
    setError('')
    try {
      const result = await buscarSolicitudesMatch(transferId)
      setCandidates(result.candidates)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error buscando solicitudes')
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    loadPendientes({ fechaDesde: firstOfMonth(), fechaHasta: today() })
  }, [loadPendientes])

  useEffect(() => {
    if (transfer) {
      searchSolicitudes(transfer.id)
    }
  }, [transfer, searchSolicitudes])

  const confirmarMut = useMutation({
    mutationFn: async ({ transferId, solicitudId, matchNivel }: { transferId: number; solicitudId: number; matchNivel?: number }) => {
      return confirmarConciliacion(transferId, solicitudId, matchNivel)
    },
    onSuccess: () => {
      // Remove from list and move to next automatically
      const newList = pendientes.filter((_, i) => i !== currentIndex)
      setPendientes(newList)
      const nextIndex = Math.min(currentIndex, newList.length - 1)
      setCurrentIndex(-1)
      setCandidates([])
      confirmarMut.reset()
      setTimeout(() => setCurrentIndex(Math.max(0, nextIndex)), 0)
      if (newList.length === 0) setError('No hay transferencias pendientes')
    },
  })

  const accionMut = useMutation({
    mutationFn: async ({ transferId, accion }: { transferId: number; accion: 'CONFIRMED_DEPOSIT' | 'CONFIRMED_BUY' | 'REVIEW_REQUIRED' }) => {
      return accionConciliar(transferId, accion)
    },
    onSuccess: () => {
      setActionMenuOpen(false)
      const newList = pendientes.filter((_, i) => i !== currentIndex)
      setPendientes(newList)
      const nextIndex = Math.min(currentIndex, newList.length - 1)
      setCurrentIndex(-1)
      setCandidates([])
      setTimeout(() => setCurrentIndex(Math.max(0, nextIndex)), 0)
      if (newList.length === 0) setError('No hay transferencias pendientes')
    },
  })

  const handleConfirmar = (solicitudId: number, matchNivel?: number) => {
    if (!transfer) return
    confirmarMut.mutate({ transferId: transfer.id, solicitudId, matchNivel })
  }

  const navigateTo = (index: number) => {

    setCandidates([])
    confirmarMut.reset()
    setCurrentIndex(index)
  }

  const handleAnterior = () => {
    if (currentIndex > 0) navigateTo(currentIndex - 1)
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
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Conciliar con Solicitudes</h1>
          <p className="text-secondary mt-1">Vincular transferencias del banco con solicitudes GT</p>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar
        activeFilterCount={[filterNombre, filterCi, filterCuenta, filterCanal].filter(Boolean).length}
        onClear={clearFilters}
        resultCount={pendientes.length}
        resultLabel="pendientes"
        dateRow={
          <>
            <Calendar size={16} className="text-tertiary shrink-0" />
            <DatePresets active={activePreset} onSelect={applyPreset} />
            <span className="text-border hidden md:inline">|</span>
            <FilterDateRange
              desde={fechaDesde}
              hasta={fechaHasta}
              onDesdeChange={(v) => { setFechaDesde(v); setActivePreset(''); loadPendientes({ ...currentFilters(), fechaDesde: v || undefined }) }}
              onHastaChange={(v) => { setFechaHasta(v); setActivePreset(''); loadPendientes({ ...currentFilters(), fechaHasta: v || undefined }) }}
            />
          </>
        }
        primaryFilters={
          <>
            <FilterInput icon={User} label="Nombre" value={filterNombre}
              onChange={(v) => { setFilterNombre(v); debouncedReload({ ...currentFilters(), nombre: v || undefined }) }}
              className="w-full md:w-40" />
            <FilterInput icon={Hash} label="CI" value={filterCi}
              onChange={(v) => { setFilterCi(v); debouncedReload({ ...currentFilters(), ci: v || undefined }) }}
              className="w-full md:w-32" />
            <FilterInput icon={Wallet} label="Cuenta" value={filterCuenta}
              onChange={(v) => { setFilterCuenta(v); debouncedReload({ ...currentFilters(), cuenta: v || undefined }) }}
              className="w-full md:w-40" />
            <FilterSelect value={filterCanal}
              onChange={(v) => { setFilterCanal(v); loadPendientes({ ...currentFilters(), canal: v || undefined }) }}
              options={[
                { value: 'BANCA MOVIL', label: 'BANCA MOVIL' },
                { value: 'BANCAMOVIL-BPA', label: 'BANCAMOVIL-BPA' },
                { value: 'TRANSFERMOVIL', label: 'TRANSFERMOVIL' },
              ]}
              allLabel="Todos los canales"
              className="w-full md:w-44" />
          </>
        }
      />

      {/* No pending */}
      {pendientes.length === 0 && !loading && (
        <div className="rounded-xl border border-border bg-surface p-12 text-center">
          <CheckCircle size={48} className="mx-auto text-emerald-400/50 mb-4" />
          <p className="text-secondary text-lg">{error || 'No hay transferencias pendientes'}</p>
        </div>
      )}

      {/* Current transfer */}
      {transfer && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr] gap-6">
          {/* Left: Bank Transfer */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline text-lg font-semibold text-white">Transferencia Banco</h3>
              <div className="flex items-center gap-2">
                {/* Action dropdown */}
                <div className="relative">
                  <button onClick={() => setActionMenuOpen(!actionMenuOpen)}
                    className="p-1.5 text-tertiary hover:text-white rounded transition-colors cursor-pointer"
                    title="Acciones especiales">
                    <MoreVertical size={16} />
                  </button>
                  {actionMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setActionMenuOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-lg border border-border bg-surface shadow-xl py-1">
                        <button onClick={() => transfer && accionMut.mutate({ transferId: transfer.id, accion: 'CONFIRMED_DEPOSIT' })}
                          disabled={accionMut.isPending}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-white hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40">
                          <Landmark size={14} className="text-blue-400" />Depósito
                        </button>
                        <button onClick={() => transfer && accionMut.mutate({ transferId: transfer.id, accion: 'CONFIRMED_BUY' })}
                          disabled={accionMut.isPending}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-white hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40">
                          <ShoppingCart size={14} className="text-emerald-400" />Compra
                        </button>
                        <button onClick={() => transfer && accionMut.mutate({ transferId: transfer.id, accion: 'REVIEW_REQUIRED' })}
                          disabled={accionMut.isPending}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-white hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40">
                          <AlertTriangle size={14} className="text-amber-400" />Requiere revisión
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {(() => {
              const bestMatch = candidates[0] || null
              const m = bestMatch ? getMatchingFields(transfer, bestMatch) : null
              return (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-tertiary">Nombre</span>
                    <span className={`font-medium ${m ? nombreClass(m.nombre) : 'text-white'}`}>{transfer.nombreOrdenante || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">CI</span>
                    <span className={`font-mono ${m?.ci ? matchClass : 'text-white'}`}>{transfer.ciOrdenante || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Cuenta</span>
                    <span className={`font-mono text-xs ${m?.cuenta ? matchClass : 'text-white'}`}>{transfer.cuentaOrdenante || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Importe</span>
                    <span className={`font-mono font-medium ${m?.importe ? matchClass : 'text-white'}`}>${transfer.importe.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Fecha</span>
                    <span className="text-white">{displayFecha(transfer.fecha)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Canal</span>
                    <span className="text-secondary">{transfer.canalEmision || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Ref Origen</span>
                    <span className={`font-mono text-xs ${m?.ref ? matchClass : 'text-secondary'}`}>{transfer.refOrigen || '—'}</span>
                  </div>
                </div>
              )
            })()}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
              <button onClick={handleAnterior} disabled={currentIndex === 0}
                className="flex items-center gap-1 text-sm text-secondary hover:text-white transition-colors cursor-pointer disabled:opacity-30">
                <ChevronLeft size={16} />Anterior
              </button>
              <span className="text-xs text-tertiary">{currentIndex + 1} / {pendientes.length}</span>
              <button onClick={() => navigateTo(currentIndex + 1)} disabled={currentIndex >= pendientes.length - 1}
                className="flex items-center gap-1 text-sm text-secondary hover:text-white transition-colors cursor-pointer disabled:opacity-30">
                Siguiente<ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Right: Solicitud candidates */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline text-lg font-semibold text-white">Solicitudes Candidatas</h3>
              {!searching && (
                <button onClick={() => transfer && searchSolicitudes(transfer.id)}
                  className="flex items-center gap-1 text-xs text-tertiary hover:text-white transition-colors cursor-pointer">
                  <Search size={12} />Re-buscar
                </button>
              )}
            </div>

            {/* Searching */}
            {searching && (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-gold mr-3" />
                <span className="text-secondary text-sm">Buscando solicitudes...</span>
              </div>
            )}

            {/* Error */}
            {error && !searching && pendientes.length > 0 && (
              <div className="flex items-center gap-2 text-red-400 text-sm py-4">
                <AlertCircle size={16} />{error}
              </div>
            )}

            {/* Candidates */}
            {!searching && candidates.length > 0 && (
              <div>
                <p className="text-amber-400 text-sm mb-3">
                  {candidates.length} solicitud{candidates.length > 1 ? 'es' : ''} encontrada{candidates.length > 1 ? 's' : ''}
                </p>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {candidates.map((c) => (
                    <SolicitudCard
                      key={c.id}
                      candidate={c}
                      transfer={transfer}
                      onConfirmar={() => handleConfirmar(c.id, c.nivel)}
                      confirming={confirmarMut.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* No match */}
            {!searching && candidates.length === 0 && !error && (
              <div className="text-center py-12">
                <XCircle size={36} className="mx-auto text-tertiary mb-3" />
                <p className="text-secondary text-sm">Sin solicitudes que coincidan</p>
              </div>
            )}

            {/* Mutation errors */}
            {confirmarMut.isError && (
              <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={14} />{confirmarMut.error?.message || 'Error al conciliar'}
              </div>
            )}
            {accionMut.isError && (
              <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={14} />{accionMut.error?.message || 'Error en acción'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ──

const matchClass = 'text-emerald-400'
const similarClass = 'text-cyan-400'

function fieldsMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function getMatchingFields(transfer: Transferencia, sol: SolicitudCandidate) {
  return {
    ci: fieldsMatch(transfer.ciOrdenante, sol.clienteCi),
    cuenta: fieldsMatch(transfer.cuentaOrdenante, sol.clienteCuenta),
    nombre: fieldsMatch(transfer.nombreOrdenante, sol.clienteNombre) ? 'exact' as const
      : nameSim(transfer.nombreOrdenante, sol.clienteNombre) >= 50 ? 'similar' as const : 'none' as const,
    importe: transfer.importe === Number(sol.monto),
    ref: fieldsMatch(transfer.refOrigen, sol.transferCode),
  }
}

function nameSim(a: string, b: string): number {
  if (!a || !b) return 0
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const ta = norm(a).split(/\s+/), tb = norm(b).split(/\s+/)
  if (!ta.length || !tb.length) return 0
  let m = 0
  for (const x of ta) for (const y of tb) { if (x === y) { m++; break } }
  return (m / Math.max(ta.length, tb.length)) * 100
}

function nombreClass(n: 'exact' | 'similar' | 'none'): string {
  return n === 'exact' ? matchClass : n === 'similar' ? similarClass : 'text-white'
}

// ── Solicitud Card ──

function SolicitudCard({
  candidate: c,
  transfer,
  onConfirmar,
  confirming,
}: {
  candidate: SolicitudCandidate
  transfer: Transferencia | null
  onConfirmar: () => void
  confirming: boolean
}) {
  const m = transfer ? getMatchingFields(transfer, c) : null

  return (
    <div className="rounded-lg border border-border/50 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-gold font-mono font-medium">{c.codigo}</span>
          <span className="text-tertiary text-xs">{c.sedeId}</span>
          {c.diasDiferencia !== null && c.diasDiferencia !== undefined && (
            <span className={`px-2.5 py-0.5 rounded-full text-sm font-bold ${
              c.diasDiferencia < 0 ? 'bg-red-500/20 text-red-400' :
              c.diasDiferencia === 0 ? 'bg-blue-500/20 text-blue-400' :
              c.diasDiferencia <= 2 ? 'bg-emerald-500/20 text-emerald-400' :
              'bg-amber-500/20 text-amber-400'
            }`}>
              {c.diasDiferencia}
            </span>
          )}
        </div>
        <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-tertiary">
          Nivel {c.nivel} — {nivelLabels[c.nivel] || ''}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div>
          <span className="text-tertiary">Monto</span>
          <p className={`font-mono ${m?.importe ? matchClass : 'text-white'}`}>
            ${Number(c.monto).toLocaleString('es-CU', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <span className="text-tertiary">Transfer Code</span>
          <p className={`font-mono ${m?.ref ? matchClass : 'text-secondary'}`}>{c.transferCode || '—'}</p>
        </div>
        <div>
          <span className="text-tertiary">CI</span>
          <p className={`font-mono ${m?.ci ? matchClass : 'text-secondary'}`}>{c.clienteCi}</p>
        </div>
        <div>
          <span className="text-tertiary">Nombre</span>
          <p className={m ? nombreClass(m.nombre) : 'text-secondary'}>{c.clienteNombre}</p>
        </div>
        <div>
          <span className="text-tertiary">Cuenta</span>
          <p className={`font-mono text-[11px] ${m?.cuenta ? matchClass : 'text-secondary'}`}>{c.clienteCuenta}</p>
        </div>
        <div>
          <span className="text-tertiary">Canal</span>
          <p className="text-secondary">{c.canalEmision || '—'}</p>
        </div>
        <div>
          <span className="text-tertiary">Fecha{c.diasDiferencia !== null ? ` (${c.diasDiferencia}d)` : ''}</span>
          <p className="text-secondary">{c.creadoAt ? displayFecha(new Date(c.creadoAt).toISOString()) : '—'}</p>
        </div>
        {c.reclamadaPor && (
          <div className="col-span-2">
            <span className="text-tertiary">Reclamada por</span>
            <p className="text-secondary">{c.reclamadaPor}</p>
          </div>
        )}
      </div>
      <button onClick={onConfirmar} disabled={confirming}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/15 text-emerald-400 rounded-lg hover:bg-emerald-500/25 transition-colors disabled:opacity-40 cursor-pointer text-sm font-medium">
        <CheckCircle size={14} />
        {confirming ? 'Conciliando...' : 'Conciliar'}
      </button>
    </div>
  )
}
