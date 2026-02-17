import { useQuery } from '@tanstack/react-query'
import { DollarSign, TrendingUp, ArrowLeftRight } from 'lucide-react'
import { DailyChart } from '../components/DailyChart'
import { resumenQuery } from '../lib/api'

export function ReportesView() {
  const { data: resumen, isLoading } = useQuery(resumenQuery())

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center py-20">
        <div className="text-secondary animate-pulse">Cargando reportes...</div>
      </div>
    )
  }

  const porDia = resumen?.porDia ?? []
  const totales = resumen?.totales ?? { cantidad: 0, total: 0 }
  const promedio = totales.cantidad > 0 ? totales.total / totales.cantidad : 0

  // Top 5 días por cantidad
  const topDias = [...porDia].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5)

  // Top 5 días por importe
  const topImporte = [...porDia].sort((a, b) => b.total - a.total).slice(0, 5)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold text-white">Reportes</h1>
        <p className="text-secondary mt-1">Análisis detallado de transferencias</p>
      </div>

      {/* Chart */}
      <div className="mb-8">
        <DailyChart data={porDia} />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowLeftRight size={16} className="text-gold" />
            <span className="text-sm text-secondary">Total Transferencias</span>
          </div>
          <p className="font-mono text-2xl text-white">{totales.cantidad.toLocaleString('es-CU')}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={16} className="text-gold" />
            <span className="text-sm text-secondary">Importe Total</span>
          </div>
          <p className="font-mono text-2xl text-white">${totales.total.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-gold" />
            <span className="text-sm text-secondary">Promedio por Transferencia</span>
          </div>
          <p className="font-mono text-2xl text-white">${promedio.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface p-6">
          <h3 className="font-headline text-lg font-semibold text-white mb-4">Top 5 Días por Cantidad</h3>
          <div className="space-y-3">
            {topDias.map((d, i) => (
              <div key={d.fecha} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-gold/20 text-gold text-xs flex items-center justify-center font-medium">{i + 1}</span>
                  <span className="font-mono text-sm text-secondary">{d.fecha}</span>
                </div>
                <span className="font-mono text-sm text-white">{d.cantidad} transferencias</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <h3 className="font-headline text-lg font-semibold text-white mb-4">Top 5 Días por Importe</h3>
          <div className="space-y-3">
            {topImporte.map((d, i) => (
              <div key={d.fecha} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-gold/20 text-gold text-xs flex items-center justify-center font-medium">{i + 1}</span>
                  <span className="font-mono text-sm text-secondary">{d.fecha}</span>
                </div>
                <span className="font-mono text-sm text-white">${d.total.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
