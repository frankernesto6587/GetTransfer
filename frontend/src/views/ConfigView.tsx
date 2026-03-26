import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Key, RefreshCw, Copy, Check, Trash2, AlertCircle, Radio, Clock, Send, Download, Wifi, WifiOff, Link, Unlink, Server, Plug, DollarSign, Building2, Eye, EyeOff, Plus } from 'lucide-react'
import { getActiveToken, generateToken, deleteToken, getMonitorConfig, updateMonitorConfig, getMonitorStatus, triggerScrape, forceCheck, getWebhookInfo, registerWebhook, unregisterWebhook, getOdooConfig, updateOdooConfig, testOdooConnection, getSaldoInicial, upsertSaldoInicial, deleteSaldoInicial, apiFetch } from '../lib/api'
import type { MonitorConfig } from '../types'

// ── Tabs ──

const TABS = [
  { id: 'general', label: 'General', icon: Server },
  { id: 'sedes', label: 'Sedes GT', icon: Building2 },
  { id: 'monitor', label: 'Monitor BANDEC', icon: Radio },
  { id: 'scraping', label: 'Scraping', icon: Download },
] as const
type TabId = typeof TABS[number]['id']

export function ConfigView() {
  const [activeTab, setActiveTab] = useState<TabId>('general')

  // Global error
  const [error, setError] = useState('')

  return (
    <div className="p-4 md:p-8 max-w-[900px] w-full">
      <div className="mb-6">
        <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Configuracion</h1>
        <p className="text-secondary mt-1">Gestion del sistema GetTransfer</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400/50 hover:text-red-400">&times;</button>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-gold text-gold'
                  : 'border-transparent text-tertiary hover:text-secondary'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content — all mounted, only active visible (preserves form state) */}
      <div className={activeTab === 'general' ? '' : 'hidden'}><GeneralTab setError={setError} /></div>
      <div className={activeTab === 'sedes' ? '' : 'hidden'}><SedesTab /></div>
      <div className={activeTab === 'monitor' ? '' : 'hidden'}><MonitorTab setError={setError} /></div>
      <div className={activeTab === 'scraping' ? '' : 'hidden'}><ScrapingTab setError={setError} /></div>
    </div>
  )
}

// ══════════════════════════════════════════
// GENERAL TAB: Token + Odoo API + Saldo
// ══════════════════════════════════════════

