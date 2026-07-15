/**
 * Clasifica los débitos (tipo 'Db') según la columna Observaciones de BANDEC.
 * Los débitos no tienen parser propio (parser.ts solo extrae datos de créditos),
 * así que la categoría y los detalles se derivan del texto crudo con reglas.
 *
 * Categorías validadas contra los 413 débitos reales de producción (jul/2026):
 *   TRIBUTO        pagos ONAT/presupuesto (formatos "NIT:..;PF:.." y "DEBITO EN CUENTA APORTE..")
 *   TRANSFERENCIA  transferencia emitida por VirtualBANDEC ("Ordenante: .. Acreditando a: ..")
 *   ORDEN_PAGO     lote de pagos a proveedores ("<importe> <cuenta16> Com:<x> <concepto>" repetido)
 *   COMISION       comisiones bancarias
 *   CAMBIO_MONEDA  venta/compra de divisas, recanje
 *   CANCELACION    cancelación de operación
 *   OTRO           fallback
 */

export type DebitCategoria =
  | 'TRIBUTO'
  | 'TRANSFERENCIA'
  | 'ORDEN_PAGO'
  | 'COMISION'
  | 'CAMBIO_MONEDA'
  | 'CANCELACION'
  | 'OTRO';

/** El texto crudo trae saltos de línea y espacios múltiples: colapsar SIEMPRE antes de clasificar. */
export function normalizeObs(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

// Un ítem de orden de pago: "<importe> <cuenta16> Com:<comisión> <concepto hasta el próximo ítem>"
const RE_ORDEN_PAGO_ITEM = /([\d,]+\.\d{2})\s+(\d{16})\s+Com:\s*([\d,.]+)\s+(.*?)(?=\s+[\d,]+\.\d{2}\s+\d{16}\s+Com:|$)/g;
const RE_ORDEN_PAGO_TEST = /[\d,]+\.\d{2}\s+\d{16}\s+Com:/;

export function classifyDebit(obsRaw: string, refCorriente?: string): DebitCategoria {
  const obs = normalizeObs(obsRaw);
  if (!obs) return 'OTRO';

  // El orden importa: de más específico a más genérico.
  if (/NIT\s*:/i.test(obs) && (/PF:/i.test(obs) || /TRIBUTO/i.test(obs) || /APORTE AL PRESUPUESTO/i.test(obs))) return 'TRIBUTO';
  if (/VENTA DE (USD|EUR|MLC)|CAMBIO DE MONEDA|RECANJE/i.test(obs)) return 'CAMBIO_MONEDA';
  // Sin la Ó final para cubrir "OPERACIÓN"/"OPERACION"; antes de COMISION porque
  // suelen mencionar comisiones en la causa.
  if (/CANCELACION DE OPERACI/i.test(obs)) return 'CANCELACION';
  if (/^\d/.test(obs) && RE_ORDEN_PAGO_TEST.test(obs)) return 'ORDEN_PAGO';
  // Anclado al inicio: "Cobro de Comision (841) por Transferencia VBANDEC. ... Ordenante: .."
  // también contiene "Ordenante:..Acreditando a:" pero empieza por "Cobro".
  if (/^Ordenante:.*Acreditando a:\s*\d{10,}/i.test(obs)) return 'TRANSFERENCIA';
  // COMIS (no COMISI): existe el typo real "Comisón" en producción.
  if (/COMIS|COBRO/i.test(obs)) return 'COMISION';
  if (refCorriente?.toUpperCase().startsWith('TO') && RE_ORDEN_PAGO_TEST.test(obs)) return 'ORDEN_PAGO';
  if (refCorriente?.toUpperCase().startsWith('VB') && /Acreditando a:/i.test(obs)) return 'TRANSFERENCIA';
  return 'OTRO';
}

export interface OrdenPagoItem {
  importe: number;
  cuenta: string;
  comision: number;
  concepto: string;
}

export interface DebitDetails {
  categoria: DebitCategoria;
  // TRIBUTO
  tributoCodigo?: string;
  tributoNombre?: string;
  periodo?: string;
  // TRANSFERENCIA
  cuentaDestino?: string;
  concepto?: string;
  ejecutadoPor?: string;
  autorizadoPor?: string;
  // ORDEN_PAGO
  items?: OrdenPagoItem[];
  // COMISION / CAMBIO_MONEDA / CANCELACION / OTRO
  descripcion?: string;
}

function parseImporte(s: string): number {
  return parseFloat(s.replace(/,/g, '')) || 0;
}

function truncate(s: string, max = 200): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function parseDebitDetails(obsRaw: string, refCorriente?: string): DebitDetails {
  const obs = normalizeObs(obsRaw);
  const categoria = classifyDebit(obsRaw, refCorriente);
  const d: DebitDetails = { categoria };

  switch (categoria) {
    case 'TRIBUTO': {
      // Formato nuevo: "PF:0810132 Cont.Seguridad Social PJ y PN;SUC:5981"
      let m = obs.match(/PF:\s*(\d+)\s+([^;]+)/i);
      if (m) {
        d.tributoCodigo = m[1];
        d.tributoNombre = m[2].trim();
      } else {
        // Formato viejo: "TRIBUTO:0820232 Cont.SS trabajadores PJ y PN SUCURSAL:598 ..."
        m = obs.match(/TRIBUTO:\s*(\d+)\s+(.+?)\s+SUCURSAL:/i);
        if (m) {
          d.tributoCodigo = m[1];
          d.tributoNombre = m[2].trim();
        }
      }
      // Período: nuevo "PD:1/6/2026;PH:30/6/2026" / viejo "Desde:01/10/2025 Hasta:31/10/2025"
      const pd = obs.match(/PD:\s*([\d/]+)/i);
      const ph = obs.match(/PH:\s*([\d/]+)/i);
      if (pd && ph) {
        d.periodo = `${pd[1]} – ${ph[1]}`;
      } else {
        const rango = obs.match(/Desde:\s*([\d/]+)\s+Hasta:\s*([\d/]+)/i);
        if (rango) d.periodo = `${rango[1]} – ${rango[2]}`;
      }
      break;
    }

    case 'TRANSFERENCIA': {
      const cuenta = obs.match(/Acreditando a:\s*(\d+)/i);
      if (cuenta) d.cuentaDestino = cuenta[1];
      const detalles = obs.match(/Detalles:\s*(.+?)\s*Firma:/i);
      if (detalles) d.concepto = truncate(detalles[1]);
      const personas = obs.match(/Ejecutado por:\s*(.+?)\s*Autorizado por:\s*(.+?)$/i);
      if (personas) {
        d.ejecutadoPor = personas[1].trim();
        d.autorizadoPor = personas[2].trim();
      }
      break;
    }

    case 'ORDEN_PAGO': {
      const items: OrdenPagoItem[] = [];
      for (const m of obs.matchAll(RE_ORDEN_PAGO_ITEM)) {
        items.push({
          importe: parseImporte(m[1]),
          cuenta: m[2],
          comision: parseImporte(m[3]),
          concepto: truncate(m[4].trim(), 120),
        });
      }
      d.items = items;
      break;
    }

    default:
      d.descripcion = truncate(obs);
  }

  return d;
}
