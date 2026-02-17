import { useState, useRef, useCallback, useEffect } from 'react'
import useSWR from 'swr'
import { TransferTable } from '../components/TransferTable'
import { Pagination } from '../components/Pagination'
import {
  buildTransferenciasUrl,
  transferenciasFetcher,
} from '../lib/api'
import type { TransferenciasResponse } from '../types'

export function TransferenciasView() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [fecha, setFecha] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
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

  const transferenciasUrl = buildTransferenciasUrl({
    page,
    limit: 50,
    nombre: debouncedSearch || undefined,
    fecha: fecha || undefined,
    desde: desde ? Number(desde) : undefined,
    hasta: hasta ? Number(hasta) : undefined,
  })

  const { data: transferencias, isLoading } =
    useSWR<TransferenciasResponse>(transferenciasUrl, transferenciasFetcher)

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold text-white">Transferencias</h1>
        <p className="text-secondary mt-1">Listado completo con filtros avanzados</p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Fecha</label>
          <input
            type="text"
            placeholder="ej: 17/02/26"
            value={fecha}
            onChange={(e) => { setFecha(e.target.value); setPage(1) }}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Importe desde</label>
          <input
            type="number"
            placeholder="Min"
            value={desde}
            onChange={(e) => { setDesde(e.target.value); setPage(1) }}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Importe hasta</label>
          <input
            type="number"
            placeholder="Max"
            value={hasta}
            onChange={(e) => { setHasta(e.target.value); setPage(1) }}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-secondary animate-pulse">Cargando transferencias...</div>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <TransferTable
              data={transferencias?.data ?? []}
              search={search}
              onSearchChange={handleSearchChange}
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
