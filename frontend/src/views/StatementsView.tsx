import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, FileArchive, CheckCircle, AlertCircle, Clock, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { uploadStatement, statementUploadsQuery } from '../lib/api'
import { displayFecha, formatCurrency } from '../components/TransferShared'
import type { StatementUploadResult, StatementValidationError } from '../types'

interface FileResult {
  filename: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  result?: StatementUploadResult
  errors?: StatementValidationError[]
}

export function StatementsView() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [fileResults, setFileResults] = useState<FileResult[]>([])
  const [uploading, setUploading] = useState(false)
  const [page, setPage] = useState(1)

  const uploadsQuery = useQuery(statementUploadsQuery(page))

  const handleFiles = async (files: File[]) => {
    const zips = files.filter(f => f.name.toLowerCase().endsWith('.zip'))
    if (zips.length === 0) {
      setFileResults([{ filename: files[0]?.name || '?', status: 'error', errors: [{ file: '', type: 'error', message: 'Selecciona archivos .zip' }] }])
      return
    }

    // Sort by filename for chronological order
    zips.sort((a, b) => a.name.localeCompare(b.name))

    const results: FileResult[] = zips.map(f => ({ filename: f.name, status: 'pending' as const }))
    setFileResults(results)
    setUploading(true)

    for (let i = 0; i < zips.length; i++) {
      const file = zips[i]!
      const name = file.name
      results[i] = { filename: name, status: 'uploading' }
      setFileResults([...results])

      try {
        const data = await uploadStatement(file)
        results[i] = { filename: name, status: 'success', result: data }
      } catch (err: any) {
        const errs = err?.details
          ? err.details
          : [{ file: name, type: 'error', message: err?.error || err?.message || 'Error al subir archivo' }]
        results[i] = { filename: name, status: 'error', errors: errs }
      }
      setFileResults([...results])
    }

    setUploading(false)
    queryClient.invalidateQueries({ queryKey: ['statement-uploads'] })
    queryClient.invalidateQueries({ queryKey: ['transferencias'] })
    queryClient.invalidateQueries({ queryKey: ['resumen'] })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) handleFiles(files)
  }

  // Aggregate totals from successful uploads
  const successResults = fileResults.filter(r => r.status === 'success' && r.result)
  const totals = successResults.reduce((acc, r) => ({
    filesProcessed: acc.filesProcessed + (r.result?.filesProcessed ?? 0),
    totalRecords: acc.totalRecords + (r.result?.totalRecords ?? 0),
    nuevas: acc.nuevas + (r.result?.nuevas ?? 0),
  }), { filesProcessed: 0, totalRecords: 0, nuevas: 0 })

  const uploads = uploadsQuery.data?.data ?? []
  const pagination = uploadsQuery.data?.pagination

  return (
    <div className="p-4 md:p-8 max-w-[900px] w-full">
      <div className="mb-8">
        <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Estados de Cuenta</h1>
        <p className="text-secondary mt-1">Subir archivos ZIP con XML del banco (uno o varios)</p>
      </div>

      {/* Upload Zone */}
      <div className="rounded-xl border border-border bg-surface p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Upload size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Subir Estados de Cuenta</h2>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            uploading ? 'cursor-wait' : 'cursor-pointer'
          } ${
            dragOver
              ? 'border-gold bg-gold/5'
              : 'border-border hover:border-gold/40 hover:bg-white/[0.02]'
          }`}
        >
          <FileArchive size={40} className={`mx-auto mb-3 ${dragOver ? 'text-gold' : 'text-tertiary'}`} />
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="text-gold animate-spin" />
              <p className="text-gold text-sm">
                Procesando {fileResults.filter(r => r.status === 'success').length + 1} de {fileResults.length}...
              </p>
            </div>
          ) : (
            <>
              <p className="text-secondary text-sm">
                Arrastra archivos .zip aqui o haz clic para seleccionar
              </p>
              <p className="text-tertiary text-xs mt-1">
                Puedes seleccionar varios ZIPs a la vez (cada uno con 1 XML)
              </p>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".zip,.ZIP"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) handleFiles(files)
            e.target.value = ''
          }}
        />

        {/* Per-file results */}
        {fileResults.length > 0 && (
          <div className="mt-4 space-y-2">
            {/* Aggregate summary if multiple successes */}
            {successResults.length > 1 && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={16} className="text-emerald-400" />
                  <span className="text-emerald-400 font-medium text-sm">
                    {successResults.length} de {fileResults.length} archivos procesados
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-tertiary text-xs uppercase">Operaciones</span>
                    <p className="text-white font-mono">{totals.totalRecords}</p>
                  </div>
                  <div>
                    <span className="text-tertiary text-xs uppercase">Nuevas</span>
                    <p className="text-emerald-400 font-mono font-medium">{totals.nuevas}</p>
                  </div>
                  <div>
                    <span className="text-tertiary text-xs uppercase">Duplicadas</span>
                    <p className="text-secondary font-mono">{totals.totalRecords - totals.nuevas}</p>
                  </div>
                </div>
              </div>
            )}

            {fileResults.map((fr, i) => (
              <div key={i} className={`p-3 rounded-lg border ${
                fr.status === 'success'
                  ? 'bg-emerald-500/5 border-emerald-500/15'
                  : fr.status === 'error'
                  ? 'bg-red-500/10 border-red-500/20'
                  : fr.status === 'uploading'
                  ? 'bg-gold/5 border-gold/20'
                  : 'bg-white/[0.02] border-border'
              }`}>
                <div className="flex items-center gap-2">
                  {fr.status === 'uploading' && <Loader2 size={14} className="text-gold animate-spin shrink-0" />}
                  {fr.status === 'success' && <CheckCircle size={14} className="text-emerald-400 shrink-0" />}
                  {fr.status === 'error' && <AlertCircle size={14} className="text-red-400 shrink-0" />}
                  {fr.status === 'pending' && <Clock size={14} className="text-tertiary shrink-0" />}
                  <span className={`text-sm font-mono truncate ${
                    fr.status === 'error' ? 'text-red-400' : fr.status === 'success' ? 'text-emerald-400' : 'text-secondary'
                  }`}>
                    {fr.filename}
                  </span>

                  {fr.result && (
                    <span className="ml-auto text-xs text-secondary whitespace-nowrap">
                      {fr.result.nuevas} nuevas / {fr.result.totalRecords} total
                      {' — '}
                      {displayFecha(fr.result.fechaDesde)} a {displayFecha(fr.result.fechaHasta)}
                    </span>
                  )}
                </div>

                {fr.errors && fr.errors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {fr.errors.map((err, j) => (
                      <p key={j} className="text-red-400 text-xs">{err.message}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload History */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3 mb-4">
          <Clock size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Historial de Uploads</h2>
        </div>

        {uploadsQuery.isLoading ? (
          <p className="text-secondary text-sm">Cargando...</p>
        ) : uploads.length === 0 ? (
          <p className="text-tertiary text-sm">No se han subido estados de cuenta aun.</p>
        ) : (
          <>
            <div className="space-y-3">
              {uploads.map((u) => (
                <div key={u.id} className="p-4 rounded-lg bg-page border border-border">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileArchive size={16} className="text-gold" />
                      <span className="text-white text-sm font-medium">{u.filename}</span>
                    </div>
                    <span className="text-tertiary text-xs font-mono">
                      {new Date(u.createdAt).toLocaleString('es-CU')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <div>
                      <span className="text-tertiary uppercase">XMLs</span>
                      <p className="text-secondary font-mono">{u.filesProcessed}</p>
                    </div>
                    <div>
                      <span className="text-tertiary uppercase">Registros</span>
                      <p className="text-secondary font-mono">{u.totalRecords}</p>
                    </div>
                    <div>
                      <span className="text-tertiary uppercase">Nuevas</span>
                      <p className="text-emerald-400 font-mono">{u.nuevas}</p>
                    </div>
                    <div>
                      <span className="text-tertiary uppercase">Periodo</span>
                      <p className="text-secondary font-mono">{displayFecha(u.fechaDesde)} — {displayFecha(u.fechaHasta)}</p>
                    </div>
                    <div>
                      <span className="text-tertiary uppercase">Saldos</span>
                      <p className="text-secondary font-mono">
                        {u.saldoInicial != null ? formatCurrency(u.saldoInicial) : '—'} → {u.saldoFinal != null ? formatCurrency(u.saldoFinal) : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-tertiary">
                    Subido por {u.user.name || u.user.email}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg bg-white/5 text-secondary hover:bg-white/10 disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-secondary">
                  {page} / {pagination.pages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                  disabled={page >= pagination.pages}
                  className="p-2 rounded-lg bg-white/5 text-secondary hover:bg-white/10 disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
