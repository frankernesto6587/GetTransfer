export type DatePresetKey = 'today' | 'week' | 'month' | 'all'

interface DatePresetsProps {
  active: DatePresetKey | ''
  onSelect: (preset: DatePresetKey) => void
}

const presets: { key: DatePresetKey; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: '7 dias' },
  { key: 'month', label: 'Este mes' },
  { key: 'all', label: 'Todo' },
]

export function DatePresets({ active, onSelect }: DatePresetsProps) {
  return (
    <div className="flex items-center gap-1 bg-page rounded-lg p-0.5">
      {presets.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            active === key
              ? 'bg-gold/20 text-gold'
              : 'text-tertiary hover:text-secondary'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
