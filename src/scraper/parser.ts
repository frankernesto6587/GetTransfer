/**
 * Parsea la columna "Observaciones" de las operaciones diarias de BANDEC.
 * Maneja 2 formatos:
 *   1. XML (RCSLBTR_102): transferencias interbancarias con tags XML
 *   2. Texto plano: "CREDITO RECIBIDO POR CORREO ELECTRONICO..."
 */

export interface TransferenciaEntrada {
  fecha: Date;
  refCorriente: string;
  refOrigen: string;
  importe: number;             // NETO acreditado (lo que entra a la cuenta)
  /** Comision descontada por el banco. El bruto que ordeno el cliente es
   *  `importe + comisionDescontada`. Opcional: statement-transformer construye
   *  el objeto literal completo y no la tiene. */
  comisionDescontada?: number;
  tipo: string;
  // Campos extraidos de Observaciones:
  nombreOrdenante: string;
  ciOrdenante: string;
  tarjetaOrdenante: string;   // PAN enmascarado
  cuentaOrdenante: string;    // NUM_CUENTA completo
  idCubacel: string;
  telefonoOrdenante: string;
  canalEmision: string;       // BANCAMOVIL-BPA, BANCA MOVIL, etc.
  sucursalOrdenante: string;
  numDebito: string;
  tipoServicio: string;
  fechaFactura: string;
  formato: 'xml' | 'texto' | 'desconocido';
  observacionesRaw: string;
}

