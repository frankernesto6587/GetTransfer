import { ChevronDown } from 'lucide-react'

interface FilterSelectProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  allLabel?: string
  className?: string
}

export function FilterSelect({
  value,
  onChange,
  options,
  allLabel = 'Todos',
  className = '',
}: FilterSelectProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full bg-page border border-border rounded-lg pl-3 pr-7 py-2 text-xs text-white focus:outline-none focus:border-gold/50 transition-colors cursor-pointer [color-scheme:dark]"
      >
        <option value="">{allLabel}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none"
      />
    </div>
  )
}
