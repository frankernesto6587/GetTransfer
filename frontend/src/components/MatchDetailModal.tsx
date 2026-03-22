import { useState } from 'react'
import { X, Check, AlertTriangle, Unlock, Unlink } from 'lucide-react'
import type { MatchedTransfer } from '../types'
import { displayFecha, formatCurrency, formatDate, CanalBadge } from './TransferShared'
import { liberarTransferencia, desmacharTransferencia } from '../lib/api'

const MATCH_TYPE_LABELS: Record<string, { label: string; class: string }> = {
  CONFIRMED_AUTO: { label: 'Auto', class: 'bg-emerald-500/15 text-emerald-400' },
  CONFIRMED_MANUAL_REF_ACCOUNT_CI: { label: 'Manual L1', class: 'bg-blue-500/15 text-blue-400' },
  CONFIRMED_MANUAL_CI_ACCOUNT_DATE: { label: 'Manual L2', class: 'bg-blue-500/15 text-blue-400' },
  CONFIRMED_MANUAL_CI_AMOUNT: { label: 'Manual L3', class: 'bg-cyan-500/15 text-cyan-400' },
  CONFIRMED_MANUAL_ACCOUNT_AMOUNT: { label: 'Manual L4', class: 'bg-cyan-500/15 text-cyan-400' },
  CONFIRMED_MANUAL_NAME_DATE: { label: 'Manual L5', class: 'bg-cyan-500/15 text-cyan-400' },
  CONFIRMED_DEPOSIT: { label: 'Deposito', class: 'bg-violet-500/15 text-violet-400' },
  CONFIRMED_BUY: { label: 'Compra', class: 'bg-amber-500/15 text-amber-400' },
  REVIEW_REQUIRED: { label: 'Revision', class: 'bg-rose-500/15 text-rose-400' },
}

function normalize(v: string | null | undefined): string {
  return (v || '').trim().toLowerCase()
}

function CompareRow({ gtValue, odooValue, mono }: {
  gtValue: string | null | undefined
  odooValue: string | null | undefined
  mono?: boolean
}) {
  const gt = gtValue || '—'
  const odoo = odooValue || '—'
  const bothPresent = gtValue && odooValue
  const match = bothPresent && normalize(gtValue) === normalize(odooValue)
  const mismatch = bothPresent && !match

  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-2 py-2 border-b border-border/30 last:border-b-0">
      <div className="grid grid-cols-2 gap-3">
        <span className={`text-sm text-white truncate ${mono ? 'font-mono' : ''}`} title={gt}>{gt}</span>
        <span className={`text-sm text-white truncate ${mono ? 'font-mono' : ''}`} title={odoo}>{odoo}</span>
      </div>
      <div className="flex items-center w-5 justify-center">
        {match && <Check size={14} className="text-emerald-400" />}
        {mismatch && <AlertTriangle size={14} className="text-amber-400" />}
      </div>
    </div>
  )
}