/** Convert DD/MM/YY to YYYY-MM-DD */
export function convertFecha(fecha: string): string {
  const parts = fecha.split('/');
  if (parts.length === 3) {
    const [dd, mm, yy] = parts;
    const yyyy = yy.length === 2 ? `20${yy}` : yy;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return fecha;
}

function extractField(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

function parseXMLFormat(obs: string): Partial<TransferenciaEntrada> {
  const result: Partial<TransferenciaEntrada> = { formato: 'xml' };

  // <DET_PAGO>TRANSFERENCIA POR BANCAMOVIL-BPA. ORDENADA POR: NOMBRE PAN: xxx ID_CUBACEL: xxx PHONE BENEFICIARIO: xxx</DET_PAGO>
  const detPago = extractField(obs, /<DET_PAGO>([\s\S]*?)<\/DET_PAGO>/);

  if (detPago) {
    // Canal
    result.canalEmision = extractField(detPago, /TRANSFERENCIA POR\s+([A-Z\-]+)/);

    // Nombre ordenante
    result.nombreOrdenante = extractField(detPago, /ORDENADA POR:\s*(.+?)\s*PAN:/);

    // PAN (tarjeta enmascarada)
    result.tarjetaOrdenante = extractField(detPago, /PAN:\s*(\S+)/);

    // ID CUBACEL
    result.idCubacel = extractField(detPago, /ID_CUBACEL:\s*(\d+)/);

    // Teléfono (número después del ID_CUBACEL)
    result.telefonoOrdenante = extractField(detPago, /ID_CUBACEL:\s*\d+\s+(\d{10})/);
  }

  // <CLI_ORDENA COD_SUCU="997" NUM_CUENTA="9204129976067738" OTR_DATOS=""/>
  result.sucursalOrdenante = extractField(obs, /CLI_ORDENA\s+COD_SUCU="(\d+)"/);
  result.cuentaOrdenante = extractField(obs, /CLI_ORDENA\s+[^>]*NUM_CUENTA="(\d+)"/);

  return result;
}

function parseTextoFormat(obs: string): Partial<TransferenciaEntrada> {
  const result: Partial<TransferenciaEntrada> = { formato: 'texto' };

  // Tipo de operación
  const tipoOp = obs.match(/^(CREDITO RECIBIDO[^[\n]*)/m);
  result.canalEmision = tipoOp ? 'CORREO ELECTRONICO' : '';

  // [DEBITO:40311151782633]
  result.numDebito = extractField(obs, /\[DEBITO:(\d+)\]/);

  // Canal de emisión más específico
  if (obs.includes('BANCAMOVIL-BPA')) result.canalEmision = 'BANCAMOVIL-BPA';
  else if (obs.includes('TRANSFERMOVIL')) result.canalEmision = 'TRANSFERMOVIL';
  else if (obs.includes('BANCA MOVIL')) result.canalEmision = 'BANCA MOVIL';
  else if (obs.includes('BANCA REMOTA')) result.canalEmision = 'BANCA REMOTA';

  // Tarjeta#: 920506XXXXXX4118
  result.tarjetaOrdenante = extractField(obs, /Tarjeta#:\s*(\w+)/);

  // ID CUBACEL
  result.idCubacel = extractField(obs, /IDCUBACEL:(\d+)/);

  // Tipo servicio
  result.tipoServicio = extractField(obs, /TS:(\d+-\w+)/);

  // Fecha factura
  result.fechaFactura = extractField(obs, /FECHA FACTURA:\s*(\w+)/);

  // Nombre ordenante
  result.nombreOrdenante = extractField(obs, /ORDENANTE\s+NOMBRE:([^|]+)/);

  // CI
  result.ciOrdenante = extractField(obs, /\bCI:(\d{11})/);

  // Tarjeta RED
  const tarjetaRed = extractField(obs, /Tarjeta RED:(\d+)/);
  if (tarjetaRed) result.cuentaOrdenante = tarjetaRed;

  return result;
}

/** Exportada para que el backfill de comisiones reuse la misma decodificacion:
 *  observacionesRaw se guarda SIN decodificar (ver parseOperacionRow). */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Comision que el banco descuenta al acreditar. El BPA la declara al final del
 * DET_PAGO: "... BENEFICIARIO: 0659834001469612 COMISI N DESCONTADA: 40.00".
 *
 * El banco manda la "O" de COMISION rota (mojibake), y decodeHtmlEntities no lo
 * arregla porque solo maneja entidades HTML — de ahi el comodin entre COMISI y N.
 * Se aplica sobre las observaciones completas y no dentro de una rama de formato
 * concreta: hoy solo cobra el BPA (formato xml), pero se espera que se extienda a
 * los demas bancos y este helper ya los cubre sin tocar nada.
 *
 * Devuelve 0 cuando no hay comision, que es el caso de la inmensa mayoria.
 */
export function extractComision(text: string): number {
  const m = text.match(/COMISI.{0,4}N\s+DESCONTADA:\s*([\d,]+\.?\d*)/i);
  if (!m) return 0;
  return parseFloat(m[1].replace(/,/g, '')) || 0;
}

export function parseObservaciones(obs: string): Partial<TransferenciaEntrada> {
  // BPA messages routed through email gateway arrive double-html-encoded.
  // textContent in the scraper only decodes once, so apply a second pass here.
  const decoded = decodeHtmlEntities(obs);
  const comisionDescontada = extractComision(decoded);
  if (decoded.includes('<RCSLBTR_102>') || decoded.includes('<DET_PAGO>')) {
    return { ...parseXMLFormat(decoded), comisionDescontada };
  } else if (decoded.includes('CREDITO RECIBIDO') || decoded.includes('ORDENANTE NOMBRE:')) {
    return { ...parseTextoFormat(decoded), comisionDescontada };
  }
  return { formato: 'desconocido', comisionDescontada };
}

export function parseOperacionRow(cells: string[]): TransferenciaEntrada | null {
  if (cells.length < 6) return null;

  const [fecha, refCorriente, refOrigen, observaciones, importe, tipo] = cells.map(c => c.trim());

  if (!fecha || fecha === '') return null;

  const parsed = parseObservaciones(observaciones);

  const fechaISO = convertFecha(fecha);
  const fechaDate = new Date(fechaISO + 'T00:00:00Z');

  return {
    fecha: isNaN(fechaDate.getTime()) ? new Date() : fechaDate,
    refCorriente,
    refOrigen,
    importe: parseFloat(importe.replace(/,/g, '')) || 0,
    comisionDescontada: parsed.comisionDescontada || 0,
    tipo,
    nombreOrdenante: parsed.nombreOrdenante || '',
    ciOrdenante: parsed.ciOrdenante || '',
    tarjetaOrdenante: parsed.tarjetaOrdenante || '',
    cuentaOrdenante: parsed.cuentaOrdenante || '',
    idCubacel: parsed.idCubacel || '',
    telefonoOrdenante: parsed.telefonoOrdenante || '',
    canalEmision: parsed.canalEmision || '',
    sucursalOrdenante: parsed.sucursalOrdenante || '',
    numDebito: parsed.numDebito || '',
    tipoServicio: parsed.tipoServicio || '',
    fechaFactura: parsed.fechaFactura || '',
    formato: parsed.formato || 'desconocido',
    observacionesRaw: observaciones,
  };
}
