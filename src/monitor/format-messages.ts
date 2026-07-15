/**
 * Formateo de mensajes de Telegram (HTML) para las notificaciones del monitor.
 * Créditos: lista resumida (formato histórico). Débitos: un mensaje detallado
 * por operación según su categoría (ver debit-classifier.ts).
 */

import { TransferenciaEntrada } from '../scraper/parser';
import { parseDebitDetails, DebitCategoria } from '../scraper/debit-classifier';

const TELEGRAM_SAFE_LEN = 3800; // margen bajo el límite de 4096 chars de Telegram

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtImporte(n: number): string {
  return n.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Las fechas se guardan a medianoche UTC: formatear en UTC para no correr un día atrás.
function fmtFecha(d: Date): string {
  return d.toLocaleDateString('es-CU', { timeZone: 'UTC' });
}

/** Lista compacta de créditos: "$monto - Nombre Apellido" (formato histórico). */
export function formatCreditosList(nuevas: { nombreOrdenante: string; importe: number }[]): string {
  return nuevas
    .map(t => {
      const parts = t.nombreOrdenante.split(/\s+/);
      const nombre = parts.slice(0, 2).join(' ') || '???';
      return `  $${t.importe.toLocaleString('es-CU')} - ${escapeHtml(nombre)}`;
    })
    .join('\n');
}

const DEBIT_HEADERS: Record<DebitCategoria, { icon: string; title: string }> = {
  TRIBUTO: { icon: '🏛️', title: 'Tributo' },
  TRANSFERENCIA: { icon: '📤', title: 'Transferencia emitida' },
  ORDEN_PAGO: { icon: '📦', title: 'Orden de pago' },
  COMISION: { icon: '🧾', title: 'Comisión bancaria' },
  CAMBIO_MONEDA: { icon: '💱', title: 'Cambio de moneda' },
  CANCELACION: { icon: '❌', title: 'Cancelación de operación' },
  OTRO: { icon: '❓', title: 'Débito' },
};

/** Mensaje HTML detallado para UN débito, según su categoría. */
export function formatDebitoMessage(t: TransferenciaEntrada): string {
  const det = parseDebitDetails(t.observacionesRaw, t.refCorriente);
  const { icon, title } = DEBIT_HEADERS[det.categoria];

  let titulo = title;
  if (det.categoria === 'ORDEN_PAGO' && det.items && det.items.length > 1) {
    titulo = `Orden de pago (lote de ${det.items.length})`;
  }

  const lines: string[] = [
    `${icon} <b>Débito — ${titulo}</b>`,
    `💰 <b>$${fmtImporte(t.importe)}</b> — ${fmtFecha(t.fecha)}`,
    `📄 Ref: <code>${escapeHtml(t.refCorriente)}</code>`,
  ];

  switch (det.categoria) {
    case 'TRIBUTO':
      if (det.tributoNombre) {
        lines.push(`🧾 ${det.tributoCodigo ? `<code>${det.tributoCodigo}</code> — ` : ''}${escapeHtml(det.tributoNombre)}`);
      }
      if (det.periodo) lines.push(`📅 Período: ${escapeHtml(det.periodo)}`);
      break;

    case 'TRANSFERENCIA':
      if (det.cuentaDestino) lines.push(`🏦 Destino: <code>${det.cuentaDestino}</code>`);
      if (det.concepto) lines.push(`📝 ${escapeHtml(det.concepto)}`);
      if (det.ejecutadoPor) {
        lines.push(det.autorizadoPor && det.autorizadoPor !== det.ejecutadoPor
          ? `👤 Ejecutó: ${escapeHtml(det.ejecutadoPor)} · Autorizó: ${escapeHtml(det.autorizadoPor)}`
          : `👤 Ejecutó/Autorizó: ${escapeHtml(det.ejecutadoPor)}`);
      }
      break;

    case 'ORDEN_PAGO': {
      const items = det.items || [];
      const itemLines = items.map(it => {
        const com = it.comision > 0 ? ` (Com: $${fmtImporte(it.comision)})` : '';
        return `• $${fmtImporte(it.importe)} → <code>…${it.cuenta.slice(-8)}</code> — ${escapeHtml(it.concepto)}${com}`;
      });
      let used = lines.join('\n').length;
      let shown = 0;
      for (const line of itemLines) {
        if (used + line.length + 1 > TELEGRAM_SAFE_LEN) break;
        lines.push(line);
        used += line.length + 1;
        shown++;
      }
      if (shown < items.length) {
        const restantes = items.slice(shown).reduce((s, it) => s + it.importe, 0);
        lines.push(`… y ${items.length - shown} pagos más ($${fmtImporte(restantes)})`);
      }
      break;
    }

    default:
      if (det.descripcion) lines.push(`📝 ${escapeHtml(det.descripcion)}`);
  }

  return lines.join('\n');
}
