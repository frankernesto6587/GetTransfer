import { ParsedStatementFile, ValidationError } from './types';
import { prisma } from '../db/repository';

export function validateBalances(file: ParsedStatementFile): ValidationError | null {
  if (file.saldoInicial === null || file.saldoFinal === null) return null;

  const creditos = file.records
    .filter(r => r.tipo.toUpperCase().startsWith('CR') || r.tipo.toUpperCase() === 'C')
    .reduce((sum, r) => sum + (parseFloat(r.importe.replace(/,/g, '')) || 0), 0);

  const debitos = file.records
    .filter(r => r.tipo.toUpperCase().startsWith('DB') || r.tipo.toUpperCase() === 'D')
    .reduce((sum, r) => sum + (parseFloat(r.importe.replace(/,/g, '')) || 0), 0);

  const expected = file.saldoInicial + creditos - debitos;
  const diff = Math.abs(expected - file.saldoFinal);

  if (diff > 0.01) {
    return {
      file: file.filename,
      type: 'balance_mismatch',
      message: `Descuadre: saldoInicial(${file.saldoInicial}) + créditos(${creditos.toFixed(2)}) - débitos(${debitos.toFixed(2)}) = ${expected.toFixed(2)}, pero saldoFinal = ${file.saldoFinal}`,
      details: { saldoInicial: file.saldoInicial, saldoFinal: file.saldoFinal, creditos, debitos, expected, diff },
    };
  }

  return null;
}

export function validateContinuity(files: ParsedStatementFile[]): ValidationError | null {
  for (let i = 0; i < files.length - 1; i++) {
    const current = files[i];
    const next = files[i + 1];

    if (current.saldoFinal !== null && next.saldoInicial !== null) {
      const diff = Math.abs(current.saldoFinal - next.saldoInicial);
      if (diff > 0.01) {
        return {
          file: `${current.filename} → ${next.filename}`,
          type: 'continuity_break',
          message: `Saldo final de ${current.filename} (${current.saldoFinal}) ≠ saldo inicial de ${next.filename} (${next.saldoInicial})`,
          details: { saldoFinal: current.saldoFinal, saldoInicial: next.saldoInicial, diff },
        };
      }
    }
  }
  return null;
}

export async function validateAgainstDB(files: ParsedStatementFile[]): Promise<ValidationError | null> {
  const lastUpload = await prisma.statementUpload.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!lastUpload || lastUpload.saldoFinal === null) return null;

  const firstFile = files[0];
  if (firstFile.saldoInicial === null) return null;

  const diff = Math.abs(lastUpload.saldoFinal - firstFile.saldoInicial);
  if (diff > 0.01) {
    return {
      file: firstFile.filename,
      type: 'db_mismatch',
      message: `Saldo final del último upload (${lastUpload.saldoFinal}) ≠ saldo inicial de ${firstFile.filename} (${firstFile.saldoInicial})`,
      details: { lastUploadSaldoFinal: lastUpload.saldoFinal, firstFileSaldoInicial: firstFile.saldoInicial },
    };
  }

  return null;
}

export async function validateNoDuplicateHash(hash: string): Promise<ValidationError | null> {
  const existing = await prisma.statementUpload.findUnique({ where: { fileHash: hash } });
  if (existing) {
    return {
      file: existing.filename,
      type: 'duplicate_hash',
      message: `Este archivo ya fue subido el ${existing.createdAt.toISOString().slice(0, 10)} (${existing.filename})`,
    };
  }
  return null;
}
