import { useState, useCallback } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Calendar } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { FilterBar, FilterDateRange, DatePresets, type DatePresetKey } from '../components/filters'
import { dashboardQuery } from '../lib/api'
import { displayFecha, formatCurrency } from '../components/TransferShared'
import { MatchDetailModal } from '../components/MatchDetailModal'
import type { MatchedTransfer } from '../types'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const MATCH_TYPE_COLORS: Record<string, string> = {
  CONFIRMED_AUTO: 'bg-emerald-500/15 text-emerald-400',
  CONFIRMED_MANUAL_REF_ACCOUNT_CI: 'bg-blue-500/15 text-blue-400',
  CONFIRMED_MANUAL_CI_ACCOUNT_DATE: 'bg-blue-500/15 text-blue-400',
  CONFIRMED_MANUAL_CI: 'bg-cyan-500/15 text-cyan-400',
  CONFIRMED_MANUAL_ACCOUNT: 'bg-cyan-500/15 text-cyan-400',
  CONFIRMED_MANUAL_NAME_DATE: 'bg-cyan-500/15 text-cyan-400',
  CONFIRMED_DEPOSIT: 'bg-violet-500/15 text-violet-400',
  CONFIRMED_BUY: 'bg-amber-500/15 text-amber-400',
  REVIEW_REQUIRED: 'bg-rose-500/15 text-rose-400',
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  CONFIRMED_AUTO: 'Auto',
  CONFIRMED_MANUAL_REF_ACCOUNT_CI: 'Manual L1',
  CONFIRMED_MANUAL_CI_ACCOUNT_DATE: 'Manual L2',
  CONFIRMED_MANUAL_CI: 'Manual L3',
  CONFIRMED_MANUAL_ACCOUNT: 'Manual L4',
  CONFIRMED_MANUAL_NAME_DATE: 'Manual L5',
  CONFIRMED_DEPOSIT: 'Deposito',
  CONFIRMED_BUY: 'Compra',
  REVIEW_REQUIRED: 'Revision',
}

function MatchTypeBadge({ matchType, conciliadaPor, matchNivel }: { matchType: string | null; conciliadaPor?: string | null; matchNivel?: number | null }) {
  if (conciliadaPor === 'auto') {
    return <span className="text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap bg-emerald-500/15 text-emerald-400">Auto</span>
  }
  if (matchNivel) {
    const nivelColors: Record<number, string> = { 1: 'bg-blue-500/15 text-blue-400', 2: 'bg-blue-500/15 text-blue-400', 3: 'bg-cyan-500/15 text-cyan-400', 4: 'bg-cyan-500/15 text-cyan-400', 5: 'bg-cyan-500/15 text-cyan-400' }
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${nivelColors[matchNivel] || 'bg-white/10 text-secondary'}`}>Manual L{matchNivel}</span>
  }
  if (!matchType) return <span className="text-tertiary">—</span>
  const colorClass = MATCH_TYPE_COLORS[matchType] || 'bg-white/10 text-secondary'
  const label = MATCH_TYPE_LABELS[matchType] || matchType
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${colorClass}`}>
      {label}
    </span>
  )
}

