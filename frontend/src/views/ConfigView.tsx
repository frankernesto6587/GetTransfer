import { useState, useEffect } from 'react'
import { Key, RefreshCw, Copy, Check, Trash2, AlertCircle } from 'lucide-react'
import { getActiveToken, generateToken, deleteToken } from '../lib/api'
import type { ApiToken } from '../types'

export function ConfigView() {
  const [token, setToken] = useState<ApiToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState<'regenerate' | 'delete' | null>(null)
  const [tokenName, setTokenName] = useState('')

  const fetchToken = async () => {
    try {
      setLoading(true)
      const data = await getActiveToken()
      setToken(data.token)
    } catch {
      setError('Error al obtener el token')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchToken() }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      const data = await generateToken(tokenName || 'Odoo POS')
      setToken(data.token)
      setTokenName('')
      setShowConfirm(null)
    } catch {
      setError('Error al generar el token')
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async () => {
    if (!token) return
    try {
      await deleteToken(token.id)
      setToken(null)
      setShowConfirm(null)
    } catch {
      setError('Error al eliminar el token')
    }
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-secondary">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-[800px]">
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold text-white">Configuracion</h1>
        <p className="text-secondary mt-1">Gestion de token de acceso para la API</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Token Section */}
      <div className="rounded-xl border border-border bg-surface p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <Key size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Token de API</h2>
        </div>

        {token ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Token activo</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-page border border-border rounded-lg px-3 py-2 text-sm text-white font-mono select-all">
                  {token.token}
                </code>
                <button
                  onClick={() => handleCopy(token.token)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                  title="Copiar token"
                >
                  {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} className="text-secondary" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-tertiary">Nombre</span>
                <p className="text-white">{token.name || '—'}</p>
              </div>
              <div>
                <span className="text-tertiary">Creado</span>
                <p className="text-white font-mono text-xs">
                  {new Date(token.createdAt).toLocaleString('es-CU')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              {showConfirm === 'regenerate' ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-amber-400">Esto invalidara el token actual. Las conexiones existentes dejaran de funcionar.</span>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors text-sm cursor-pointer"
                  >
                    {generating ? 'Generando...' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => setShowConfirm(null)}
                    className="px-3 py-1.5 bg-white/5 text-secondary rounded-lg hover:bg-white/10 transition-colors text-sm cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : showConfirm === 'delete' ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-400">Eliminar el token? Las conexiones dejaran de funcionar.</span>
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm cursor-pointer"
                  >
                    Eliminar
                  </button>
                  <button
                    onClick={() => setShowConfirm(null)}
                    className="px-3 py-1.5 bg-white/5 text-secondary rounded-lg hover:bg-white/10 transition-colors text-sm cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setShowConfirm('regenerate')}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/15 text-amber-400 rounded-lg hover:bg-amber-500/25 transition-colors cursor-pointer text-sm"
                  >
                    <RefreshCw size={14} />
                    Regenerar Token
                  </button>
                  <button
                    onClick={() => setShowConfirm('delete')}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors cursor-pointer text-sm"
                  >
                    <Trash2 size={14} />
                    Eliminar
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-secondary text-sm">No hay token generado. Genera uno para permitir la conexion desde Odoo.</p>
            <div>
              <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Nombre (opcional)</label>
              <input
                type="text"
                placeholder="Ej: Odoo POS Sucursal 1"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-5 py-2.5 bg-gold/20 text-gold rounded-lg hover:bg-gold/30 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Key size={16} />
              {generating ? 'Generando...' : 'Generar Token'}
            </button>
          </div>
        )}
      </div>

      {/* Help Section */}
      <div className="rounded-xl border border-border bg-surface/50 p-6">
        <h3 className="font-headline text-base font-semibold text-white mb-3">Como conectar Odoo con GetTransfer</h3>
        <ol className="space-y-2 text-sm text-secondary list-decimal list-inside">
          <li>Genere un token de API usando el boton de arriba</li>
          <li>Copie el token generado (formato UUID)</li>
          <li>En Odoo, vaya a <span className="text-white">Punto de Venta → Configuracion → Ajustes</span></li>
          <li>En la seccion <span className="text-white">GetTransfer</span>, pegue la URL de esta aplicacion y el token</li>
          <li>Presione <span className="text-white">Verificar Conexion</span> para confirmar que funciona</li>
          <li>Cree un metodo de pago de tipo <span className="text-white">GetTransfer</span> en Odoo</li>
        </ol>
        <div className="mt-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <p className="text-xs text-amber-400">
            Si regenera el token, debera actualizarlo tambien en la configuracion de Odoo.
          </p>
        </div>
      </div>
    </div>
  )
}
