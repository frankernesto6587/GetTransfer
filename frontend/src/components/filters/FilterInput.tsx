import { X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface FilterInputProps {
  icon: LucideIcon
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  className?: string
}

export function FilterInput({
  icon: Icon,
  label,
  value,
  onChange,
  type = 'text',
  className = '',
}: FilterInputProps) {
  return (
    <div className={`relative group ${className}`}>
      <Icon
        size={14}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none"
      />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        className="peer w-full bg-page border border-border rounded-lg pl-8 pr-7 pt-3.5 pb-1 text-xs text-white focus:outline-none focus:border-gold/50 transition-colors [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
      />
      <label className="absolute left-8 top-1/2 -translate-y-1/2 text-tertiary text-xs pointer-events-none transition-all duration-150 peer-focus:top-2 peer-focus:text-[10px] peer-focus:text-gold peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:text-secondary">
        {label}
      </label>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-tertiary hover:text-white transition-colors cursor-pointer"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
