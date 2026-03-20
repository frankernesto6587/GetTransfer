import { useState } from 'react'
import { X, Unlock, Unlink, Pencil, Save, XCircle } from 'lucide-react'
import type { TransferDetailData } from '../types'
import { liberarTransferencia, desmacharTransferencia, updateOdooPayment } from '../lib/api'

/** YYYY-MM-DD → DD/MM/YYYY */
export function displayFecha(f: string) {
  const iso = f?.slice(0, 10)
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : f
}

export function formatDate(val: string | null) {
  if (!val) return '—'
  const d = new Date(val)
  return `${d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}`
}

export function formatCurrency(amount: number) {
  return amount.toLocaleString('es-CU', { minimumFractionDigits: 2 })
}

export function CanalBadge({ canal }: { canal: string | null }) {
  if (!canal) return <span className="text-tertiary">—</span>
  const colors: Record<string, string> = {
    TRANSFERMOVIL: 'bg-emerald-500/15 text-emerald-400',
    ENZONA: 'bg-blue-500/15 text-blue-400',
    ATM: 'bg-amber-500/15 text-amber-400',
  }
  const key = canal.toUpperCase()
  const colorClass =
    Object.entries(colors).find(([k]) => key.includes(k))?.[1] ??
    'bg-white/10 text-secondary'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
      {canal}
    </span>
  )
}

const MATCH_TYPE_LABELS: Record<string, { label: string; class: string }> = {
  CONFIRMED_AUTO: { label: 'Auto-confirmado', class: 'bg-emerald-500/15 text-emerald-400' },
  CONFIRMED_MANUAL_REF_ACCOUNT_CI: { label: 'Manual — Ref + Cuenta + CI', class: 'bg-blue-500/15 text-blue-400' },
  CONFIRMED_MANUAL_CI_ACCOUNT_DATE: { label: 'Manual — CI + Cuenta + Fecha', class: 'bg-blue-500/15 text-blue-400' },
  CONFIRMED_MANUAL_CI_AMOUNT: { label: 'Manual — CI + Monto', class: 'bg-cyan-500/15 text-cyan-400' },
  CONFIRMED_MANUAL_ACCOUNT_AMOUNT: { label: 'Manual — Cuenta + Monto', class: 'bg-cyan-500/15 text-cyan-400' },
  CONFIRMED_MANUAL_NAME_DATE: { label: 'Manual — Nombre + Fecha', class: 'bg-cyan-500/15 text-cyan-400' },
  CONFIRMED_DEPOSIT: { label: 'Deposito', class: 'bg-violet-500/15 text-violet-400' },
  CONFIRMED_BUY: { label: 'Compra', class: 'bg-amber-500/15 text-amber-400' },
  REVIEW_REQUIRED: { label: 'Requiere revision', class: 'bg-rose-500/15 text-rose-400' },
}

