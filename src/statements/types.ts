export interface RawXMLRecord {
  fecha: string;
  ref_corrie: string;
  ref_origin: string;
  observ: string;
  importe: string;
  tipo: string;
}

export interface ParsedStatementFile {
  filename: string;
  records: RawXMLRecord[];
  saldoInicial: number | null;
  saldoFinal: number | null;
  saldoReservado: number | null;
  saldoDisponible: number | null;
}

export interface ValidationError {
  file: string;
  type: 'balance_mismatch' | 'continuity_break' | 'db_mismatch' | 'duplicate_hash';
  message: string;
  details?: Record<string, unknown>;
}

export interface StatementUploadResult {
  uploadId: number;
  filesProcessed: number;
  totalRecords: number;
  nuevas: number;
  fechaDesde: string;
  fechaHasta: string;
}
