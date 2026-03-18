import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string
  delta?: string
  icon: LucideIcon
  highlight?: boolean
}

export function MetricCard({
  label,
  value,
  delta,
  icon: Icon,
  highlight,
}: MetricCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        highlight
          ? 'bg-gold-dim border-gold/30'
          : 'bg-surface border-border'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-secondary">{label}</span>
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            highlight ? 'bg-gold/20' : 'bg-white/5'
          }`}
        >
          <Icon
            size={18}
            className={highlight ? 'text-gold' : 'text-secondary'}
          />
        </div>
      </div>
      <p className="font-mono text-lg md:text-2xl font-medium text-white truncate">{value}</p>
      {delta ? (
        <p className="text-xs text-secondary mt-1">{delta}</p>
      ) : null}
    </div>
  )
}
