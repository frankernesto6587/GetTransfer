import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Copy, RefreshCw, Check, Eye, EyeOff, Building2 } from 'lucide-react'
import { apiFetch } from '../lib/api'

interface Sede {
  id: number
  prefix: string
  name: string
  token: string
  secret: string
  active: boolean
  createdAt: string
}

async function getSedes(): Promise<Sede[]> {
  const res = await apiFetch('/api/sedes')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function getSedeDetail(id: number): Promise<Sede> {
  const res = await apiFetch(`/api/sedes/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function createSede(data: { prefix: string; name: string }): Promise<Sede> {
  const res = await apiFetch('/api/sedes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

async function regenerarToken(id: number): Promise<Sede> {
  const res = await apiFetch(`/api/sedes/${id}/regenerar-token`, { method: 'POST' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function regenerarSecret(id: number): Promise<Sede> {
  const res = await apiFetch(`/api/sedes/${id}/regenerar-secret`, { method: 'POST' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 text-secondary hover:text-white transition-colors" title={`Copiar ${label}`}>
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      {copied ? 'Copiado' : label}
    </button>
  )
}

export function SedesView() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newPrefix, setNewPrefix] = useState('')
  const [newName, setNewName] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Sede | null>(null)
  const [showSecret, setShowSecret] = useState(false)

  const { data: sedes, isLoading } = useQuery({
    queryKey: ['sedes'],
    queryFn: getSedes,
  })

  const createMut = useMutation({
    mutationFn: createSede,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sedes'] })
      setShowCreate(false)
      setNewPrefix('')
      setNewName('')
    },
  })

  const regenTokenMut = useMutation({
    mutationFn: regenerarToken,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sedes'] })
      setDetail(data)
    },
  })

  const regenSecretMut = useMutation({
    mutationFn: regenerarSecret,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sedes'] })
      setDetail(data)
    },
  })

  async function handleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null)
      setDetail(null)
      setShowSecret(false)
      return
    }
    setExpandedId(id)
    setShowSecret(false)
    try {
      const d = await getSedeDetail(id)
      setDetail(d)
    } catch {
      setDetail(null)
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Sedes GT</h1>
          <p className="text-secondary mt-1">Gestión de sedes y credenciales de sincronización</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/10 text-gold hover:bg-gold/20 transition-colors"
        >
          <Plus size={16} />
          Nueva Sede
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-5">
          <h3 className="font-headline font-semibold text-white mb-4">Crear Sede</h3>
          <div className="flex items-end gap-4">
            <div>
              <label className="text-xs text-tertiary block mb-1">Prefijo</label>
              <input
                type="text"
                value={newPrefix}
                onChange={(e) => setNewPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="L1"
                className="px-3 py-2 rounded-lg bg-page border border-border text-white font-mono w-20"
                maxLength={10}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-tertiary block mb-1">Nombre</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="POS Mayorista"
                className="px-3 py-2 rounded-lg bg-page border border-border text-white w-full"
              />
            </div>
            <button
              onClick={() => createMut.mutate({ prefix: newPrefix, name: newName })}
              disabled={!newPrefix || !newName || createMut.isPending}
              className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              {createMut.isPending ? 'Creando...' : 'Crear'}
            </button>
          </div>
          {createMut.isError && (
            <p className="text-red-400 text-sm mt-2">{(createMut.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Sedes list */}
      {isLoading ? (
        <div className="text-secondary animate-pulse py-10 text-center">Cargando sedes...</div>
      ) : !sedes?.length ? (
        <div className="text-center py-20 text-tertiary">No hay sedes registradas. Crea la primera.</div>
      ) : (
        <div className="space-y-3">
          {sedes.map((s) => (
            <div key={s.id} className={`rounded-xl border bg-surface transition-colors ${s.active ? 'border-border' : 'border-red-500/20 bg-red-500/5'}`}>
              {/* Header row */}
              <button
                onClick={() => handleExpand(s.id)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gold/10 flex items-center justify-center">
                    <Building2 size={20} className="text-gold" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-gold text-lg">{s.prefix}</span>
                      <span className="text-white font-medium">{s.name}</span>
                      {!s.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">Inactiva</span>}
                    </div>
                    <span className="text-tertiary text-xs">Token: {s.token}</span>
                  </div>
                </div>
                <span className="text-tertiary text-xs">{expandedId === s.id ? '▲' : '▼'}</span>
              </button>

              {/* Expanded detail */}
              {expandedId === s.id && detail && (
                <div className="px-5 pb-5 border-t border-border pt-4 space-y-4">
                  {/* Datos para copiar a Odoo */}
                  <div className="rounded-lg bg-page p-4">
                    <p className="text-white text-sm font-medium mb-3">Datos para configurar en Odoo local:</p>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-tertiary text-xs block">Prefijo Sede GT</span>
                          <span className="text-white font-mono">{detail.prefix}</span>
                        </div>
                        <CopyButton value={detail.prefix} label="Prefijo" />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <span className="text-tertiary text-xs block">Token GT Central</span>
                          <span className="text-white font-mono text-sm break-all">{detail.token}</span>
                        </div>
                        <div className="flex items-center gap-1 ml-3 shrink-0">
                          <CopyButton value={detail.token} label="Token" />
                          <button
                            onClick={() => { if (confirm('¿Regenerar token? La sede dejará de sincronizar hasta actualizar el token en Odoo.')) regenTokenMut.mutate(s.id) }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                            title="Regenerar token"
                          >
                            <RefreshCw size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <span className="text-tertiary text-xs block">Secreto HMAC</span>
                          <span className="text-white font-mono text-xs break-all">
                            {showSecret ? detail.secret : '••••••••••••••••'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 ml-3 shrink-0">
                          <button
                            onClick={() => setShowSecret(!showSecret)}
                            className="p-1 rounded text-tertiary hover:text-white"
                            title={showSecret ? 'Ocultar' : 'Mostrar'}
                          >
                            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <CopyButton value={detail.secret} label="Secret" />
                          <button
                            onClick={() => { if (confirm('¿Regenerar secreto HMAC?')) regenSecretMut.mutate(s.id) }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                            title="Regenerar secret"
                          >
                            <RefreshCw size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-tertiary text-xs">
                    Creada: {new Date(detail.createdAt).toLocaleString('es-CU')}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
