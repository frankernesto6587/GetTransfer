import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Calendar, Filter, RotateCcw } from 'lucide-react'
import { TransferTable, type SortingState } from '../components/TransferTable'
import { Pagination } from '../components/Pagination'
import { transferenciasQuery } from '../lib/api'

/** Get YYYY-MM-DD for today */
function today() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

/** Get YYYY-MM-DD for first day of current month */
function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** YYYY-MM-DD → DD/MM/YYYY for display */
function displayDate(iso: string) {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

type DatePreset = 'today' | 'week' | 'month' | 'all'

export function TransferenciasView() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [fechaDesde, setFechaDesde] = useState(firstOfMonth())
  const [fechaHasta, setFechaHasta] = useState(today())
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [activePreset, setActivePreset] = useState<DatePreset>('month')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const applyPreset = useCallback((preset: DatePreset) => {
    setActivePreset(preset)
    setPage(1)
    const t = new Date()
    switch (preset) {
      case 'today':
        setFechaDesde(today())
        setFechaHasta(today())
        break
      case 'week': {
        const weekAgo = new Date(t)
        weekAgo.setDate(weekAgo.getDate() - 6)
        setFechaDesde(weekAgo.toISOString().slice(0, 10))
        setFechaHasta(today())
        break
      }
      case 'month':
        setFechaDesde(firstOfMonth())
        setFechaHasta(today())
        break
      case 'all':
        setFechaDesde('')
        setFechaHasta('')
        break
    }
  }, [])

  const hasActiveFilters = useMemo(() => {
    return debouncedSearch || desde || hasta
  }, [debouncedSearch, desde, hasta])

  const clearFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setDesde('')
    setHasta('')
    setPage(1)
  }, [])

  const sort = sorting[0]
  const { data: transferencias, isLoading, isFetching } = useQuery({
    ...transferenciasQuery({
      page,
      limit: 50,
      nombre: debouncedSearch || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      desde: desde ? Number(desde) : undefined,
      hasta: hasta ? Number(hasta) : undefined,
      orderBy: sort?.id,
      orderDir: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
    }),
    placeholderData: keepPreviousData,
  })

  const total = transferencias?.pagination?.total ?? 0

  return (
    <div className="p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-headline text-3xl font-bold text-white">Transferencias</h1>
          <p className="text-secondary mt-1">
            {total > 0 ? (
              <>
                <span className="text-white font-medium">{total.toLocaleString('es-CU')}</span> transferencias
                {fechaDesde && fechaHasta && fechaDesde === fechaHasta
                  ? <> del <span className="text-white">{displayDate(fechaDesde)}</span></>
                  : fechaDesde || fechaHasta
                    ? <> del <span className="text-white">{displayDate(fechaDesde) || '...'}</span> al <span className="text-white">{displayDate(fechaHasta) || '...'}</span></>
                    : <> en total</>
                }
              </>
            ) : 'Sin resultados para los filtros seleccionados'}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-border bg-surface mb-6">
        {/* Date presets + range */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
          <Calendar size={16} className="text-tertiary shrink-0" />

          <div className="flex items-center gap-1 bg-page rounded-lg p-0.5">
            {([
              ['today', 'Hoy'],
              ['week', '7 dias'],
              ['month', 'Este mes'],
              ['all', 'Todo'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  activePreset === key
                    ? 'bg-gold/20 text-gold'
                    : 'text-tertiary hover:text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-border">|</span>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => { setFechaDesde(e.target.value); setActivePreset('' as DatePreset); setPage(1) }}
              className="bg-page border border-border rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-gold/50 transition-colors [color-scheme:dark]"
            />
            <span className="text-tertiary text-xs">—</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => { setFechaHasta(e.target.value); setActivePreset('' as DatePreset); setPage(1) }}
              className="bg-page border border-border rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-gold/50 transition-colors [color-scheme:dark]"
            />
          </div>
        </div>

        {/* Importe + name filters */}
        <div className="flex items-center gap-3 px-5 py-3">
          <Filter size={16} className="text-tertiary shrink-0" />

          <div className="flex items-center gap-2">
            <label className="text-xs text-tertiary whitespace-nowrap">Importe</label>
            <input
              type="number"
              placeholder="Min"
              value={desde}
              onChange={(e) => { setDesde(e.target.value); setPage(1) }}
              className="w-24 bg-page border border-border rounded-lg px-2.5 py-1 text-xs text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
            />
            <span className="text-tertiary text-xs">—</span>
            <input
              type="number"
              placeholder="Max"
              value={hasta}
              onChange={(e) => { setHasta(e.target.value); setPage(1) }}
              className="w-24 bg-page border border-border rounded-lg px-2.5 py-1 text-xs text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>

          {hasActiveFilters && (
            <>
              <span className="text-border">|</span>
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-1 text-xs text-tertiary hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw size={12} />
                Limpiar filtros
              </button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-secondary animate-pulse">Cargando transferencias...</div>
        </div>
      ) : (
        <>
          <div className={`mb-4 transition-opacity duration-150 ${isFetching ? 'opacity-50' : ''}`}>
            <TransferTable
              data={transferencias?.data ?? []}
              search={search}
              onSearchChange={handleSearchChange}
              sorting={sorting}
              onSortingChange={(s) => { setSorting(s); setPage(1) }}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: ['transferencias'] })}
            />
          </div>

          {transferencias?.pagination ? (
            <Pagination
              pagination={transferencias.pagination}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
