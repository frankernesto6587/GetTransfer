import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Check, Zap, ChevronLeft, ChevronRight } from 'lucide-react'
import { solicitudesQuery, buscarConciliacion, confirmarConciliacion, autoConciliar } from '../lib/api'
import type { Solicitud, ConciliarCandidate } from '../types'

const nivelLabel: Record<number, { label: string; class: string }> = {
  1: { label: 'L1 — Code+Cuenta+CI', class: 'bg-emerald-500/10 text-emerald-400' },
  2: { label: 'L2 — Cuenta+CI', class: 'bg-blue-500/10 text-blue-400' },
  3: { label: 'L3 — CI', class: 'bg-yellow-500/10 text-yellow-400' },
  4: { label: 'L4 — Cuenta', class: 'bg-orange-500/10 text-orange-400' },
  5: { label: 'L5 — Nombre', class: 'bg-red-500/10 text-red-400' },
}

export function ConciliarView() {
  const queryClient = useQueryClient()
  const [page] = useState(1)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [candidates, setCandidates] = useState<ConciliarCandidate[]>([])
  const [autoMatch, setAutoMatch] = useState<ConciliarCandidate | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [autoResult, setAutoResult] = useState<any>(null)

  const { data, isLoading } = useQuery({
    ...solicitudesQuery({ page, limit: 50 }),
  })

  const pendientes = data?.data ?? []
  const total = data?.pagination?.total ?? 0
  const selected = pendientes[selectedIdx] || null

  async function handleBuscar(sol: Solicitud) {
    setSearching(true)
    setError('')
    setCandidates([])
    setAutoMatch(null)
    try {
      const result = await buscarConciliacion(sol.id)
      setCandidates(result.candidates)
      setAutoMatch(result.autoMatch)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  const confirmarMut = useMutation({
    mutationFn: ({ solId, transferId, nivel }: { solId: number; transferId: number; nivel?: number }) =>
      confirmarConciliacion(solId, transferId, nivel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
      setCandidates([])
      setAutoMatch(null)
      // Move to next
      if (selectedIdx < pendientes.length - 1) setSelectedIdx(selectedIdx + 1)
    },
  })

  const autoMut = useMutation({
    mutationFn: () => autoConciliar(),
    onSuccess: (result) => {
      setAutoResult(result)
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
    },
  })

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Conciliar Solicitudes</h1>
          <p className="text-secondary mt-1">
            {total > 0
              ? <><span className="text-white font-medium">{total}</span> solicitudes pendientes de conciliación</>
              : 'Todas las solicitudes están conciliadas'}
          </p>
        </div>
        <button
          onClick={() => autoMut.mutate()}
          disabled={autoMut.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/10 text-gold hover:bg-gold/20 transition-colors disabled:opacity-50"
        >
          <Zap size={16} />
          {autoMut.isPending ? 'Procesando...' : 'Auto-conciliar'}
        </button>
      </div>

      {autoResult && (
        <div className="mb-4 p-4 rounded-xl border border-border bg-surface">
          <p className="text-white font-medium mb-1">Resultado auto-conciliación:</p>
          <p className="text-secondary text-sm">
            {autoResult.matched} conciliadas, {autoResult.noMatch} sin match, {autoResult.errors} errores
            (de {autoResult.total} procesadas)
          </p>
          <button onClick={() => setAutoResult(null)} className="text-xs text-tertiary hover:text-secondary mt-1">Cerrar</button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-secondary animate-pulse">Cargando...</div>
        </div>
      ) : pendientes.length === 0 ? (
        <div className="text-center py-20 text-secondary">No hay solicitudes pendientes de conciliación.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: solicitud detail */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline text-lg font-semibold text-white">
                Solicitud {selectedIdx + 1} de {pendientes.length}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setSelectedIdx(Math.max(0, selectedIdx - 1)); setCandidates([]); setAutoMatch(null) }}
                  disabled={selectedIdx === 0}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-tertiary hover:text-white disabled:opacity-30"
                ><ChevronLeft size={16} /></button>
                <button
                  onClick={() => { setSelectedIdx(Math.min(pendientes.length - 1, selectedIdx + 1)); setCandidates([]); setAutoMatch(null) }}
                  disabled={selectedIdx >= pendientes.length - 1}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-tertiary hover:text-white disabled:opacity-30"
                ><ChevronRight size={16} /></button>
              </div>
            </div>

            {selected && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-gold font-mono font-bold text-lg">{selected.codigo}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-tertiary">{selected.sedeId}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-tertiary text-xs">Nombre</span>
                    <p className="text-white">{selected.clienteNombre}</p>
                  </div>
                  <div>
                    <span className="text-tertiary text-xs">CI</span>
                    <p className="text-white font-mono">{selected.clienteCi}</p>
                  </div>
                  <div>
                    <span className="text-tertiary text-xs">Cuenta</span>
                    <p className="text-white font-mono text-xs">{selected.clienteCuenta}</p>
                  </div>
                  <div>
                    <span className="text-tertiary text-xs">Monto</span>
                    <p className="text-emerald-400 font-mono font-bold">${Number(selected.monto).toLocaleString('es-CU', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <span className="text-tertiary text-xs">Transfer Code</span>
                    <p className="text-white font-mono">{selected.transferCode || '-'}</p>
                  </div>
                  <div>
                    <span className="text-tertiary text-xs">Canal</span>
                    <p className="text-secondary">{selected.canalEmision || '-'}</p>
                  </div>
                  <div>
                    <span className="text-tertiary text-xs">Reclamada por</span>
                    <p className="text-secondary">{selected.reclamadaPor || '-'}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleBuscar(selected)}
                  disabled={searching}
                  className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gold/10 text-gold hover:bg-gold/20 transition-colors disabled:opacity-50"
                >
                  <Search size={16} />
                  {searching ? 'Buscando...' : 'Buscar en Banco'}
                </button>
              </div>
            )}
          </div>

          {/* Right: candidates */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="font-headline text-lg font-semibold text-white mb-4">Transferencias del Banco</h3>

            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

            {autoMatch && (
              <div className="mb-4 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                <p className="text-emerald-400 text-sm font-medium mb-2">Auto-match encontrado (Nivel 1)</p>
                <CandidateCard
                  c={autoMatch}
                  onConfirm={() => confirmarMut.mutate({ solId: selected!.id, transferId: autoMatch.id, nivel: 1 })}
                  confirming={confirmarMut.isPending}
                />
              </div>
            )}

            {candidates.length === 0 && !autoMatch && !searching && (
              <p className="text-tertiary text-sm">Haz clic en "Buscar en Banco" para encontrar transferencias que coincidan.</p>
            )}

            {searching && (
              <div className="text-secondary animate-pulse text-sm">Buscando transferencias...</div>
            )}

            {candidates.filter(c => c !== autoMatch).map((c) => (
              <CandidateCard
                key={c.id}
                c={c}
                onConfirm={() => confirmarMut.mutate({ solId: selected!.id, transferId: c.id, nivel: c.nivel })}
                confirming={confirmarMut.isPending}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CandidateCard({ c, onConfirm, confirming }: { c: ConciliarCandidate; onConfirm: () => void; confirming: boolean }) {
  const n = nivelLabel[c.nivel] || { label: `L${c.nivel}`, class: 'bg-white/5 text-secondary' }
  return (
    <div className="p-3 rounded-lg border border-border bg-page mb-2">
      <div className="flex items-center justify-between mb-2">
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${n.class}`}>{n.label}</span>
        <span className="text-white font-mono font-bold">${c.importe.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs mb-2">
        <div><span className="text-tertiary">Ref:</span> <span className="text-white font-mono">{c.refOrigen}</span></div>
        <div><span className="text-tertiary">Fecha:</span> <span className="text-secondary">{new Date(c.fecha).toLocaleDateString('es-CU')}</span></div>
        <div><span className="text-tertiary">CI:</span> <span className="text-white font-mono">{c.ciOrdenante || '-'}</span></div>
        <div><span className="text-tertiary">Cuenta:</span> <span className="text-white font-mono">{c.cuentaOrdenante || '-'}</span></div>
        <div className="col-span-2"><span className="text-tertiary">Nombre:</span> <span className="text-white">{c.nombreOrdenante || '-'}</span></div>
      </div>
      <button
        onClick={onConfirm}
        disabled={confirming}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-sm disabled:opacity-50"
      >
        <Check size={14} />
        {confirming ? 'Conciliando...' : 'Conciliar'}
      </button>
    </div>
  )
}
