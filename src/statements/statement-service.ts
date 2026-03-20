import { extractZip, parseXMLFile, computeFileHash } from './statement-parser';
import { transformRecords } from './statement-transformer';
import { validateBalances, validateContinuity, validateNoDuplicateHash } from './statement-validator';
import { upsertMany, prisma } from '../db/repository';
import { StatementUploadResult, ValidationError } from './types';

export async function processStatementUpload(
  zipBuffer: Buffer,
  filename: string,
  userId: number
): Promise<StatementUploadResult> {
  // 1. Compute hash and check for duplicates
  const fileHash = computeFileHash(zipBuffer);
  const dupError = await validateNoDuplicateHash(fileHash);
  if (dupError) throw new StatementValidationError([dupError]);

  // 2. Extract and parse
  const xmlFiles = await extractZip(zipBuffer);
  if (xmlFiles.size === 0) throw new Error('El ZIP no contiene archivos XML');

  const parsedFiles = Array.from(xmlFiles.entries())
    .map(([name, content]) => parseXMLFile(name, content))
    .sort((a, b) => {
      const aDate = a.records[0]?.fecha || '';
      const bDate = b.records[0]?.fecha || '';
      return aDate.localeCompare(bDate);
    });

  // 3. Validate balances
  const balanceErrors: ValidationError[] = [];
  for (const file of parsedFiles) {
    const err = validateBalances(file);
    if (err) balanceErrors.push(err);
  }
  if (balanceErrors.length > 0) throw new StatementValidationError(balanceErrors);

  // 4. Validate continuity
  const contError = validateContinuity(parsedFiles);
  if (contError) throw new StatementValidationError([contError]);

  // 5. Transform records
  const allTransfers = parsedFiles.flatMap(f => transformRecords(f));

  if (allTransfers.length === 0) throw new Error('El ZIP no contiene operaciones');

  // 6. Compute date range
  const allDates = allTransfers.map(t => t.fecha.toISOString().slice(0, 10)).sort();
  const fechaDesde = allDates[0] || '';
  const fechaHasta = allDates[allDates.length - 1] || '';

  // 7. Transaction: create upload record + upsert transfers
  const firstFile = parsedFiles[0]!;
  const lastFile = parsedFiles[parsedFiles.length - 1]!;

  const result = await prisma.$transaction(async (tx) => {
    const upload = await tx.statementUpload.create({
      data: {
        filename,
        fileHash,
        filesProcessed: parsedFiles.length,
        totalRecords: allTransfers.length,
        nuevas: 0, // updated below
        fechaDesde,
        fechaHasta,
        saldoInicial: firstFile.saldoInicial,
        saldoFinal: lastFile.saldoFinal,
        uploadedBy: userId,
      },
    });

    return upload;
  });

  // upsertMany outside transaction (uses skipDuplicates)
  const { nuevas } = await upsertMany(allTransfers, { source: 'statement' });

  // Update nuevas count
  await prisma.statementUpload.update({
    where: { id: result.id },
    data: { nuevas },
  });

  return {
    uploadId: result.id,
    filesProcessed: parsedFiles.length,
    totalRecords: allTransfers.length,
    nuevas,
    fechaDesde,
    fechaHasta,
  };
}

export class StatementValidationError extends Error {
  public errors: ValidationError[];
  constructor(errors: ValidationError[]) {
    super(errors.map(e => e.message).join('; '));
    this.name = 'StatementValidationError';
    this.errors = errors;
  }
}
