import { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Eye, X, Unlock } from 'lucide-react'
import type { Transferencia } from '../types'
import { liberarTransferencia } from '../lib/api'

/** YYYY-MM-DD → DD/MM/YYYY */
function displayFecha(f: string) {
  const iso = f?.slice(0, 10)
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : f
}

function formatDate(val: string | null) {
  if (!val) return '—'
  const d = new Date(val)
  return `${d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}`
}

function formatCurrency(amount: number) {
  return `$${amount.toLocaleString('es-CU', { minimumFractionDigits: 2 })}`
}

function CanalBadge({ canal }: { canal: string | null }) {
  if (!canal) return <span className="text-tertiary">—</span>
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

function DetailRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-b-0">
      <span className="text-secondary text-sm">{label}</span>
      <span className={`text-white text-sm ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}

function TransferDetailModal({ transfer, onClose, onRefresh }: { transfer: Transferencia; onClose: () => void; onRefresh?: () => void }) {
  const [confirmLiberar, setConfirmLiberar] = useState(false)
  const [liberando, setLiberando] = useState(false)
  const [liberarError, setLiberarError] = useState('')

  const handleLiberar = async () => {
    if (!transfer.codigoConfirmacion) return
    setLiberando(true)
    setLiberarError('')
    try {
      await liberarTransferencia(transfer.codigoConfirmacion)
      onRefresh?.()
      onClose()
    } catch (err) {
      setLiberarError(err instanceof Error ? err.message : 'Error al liberar')
    } finally {
      setLiberando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface border border-border rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface rounded-t-2xl">
          <div>
            <h3 className="font-headline text-lg font-semibold text-white">Detalle de Transferencia</h3>
            <span className="font-mono text-gold text-sm">{transfer.codigoConfirmacion || `#${transfer.id}`}</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-secondary hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Importe destacado */}
          <div className="text-center py-3 rounded-xl bg-gold/10 border border-gold/20">
            <div className="text-tertiary text-xs uppercase tracking-wider mb-1">Importe</div>
            <div className="font-mono text-2xl font-bold text-gold">{formatCurrency(transfer.importe)}</div>
          </div>

          {/* Ordenante */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-tertiary mb-2 font-medium">Datos del Ordenante</h4>
            <div className="bg-page rounded-lg px-4 py-1">
              <DetailRow label="Nombre" value={transfer.nombreOrdenante} />
              <DetailRow label="CI" value={transfer.ciOrdenante} mono />
              <DetailRow label="Cuenta" value={transfer.cuentaOrdenante} mono />
              <DetailRow label="Tarjeta" value={transfer.tarjetaOrdenante} mono />
              <DetailRow label="Teléfono" value={transfer.telefonoOrdenante} mono />
              <DetailRow label="Sucursal" value={transfer.sucursalOrdenante} />
            </div>
          </div>

          {/* Datos de la transferencia */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-tertiary mb-2 font-medium">Datos de la Transferencia</h4>
            <div className="bg-page rounded-lg px-4 py-1">
              <DetailRow label="Fecha" value={displayFecha(transfer.fecha)} mono />
              <DetailRow label="Ref Origen" value={transfer.refOrigen} mono />
              <DetailRow label="Ref Corriente" value={transfer.refCorriente} mono />
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-secondary text-sm">Canal</span>
                <CanalBadge canal={transfer.canalEmision} />
              </div>
              <DetailRow label="Tipo" value={transfer.tipo} />
              <DetailRow label="Tipo Servicio" value={transfer.tipoServicio} />
            </div>
          </div>

          {/* Estado */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-tertiary mb-2 font-medium">Estado</h4>
            <div className="bg-page rounded-lg px-4 py-1">
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-secondary text-sm">Código</span>
                {transfer.codigoConfirmacion ? (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400 font-mono">
                    {transfer.codigoConfirmacion}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/5 text-tertiary">Pendiente</span>
                )}
              </div>
              <DetailRow label="Confirmado" value={formatDate(transfer.confirmedAt)} mono />
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-secondary text-sm">Reclamada</span>
                {transfer.claimedAt ? (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-500/15 text-violet-400 font-mono">
                    {formatDate(transfer.claimedAt)}
                  </span>
                ) : (
                  <span className="text-tertiary text-sm">—</span>
                )}
              </div>
              <DetailRow label="Ref Odoo" value={transfer.claimedBy} mono />
            </div>
          </div>

          {/* Liberar button - only when claimed */}
          {transfer.claimedAt && (
            <div className="pt-2">
              {liberarError && (
                <div className="text-red-400 text-sm mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  {liberarError}
                </div>
              )}
              {confirmLiberar ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-red-400">Liberar esta transferencia? Podra ser reclamada nuevamente.</span>
                  <button
                    onClick={handleLiberar}
                    disabled={liberando}
                    className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm cursor-pointer disabled:opacity-40"
                  >
                    {liberando ? 'Liberando...' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => setConfirmLiberar(false)}
                    className="px-3 py-1.5 bg-white/5 text-secondary rounded-lg hover:bg-white/10 transition-colors text-sm cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmLiberar(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors cursor-pointer text-sm w-full justify-center"
                >
                  <Unlock size={14} />
                  Liberar Transferencia
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const col = createColumnHelper<Transferencia>()

function makeColumns(onView: (t: Transferencia) => void) {
  return [
    col.accessor('fecha', {
      header: 'Fecha',
      cell: (info) => {
        const v = info.getValue()
        const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (!m) return <span className="font-mono text-secondary">{v}</span>
        const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
        const day = parseInt(m[3]!)
        const mon = months[parseInt(m[2]!) - 1]
        return (
          <span className="text-secondary text-xs">
            <span className="font-mono font-medium text-white">{day}</span>{' '}
            <span className="uppercase">{mon}</span>
          </span>
        )
      },
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
    col.accessor('canalEmision', {
      header: 'Canal',
      cell: (info) => <CanalBadge canal={info.getValue()} />,
    }),
    col.accessor('importe', {
      header: 'Importe',
      cell: (info) => (
        <span className="font-mono text-white">
          {formatCurrency(info.getValue())}
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
    col.accessor('claimedAt', {
      header: 'Reclamada',
      cell: (info) => {
        const val = info.getValue()
        const by = info.row.original.claimedBy
        if (!val) return <span className="text-tertiary">—</span>
        const d = new Date(val)
        return (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-500/15 text-violet-400 font-mono" title={by || ''}>
            {d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit' })}{' '}
            {d.toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )
      },
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        <button
          onClick={() => onView(info.row.original)}
          className="p-1.5 rounded-lg hover:bg-gold/15 text-tertiary hover:text-gold transition-colors"
          title="Ver detalle"
        >
          <Eye size={16} />
        </button>
      ),
    }),
  ]
}

interface TransferTableProps {
  data: Transferencia[]
  search: string
  onSearchChange: (value: string) => void
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
  onRefresh?: () => void
}

export type { SortingState }

export function TransferTable({
  data,
  search,
  onSearchChange,
  sorting,
  onSortingChange,
  onRefresh,
}: TransferTableProps) {
  const [selected, setSelected] = useState<Transferencia | null>(null)

  const columns = makeColumns(setSelected)

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

      {/* Detail Modal */}
      {selected ? <TransferDetailModal transfer={selected} onClose={() => setSelected(null)} onRefresh={onRefresh} /> : null}
    </div>
  )
}