function formatShortDate(fecha: string) {
  const m = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return fecha
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${parseInt(m[3]!)} ${months[parseInt(m[2]!) - 1]}`
}

function formatAxisCurrency(value: number) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
  return `$${value}`
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-surface border border-border px-3 py-2 text-xs shadow-lg">
      <p className="text-white font-medium mb-1">{formatShortDate(label)}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  )
}

export function DashboardView() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<MatchedTransfer | null>(null)
  const [fechaDesde, setFechaDesde] = useState(firstOfMonth())
  const [fechaHasta, setFechaHasta] = useState(today())
  const [activePreset, setActivePreset] = useState<DatePresetKey>('month')

  const applyPreset = useCallback((preset: DatePresetKey) => {
    setActivePreset(preset)
    const t = new Date()
    switch (preset) {
      case 'today':
        setFechaDesde(today()); setFechaHasta(today())
        break
      case 'week': {
        const weekAgo = new Date(t)
        weekAgo.setDate(weekAgo.getDate() - 6)
        setFechaDesde(weekAgo.toISOString().slice(0, 10)); setFechaHasta(today())
        break
      }
      case 'month':
        setFechaDesde(firstOfMonth()); setFechaHasta(today())
        break
      case 'all':
        setFechaDesde(''); setFechaHasta('')
        break
    }
  }, [])

  const { data, isLoading } = useQuery({
    ...dashboardQuery({
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
    }),
    placeholderData: keepPreviousData,
  })

  if (isLoading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-secondary animate-pulse">Cargando datos...</div>
      </div>
    )
  }

  const gt = data?.gtTotals ?? { importe: 0, cantidad: 0, importeCreditos: 0, cantidadCreditos: 0, importeDebitos: 0, cantidadDebitos: 0 }
  const ms = data?.matchStats ?? { total: 0, auto: 0, manual: 0, deposito: 0, compra: 0, revision: 0 }
  const pend = data?.pendientes ?? { cantidad: 0, importe: 0 }
  const porDia = data?.porDia ?? []
  const recentMatches = data?.recentMatches ?? []

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-secondary mt-1">Resumen general de operaciones</p>
      </div>

      {/* Date filter */}
      <FilterBar
        activeFilterCount={0}
        onClear={() => {}}
        resultCount={gt.cantidad}
        resultLabel="transferencias"
        primaryFilters={<></>}
        dateRow={
          <>
            <Calendar size={16} className="text-tertiary shrink-0" />
            <DatePresets active={activePreset} onSelect={applyPreset} />
            <span className="text-border hidden md:inline">|</span>
            <FilterDateRange
              desde={fechaDesde}
              hasta={fechaHasta}
              onDesdeChange={(v) => { setFechaDesde(v); setActivePreset('' as DatePresetKey) }}
              onHastaChange={(v) => { setFechaHasta(v); setActivePreset('' as DatePresetKey) }}
            />
          </>
        }
      />

      {/* 3-column cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 mb-6">
        {/* GT Transfers card */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs text-tertiary uppercase tracking-wider mb-3">Transferencias GT</p>
          <p className="text-3xl font-bold text-gold mb-2">{gt.cantidad.toLocaleString('es-CU')}</p>
          <p className="text-sm text-secondary mb-3">{formatCurrency(gt.importe)} total</p>
          <div className="flex gap-4 text-xs">
            <div>
              <span className="text-emerald-400 font-medium">{gt.cantidadCreditos.toLocaleString('es-CU')}</span>
              <span className="text-tertiary ml-1">Cr</span>
              <span className="text-secondary ml-1">{formatCurrency(gt.importeCreditos)}</span>
            </div>
            <div>
              <span className="text-rose-400 font-medium">{gt.cantidadDebitos.toLocaleString('es-CU')}</span>
              <span className="text-tertiary ml-1">Db</span>
              <span className="text-secondary ml-1">{formatCurrency(gt.importeDebitos)}</span>
            </div>
          </div>
        </div>

        {/* Matches card */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs text-tertiary uppercase tracking-wider mb-3">Matches</p>
          <p className="text-3xl font-bold text-emerald-400 mb-3">{ms.total.toLocaleString('es-CU')}</p>
          <div className="flex flex-wrap gap-2">
            {ms.auto > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400">
                Auto: {ms.auto}
              </span>
            )}
            {ms.manual > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-500/15 text-blue-400">
                Manual: {ms.manual}
              </span>
            )}
            {ms.deposito > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-violet-500/15 text-violet-400">
                Deposito: {ms.deposito}
              </span>
            )}
            {ms.compra > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-400">
                Compra: {ms.compra}
              </span>
            )}
            {ms.revision > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-rose-500/15 text-rose-400">
                Revision: {ms.revision}
              </span>
            )}
          </div>
        </div>

        {/* Pendientes card */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs text-tertiary uppercase tracking-wider mb-3">Pendientes</p>
          <p className="text-3xl font-bold text-amber-400 mb-2">{pend.cantidad.toLocaleString('es-CU')}</p>
          <p className="text-sm text-secondary">{formatCurrency(pend.importe)} sin confirmar</p>
        </div>
      </div>

      {/* Chart */}
      {porDia.length > 1 && (
        <div className="rounded-xl border border-border bg-surface p-5 mb-6">
          <p className="text-xs text-tertiary uppercase tracking-wider mb-4">Monto por dia</p>
          <div className="h-[200px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={porDia} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradCreditos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradMatches" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="fecha"
                  tickFormatter={formatShortDate}
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatAxisCurrency}
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="gtCreditos"
                  name="GT Creditos"
                  stroke="#34d399"
                  fill="url(#gradCreditos)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="matchImporte"
                  name="Matches"
                  stroke="#60a5fa"
                  fill="url(#gradMatches)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded bg-emerald-400" />
              <span className="text-secondary">GT Creditos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded bg-blue-400" />
              <span className="text-secondary">Matches</span>
            </div>
          </div>
        </div>
      )}

      {/* Recent matches table */}
      {recentMatches.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-sm font-medium text-white">Ultimos Matches</p>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2 text-xs text-tertiary font-medium">Fecha</th>
                  <th className="px-4 py-2 text-xs text-tertiary font-medium">Nombre</th>
                  <th className="px-4 py-2 text-xs text-tertiary font-medium text-right">Monto</th>
                  <th className="px-4 py-2 text-xs text-tertiary font-medium">Tipo Match</th>
                  <th className="px-4 py-2 text-xs text-tertiary font-medium">Solicitud</th>
                  <th className="px-4 py-2 text-xs text-tertiary font-medium">Cliente</th>
                </tr>
              </thead>
              <tbody>
                {recentMatches.map((match) => (
                  <tr
                    key={match.id}
                    onClick={() => setSelected(match)}
                    className="border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5 text-secondary text-xs font-mono">{displayFecha(match.fecha)}</td>
                    <td className="px-4 py-2.5 text-white truncate max-w-[200px]">{match.nombreOrdenante || '—'}</td>
                    <td className="px-4 py-2.5 text-white font-mono text-right">{formatCurrency(match.importe)}</td>
                    <td className="px-4 py-2.5"><MatchTypeBadge matchType={match.matchType} conciliadaPor={(match as any).solicitud_conciliadaPor} matchNivel={(match as any).solicitud_matchNivel} /></td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-gold">{(match as any).solicitud_codigo || match.codigoConfirmacion}</span>
                    </td>
                    <td className="px-4 py-2.5 text-blue-400/80 truncate max-w-[150px]">{(match as any).solicitud_clienteNombre || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border/50">
            {recentMatches.map((match) => (
              <div
                key={match.id}
                onClick={() => setSelected(match)}
                className="px-4 py-3 space-y-1.5 active:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-secondary text-xs font-mono">{displayFecha(match.fecha)}</span>
                  <span className="font-mono text-white text-sm font-medium">{formatCurrency(match.importe)}</span>
                </div>
                <p className="text-white text-sm truncate">{match.nombreOrdenante || '—'}</p>
                <div className="flex items-center gap-2">
                  <MatchTypeBadge matchType={match.matchType} conciliadaPor={(match as any).solicitud_conciliadaPor} matchNivel={(match as any).solicitud_matchNivel} />
                  <span className="text-[10px] font-mono text-gold">{(match as any).solicitud_codigo || match.codigoConfirmacion}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <MatchDetailModal
          match={selected}
          onClose={() => setSelected(null)}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['dashboard'] })}
        />
      )}
    </div>
  )
}
