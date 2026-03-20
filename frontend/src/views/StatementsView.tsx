import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileArchive, CheckCircle, AlertCircle, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { uploadStatement, statementUploadsQuery } from '../lib/api'
import { displayFecha, formatCurrency } from '../components/TransferShared'
import type { StatementUploadResult, StatementValidationError } from '../types'

export function StatementsView() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<StatementUploadResult | null>(null)
  const [errors, setErrors] = useState<StatementValidationError[]>([])
  const [page, setPage] = useState(1)

  const uploadsQuery = useQuery(statementUploadsQuery(page))

  const uploadMut = useMutation({
    mutationFn: uploadStatement,
    onSuccess: (data) => {
      setResult(data)
      setErrors([])
      queryClient.invalidateQueries({ queryKey: ['statement-uploads'] })
      queryClient.invalidateQueries({ queryKey: ['transferencias'] })
      queryClient.invalidateQueries({ queryKey: ['resumen'] })
    },
    onError: (err: any) => {
      setResult(null)
      if (err?.details) {
        setErrors(err.details)
      } else {
        setErrors([{ file: '', type: 'error', message: err?.error || err?.message || 'Error al subir archivo' }])
      }
    },
  })

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setErrors([{ file: file.name, type: 'error', message: 'El archivo debe ser un .zip' }])
      return
    }
    setResult(null)
    setErrors([])
    uploadMut.mutate(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const uploads = uploadsQuery.data?.data ?? []
  const pagination = uploadsQuery.data?.pagination

  return (
    <div className="p-4 md:p-8 max-w-[900px] w-full">
      <div className="mb-8">
        <h1 className="font-headline text-2xl md:text-3xl font-bold text-white">Estados de Cuenta</h1>
        <p className="text-secondary mt-1">Subir ZIP con archivos XML del banco</p>
      </div>

      {/* Upload Zone */}
      <div className="rounded-xl border border-border bg-surface p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Upload size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Subir Estado de Cuenta</h2>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-gold bg-gold/5'
              : 'border-border hover:border-gold/40 hover:bg-white/[0.02]'
          }`}
        >
          <FileArchive size={40} className={`mx-auto mb-3 ${dragOver ? 'text-gold' : 'text-tertiary'}`} />
          {uploadMut.isPending ? (
            <p className="text-gold text-sm animate-pulse">Procesando archivo...</p>
          ) : (
            <>
              <p className="text-secondary text-sm">
                Arrastra un archivo .zip aqui o haz clic para seleccionar
              </p>
              <p className="text-tertiary text-xs mt-1">
                ZIP con archivos XML de estado de cuenta BANDEC
              </p>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />

        {/* Success result */}
        {result && (
          <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={18} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium text-sm">Archivo procesado correctamente</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-tertiary text-xs uppercase">Archivos XML</span>
                <p className="text-white font-mono">{result.filesProcessed}</p>
              </div>
              <div>
                <span className="text-tertiary text-xs uppercase">Operaciones</span>
                <p className="text-white font-mono">{result.totalRecords}</p>
              </div>
              <div>
                <span className="text-tertiary text-xs uppercase">Nuevas</span>
                <p className="text-emerald-400 font-mono font-medium">{result.nuevas}</p>
              </div>
              <div>
                <span className="text-tertiary text-xs uppercase">Duplicadas</span>
                <p className="text-secondary font-mono">{result.totalRecords - result.nuevas}</p>
              </div>
            </div>
            <div className="mt-2 text-xs text-secondary">
              Periodo: {displayFecha(result.fechaDesde)} — {displayFecha(result.fechaHasta)}
            </div>
          </div>
        )}

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="mt-4 space-y-2">
            {errors.map((err, i) => (
              <div key={i} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-red-400 text-sm">{err.message}</p>
                    {err.file && <p className="text-red-400/60 text-xs mt-0.5">{err.file}</p>}
                  </div>
                </div>
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
