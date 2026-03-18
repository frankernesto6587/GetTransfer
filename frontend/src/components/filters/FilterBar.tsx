import { useState } from 'react'
import { RotateCcw, SlidersHorizontal, ChevronDown } from 'lucide-react'

interface FilterBarProps {
  dateRow?: React.ReactNode
  primaryFilters: React.ReactNode
  secondaryFilters?: React.ReactNode
  activeFilterCount: number
  onClear: () => void
  resultCount?: number
  resultLabel?: string
}

export function FilterBar({
  dateRow,
  primaryFilters,
  secondaryFilters,
  activeFilterCount,
  onClear,
  resultCount,
  resultLabel = 'resultados',
}: FilterBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [secondaryOpen, setSecondaryOpen] = useState(false)

  return (
    <div className="rounded-xl border border-border bg-surface mb-6">
      {/* Date row */}
      {dateRow && (
        <div className="flex flex-wrap items-center gap-3 px-4 md:px-5 py-3 border-b border-border">
          {dateRow}
        </div>
      )}

      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden flex items-center gap-2 px-4 py-3 w-full text-left text-sm text-secondary border-b border-border cursor-pointer"
      >
        <SlidersHorizontal size={16} />
        Filtros
        {activeFilterCount > 0 && (
          <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-gold/20 text-gold text-[10px] font-bold px-1">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Primary filters */}
      <div
        className={`${mobileOpen ? 'flex' : 'hidden'} md:flex flex-col md:flex-row items-stretch md:items-center gap-3 px-4 md:px-5 py-3 ${
          secondaryFilters ? '' : ''
        }`}
      >
        <div className="flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center gap-3 flex-1 min-w-0">
          {primaryFilters}
        </div>

        {/* Actions cluster */}
        <div className="flex items-center gap-2 shrink-0">
          {secondaryFilters && (
            <button
              onClick={() => setSecondaryOpen(!secondaryOpen)}
              className="hidden md:flex items-center gap-1 px-2.5 py-1.5 text-xs text-tertiary hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/5"
            >
              <SlidersHorizontal size={12} />
              Mas filtros
              <ChevronDown
                size={12}
                className={`transition-transform duration-200 ${secondaryOpen ? 'rotate-180' : ''}`}
              />
            </button>
          )}
          {activeFilterCount > 0 && (
            <button
              onClick={onClear}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-tertiary hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              Limpiar
            </button>
          )}
          {resultCount !== undefined && (
            <span className="text-xs text-tertiary ml-auto md:ml-0 whitespace-nowrap">
              {resultCount.toLocaleString('es-CU')} {resultLabel}
            </span>
          )}
        </div>
      </div>

      {/* Secondary filters (collapsible) */}
      {secondaryFilters && (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            secondaryOpen || mobileOpen ? 'grid-rows-[1fr]' : 'md:grid-rows-[0fr] grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <div
              className={`${mobileOpen ? 'flex' : 'hidden'} md:flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center gap-3 px-4 md:px-5 py-3 border-t border-border`}
            >
              {secondaryFilters}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
