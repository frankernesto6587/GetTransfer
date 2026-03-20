import { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Columns3,
  RefreshCw,
} from 'lucide-react'
import { Pagination } from './Pagination'
import { useUIStore } from '../stores/uiStore'
import type { PaginationInfo, TotalsInfo } from '../types'

export type { SortingState }

function formatCurrency(amount: number) {
  return amount.toLocaleString('es-CU', { minimumFractionDigits: 2 })
}

interface DataTableProps<T> {
  tableId: string
  data: T[]
  columns: ColumnDef<T, any>[]
  sorting?: SortingState
  onSortingChange?: (sorting: SortingState) => void
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  pagination?: PaginationInfo
  onPageChange?: (page: number) => void
  onLimitChange?: (limit: number) => void
  totals?: TotalsInfo
  pageTotals?: TotalsInfo
  onRowClick?: (row: T) => void
  mobileCard?: (row: T, index: number) => React.ReactNode
  alwaysVisibleColumns?: string[]
  onRefresh?: () => void
  title?: string
  headerExtra?: React.ReactNode
  loading?: boolean
}

export function DataTable<T>({
  tableId,
  data,
  columns,
  sorting = [],
  onSortingChange,
  search,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  pagination,
  onPageChange,
  onLimitChange,
  totals,
  pageTotals,
  onRowClick,
  mobileCard,
  alwaysVisibleColumns = ['fecha', 'credito', 'debito'],
  onRefresh,
  title,
  headerExtra,
  loading,
}: DataTableProps<T>) {
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const { columnVisibility: storeVisibility, setColumnVisibility, resetColumnVisibility } = useUIStore()
  const tableVis = storeVisibility[tableId] ?? {}

  // Convert store format to TanStack Table format
  const columnVisibility: VisibilityState = {}
  for (const col of columns) {
    const id = (col as any).accessorKey ?? (col as any).id
    if (!id) continue
    if (id in tableVis) {
      columnVisibility[id] = tableVis[id] ?? true
    }
  }

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: onSortingChange
      ? (updater) => {
          const next = typeof updater === 'function' ? updater(sorting) : updater
          onSortingChange(next)
        }
      : undefined,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  })

  const toggleableColumns = table
    .getAllColumns()
    .filter(
      (col) =>
        col.id !== 'actions' &&
        !alwaysVisibleColumns.includes(col.id),
    )

  const hasHeader = title || onSearchChange || onRefresh || headerExtra

  return (
    <div className="rounded-xl border border-border bg-surface">
      {/* Header */}
      {hasHeader && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-4 md:px-5 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            {title && (
              <h3 className="font-headline text-lg font-semibold text-white">{title}</h3>
            )}
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1.5 rounded-lg text-tertiary hover:text-white hover:bg-white/10 transition-colors"
                title="Refrescar"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            )}
            {headerExtra}
          </div>
          <div className="flex items-center gap-2">
            {onSearchChange !== undefined && (
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary"
                />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={search ?? ''}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="bg-page border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 w-full md:w-64 transition-colors"
                />
              </div>
            )}
            {/* Column visibility toggle */}
            {toggleableColumns.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setColMenuOpen(!colMenuOpen)}
                  className="p-2 rounded-lg text-tertiary hover:text-white hover:bg-white/10 transition-colors"
                  title="Columnas visibles"
                >
                  <Columns3 size={16} />
                </button>
                {colMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setColMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-xl py-2 min-w-[180px]">
                      {toggleableColumns.map((col) => {
                        const isVisible = col.getIsVisible()
                        return (
                          <label
                            key={col.id}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 cursor-pointer text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => {
                                setColumnVisibility(tableId, col.id, !isVisible)
                              }}
                              className="accent-gold"
                            />
                            <span className={isVisible ? 'text-white' : 'text-tertiary'}>
                              {typeof col.columnDef.header === 'string'
                                ? col.columnDef.header
                                : col.id}
                            </span>
                          </label>
                        )
                      })}
                      <div className="border-t border-border mt-1 pt-1 px-3">
                        <button
                          onClick={() => {
                            resetColumnVisibility(tableId)
                            setColMenuOpen(false)
                          }}
                          className="text-xs text-tertiary hover:text-white transition-colors"
                        >
                          Restaurar todas
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile cards */}
      {mobileCard && (
        <div className="md:hidden divide-y divide-border/50">
          {data.length === 0 ? (
            <div className="text-center py-12 text-secondary">
              No se encontraron resultados
            </div>
          ) : (
            data.map((row, i) => (
              <div
                key={i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer' : ''}
              >
                {mobileCard(row, i)}
              </div>
            ))
          )}
        </div>
      )}

      {/* Desktop table */}
      <div className={`overflow-x-auto ${mobileCard ? 'hidden md:block' : ''}`}>
        <table className="w-full text-xs">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  const align =
                    (header.column.columnDef.meta as { align?: string } | undefined)
                      ?.align === 'right'
                      ? 'text-right'
                      : 'text-left'
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()

                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`${align} text-xs font-medium text-tertiary uppercase tracking-wider px-3 py-2.5 ${
                        canSort
                          ? 'cursor-pointer select-none hover:text-secondary transition-colors'
                          : ''
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {canSort ? (
                          sorted === 'asc' ? (
                            <ArrowUp size={12} className="text-gold" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown size={12} className="text-gold" />
                          ) : (
                            <ArrowUpDown size={12} className="opacity-30" />
                          )
                        ) : null}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getVisibleFlatColumns().length}
                  className="text-center py-12 text-secondary"
                >
                  No se encontraron resultados
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`border-b border-border/50 hover:bg-white/[0.02] transition-colors ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {row.getVisibleCells().map((cell) => {
                    const align =
                      (cell.column.columnDef.meta as { align?: string } | undefined)
                        ?.align === 'right'
                        ? 'text-right'
                        : ''
                    return (
                      <td key={cell.id} className={`px-3 py-2 ${align}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Totals footer */}
      {(pageTotals || totals) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 md:px-5 py-2.5 border-t border-border text-sm">
          {pageTotals && (
            <span className="text-secondary">
              Pagina:{' '}
              <span className="text-white font-mono">{formatCurrency(pageTotals.importe)}</span>
              <span className="text-tertiary ml-1">({pageTotals.cantidad})</span>
            </span>
          )}
          {totals && totals.importeCreditos !== undefined && (
            <span className="text-secondary">
              Cr:{' '}
              <span className="text-emerald-400 font-mono">{formatCurrency(totals.importeCreditos)}</span>
              <span className="text-tertiary ml-1">({totals.cantidadCreditos})</span>
            </span>
          )}
          {totals && totals.importeDebitos !== undefined && (
            <span className="text-secondary">
              Db:{' '}
              <span className="text-red-400 font-mono">{formatCurrency(totals.importeDebitos)}</span>
              <span className="text-tertiary ml-1">({totals.cantidadDebitos})</span>
            </span>
          )}
          {totals && totals.importeCreditos === undefined && (
            <span className="text-secondary">
              Total:{' '}
              <span className="text-white font-mono">{formatCurrency(totals.importe)}</span>
              <span className="text-tertiary ml-1">({totals.cantidad})</span>
            </span>
          )}
        </div>
      )}

      {/* Pagination */}
      {pagination && onPageChange && pagination.pages > 1 && (
        <div className="px-4 md:px-5 py-3 border-t border-border">
          <Pagination pagination={pagination} onPageChange={onPageChange} onLimitChange={onLimitChange} />
        </div>
      )}
    </div>
  )
}
