import { useState, useEffect } from 'react'
import { Key, RefreshCw, Copy, Check, Trash2, AlertCircle, Radio, Clock, Send, Download, Wifi, WifiOff, Link, Unlink, Server, Plug } from 'lucide-react'
import { getActiveToken, generateToken, deleteToken, getMonitorConfig, updateMonitorConfig, getMonitorStatus, triggerScrape, forceCheck, getWebhookInfo, registerWebhook, unregisterWebhook, getOdooConfig, updateOdooConfig, testOdooConnection } from '../lib/api'
import type { ApiToken, MonitorConfig, BankStatus, WebhookInfo } from '../types'

export function ConfigView() {
  const [token, setToken] = useState<ApiToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState<'regenerate' | 'delete' | null>(null)
  const [tokenName, setTokenName] = useState('')

  // Monitor state
  const [, setMonitorConfig] = useState<MonitorConfig | null>(null)
  const [bankStatus, setBankStatus] = useState<BankStatus | null>(null)
  const [monitorForm, setMonitorForm] = useState({
    enabled: true,
    interval_minutes: 5,
    telegram_bot_token: '',
    telegram_chat_id: '',
    telegram_topic_id: '',
    telegram_webhook_url: '',
  })
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [checkingNow, setCheckingNow] = useState(false)
  const [savingMonitor, setSavingMonitor] = useState(false)
  const [monitorSuccess, setMonitorSuccess] = useState('')
  const [scrapeMonth, setScrapeMonth] = useState(new Date().getMonth() + 1)
  const [scrapeYear, setScrapeYear] = useState(new Date().getFullYear())
  const [scraping, setScraping] = useState(false)
  const [scrapeResult, setScrapeResult] = useState('')

  // Odoo config state
  const [odooForm, setOdooForm] = useState({ api_url: '', api_key: '' })
  const [savingOdoo, setSavingOdoo] = useState(false)
  const [odooSuccess, setOdooSuccess] = useState('')
  const [testingOdoo, setTestingOdoo] = useState(false)
  const [odooTestResult, setOdooTestResult] = useState<{ ok: boolean; message: string } | null>(null)

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

  const fetchMonitor = async () => {
    try {
      const [config, status] = await Promise.all([getMonitorConfig(), getMonitorStatus()])
      setMonitorConfig(config)
      setBankStatus(status)
      setMonitorForm({
        enabled: config.enabled,
        interval_minutes: config.interval_minutes,
        telegram_bot_token: config.telegram_bot_token || '',
        telegram_chat_id: config.telegram_chat_id || '',
        telegram_topic_id: config.telegram_topic_id ? String(config.telegram_topic_id) : '',
        telegram_webhook_url: config.telegram_webhook_url || '',
      })
      try {
        const whInfo = await getWebhookInfo()
        setWebhookInfo(whInfo)
      } catch { /* no webhook info */ }
    } catch {
      // Monitor not available
    }
  }

  const handleSaveMonitor = async () => {
    setSavingMonitor(true)
    setError('')
    setMonitorSuccess('')
    try {
      const data: Partial<MonitorConfig> = {
        enabled: monitorForm.enabled,
        interval_minutes: monitorForm.interval_minutes,
        telegram_bot_token: monitorForm.telegram_bot_token || null,
        telegram_chat_id: monitorForm.telegram_chat_id || null,
        telegram_topic_id: monitorForm.telegram_topic_id ? parseInt(monitorForm.telegram_topic_id) : null,
        telegram_webhook_url: monitorForm.telegram_webhook_url || null,
      }
      const updated = await updateMonitorConfig(data)
      setMonitorConfig(updated)
      setMonitorSuccess('Configuracion guardada')
      setTimeout(() => setMonitorSuccess(''), 3000)
    } catch {
      setError('Error al guardar configuracion del monitor')
    } finally {
      setSavingMonitor(false)
    }
  }

  const handleScrape = async () => {
    setScraping(true)
    setScrapeResult('')
    setError('')
    try {
      const result = await triggerScrape(scrapeMonth, scrapeYear)
      setScrapeResult(result.message)
    } catch (err: any) {
      setError(err.message || 'Error en scraping')
    } finally {
      setScraping(false)
    }
  }

  const fetchOdooConfig = async () => {
    try {
      const config = await getOdooConfig()
      setOdooForm({ api_url: config.api_url || '', api_key: config.api_key || '' })
    } catch {
      // Odoo config not available yet
    }
  }

  const handleSaveOdoo = async () => {
    setSavingOdoo(true)
    setError('')
    setOdooSuccess('')
    try {
      await updateOdooConfig(odooForm)
      setOdooSuccess('Configuracion guardada')
      setTimeout(() => setOdooSuccess(''), 3000)
    } catch {
      setError('Error al guardar configuracion de Odoo')
    } finally {
      setSavingOdoo(false)
    }
  }

  const handleTestOdoo = async () => {
    setTestingOdoo(true)
    setOdooTestResult(null)
    try {
      const result = await testOdooConnection(odooForm)
      setOdooTestResult(result)
    } catch (err: any) {
      setOdooTestResult({ ok: false, message: err.message || 'Error de conexion' })
    } finally {
      setTestingOdoo(false)
    }
  }

  useEffect(() => { fetchToken(); fetchMonitor(); fetchOdooConfig() }, [])

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
      <div className="rounded-xl border border-border bg-surface/50 p-6 mb-6">
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

      {/* Odoo API Config Section */}
      <div className="rounded-xl border border-border bg-surface p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <Server size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Conexion Odoo API</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">URL de la API Odoo</label>
            <input
              type="text"
              placeholder="http://192.168.1.86:8000"
              value={odooForm.api_url}
              onChange={(e) => setOdooForm(f => ({ ...f, api_url: e.target.value }))}
              className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">API Key de Odoo</label>
            <input
              type="password"
              placeholder="API Key para autenticacion"
              value={odooForm.api_key}
              onChange={(e) => setOdooForm(f => ({ ...f, api_key: e.target.value }))}
              className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors font-mono"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveOdoo}
              disabled={savingOdoo}
              className="flex items-center gap-2 px-5 py-2.5 bg-gold/20 text-gold rounded-lg hover:bg-gold/30 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {savingOdoo ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={handleTestOdoo}
              disabled={testingOdoo || !odooForm.api_url}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 text-secondary rounded-lg hover:bg-white/10 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Plug size={14} />
              {testingOdoo ? 'Probando...' : 'Probar Conexion'}
            </button>
            {odooSuccess && (
              <span className="flex items-center gap-1 text-sm text-emerald-400">
                <Check size={14} />
                {odooSuccess}
              </span>
            )}
          </div>

          {odooTestResult && (
            <div className={`p-3 rounded-lg border text-sm ${
              odooTestResult.ok
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              {odooTestResult.ok ? <Check size={14} className="inline mr-1" /> : <AlertCircle size={14} className="inline mr-1" />}
              {odooTestResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Monitor BANDEC Section */}
      <div className="rounded-xl border border-border bg-surface p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <Radio size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Monitor BANDEC</h2>
          {bankStatus && (
            <span className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              bankStatus.online
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-red-500/15 text-red-400'
            }`}>
              {bankStatus.online ? <Wifi size={12} /> : <WifiOff size={12} />}
              {bankStatus.online ? 'Online' : 'Offline'}
            </span>
          )}
        </div>

        {/* Bank Status */}
        {bankStatus && (
          <div className="grid grid-cols-3 gap-4 mb-6 p-4 rounded-lg bg-page border border-border">
            <div>
              <span className="text-xs text-tertiary uppercase tracking-wider">Ultimo chequeo</span>
              <p className="text-sm text-white font-mono mt-0.5">
                {bankStatus.last_check ? new Date(bankStatus.last_check).toLocaleString('es-CU') : '—'}
              </p>
            </div>
            <div>
              <span className="text-xs text-tertiary uppercase tracking-wider">Ultima vez online</span>
              <p className="text-sm text-white font-mono mt-0.5">
                {bankStatus.last_online ? new Date(bankStatus.last_online).toLocaleString('es-CU') : '—'}
              </p>
            </div>
            <div>
              <span className="text-xs text-tertiary uppercase tracking-wider">Fecha contable</span>
              <p className="text-sm text-white font-mono mt-0.5">
                {bankStatus.fecha_contable || '—'}
              </p>
            </div>
          </div>
        )}

        {/* Force Check Button */}
        <div className="mb-6">
          <button
            onClick={async () => {
              setCheckingNow(true)
              setError('')
              try {
                const result = await forceCheck()
                setBankStatus({
                  online: result.online,
                  last_check: new Date().toISOString(),
                  last_online: result.online ? new Date().toISOString() : (bankStatus?.last_online || null),
                  fecha_contable: result.fecha_contable,
                })
                setMonitorSuccess(result.message)
                setTimeout(() => setMonitorSuccess(''), 5000)
              } catch (err: any) {
                setError(err.message)
              } finally {
                setCheckingNow(false)
              }
            }}
            disabled={checkingNow}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/10 border border-gold/30 text-gold text-sm font-medium hover:bg-gold/20 transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={checkingNow ? 'animate-spin' : ''} />
            {checkingNow ? 'Chequeando...' : 'Forzar chequeo ahora'}
          </button>
        </div>

        {/* Monitor Config */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-white">Monitoreo automatico</label>
              <p className="text-xs text-tertiary">Chequea periodicamente si el banco esta disponible</p>
            </div>
            <button
              onClick={() => setMonitorForm(f => ({ ...f, enabled: !f.enabled }))}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                monitorForm.enabled ? 'bg-gold' : 'bg-white/10'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                monitorForm.enabled ? 'translate-x-5' : ''
              }`} />
            </button>
          </div>

          <div>
            <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">
              <Clock size={12} className="inline mr-1" />
              Intervalo (minutos)
            </label>
            <input
              type="number"
              min={1}
              value={monitorForm.interval_minutes}
              onChange={(e) => setMonitorForm(f => ({ ...f, interval_minutes: parseInt(e.target.value) || 5 }))}
              className="w-32 bg-page border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-sm text-white font-medium mb-3 flex items-center gap-1.5">
              <Send size={14} className="text-gold" />
              Notificaciones Telegram
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Bot Token</label>
                <input
                  type="text"
                  placeholder="123456:ABC-DEF..."
                  value={monitorForm.telegram_bot_token}
                  onChange={(e) => setMonitorForm(f => ({ ...f, telegram_bot_token: e.target.value }))}
                  className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Chat ID</label>
                <input
                  type="text"
                  placeholder="-1001234567890"
                  value={monitorForm.telegram_chat_id}
                  onChange={(e) => setMonitorForm(f => ({ ...f, telegram_chat_id: e.target.value }))}
                  className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors font-mono"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Topic ID (opcional)</label>
              <input
                type="text"
                placeholder="Para temas de supergrupos"
                value={monitorForm.telegram_topic_id}
                onChange={(e) => setMonitorForm(f => ({ ...f, telegram_topic_id: e.target.value }))}
                className="w-64 bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors font-mono"
              />
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-sm text-white font-medium mb-2 flex items-center gap-1.5">
                <Link size={14} className="text-gold" />
                Webhook
                {webhookInfo && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    webhookInfo.registered ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-tertiary'
                  }`}>
                    {webhookInfo.registered ? 'Activo' : 'Inactivo'}
                  </span>
                )}
              </h4>
              <p className="text-xs text-tertiary mb-3">
                URL publica de este servidor. Los comandos /setchat y /settopic configuran chat y tema desde Telegram.
              </p>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">URL del servidor</label>
                  <input
                    type="text"
                    placeholder="https://tu-servidor.com"
                    value={monitorForm.telegram_webhook_url}
                    onChange={(e) => setMonitorForm(f => ({ ...f, telegram_webhook_url: e.target.value }))}
                    className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors font-mono"
                  />
                </div>
                {webhookInfo?.registered ? (
                  <div className="flex gap-2">
                    {webhookInfo.bot_username && (
                      <button
                        onClick={() => window.open(`https://t.me/${webhookInfo.bot_username}?startgroup=true`, '_blank')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500/15 text-blue-400 rounded-lg hover:bg-blue-500/25 transition-colors cursor-pointer text-sm whitespace-nowrap"
                      >
                        <Send size={14} />
                        Agregar a grupo
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        setWebhookLoading(true)
                        setError('')
                        try {
                          await unregisterWebhook()
                          setWebhookInfo({ registered: false, url: null, bot_username: null })
                          setMonitorSuccess('Webhook desregistrado')
                          setTimeout(() => setMonitorSuccess(''), 3000)
                        } catch (err: any) {
                          setError(err.message)
                        } finally {
                          setWebhookLoading(false)
                        }
                      }}
                      disabled={webhookLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500/15 text-red-400 rounded-lg hover:bg-red-500/25 transition-colors cursor-pointer text-sm whitespace-nowrap"
                    >
                      <Unlink size={14} />
                      {webhookLoading ? '...' : 'Desregistrar'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      // Open window immediately on user click to avoid popup blocker
                      const popup = window.open('about:blank', '_blank')
                      setWebhookLoading(true)
                      setError('')
                      try {
                        // Save config first if webhook URL changed
                        if (monitorForm.telegram_webhook_url) {
                          await updateMonitorConfig({ telegram_webhook_url: monitorForm.telegram_webhook_url })
                        }
                        const result = await registerWebhook() as { ok: boolean; webhook_url?: string; bot_username?: string }
                        console.log('registerWebhook result:', result)
                        const botUsername = result.bot_username || null
                        setWebhookInfo({ registered: true, url: result.webhook_url || null, bot_username: botUsername })
                        // Navigate the already-opened window to the Telegram link
                        if (botUsername && popup) {
                          popup.location.href = `https://t.me/${botUsername}?startgroup=true`
                        } else if (popup) {
                          popup.close()
                        }
                        setMonitorSuccess('Webhook registrado')
                        setTimeout(() => setMonitorSuccess(''), 3000)
                      } catch (err: any) {
                        if (popup) popup.close()
                        setError(err.message)
                      } finally {
                        setWebhookLoading(false)
                      }
                    }}
                    disabled={webhookLoading || !monitorForm.telegram_bot_token || !monitorForm.telegram_webhook_url}
                    className="flex items-center gap-2 px-4 py-2 bg-gold/15 text-gold rounded-lg hover:bg-gold/25 transition-colors cursor-pointer text-sm disabled:opacity-40 whitespace-nowrap"
                  >
                    <Link size={14} />
                    {webhookLoading ? '...' : 'Registrar'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveMonitor}
              disabled={savingMonitor}
              className="flex items-center gap-2 px-5 py-2.5 bg-gold/20 text-gold rounded-lg hover:bg-gold/30 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {savingMonitor ? 'Guardando...' : 'Guardar Configuracion'}
            </button>
            {monitorSuccess && (
              <span className="flex items-center gap-1 text-sm text-emerald-400">
                <Check size={14} />
                {monitorSuccess}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Scraping Manual */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3 mb-4">
          <Download size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Scraping Manual</h2>
        </div>
        <p className="text-sm text-secondary mb-4">Ejecutar scraping de transferencias para un mes completo.</p>

        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Mes</label>
            <select
              value={scrapeMonth}
              onChange={(e) => setScrapeMonth(parseInt(e.target.value))}
              className="bg-page border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i).toLocaleString('es', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Ano</label>
            <input
              type="number"
              min={2020}
              value={scrapeYear}
              onChange={(e) => setScrapeYear(parseInt(e.target.value) || new Date().getFullYear())}
              className="w-24 bg-page border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>
          <button
            onClick={handleScrape}
            disabled={scraping}
            className="flex items-center gap-2 px-5 py-2.5 bg-gold/20 text-gold rounded-lg hover:bg-gold/30 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Download size={14} />
            {scraping ? 'Scrapeando...' : 'Ejecutar'}
          </button>
        </div>

        {scrapeResult && (
          <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">
            {scrapeResult}
          </div>
        )}
      </div>
    </div>
  )
}
