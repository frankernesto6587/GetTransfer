import type { DiaStat } from '../types'

interface DailyChartProps {
  data: DiaStat[]
}

export function DailyChart({ data }: DailyChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <h3 className="font-headline text-lg font-semibold text-white mb-4">
          Transferencias por Día
        </h3>
        <p className="text-secondary text-sm">Sin datos disponibles</p>
      </div>
    )
  }

  const maxCantidad = Math.max(...data.map((d) => d.cantidad))

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h3 className="font-headline text-lg font-semibold text-white mb-6">
        Transferencias por Día
      </h3>
      <div className="flex items-end gap-2">
        {data.map((day) => {
          const heightPct = maxCantidad > 0 ? (day.cantidad / maxCantidad) * 100 : 0
          const barHeight = Math.max(heightPct * 1.6, 4) // max ~160px
          const label = day.fecha.slice(8) // DD from YYYY-MM-DD

          return (
            <div
              key={day.fecha}
              className="flex-1 flex flex-col items-center gap-2 min-w-0"
            >
              <span className="text-xs font-mono text-secondary">
                {day.cantidad}
              </span>
              <div
                className="w-full max-w-[32px] mx-auto rounded-t-md bg-gold/80 hover:bg-gold transition-colors cursor-default"
                style={{ height: `${barHeight}px` }}
                title={`${day.fecha}: ${day.cantidad} transferencias — $${day.total.toLocaleString('es-CU')}`}
              />
              <span className="text-xs text-tertiary font-mono">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
