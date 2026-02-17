import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PaginationInfo } from '../types'

interface PaginationProps {
  pagination: PaginationInfo
  onPageChange: (page: number) => void
}

export function Pagination({ pagination, onPageChange }: PaginationProps) {
  const { page, limit, total, pages } = pagination
  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)

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

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-secondary">
        Mostrando {start}–{end} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg border border-border text-secondary hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        {pageNumbers.map((n) => (
          <button
            key={n}
            onClick={() => onPageChange(n)}
            className={`w-8 h-8 rounded-lg text-sm transition-colors ${
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
          className="p-1.5 rounded-lg border border-border text-secondary hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
