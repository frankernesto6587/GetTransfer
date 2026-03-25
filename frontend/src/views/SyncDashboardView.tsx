import { useQuery } from '@tanstack/react-query'
import { Activity, Server, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { syncMetricsQuery } from '../lib/api'

export function SyncDashboardView() {
  const { data, isLoading, isFetching } = useQuery({
    ...syncMetricsQuery(),
    refetchInterval: 30000, // Auto-refresh every 30s
  })

  if (isLoading) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-center py-20">
          <div className="text-secondary animate-pulse">Cargando métricas de sincronización...</div>
        </div>
      </div>
    )
  }

  // Process sede data
  const sedeMap = new Map<string, { events: number; lastSync: string | null; solicitudes: Record<string, number>; monto: Record<string, number> }>()

  for (const e of data?.events ?? []) {
    if (!sedeMap.has(e.sedeId)) {
      sedeMap.set(e.sedeId, { events: 0, lastSync: null, solicitudes: {}, monto: {} })
    }
    const s = sedeMap.get(e.sedeId)!
    s.events = e._count
    s.lastSync = e._max?.receivedAt || null
  }

  for (const b of data?.bySede ?? []) {
    if (!sedeMap.has(b.sedeId)) {
      sedeMap.set(b.sedeId, { events: 0, lastSync: null, solicitudes: {}, monto: {} })
    }
    const s = sedeMap.get(b.sedeId)!
    s.solicitudes[b.workflowStatus] = b._count
    s.monto[b.workflowStatus] = Number(b._sum?.monto ?? 0)
  }

  // Global stats
  const globalStats = {
    totalSolicitudes: 0,
    claimed: 0,
    pending: 0,
    cancelled: 0,
    matched: 0,
    unmatched: 0,
  }
  for (const s of data?.solicitudes ?? []) {
    globalStats.totalSolicitudes += s._count
    if (s.workflowStatus === 'claimed') globalStats.claimed += s._count
    if (s.workflowStatus === 'pending') globalStats.pending += s._count
    if (s.workflowStatus === 'cancelled') globalStats.cancelled += s._count
    if (s.reconStatus === 'matched') globalStats.matched += s._count
    if (s.reconStatus === 'unmatched') globalStats.unmatched += s._count
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Sincronización</h1>
        <p className="text-secondary mt-1">
          Estado de sync de sedes con GT central
          {isFetching && <span className="ml-2 text-gold text-xs">(actualizando...)</span>}
        </p>
      </div>

      {/* Global cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Activity} label="Total solicitudes" value={globalStats.totalSolicitudes} />
        <StatCard icon={Clock} label="Pendientes" value={globalStats.pending} color="text-blue-400" />
        <StatCard icon={CheckCircle} label="Conciliadas" value={globalStats.matched} color="text-emerald-400" />
        <StatCard icon={AlertTriangle} label="Sin conciliar" value={globalStats.unmatched} color="text-yellow-400" />
      </div>

      {/* Sede cards */}
      <h2 className="font-headline text-lg font-semibold text-white mb-4">Sedes</h2>
      {sedeMap.size === 0 ? (
        <div className="text-center py-10 text-tertiary">No hay datos de sedes. Las sedes aparecerán cuando sincronicen.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from(sedeMap.entries()).map(([sedeId, info]) => {
            const total = Object.values(info.solicitudes).reduce((a, b) => a + b, 0)
            const lastSync = info.lastSync ? new Date(info.lastSync) : null
            const minutesAgo = lastSync ? Math.round((Date.now() - lastSync.getTime()) / 60000) : null
            const isStale = minutesAgo !== null && minutesAgo > 30

            return (
              <div key={sedeId} className={`rounded-xl border p-5 ${isStale ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border bg-surface'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Server size={16} className={isStale ? 'text-yellow-400' : 'text-emerald-400'} />
                    <span className="font-headline font-bold text-white text-lg">{sedeId}</span>
                  </div>
                  {isStale && <AlertTriangle size={14} className="text-yellow-400" />}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-tertiary">Solicitudes</span>
                    <span className="text-white font-mono">{total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Pendientes</span>
                    <span className="text-blue-400 font-mono">{info.solicitudes.pending || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Reclamadas</span>
                    <span className="text-emerald-400 font-mono">{info.solicitudes.claimed || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Eventos recibidos</span>
                    <span className="text-white font-mono">{info.events}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Último sync</span>
                    <span className={`font-mono text-xs ${isStale ? 'text-yellow-400' : 'text-secondary'}`}>
                      {lastSync
                        ? `hace ${minutesAgo} min`
                        : 'Nunca'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color = 'text-white' }: { icon: typeof Activity; label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-tertiary" />
        <span className="text-tertiary text-xs">{label}</span>
      </div>
      <span className={`font-mono text-2xl font-bold ${color}`}>{value.toLocaleString('es-CU')}</span>
    </div>
  )
}
