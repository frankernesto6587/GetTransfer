import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { Transferencia } from '../types'

const col = createColumnHelper<Transferencia>()

const columns = [
  col.accessor('fecha', {
    header: 'Fecha',
    cell: (info) => <span className="font-mono text-secondary">{info.getValue()}</span>,
  }),
  col.accessor('refOrigen', {
    header: 'Ref Origen',
    cell: (info) => <span className="font-mono text-secondary">{info.getValue()}</span>,
  }),
  col.accessor('refCorriente', {
    header: 'Ref Destino',
    cell: (info) => <span className="font-mono text-secondary">{info.getValue()}</span>,
  }),
  col.accessor('nombreOrdenante', {
    header: 'Ordenante',
    cell: (info) => <span className="text-white">{info.getValue() || '—'}</span>,
  }),
  col.accessor('ciOrdenante', {
    header: 'CI',
    cell: (info) => <span className="font-mono text-secondary">{info.getValue() || '—'}</span>,
  }),
  col.accessor('canalEmision', {
    header: 'Canal',
    cell: (info) => {
      const canal = info.getValue()
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
    },
  }),
  col.accessor('importe', {
    header: 'Importe',
    cell: (info) => (
      <span className="font-mono text-white">
        ${info.getValue().toLocaleString('es-CU', { minimumFractionDigits: 2 })}
      </span>
    ),
    meta: { align: 'right' },
  }),
  col.accessor('codigoConfirmacion', {
    header: 'Estado',
    enableSorting: false,
    cell: (info) => {
      const codigo = info.getValue()
      return codigo ? (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400" title={codigo}>
          {codigo}
        </span>
      ) : (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/5 text-tertiary">
          Pendiente
        </span>
      )
    },
  }),
]

interface TransferTableProps {
  data: Transferencia[]
  search: string
  onSearchChange: (value: string) => void
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
}

export type { SortingState }

export function TransferTable({
  data,
  search,
  onSearchChange,
  sorting,
  onSortingChange,
}: TransferTableProps) {

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      onSortingChange(next)
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  })

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
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  const align = (header.column.columnDef.meta as { align?: string } | undefined)?.align === 'right' ? 'text-right' : 'text-left'
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()

                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`${align} text-xs font-medium text-tertiary uppercase tracking-wider px-6 py-3 ${canSort ? 'cursor-pointer select-none hover:text-secondary transition-colors' : ''}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort ? (
                          sorted === 'asc' ? <ArrowUp size={12} className="text-gold" /> :
                          sorted === 'desc' ? <ArrowDown size={12} className="text-gold" /> :
                          <ArrowUpDown size={12} className="opacity-30" />
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
                <td colSpan={columns.length} className="text-center py-12 text-secondary">
                  No se encontraron transferencias
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                >
                  {row.getVisibleCells().map((cell) => {
                    const align = (cell.column.columnDef.meta as { align?: string } | undefined)?.align === 'right' ? 'text-right' : ''
                    return (
                      <td key={cell.id} className={`px-6 py-3 ${align}`}>
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
    </div>
  )
}