function GeneralTab({ setError }: { error?: string; setError: (e: string) => void }) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [showConfirm, setShowConfirm] = useState<'regenerate' | 'delete' | null>(null)
  const [tokenName, setTokenName] = useState('')

  // Odoo config
  const [odooForm, setOdooForm] = useState({ api_url: '', api_key: '' })
  const [odooSuccess, setOdooSuccess] = useState('')
  const [odooTestResult, setOdooTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Saldo inicial
  const [saldoImporte, setSaldoImporte] = useState('')
  const [saldoSuccess, setSaldoSuccess] = useState('')
  const [showDeleteSaldo, setShowDeleteSaldo] = useState(false)

  const tokenQuery = useQuery({ queryKey: ['token'], queryFn: getActiveToken })

  useQuery({
    queryKey: ['odoo-config'],
    queryFn: async () => {
      const config = await getOdooConfig()
      setOdooForm({ api_url: config.api_url || '', api_key: config.api_key || '' })
      return config
    },
  })

  const saldoQuery = useQuery({
    queryKey: ['saldo-inicial'],
    queryFn: async () => {
      const saldo = await getSaldoInicial()
      if (saldo) setSaldoImporte(String(saldo.importe))
      return saldo
    },
  })

  const generateTokenMut = useMutation({
    mutationFn: (name: string) => generateToken(name || 'Odoo POS'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['token'] }); setTokenName(''); setShowConfirm(null) },
    onError: () => setError('Error al generar el token'),
  })
  const deleteTokenMut = useMutation({
    mutationFn: (id: number) => deleteToken(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['token'] }); setShowConfirm(null) },
    onError: () => setError('Error al eliminar el token'),
  })
  const saveOdooMut = useMutation({
    mutationFn: () => updateOdooConfig(odooForm),
    onSuccess: () => { setOdooSuccess('Guardado'); setTimeout(() => setOdooSuccess(''), 3000) },
    onError: () => setError('Error al guardar Odoo'),
  })
  const testOdooMut = useMutation({
    mutationFn: () => testOdooConnection(odooForm),
    onSuccess: (r) => setOdooTestResult(r),
    onError: (e: any) => setOdooTestResult({ ok: false, message: e.message }),
  })
  const saveSaldoMut = useMutation({
    mutationFn: () => upsertSaldoInicial(parseFloat(saldoImporte)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['saldo-inicial'] }); setSaldoSuccess('Guardado'); setTimeout(() => setSaldoSuccess(''), 3000) },
    onError: (e: any) => setError(e.message),
  })
  const deleteSaldoMut = useMutation({
    mutationFn: () => deleteSaldoInicial(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['saldo-inicial'] }); setSaldoImporte(''); setShowDeleteSaldo(false) },
    onError: (e: any) => setError(e.message),
  })

  const token = tokenQuery.data?.token ?? null
  const handleCopy = async (text: string) => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div className="space-y-6">
      {/* Token */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3 mb-4">
          <Key size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Token de API</h2>
        </div>
        {token ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-page border border-border rounded-lg px-3 py-2 text-sm text-white font-mono select-all">{token.token}</code>
              <button onClick={() => handleCopy(token.token)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10" title="Copiar">
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} className="text-secondary" />}
              </button>
            </div>
            <div className="flex gap-3 pt-2">
              {showConfirm === 'regenerate' ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-amber-400">Invalidara el token actual.</span>
                  <button onClick={() => generateTokenMut.mutate(tokenName)} className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-sm">Confirmar</button>
                  <button onClick={() => setShowConfirm(null)} className="px-3 py-1.5 bg-white/5 text-secondary rounded-lg text-sm">Cancelar</button>
                </div>
              ) : showConfirm === 'delete' ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-400">Eliminar?</span>
                  <button onClick={() => deleteTokenMut.mutate(token.id)} className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm">Eliminar</button>
                  <button onClick={() => setShowConfirm(null)} className="px-3 py-1.5 bg-white/5 text-secondary rounded-lg text-sm">Cancelar</button>
                </div>
              ) : (
                <>
                  <button onClick={() => setShowConfirm('regenerate')} className="flex items-center gap-2 px-4 py-2 bg-amber-500/15 text-amber-400 rounded-lg text-sm"><RefreshCw size={14} />Regenerar</button>
                  <button onClick={() => setShowConfirm('delete')} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-lg text-sm"><Trash2 size={14} />Eliminar</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-secondary text-sm">No hay token. Genere uno para conectar Odoo.</p>
            <input type="text" placeholder="Nombre (opcional)" value={tokenName} onChange={(e) => setTokenName(e.target.value)} className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white" />
            <button onClick={() => generateTokenMut.mutate(tokenName)} className="flex items-center gap-2 px-5 py-2.5 bg-gold/20 text-gold rounded-lg"><Key size={16} />Generar Token</button>
          </div>
        )}
      </div>

      {/* Odoo API */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3 mb-4">
          <Server size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Conexion Odoo API</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">URL de la API Odoo</label>
            <input type="text" placeholder="http://192.168.1.86:8000" value={odooForm.api_url} onChange={(e) => setOdooForm(f => ({ ...f, api_url: e.target.value }))} className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white font-mono" />
          </div>
          <div>
            <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">API Key</label>
            <input type="password" value={odooForm.api_key} onChange={(e) => setOdooForm(f => ({ ...f, api_key: e.target.value }))} className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white font-mono" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => saveOdooMut.mutate()} disabled={saveOdooMut.isPending} className="px-5 py-2.5 bg-gold/20 text-gold rounded-lg disabled:opacity-40">{saveOdooMut.isPending ? 'Guardando...' : 'Guardar'}</button>
            <button onClick={() => testOdooMut.mutate()} disabled={testOdooMut.isPending || !odooForm.api_url} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 text-secondary rounded-lg disabled:opacity-40"><Plug size={14} />{testOdooMut.isPending ? 'Probando...' : 'Probar'}</button>
            {odooSuccess && <span className="text-sm text-emerald-400 flex items-center gap-1"><Check size={14} />{odooSuccess}</span>}
          </div>
          {odooTestResult && (
            <div className={`p-3 rounded-lg border text-sm ${odooTestResult.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              {odooTestResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Saldo Inicial */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3 mb-4">
          <DollarSign size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Saldo Inicial</h2>
        </div>
        <div className="flex flex-col md:flex-row items-stretch md:items-end gap-3">
          <div>
            <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Importe (CUP)</label>
            <input type="number" min={0} step="0.01" value={saldoImporte} onChange={(e) => setSaldoImporte(e.target.value)} className="w-full md:w-64 bg-page border border-border rounded-lg px-3 py-2 text-sm text-white font-mono" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => saveSaldoMut.mutate()} disabled={saveSaldoMut.isPending || !saldoImporte} className="px-5 py-2.5 bg-gold/20 text-gold rounded-lg disabled:opacity-40">{saveSaldoMut.isPending ? 'Guardando...' : 'Guardar'}</button>
            {saldoQuery.data && !showDeleteSaldo && (
              <button onClick={() => setShowDeleteSaldo(true)} className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 rounded-lg text-sm"><Trash2 size={14} />Eliminar</button>
            )}
            {showDeleteSaldo && (
              <div className="flex items-center gap-2">
                <button onClick={() => deleteSaldoMut.mutate()} className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm">Confirmar</button>
                <button onClick={() => setShowDeleteSaldo(false)} className="px-3 py-1.5 bg-white/5 text-secondary rounded-lg text-sm">Cancelar</button>
              </div>
            )}
            {saldoSuccess && <span className="text-sm text-emerald-400 flex items-center gap-1"><Check size={14} />{saldoSuccess}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════
// SEDES TAB
// ══════════════════════════════════════════

interface Sede {
  id: number; prefix: string; name: string; token: string; secret: string; active: boolean; createdAt: string
}

function SedesTab() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newPrefix, setNewPrefix] = useState('')
  const [newName, setNewName] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Sede | null>(null)
  const [showSecret, setShowSecret] = useState(false)

  const { data: sedes, isLoading } = useQuery({
    queryKey: ['sedes'],
    queryFn: async (): Promise<Sede[]> => { const r = await apiFetch('/api/sedes'); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() },
  })

  const createMut = useMutation({
    mutationFn: async (data: { prefix: string; name: string }) => {
      const r = await apiFetch('/api/sedes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      return r.json()
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sedes'] }); setShowCreate(false); setNewPrefix(''); setNewName('') },
  })

  const regenTokenMut = useMutation({
    mutationFn: async (id: number) => { const r = await apiFetch(`/api/sedes/${id}/regenerar-token`, { method: 'POST' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<Sede> },
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['sedes'] }); setDetail(data) },
  })

  const regenSecretMut = useMutation({
    mutationFn: async (id: number) => { const r = await apiFetch(`/api/sedes/${id}/regenerar-secret`, { method: 'POST' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<Sede> },
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['sedes'] }); setDetail(data) },
  })

  async function handleExpand(id: number) {
    if (expandedId === id) { setExpandedId(null); setDetail(null); setShowSecret(false); return }
    setExpandedId(id); setShowSecret(false)
    try { const r = await apiFetch(`/api/sedes/${id}`); setDetail(r.ok ? await r.json() : null) } catch { setDetail(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-secondary text-sm">Cada sede tiene un prefijo único, token y secreto para sincronización.</p>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/10 text-gold hover:bg-gold/20 text-sm">
          <Plus size={14} />Nueva Sede
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-end gap-4">
            <div>
              <label className="text-xs text-tertiary block mb-1">Prefijo</label>
              <input type="text" value={newPrefix} onChange={(e) => setNewPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="L1" className="px-3 py-2 rounded-lg bg-page border border-border text-white font-mono w-20" maxLength={10} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-tertiary block mb-1">Nombre</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="POS Mayorista" className="px-3 py-2 rounded-lg bg-page border border-border text-white w-full" />
            </div>
            <button onClick={() => createMut.mutate({ prefix: newPrefix, name: newName })} disabled={!newPrefix || !newName || createMut.isPending} className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50">
              {createMut.isPending ? 'Creando...' : 'Crear'}
            </button>
          </div>
          {createMut.isError && <p className="text-red-400 text-sm mt-2">{(createMut.error as Error).message}</p>}
        </div>
      )}

      {isLoading ? (
        <div className="text-secondary animate-pulse py-10 text-center">Cargando sedes...</div>
      ) : !sedes?.length ? (
        <div className="text-center py-10 text-tertiary">No hay sedes. Crea la primera.</div>
      ) : (
        sedes.map(s => (
          <div key={s.id} className={`rounded-xl border bg-surface ${s.active ? 'border-border' : 'border-red-500/20 bg-red-500/5'}`}>
            <button onClick={() => handleExpand(s.id)} className="w-full flex items-center justify-between p-4 text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                  <Building2 size={18} className="text-gold" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-gold">{s.prefix}</span>
                    <span className="text-white font-medium">{s.name}</span>
                    {!s.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">Inactiva</span>}
                  </div>
                  <span className="text-tertiary text-xs">Token: {s.token}</span>
                </div>
              </div>
              <span className="text-tertiary text-xs">{expandedId === s.id ? '▲' : '▼'}</span>
            </button>

            {expandedId === s.id && detail && (
              <div className="px-4 pb-4 border-t border-border pt-3">
                <p className="text-white text-sm font-medium mb-3">Copiar a configuración de Odoo local:</p>
                <div className="space-y-3 rounded-lg bg-page p-4">
                  <CredentialRow label="Prefijo Sede" value={detail.prefix} />
                  <CredentialRow label="Token GT Central" value={detail.token}>
                    <button onClick={() => { if (confirm('¿Regenerar token?')) regenTokenMut.mutate(s.id) }} className="p-1 rounded text-yellow-400 hover:bg-yellow-500/10" title="Regenerar"><RefreshCw size={12} /></button>
                  </CredentialRow>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <span className="text-tertiary text-xs block">Secreto HMAC</span>
                      <span className="text-white font-mono text-xs break-all">{showSecret ? detail.secret : '••••••••••••••••'}</span>
                    </div>
                    <div className="flex items-center gap-1 ml-3 shrink-0">
                      <button onClick={() => setShowSecret(!showSecret)} className="p-1 rounded text-tertiary hover:text-white">{showSecret ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                      <CopyBtn value={detail.secret} />
                      <button onClick={() => { if (confirm('¿Regenerar secreto?')) regenSecretMut.mutate(s.id) }} className="p-1 rounded text-yellow-400 hover:bg-yellow-500/10" title="Regenerar"><RefreshCw size={12} /></button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

function CredentialRow({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <span className="text-tertiary text-xs block">{label}</span>
        <span className="text-white font-mono text-sm break-all">{value}</span>
      </div>
      <div className="flex items-center gap-1 ml-3 shrink-0">
        <CopyBtn value={value} />
        {children}
      </div>
    </div>
  )
}

function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 2000) }} className="p-1 rounded text-secondary hover:text-white" title="Copiar">
      {ok ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  )
}

// ══════════════════════════════════════════
// MONITOR TAB
// ══════════════════════════════════════════

function MonitorTab({ setError }: { error?: string; setError: (e: string) => void }) {
  const queryClient = useQueryClient()
  const [monitorForm, setMonitorForm] = useState({
    enabled: true, interval_minutes: 5,
    telegram_bot_token: '', telegram_chat_id: '', telegram_topic_id: '', telegram_webhook_url: '',
  })
  const [monitorSuccess, setMonitorSuccess] = useState('')
  const [checkingNow, setCheckingNow] = useState(false)
  const [webhookLoading, setWebhookLoading] = useState(false)

  const monitorQuery = useQuery({
    queryKey: ['monitor-config'],
    queryFn: async () => {
      const [config, status] = await Promise.all([getMonitorConfig(), getMonitorStatus()])
      setMonitorForm({
        enabled: config.enabled, interval_minutes: config.interval_minutes,
        telegram_bot_token: config.telegram_bot_token || '', telegram_chat_id: config.telegram_chat_id || '',
        telegram_topic_id: config.telegram_topic_id ? String(config.telegram_topic_id) : '',
        telegram_webhook_url: config.telegram_webhook_url || '',
      })
      return { config, status }
    },
  })

  const webhookQuery = useQuery({ queryKey: ['webhook-info'], queryFn: getWebhookInfo, retry: false })

  const saveMonitorMut = useMutation({
    mutationFn: () => {
      const data: Partial<MonitorConfig> = {
        enabled: monitorForm.enabled, interval_minutes: monitorForm.interval_minutes,
        telegram_bot_token: monitorForm.telegram_bot_token || null, telegram_chat_id: monitorForm.telegram_chat_id || null,
        telegram_topic_id: monitorForm.telegram_topic_id ? parseInt(monitorForm.telegram_topic_id) : null,
        telegram_webhook_url: monitorForm.telegram_webhook_url || null,
      }
      return updateMonitorConfig(data)
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['monitor-config'] }); setMonitorSuccess('Guardado'); setTimeout(() => setMonitorSuccess(''), 3000) },
    onError: () => setError('Error al guardar monitor'),
  })

  const bankStatus = monitorQuery.data?.status ?? null
  const webhookInfo = webhookQuery.data ?? null

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3 mb-4">
          <Radio size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Estado BANDEC</h2>
          {bankStatus && (
            <span className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${bankStatus.online ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
              {bankStatus.online ? <Wifi size={12} /> : <WifiOff size={12} />}
              {bankStatus.online ? 'Online' : 'Offline'}
            </span>
          )}
        </div>
        {bankStatus && (
          <div className="grid grid-cols-3 gap-4 mb-4 p-3 rounded-lg bg-page border border-border text-sm">
            <div><span className="text-tertiary text-xs">Ultimo chequeo</span><p className="text-white font-mono text-xs">{bankStatus.last_check ? new Date(bankStatus.last_check).toLocaleString('es-CU') : '—'}</p></div>
            <div><span className="text-tertiary text-xs">Ultima vez online</span><p className="text-white font-mono text-xs">{bankStatus.last_online ? new Date(bankStatus.last_online).toLocaleString('es-CU') : '—'}</p></div>
            <div><span className="text-tertiary text-xs">Fecha contable</span><p className="text-white font-mono text-xs">{bankStatus.fecha_contable || '—'}</p></div>
          </div>
        )}
        <button onClick={async () => { setCheckingNow(true); try { await forceCheck(); queryClient.invalidateQueries({ queryKey: ['monitor-config'] }) } catch (e: any) { setError(e.message) } finally { setCheckingNow(false) } }} disabled={checkingNow} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/10 border border-gold/30 text-gold text-sm disabled:opacity-50">
          <RefreshCw size={14} className={checkingNow ? 'animate-spin' : ''} />
          {checkingNow ? 'Chequeando...' : 'Forzar chequeo'}
        </button>
      </div>

      {/* Config */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="font-headline text-lg font-semibold text-white mb-4">Configuracion del Monitor</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><label className="text-sm text-white">Monitoreo automatico</label><p className="text-xs text-tertiary">Chequea si el banco esta disponible</p></div>
            <button onClick={() => setMonitorForm(f => ({ ...f, enabled: !f.enabled }))} className={`relative w-11 h-6 rounded-full transition-colors ${monitorForm.enabled ? 'bg-gold' : 'bg-white/10'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${monitorForm.enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          <div>
            <label className="block text-xs text-tertiary uppercase mb-1.5"><Clock size={12} className="inline mr-1" />Intervalo (min)</label>
            <input type="number" min={1} value={monitorForm.interval_minutes} onChange={(e) => setMonitorForm(f => ({ ...f, interval_minutes: parseInt(e.target.value) || 5 }))} className="w-32 bg-page border border-border rounded-lg px-3 py-2 text-sm text-white" />
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-sm text-white font-medium mb-3 flex items-center gap-1.5"><Send size={14} className="text-gold" />Telegram</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-xs text-tertiary uppercase mb-1.5">Bot Token</label><input type="text" value={monitorForm.telegram_bot_token} onChange={(e) => setMonitorForm(f => ({ ...f, telegram_bot_token: e.target.value }))} className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white font-mono" /></div>
              <div><label className="block text-xs text-tertiary uppercase mb-1.5">Chat ID</label><input type="text" value={monitorForm.telegram_chat_id} onChange={(e) => setMonitorForm(f => ({ ...f, telegram_chat_id: e.target.value }))} className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white font-mono" /></div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-tertiary uppercase mb-1.5">Topic ID (opcional)</label>
              <input type="text" value={monitorForm.telegram_topic_id} onChange={(e) => setMonitorForm(f => ({ ...f, telegram_topic_id: e.target.value }))} className="w-full md:w-64 bg-page border border-border rounded-lg px-3 py-2 text-sm text-white font-mono" />
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-sm text-white font-medium mb-2 flex items-center gap-1.5">
                <Link size={14} className="text-gold" />Webhook
                {webhookInfo && <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${webhookInfo.registered ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-tertiary'}`}>{webhookInfo.registered ? 'Activo' : 'Inactivo'}</span>}
              </h4>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-tertiary uppercase mb-1.5">URL del servidor</label>
                  <input type="text" placeholder="https://tu-servidor.com" value={monitorForm.telegram_webhook_url} onChange={(e) => setMonitorForm(f => ({ ...f, telegram_webhook_url: e.target.value }))} className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white font-mono" />
                </div>
                {webhookInfo?.registered ? (
                  <button onClick={async () => { setWebhookLoading(true); try { await unregisterWebhook(); queryClient.invalidateQueries({ queryKey: ['webhook-info'] }) } catch (e: any) { setError(e.message) } finally { setWebhookLoading(false) } }} disabled={webhookLoading} className="flex items-center gap-2 px-4 py-2 bg-red-500/15 text-red-400 rounded-lg text-sm whitespace-nowrap"><Unlink size={14} />{webhookLoading ? '...' : 'Desregistrar'}</button>
                ) : (
                  <button onClick={async () => { setWebhookLoading(true); try { if (monitorForm.telegram_webhook_url) await updateMonitorConfig({ telegram_webhook_url: monitorForm.telegram_webhook_url }); await registerWebhook(); queryClient.invalidateQueries({ queryKey: ['webhook-info'] }) } catch (e: any) { setError(e.message) } finally { setWebhookLoading(false) } }} disabled={webhookLoading || !monitorForm.telegram_bot_token || !monitorForm.telegram_webhook_url} className="flex items-center gap-2 px-4 py-2 bg-gold/15 text-gold rounded-lg text-sm disabled:opacity-40 whitespace-nowrap"><Link size={14} />{webhookLoading ? '...' : 'Registrar'}</button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => saveMonitorMut.mutate()} disabled={saveMonitorMut.isPending} className="px-5 py-2.5 bg-gold/20 text-gold rounded-lg disabled:opacity-40">{saveMonitorMut.isPending ? 'Guardando...' : 'Guardar'}</button>
            {monitorSuccess && <span className="text-sm text-emerald-400 flex items-center gap-1"><Check size={14} />{monitorSuccess}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════
// SCRAPING TAB
// ══════════════════════════════════════════

function ScrapingTab({ setError }: { error?: string; setError: (e: string) => void }) {
  const [scrapeMonth, setScrapeMonth] = useState(new Date().getMonth() + 1)
  const [scrapeYear, setScrapeYear] = useState(new Date().getFullYear())
  const [scrapeResult, setScrapeResult] = useState('')

  const scrapeMut = useMutation({
    mutationFn: () => triggerScrape(scrapeMonth, scrapeYear),
    onSuccess: (result) => setScrapeResult(result.message),
    onError: (e: any) => setError(e.message),
  })

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="flex items-center gap-3 mb-4">
        <Download size={20} className="text-gold" />
        <h2 className="font-headline text-lg font-semibold text-white">Scraping Manual</h2>
      </div>
      <p className="text-sm text-secondary mb-4">Ejecutar scraping de transferencias para un mes completo.</p>
      <div className="flex flex-col md:flex-row items-stretch md:items-end gap-3">
        <div>
          <label className="block text-xs text-tertiary uppercase mb-1.5">Mes</label>
          <select value={scrapeMonth} onChange={(e) => setScrapeMonth(parseInt(e.target.value))} className="w-full md:w-auto bg-page border border-border rounded-lg px-3 py-2 text-sm text-white">
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('es', { month: 'long' })}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-tertiary uppercase mb-1.5">Ano</label>
          <input type="number" min={2020} value={scrapeYear} onChange={(e) => setScrapeYear(parseInt(e.target.value) || new Date().getFullYear())} className="w-full md:w-24 bg-page border border-border rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <button onClick={() => scrapeMut.mutate()} disabled={scrapeMut.isPending} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gold/20 text-gold rounded-lg disabled:opacity-40 w-full md:w-auto">
          <Download size={14} />{scrapeMut.isPending ? 'Scrapeando...' : 'Ejecutar'}
        </button>
      </div>
      {scrapeResult && <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">{scrapeResult}</div>}
    </div>
  )
}
