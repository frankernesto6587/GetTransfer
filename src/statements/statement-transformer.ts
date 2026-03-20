import { ParsedStatementFile } from './types';
import { TransferenciaEntrada, parseObservaciones } from '../scraper/parser';
import { convertFecha } from '../scraper/parser';

export function transformRecords(file: ParsedStatementFile): TransferenciaEntrada[] {
  return file.records.map(record => {
    const fechaISO = convertFecha(record.fecha);
    const fechaDate = new Date(fechaISO + 'T00:00:00Z');
    const parsed = parseObservaciones(record.observ);

    return {
      fecha: isNaN(fechaDate.getTime()) ? new Date() : fechaDate,
      refCorriente: record.ref_corrie,
      refOrigen: record.ref_origin,
      importe: parseFloat(record.importe.replace(/,/g, '')) || 0,
      tipo: record.tipo,
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
      observacionesRaw: record.observ,
    };
  });
}
