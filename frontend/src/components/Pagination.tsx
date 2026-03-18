import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PaginationInfo } from '../types'

const PAGE_SIZE_OPTIONS = [15, 20, 50]

interface PaginationProps {
  pagination: PaginationInfo
  onPageChange: (page: number) => void
  onLimitChange?: (limit: number) => void
}

export function Pagination({ pagination, onPageChange, onLimitChange }: PaginationProps) {
  const { page, limit, total, pages } = pagination
  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)

  const [customInput, setCustomInput] = useState(false)
  const [customValue, setCustomValue] = useState('')

  // Build page numbers to show
  const pageNumbers: number[] = []
  const maxVisible = 5
  let startPage = Math.max(1, page - Math.floor(maxVisible / 2))
  const endPage = Math.min(pages, startPage + maxVisible - 1)
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1)
  }
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i)
  }

  const isPreset = PAGE_SIZE_OPTIONS.includes(limit)

  const handleCustomSubmit = () => {
    const n = parseInt(customValue)
    if (n && n >= 1 && n <= 500) {
      onLimitChange?.(n)
    }
    setCustomInput(false)
    setCustomValue('')
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <span className="text-sm text-secondary text-center md:text-left">
          Mostrando {start}–{end} de {total}
        </span>
        {onLimitChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-tertiary">|</span>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                onClick={() => onLimitChange(size)}
                className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                  limit === size
                    ? 'bg-gold/20 text-gold font-medium'
                    : 'text-tertiary hover:text-white'
                }`}
              >
                {size}
              </button>
            ))}
            {customInput ? (
              <input
                type="number"
                autoFocus
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onBlur={handleCustomSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustomSubmit()
                  if (e.key === 'Escape') { setCustomInput(false); setCustomValue('') }
                }}
                className="w-12 bg-page border border-border rounded px-1.5 py-0.5 text-xs text-white text-center focus:outline-none focus:border-gold/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                placeholder="#"
                min={1}
                max={500}
              />
            ) : (
              <button
                onClick={() => { setCustomInput(true); setCustomValue(isPreset ? '' : String(limit)) }}
                className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                  !isPreset
                    ? 'bg-gold/20 text-gold font-medium'
                    : 'text-tertiary hover:text-white'
                }`}
                title="Cantidad personalizada"
              >
                {!isPreset ? limit : '...'}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg border border-border text-secondary hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
        >
          <ChevronLeft size={16} />
        </button>
        {pageNumbers.map((n) => (
          <button
            key={n}
            onClick={() => onPageChange(n)}
            className={`w-10 h-10 md:w-8 md:h-8 rounded-lg text-sm transition-colors ${
              n === page
                ? 'bg-gold text-page font-medium'
                : 'text-secondary hover:text-white hover:bg-white/5'
            }`}
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="p-1.5 rounded-lg border border-border text-secondary hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
