import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'crypto';
import { RawXMLRecord, ParsedStatementFile } from './types';

export async function extractZip(buffer: Buffer): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(buffer);
  const files = new Map<string, string>();

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !name.endsWith('.xml')) continue;
    const content = await entry.async('string');
    files.set(name, content);
  }

  return files;
}

const SALDO_LABELS_BALANCE = [
  'Saldo Contable Anterior',
  'Saldo Contable Final',
  'Saldo Reservado',
  'Saldo Disponible',
];

const SALDO_LABELS_SKIP = [
  'Saldo Contable al Cierre del D',
  'Saldo Confirmado Final',
  'Saldo Sobre Giro',
];

/** Decode HTML entities so &lt; → <, &gt; → >, etc. Mirrors what the browser's textContent does. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function parseXMLFile(filename: string, xmlContent: string): ParsedStatementFile {
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    processEntities: false,
    stopNodes: ['*.Observaciones'],
  });

  const parsed = parser.parse(xmlContent);
  const root = parsed?.NewDataSet?.['Estado_x0020_de_x0020_Cuenta'];

  if (!root) {
    return {
      filename,
      records: [],
      saldoInicial: null,
      saldoFinal: null,
      saldoReservado: null,
      saldoDisponible: null,
    };
  }

  const rows: any[] = Array.isArray(root) ? root : [root];

  let saldoInicial: number | null = null;
  let saldoFinal: number | null = null;
  let saldoReservado: number | null = null;
  let saldoDisponible: number | null = null;
  const records: RawXMLRecord[] = [];

  for (const row of rows) {
    const observ = decodeEntities(String(row.Observaciones || row.observ || '').trim());

    // Check if it's a saldo row
    const isSaldoBalance = SALDO_LABELS_BALANCE.some(label => observ.startsWith(label));
    const isSaldoSkip = SALDO_LABELS_SKIP.some(label => observ.startsWith(label));

    if (isSaldoSkip) continue;

    // Generic catch-all: any row starting with "Saldo " is a balance row, not an operation
    if (observ.startsWith('Saldo ') && !isSaldoBalance) continue;

    if (isSaldoBalance) {
      const importe = parseFloat(String(row.Importe || row.importe || '0').replace(/,/g, ''));
      if (observ.startsWith('Saldo Contable Anterior')) saldoInicial = importe;
      else if (observ.startsWith('Saldo Contable Final')) saldoFinal = importe;
      else if (observ.startsWith('Saldo Reservado')) saldoReservado = importe;
      else if (observ.startsWith('Saldo Disponible')) saldoDisponible = importe;
      continue;
    }

    // Regular record
    records.push({
      fecha: String(row.Fecha || row.fecha || ''),
      ref_corrie: String(row.Ref_x0020_Corrie || row.ref_corrie || ''),
      ref_origin: String(row.Ref_x0020_Origin || row.ref_origin || ''),
      observ,
      importe: String(row.Importe || row.importe || '0'),
      tipo: String(row.Tipo || row.tipo || ''),
    });
  }

  return { filename, records, saldoInicial, saldoFinal, saldoReservado, saldoDisponible };
}

export function computeFileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
