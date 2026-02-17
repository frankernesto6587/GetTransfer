import { Search } from 'lucide-react'
import type { Transferencia } from '../types'

interface TransferTableProps {
  data: Transferencia[]
  search: string
  onSearchChange: (value: string) => void
}

function canalBadge(canal: string) {
  if (!canal) return null

  const colors: Record<string, string> = {
    TRANSFERMOVIL: 'bg-emerald-500/15 text-emerald-400',
    ENZONA: 'bg-blue-500/15 text-blue-400',
    ATM: 'bg-amber-500/15 text-amber-400',
  }

  const key = canal.toUpperCase()
  const colorClass =
    Object.entries(colors).find(([k]) => key.includes(k))?.[1] ??
    'bg-white/10 text-secondary'

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
      {canal}
    </span>
  )
}

export function TransferTable({
  data,
  search,
  onSearchChange,
}: TransferTableProps) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h3 className="font-headline text-lg font-semibold text-white">
          Transferencias Recientes
        </h3>
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary"
          />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-page border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 w-64 transition-colors"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-tertiary uppercase tracking-wider px-6 py-3">
                Fecha
              </th>
              <th className="text-left text-xs font-medium text-tertiary uppercase tracking-wider px-6 py-3">
                Ref Origen
              </th>
              <th className="text-left text-xs font-medium text-tertiary uppercase tracking-wider px-6 py-3">
                Ordenante
              </th>
              <th className="text-left text-xs font-medium text-tertiary uppercase tracking-wider px-6 py-3">
                Canal
              </th>
              <th className="text-right text-xs font-medium text-tertiary uppercase tracking-wider px-6 py-3">
                Importe
              </th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-secondary">
                  No se encontraron transferencias
                </td>
              </tr>
            ) : (
              data.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-6 py-3 font-mono text-secondary">
                    {t.fecha}
                  </td>
                  <td className="px-6 py-3 font-mono text-secondary">
                    {t.refOrigen}
                  </td>
                  <td className="px-6 py-3 text-white">
                    {t.nombreOrdenante || '—'}
                  </td>
                  <td className="px-6 py-3">{canalBadge(t.canalEmision)}</td>
                  <td className="px-6 py-3 text-right font-mono text-white">
                    ${t.importe.toLocaleString('es-CU', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