export function MatchDetailModal({ match, onClose, onRefresh }: {
  match: MatchedTransfer
  onClose: () => void
  onRefresh?: () => void
}) {
  const [confirmDesmachar, setConfirmDesmachar] = useState(false)
  const [desmachando, setDesmachando] = useState(false)
  const [desmacharError, setDesmacharError] = useState('')
  const [confirmLiberar, setConfirmLiberar] = useState(false)
  const [liberando, setLiberando] = useState(false)
  const [liberarError, setLiberarError] = useState('')

  const matchTypeConfig = match.matchType ? MATCH_TYPE_LABELS[match.matchType] : null

  const handleDesmachar = async () => {
    if (!match.codigoConfirmacion) return
    setDesmachando(true)
    setDesmacharError('')
    try {
      await desmacharTransferencia(match.id)
      onRefresh?.()
      onClose()
    } catch (err) {
      setDesmacharError(err instanceof Error ? err.message : 'Error al desmachar')
    } finally {
      setDesmachando(false)
    }
  }

  const handleLiberar = async () => {
    if (!match.codigoConfirmacion) return
    setLiberando(true)
    setLiberarError('')
    try {
      await liberarTransferencia(match.codigoConfirmacion)
      onRefresh?.()
      onClose()
    } catch (err) {
      setLiberarError(err instanceof Error ? err.message : 'Error al liberar')
    } finally {
      setLiberando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface border border-border rounded-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface rounded-t-2xl z-10">
          <div>
            <h3 className="font-headline text-lg font-semibold text-white">Detalle del Match</h3>
            <span className="font-mono text-gold text-sm">{match.codigoConfirmacion}</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-secondary hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Shared data header */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center py-3 rounded-xl bg-gold/10 border border-gold/20 col-span-2 md:col-span-1">
              <div className="text-tertiary text-[10px] uppercase tracking-wider mb-0.5">Monto</div>
              <div className={`font-mono text-xl font-bold ${match.tipo === 'Cr' ? 'text-emerald-400' : 'text-red-400'}`}>
                {match.tipo === 'Cr' ? '+' : '-'}${formatCurrency(match.importe)}
              </div>
            </div>
            <div className="text-center py-3 rounded-xl bg-white/5 border border-border">
              <div className="text-tertiary text-[10px] uppercase tracking-wider mb-0.5">Tipo Match</div>
              {matchTypeConfig ? (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${matchTypeConfig.class}`}>
                  {matchTypeConfig.label}
                </span>
              ) : (
                <span className="text-secondary text-sm">—</span>
              )}
            </div>
            <div className="text-center py-3 rounded-xl bg-white/5 border border-border">
              <div className="text-tertiary text-[10px] uppercase tracking-wider mb-0.5">Fecha Match</div>
              <div className="text-white text-sm font-mono">{match.confirmedAt ? formatDate(match.confirmedAt) : '—'}</div>
            </div>
            <div className="text-center py-3 rounded-xl bg-white/5 border border-border">
              <div className="text-tertiary text-[10px] uppercase tracking-wider mb-0.5">Orden Odoo</div>
              <div className="text-white text-sm font-mono">{match.claimedBy || '—'}</div>
            </div>
          </div>

          {/* Comparison cards */}
          <div>
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto] gap-x-2 mb-2">
              <div className="grid grid-cols-2 gap-3">
                <h4 className="text-xs uppercase tracking-wider text-emerald-400 font-medium">GT (BANDEC)</h4>
                <h4 className="text-xs uppercase tracking-wider text-blue-400 font-medium">Odoo</h4>
              </div>
              <div className="w-5" />
            </div>

            <div className="bg-page rounded-lg px-4 py-1">
              {/* Row labels on the left of each section */}
              <div className="grid grid-cols-[1fr_auto] gap-x-2 py-2 border-b border-border/30">
                <div className="grid grid-cols-2 gap-3">
                  <span className="text-tertiary text-xs">Fecha</span>
                  <span className="text-tertiary text-xs">Fecha</span>
                </div>
                <div className="w-5" />
              </div>
              <CompareRow
                gtValue={match.fecha ? displayFecha(match.fecha) : null}
                odooValue={match.odoo_order_date ? displayFecha(match.odoo_order_date) : null}
                mono
              />

              <div className="grid grid-cols-[1fr_auto] gap-x-2 py-2 border-b border-border/30 mt-1">
                <div className="grid grid-cols-2 gap-3">
                  <span className="text-tertiary text-xs">Nombre</span>
                  <span className="text-tertiary text-xs">Nombre</span>
                </div>
                <div className="w-5" />
              </div>
              <CompareRow
                gtValue={match.nombreOrdenante}
                odooValue={match.odoo_card_holder_name}
              />

              <div className="grid grid-cols-[1fr_auto] gap-x-2 py-2 border-b border-border/30 mt-1">
                <div className="grid grid-cols-2 gap-3">
                  <span className="text-tertiary text-xs">CI</span>
                  <span className="text-tertiary text-xs">CI</span>
                </div>
                <div className="w-5" />
              </div>
              <CompareRow
                gtValue={match.ciOrdenante}
                odooValue={match.odoo_card_holder_ci}
                mono
              />

              <div className="grid grid-cols-[1fr_auto] gap-x-2 py-2 border-b border-border/30 mt-1">
                <div className="grid grid-cols-2 gap-3">
                  <span className="text-tertiary text-xs">Cuenta</span>
                  <span className="text-tertiary text-xs">Cuenta</span>
                </div>
                <div className="w-5" />
              </div>
              <CompareRow
                gtValue={match.cuentaOrdenante}
                odooValue={match.odoo_card_number}
                mono
              />

              <div className="grid grid-cols-[1fr_auto] gap-x-2 py-2 border-b border-border/30 mt-1">
                <div className="grid grid-cols-2 gap-3">
                  <span className="text-tertiary text-xs">Ref Origen</span>
                  <span className="text-tertiary text-xs">Transfer Code</span>
                </div>
                <div className="w-5" />
              </div>
              <CompareRow
                gtValue={match.refOrigen}
                odooValue={match.odoo_transfer_code}
                mono
              />
            </div>
          </div>

          {/* Non-shared fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* GT-only fields */}
            <div>
              <h4 className="text-xs uppercase tracking-wider text-emerald-400/70 mb-2 font-medium">Solo GT</h4>
              <div className="bg-page rounded-lg px-4 py-1">
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-secondary text-sm">Canal</span>
                  <CanalBadge canal={match.canalEmision} />
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-secondary text-sm">Ref Corriente</span>
                  <span className="text-white text-sm font-mono">{match.refCorriente || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-secondary text-sm">Tarjeta</span>
                  <span className="text-white text-sm font-mono">{match.tarjetaOrdenante || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-secondary text-sm">Tipo</span>
                  <span className="text-white text-sm">{match.tipo}</span>
                </div>
              </div>
            </div>

            {/* Odoo-only fields */}
            <div>
              <h4 className="text-xs uppercase tracking-wider text-blue-400/70 mb-2 font-medium">Solo Odoo</h4>
              <div className="bg-page rounded-lg px-4 py-1">
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-secondary text-sm">Orden</span>
                  <span className="text-white text-sm font-mono">{match.odoo_order_name || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-secondary text-sm">Sesion</span>
                  <span className="text-white text-sm">{match.odoo_session_name || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-secondary text-sm">Tipo Pago</span>
                  <span className="text-white text-sm">{match.odoo_payment_type || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-secondary text-sm">Reclamada</span>
                  <span className="text-white text-sm font-mono">{match.claimedAt ? formatDate(match.claimedAt) : '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {match.codigoConfirmacion && (
            <div className="pt-2 space-y-3">
              {desmacharError && (
                <div className="text-red-400 text-sm p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  {desmacharError}
                </div>
              )}
              {confirmDesmachar ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-amber-400">Desmachar? Se limpiaran los datos GT en Odoo y la confirmacion en GT.</span>
                  <button
                    onClick={handleDesmachar}
                    disabled={desmachando}
                    className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors text-sm cursor-pointer disabled:opacity-40"
                  >
                    {desmachando ? 'Desmachando...' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => setConfirmDesmachar(false)}
                    className="px-3 py-1.5 bg-white/5 text-secondary rounded-lg hover:bg-white/10 transition-colors text-sm cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDesmachar(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer text-sm w-full justify-center"
                >
                  <Unlink size={14} />
                  Desmachar Transferencia
                </button>
              )}

              {match.claimedAt && (
                <>
                  {liberarError && (
                    <div className="text-red-400 text-sm p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      {liberarError}
                    </div>
                  )}
                  {confirmLiberar ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-red-400">Liberar esta transferencia? Podra ser reclamada nuevamente.</span>
                      <button
                        onClick={handleLiberar}
                        disabled={liberando}
                        className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm cursor-pointer disabled:opacity-40"
                      >
                        {liberando ? 'Liberando...' : 'Confirmar'}
                      </button>
                      <button
                        onClick={() => setConfirmLiberar(false)}
                        className="px-3 py-1.5 bg-white/5 text-secondary rounded-lg hover:bg-white/10 transition-colors text-sm cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmLiberar(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors cursor-pointer text-sm w-full justify-center"
                    >
                      <Unlock size={14} />
                      Liberar Transferencia
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
