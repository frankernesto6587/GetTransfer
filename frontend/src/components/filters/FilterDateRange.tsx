interface FilterDateRangeProps {
  desde: string
  hasta: string
  onDesdeChange: (value: string) => void
  onHastaChange: (value: string) => void
}

export function FilterDateRange({
  desde,
  hasta,
  onDesdeChange,
  onHastaChange,
}: FilterDateRangeProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={desde}
        onChange={(e) => onDesdeChange(e.target.value)}
        className="bg-page border border-border rounded-lg px-2.5 pt-3.5 pb-1 text-xs text-white focus:outline-none focus:border-gold/50 transition-colors [color-scheme:dark]"
      />
      <span className="text-tertiary text-xs">&mdash;</span>
      <input
        type="date"
        value={hasta}
        onChange={(e) => onHastaChange(e.target.value)}
        className="bg-page border border-border rounded-lg px-2.5 pt-3.5 pb-1 text-xs text-white focus:outline-none focus:border-gold/50 transition-colors [color-scheme:dark]"
      />
    </div>
  )
}