function MatchTypeBadgeDetail({ matchType, nivelConfianza }: { matchType: string; nivelConfianza: number | null }) {
  const config = MATCH_TYPE_LABELS[matchType]
  if (!config) return <span className="text-secondary text-sm">{matchType}</span>
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.class}`}>
        {config.label}
      </span>
      {nivelConfianza && (
        <span className="text-[10px] text-tertiary font-mono">N{nivelConfianza}</span>
      )}
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

export function TransferDetailModal({ transfer, onClose, onRefresh }: { transfer: TransferDetailData; onClose: () => void; onRefresh?: () => void }) {
  const [confirmLiberar, setConfirmLiberar] = useState(false)
  const [liberando, setLiberando] = useState(false)
  const [liberarError, setLiberarError] = useState('')

  const [confirmDesmachar, setConfirmDesmachar] = useState(false)
  const [desmachando, setDesmachando] = useState(false)
  const [desmacharError, setDesmacharError] = useState('')

  // Odoo inline editing
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [editFields, setEditFields] = useState({ card_holder_name: '', card_holder_ci: '', card_number: '', transfer_code: '' })

  const { source, data } = transfer
  const isBandec = source === 'bandec'

  const startEditing = () => {
    if (isBandec) return
    setEditFields({
      card_holder_name: data.card_holder_name || '',
      card_holder_ci: data.card_holder_ci || '',
      card_number: data.card_number || '',
      transfer_code: data.transfer_code || '',
    })
    setEditError('')
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setEditError('')
  }

  const handleSaveEdit = async () => {
    if (isBandec) return
    setSaving(true)
    setEditError('')
    try {
      const changed: Record<string, string> = {}
      if (editFields.card_holder_name !== (data.card_holder_name || '')) changed.card_holder_name = editFields.card_holder_name
      if (editFields.card_holder_ci !== (data.card_holder_ci || '')) changed.card_holder_ci = editFields.card_holder_ci
      if (editFields.card_number !== (data.card_number || '')) changed.card_number = editFields.card_number
      if (editFields.transfer_code !== (data.transfer_code || '')) changed.transfer_code = editFields.transfer_code

      if (Object.keys(changed).length === 0) {
        setEditing(false)
        return
      }

      await updateOdooPayment(data.payment_id, changed)
      onRefresh?.()
      setEditing(false)
      onClose()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // Common values
  const importe = isBandec ? data.importe : data.amount
  const nombre = isBandec ? data.nombreOrdenante : (data.card_holder_name || data.gt_nombre_ordenante)
  const ci = isBandec ? data.ciOrdenante : (data.card_holder_ci || data.gt_ci_ordenante)
  const cuenta = isBandec ? data.cuentaOrdenante : (data.card_number || data.gt_cuenta_ordenante)
  const canal = isBandec ? data.canalEmision : data.gt_canal_emision
  const refOrigen = isBandec ? data.refOrigen : data.gt_ref_origen
  const refCorriente = isBandec ? data.refCorriente : data.gt_ref_corriente
  const fecha = isBandec ? data.fecha : (data.order_date || data.gt_fecha || '')
  const subtitle = isBandec
    ? (data.codigoConfirmacion || `#${data.id}`)
    : (data.order_name || `#${data.payment_id}`)

  const handleLiberar = async () => {
    if (!isBandec) return
    if (!data.codigoConfirmacion) return
    setLiberando(true)
    setLiberarError('')
    try {
      await liberarTransferencia(data.codigoConfirmacion)
      onRefresh?.()
      onClose()
    } catch (err) {
      setLiberarError(err instanceof Error ? err.message : 'Error al liberar')
    } finally {
      setLiberando(false)
    }
  }

  const handleDesmachar = async () => {
    if (!isBandec) return
    if (!data.codigoConfirmacion) return
    setDesmachando(true)
    setDesmacharError('')
    try {
      await desmacharTransferencia(data.id)
      onRefresh?.()
      onClose()
    } catch (err) {
      setDesmacharError(err instanceof Error ? err.message : 'Error al desmachar')
    } finally {
      setDesmachando(false)
    }
  }

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
            <h3 className="font-headline text-lg font-semibold text-white">Detalle de Transferencia</h3>
            <span className="font-mono text-gold text-sm">{subtitle}</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-secondary hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Importe destacado */}
          <div className="text-center py-3 rounded-xl bg-gold/10 border border-gold/20">
            <div className="text-tertiary text-xs uppercase tracking-wider mb-1">Importe</div>
            <div className="font-mono text-2xl font-bold text-gold">{formatCurrency(importe)}</div>
          </div>

          {/* Ordenante */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-tertiary mb-2 font-medium">Datos del Ordenante</h4>
            <div className="bg-page rounded-lg px-4 py-1">
              <DetailRow label="Nombre" value={nombre} />
              <DetailRow label="CI" value={ci} mono />
              <DetailRow label="Cuenta" value={cuenta} mono />
              {isBandec && <DetailRow label="Tarjeta" value={data.tarjetaOrdenante} mono />}
              {isBandec && <DetailRow label="Telefono" value={data.telefonoOrdenante} mono />}
              {isBandec && <DetailRow label="Sucursal" value={data.sucursalOrdenante} />}
            </div>
          </div>

          {/* Datos de la transferencia */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-tertiary mb-2 font-medium">Datos de la Transferencia</h4>
            <div className="bg-page rounded-lg px-4 py-1">
              <DetailRow label="Fecha" value={fecha ? displayFecha(fecha) : '—'} mono />
              <DetailRow label="Ref Origen" value={refOrigen} mono />
              <DetailRow label="Ref Corriente" value={refCorriente} mono />
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-secondary text-sm">Canal</span>
                <CanalBadge canal={canal} />
              </div>
              {isBandec && <DetailRow label="Tipo" value={data.tipo} />}
              {isBandec && <DetailRow label="Tipo Servicio" value={data.tipoServicio} />}
            </div>
          </div>

          {/* Datos Odoo - only for odoo source */}
          {!isBandec && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs uppercase tracking-wider text-tertiary font-medium">Datos Odoo</h4>
                {!editing ? (
                  <button
                    onClick={startEditing}
                    className="p-1 rounded hover:bg-white/10 text-tertiary hover:text-white transition-colors"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 transition-colors disabled:opacity-40"
                      title="Guardar"
                    >
                      <Save size={14} />
                    </button>
                    <button
                      onClick={cancelEditing}
                      disabled={saving}
                      className="p-1 rounded hover:bg-white/10 text-secondary hover:text-white transition-colors disabled:opacity-40"
                      title="Cancelar"
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                )}
              </div>
              {editError && (
                <div className="text-red-400 text-sm mb-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  {editError}
                </div>
              )}
              <div className="bg-page rounded-lg px-4 py-1">
                <DetailRow label="Orden" value={data.order_name} mono />
                <DetailRow label="Sesion" value={data.session_name} />
                <DetailRow label="Tipo Pago" value={data.payment_type} />
                {editing ? (
                  <>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-secondary text-sm">Nombre</span>
                      <input
                        value={editFields.card_holder_name}
                        onChange={(e) => setEditFields(f => ({ ...f, card_holder_name: e.target.value }))}
                        className="bg-surface border border-border rounded px-2 py-1 text-white text-sm w-48 text-right focus:outline-none focus:border-gold/50"
                      />
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-secondary text-sm">CI</span>
                      <input
                        value={editFields.card_holder_ci}
                        onChange={(e) => setEditFields(f => ({ ...f, card_holder_ci: e.target.value }))}
                        className="bg-surface border border-border rounded px-2 py-1 text-white text-sm font-mono w-48 text-right focus:outline-none focus:border-gold/50"
                      />
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-secondary text-sm">Cuenta</span>
                      <input
                        value={editFields.card_number}
                        onChange={(e) => setEditFields(f => ({ ...f, card_number: e.target.value }))}
                        className="bg-surface border border-border rounded px-2 py-1 text-white text-sm font-mono w-48 text-right focus:outline-none focus:border-gold/50"
                      />
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-secondary text-sm">Transfer Code</span>
                      <input
                        value={editFields.transfer_code}
                        onChange={(e) => setEditFields(f => ({ ...f, transfer_code: e.target.value }))}
                        className="bg-surface border border-border rounded px-2 py-1 text-white text-sm font-mono w-48 text-right focus:outline-none focus:border-gold/50"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <DetailRow label="Nombre" value={data.card_holder_name} />
                    <DetailRow label="CI" value={data.card_holder_ci} mono />
                    <DetailRow label="Cuenta" value={data.card_number} mono />
                    <DetailRow label="Transfer Code" value={data.transfer_code} mono />
                  </>
                )}
                <DetailRow label="GT Codigo" value={data.gt_codigo} mono />
              </div>
            </div>
          )}

          {/* Estado - only for bandec */}
          {isBandec && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-tertiary mb-2 font-medium">Estado</h4>
              <div className="bg-page rounded-lg px-4 py-1">
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-secondary text-sm">Codigo</span>
                  {data.codigoConfirmacion ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400 font-mono">
                      {data.codigoConfirmacion}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/5 text-tertiary">Pendiente</span>
                  )}
                </div>
                {data.matchType && (
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-secondary text-sm">Tipo Match</span>
                    <MatchTypeBadgeDetail matchType={data.matchType} nivelConfianza={data.nivelConfianza} />
                  </div>
                )}
                <DetailRow label="Confirmado" value={formatDate(data.confirmedAt)} mono />
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-secondary text-sm">Reclamada</span>
                  {data.claimedAt ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-500/15 text-violet-400 font-mono">
                      {formatDate(data.claimedAt)}
                    </span>
                  ) : (
                    <span className="text-tertiary text-sm">—</span>
                  )}
                </div>
                <DetailRow label="Ref Odoo" value={data.claimedBy} mono />
              </div>
            </div>
          )}

          {/* Action buttons - bandec only when confirmed */}
          {isBandec && data.codigoConfirmacion && (
            <div className="pt-2 space-y-3">
              {/* Desmachar button */}
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

              {/* Liberar button - only when claimed */}
              {data.claimedAt && (
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
