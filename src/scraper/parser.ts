/**
 * Parsea la columna "Observaciones" de las operaciones diarias de BANDEC.
 * Maneja 2 formatos:
 *   1. XML (RCSLBTR_102): transferencias interbancarias con tags XML
 *   2. Texto plano: "CREDITO RECIBIDO POR CORREO ELECTRONICO..."
 */

export interface TransferenciaEntrada {
  fecha: string;
  refCorriente: string;
  refOrigen: string;
  importe: number;
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
  if (obs.includes('BANCA MOVIL')) result.canalEmision = 'BANCA MOVIL';
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

export function parseObservaciones(obs: string): Partial<TransferenciaEntrada> {
  if (obs.includes('<RCSLBTR_102>') || obs.includes('<DET_PAGO>')) {
    return parseXMLFormat(obs);
  } else if (obs.includes('CREDITO RECIBIDO') || obs.includes('ORDENANTE NOMBRE:')) {
    return parseTextoFormat(obs);
  }
  return { formato: 'desconocido' };
}

export function parseOperacionRow(cells: string[]): TransferenciaEntrada | null {
  if (cells.length < 6) return null;

  const [fecha, refCorriente, refOrigen, observaciones, importe, tipo] = cells.map(c => c.trim());

  if (!fecha || fecha === '') return null;

  const parsed = parseObservaciones(observaciones);

  return {
    fecha,
    refCorriente,
    refOrigen,
    importe: parseFloat(importe.replace(/,/g, '')) || 0,
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
