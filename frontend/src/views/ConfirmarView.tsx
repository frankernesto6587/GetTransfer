import { useState, useRef, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, CheckCircle, Printer, AlertCircle, HelpCircle } from 'lucide-react'

/** YYYY-MM-DD → DD/MM/YYYY */
function displayFecha(f: string) {
  const m = f?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : f;
}
import { buscarPendientes, confirmarTransferencia } from '../lib/api'
import type { Transferencia } from '../types'

export function ConfirmarView() {
  const queryClient = useQueryClient()

  const [importe, setImporte] = useState('')
  const [nombre, setNombre] = useState('')
  const [ci, setCi] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [refCorriente, setRefCorriente] = useState('')

  const [results, setResults] = useState<Transferencia[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [confirmada, setConfirmada] = useState<Transferencia | null>(null)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)

  const receiptRef = useRef<HTMLDivElement>(null)

  const confirmarMut = useMutation({
    mutationFn: confirmarTransferencia,
    onSuccess: (data) => {
      setConfirmada(data)
      setResults(null)
      queryClient.invalidateQueries({ queryKey: ['transferencias'] })
    },
  })

  // Valid search combinations:
  // - refCorriente alone
  // - nombre + importe (+ optional ci, cuenta, refCorriente)
  // - ci + importe
  // - cuenta + importe
  const canSearch = useMemo(() => {
    const hasRef = refCorriente.trim().length > 0
    const hasNombre = nombre.trim().length >= 6
    const hasCi = /^\d{11}$/.test(ci.trim())
    const hasCuenta = cuenta.replace(/[\s-]/g, '').length === 16
    const hasImporte = importe.length > 0
    return hasRef || (hasNombre && hasImporte) || (hasCi && hasImporte) || (hasCuenta && hasImporte)
  }, [refCorriente, nombre, ci, cuenta, importe])

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSearch) return

    setSearching(true)
    setSearchError('')
    setResults(null)
    setConfirmada(null)

    try {
      const data = await buscarPendientes({
        importe: importe ? Number(importe) : undefined,
        nombre: nombre.trim() || undefined,
        ci: ci.trim() || undefined,
        cuentaOrdenante: cuenta.replace(/\D/g, '') || undefined,
        refCorriente: refCorriente.trim() || undefined,
      })
      setResults(data)
    } catch {
      setSearchError('Error al buscar transferencias')
    } finally {
      setSearching(false)
    }
  }

  const handleConfirmar = (id: number) => {
    setConfirmingId(id)
    confirmarMut.mutate(id, {
      onSettled: () => setConfirmingId(null),
    })
  }

  const handleImprimir = () => {
    if (!receiptRef.current) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Comprobante - ${confirmada?.codigoConfirmacion}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; padding: 24px; max-width: 400px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 12px; margin-bottom: 16px; }
          .header h1 { font-size: 16px; margin-bottom: 4px; }
          .header p { font-size: 11px; color: #666; }
          .code { text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 3px; padding: 16px 0; border: 2px solid #000; margin: 16px 0; }
          .details { font-size: 12px; line-height: 1.8; }
          .details .row { display: flex; justify-content: space-between; }
          .details .label { color: #666; }
          .divider { border-top: 1px dashed #000; margin: 12px 0; }
          .footer { text-align: center; font-size: 10px; color: #666; margin-top: 24px; }
          .firma { margin-top: 40px; border-top: 1px solid #000; width: 200px; margin-left: auto; margin-right: auto; padding-top: 4px; text-align: center; font-size: 11px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${receiptRef.current.innerHTML}
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleNuevaBusqueda = () => {
    setImporte('')
    setNombre('')
    setCi('')
    setCuenta('')
    setRefCorriente('')
    setResults(null)
    setConfirmada(null)
    setSearchError('')
  }

  return (
    <div className="p-8 max-w-[900px]">
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold text-white">Confirmar Transferencia</h1>
        <p className="text-secondary mt-1">Buscar y confirmar transferencias pendientes</p>
      </div>

      {/* Resultado de confirmacion exitosa */}
      {confirmada ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-8">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle size={28} className="text-emerald-400" />
            <h2 className="font-headline text-xl font-semibold text-emerald-400">Transferencia Confirmada</h2>
          </div>

          <div className="text-center mb-6">
            <p className="text-tertiary text-sm mb-2">Codigo de confirmacion</p>
            <p className="font-mono text-4xl font-bold text-white tracking-wider">
              {confirmada.codigoConfirmacion}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div>
              <span className="text-tertiary">Ordenante</span>
              <p className="text-white">{confirmada.nombreOrdenante}</p>
            </div>
            <div>
              <span className="text-tertiary">Importe</span>
              <p className="text-white font-mono">${confirmada.importe.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</p>
            </div>
            <div>
              <span className="text-tertiary">Fecha</span>
              <p className="text-white">{displayFecha(confirmada.fecha)}</p>
            </div>
            <div>
              <span className="text-tertiary">Canal</span>
              <p className="text-white">{confirmada.canalEmision || '—'}</p>
            </div>
            <div>
              <span className="text-tertiary">CI</span>
              <p className="text-white font-mono">{confirmada.ciOrdenante || '—'}</p>
            </div>
            <div>
              <span className="text-tertiary">Ref Origen</span>
              <p className="text-white font-mono text-xs">{confirmada.refOrigen}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleImprimir}
              className="flex items-center gap-2 px-4 py-2 bg-gold/20 text-gold rounded-lg hover:bg-gold/30 transition-colors cursor-pointer"
            >
              <Printer size={16} />
              Imprimir Comprobante
            </button>
            <button
              onClick={handleNuevaBusqueda}
              className="px-4 py-2 bg-white/5 text-secondary rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              Nueva Busqueda
            </button>
          </div>

          {/* Receipt template (hidden, used for printing) */}
          <div className="hidden">
            <div ref={receiptRef}>
              <div className="header">
                <h1>GETTRANSFER</h1>
                <p>Comprobante de Confirmacion</p>
              </div>
              <div className="code">{confirmada.codigoConfirmacion}</div>
              <div className="details">
                <div className="row"><span className="label">Fecha:</span><span>{displayFecha(confirmada.fecha)}</span></div>
                <div className="row"><span className="label">Ordenante:</span><span>{confirmada.nombreOrdenante}</span></div>
                <div className="row"><span className="label">CI:</span><span>{confirmada.ciOrdenante || '—'}</span></div>
                <div className="row"><span className="label">Importe:</span><span>${confirmada.importe.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span></div>
                <div className="row"><span className="label">Canal:</span><span>{confirmada.canalEmision || '—'}</span></div>
                <div className="divider"></div>
                <div className="row"><span className="label">Ref Origen:</span><span>{confirmada.refOrigen}</span></div>
                <div className="row"><span className="label">Ref Destino:</span><span>{confirmada.refCorriente}</span></div>
                <div className="divider"></div>
                <div className="row"><span className="label">Confirmado:</span><span>{confirmada.confirmedAt ? new Date(confirmada.confirmedAt).toLocaleString('es-CU') : ''}</span></div>
              </div>
              <div className="firma">Firma</div>
              <div className="footer">
                <p>Este comprobante es valido como constancia de confirmacion.</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Formulario de busqueda */}
          <form onSubmit={handleBuscar} className="rounded-xl border border-border bg-surface p-6 mb-6">
            <h3 className="font-headline text-lg font-semibold text-white mb-4">Datos del cliente</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Importe</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Monto transferido"
                  value={importe}
                  onChange={(e) => setImporte(e.target.value)}
                  className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Nombre</label>
                <input
                  type="text"
                  placeholder="Nombre del ordenante (min. 6 caracteres)"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">CI</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="11 digitos"
                  value={ci}
                  onChange={(e) => setCi(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Cuenta</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={19}
                  placeholder="0000-0000-0000-0000"
                  value={cuenta}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '').slice(0, 16)
                    const formatted = raw.replace(/(\d{4})(?=\d)/g, '$1-')
                    setCuenta(formatted)
                  }}
                  className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors font-mono tracking-wider"
                />
              </div>
              <div>
                <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Ref Destino</label>
                <input
                  type="text"
                  placeholder="Referencia destino"
                  value={refCorriente}
                  onChange={(e) => setRefCorriente(e.target.value)}
                  className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={searching || !canSearch}
              className="flex items-center gap-2 px-5 py-2.5 bg-gold/20 text-gold rounded-lg hover:bg-gold/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Search size={16} />
              {searching ? 'Buscando...' : 'Buscar Transferencia'}
            </button>
          </form>

          {/* Ayuda de parametros */}
          <div className="rounded-xl border border-border bg-surface/50 p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle size={16} className="text-tertiary" />
              <h4 className="text-sm font-medium text-secondary">Combinaciones de busqueda</h4>
            </div>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
                <span className="text-gold font-mono text-xs mt-0.5 shrink-0">1</span>
                <div>
                  <span className="text-white">Nombre + Importe</span>
                  <span className="text-tertiary ml-2">— Busqueda principal. CI y Ref Destino opcionales para refinar.</span>
                </div>
              </div>
              <div className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
                <span className="text-gold font-mono text-xs mt-0.5 shrink-0">2</span>
                <div>
                  <span className="text-white">CI + Importe</span>
                  <span className="text-tertiary ml-2">— Cuando el cliente no recuerda el nombre exacto.</span>
                </div>
              </div>
              <div className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
                <span className="text-gold font-mono text-xs mt-0.5 shrink-0">3</span>
                <div>
                  <span className="text-white">Cuenta + Importe</span>
                  <span className="text-tertiary ml-2">— Busqueda por numero de cuenta del ordenante.</span>
                </div>
              </div>
              <div className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
                <span className="text-gold font-mono text-xs mt-0.5 shrink-0">4</span>
                <div>
                  <span className="text-white">Ref Destino</span>
                  <span className="text-tertiary ml-2">— Sola, sin otros campos. Busqueda directa por referencia.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {searchError ? (
            <div className="flex items-center gap-2 text-red-400 text-sm mb-4">
              <AlertCircle size={16} />
              {searchError}
            </div>
          ) : null}

          {/* Resultados */}
          {results !== null ? (
            <div className="rounded-xl border border-border bg-surface">
              <div className="px-6 py-4 border-b border-border">
                <h3 className="font-headline text-lg font-semibold text-white">
                  {results.length === 0
                    ? 'Sin resultados'
                    : `${results.length} transferencia${results.length > 1 ? 's' : ''} encontrada${results.length > 1 ? 's' : ''}`}
                </h3>
              </div>

              {results.length === 0 ? (
                <div className="px-6 py-12 text-center text-secondary">
                  No se encontraron transferencias pendientes con esos datos.
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {results.map((t) => (
                    <div key={t.id} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                      <div className="flex-1 grid grid-cols-5 gap-4 text-sm">
                        <div>
                          <span className="text-tertiary text-xs block">Fecha</span>
                          <span className="text-secondary font-mono">{displayFecha(t.fecha)}</span>
                        </div>
                        <div>
                          <span className="text-tertiary text-xs block">Ordenante</span>
                          <span className="text-white">{t.nombreOrdenante || '—'}</span>
                        </div>
                        <div>
                          <span className="text-tertiary text-xs block">CI</span>
                          <span className="text-secondary font-mono">{t.ciOrdenante || '—'}</span>
                        </div>
                        <div>
                          <span className="text-tertiary text-xs block">Importe</span>
                          <span className="text-white font-mono">${t.importe.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div>
                          <span className="text-tertiary text-xs block">Canal</span>
                          <span className="text-secondary">{t.canalEmision || '—'}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleConfirmar(t.id)}
                        disabled={confirmingId !== null}
                        className="ml-4 flex items-center gap-1.5 px-4 py-2 bg-emerald-500/15 text-emerald-400 rounded-lg hover:bg-emerald-500/25 transition-colors disabled:opacity-40 cursor-pointer text-sm font-medium"
                      >
                        <CheckCircle size={14} />
                        {confirmingId === t.id ? 'Confirmando...' : 'Confirmar'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {confirmarMut.isError ? (
                <div className="px-6 py-3 border-t border-border text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle size={14} />
                  {confirmarMut.error?.message || 'Error al confirmar'}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
