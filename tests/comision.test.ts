/**
 * Comisión que el banco descuenta al acreditar (BPA desde 2026-08-06, 0,8%).
 *
 * Estas dos funciones deciden si una transferencia casa con su solicitud: si
 * fallan, el dinero del cliente queda colgado sin conciliar. Los textos de abajo
 * están copiados de transferencias reales de producción.
 *
 * Ejecutar:  pnpm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractComision, decodeHtmlEntities } from '../src/scraper/parser';
import { importeCuadra, rangoImporteNeto } from '../src/db/repository';

// Mensaje real del BPA (id 410045). El banco manda la "Ó" rota: "COMISI N".
const RAW_BPA_CON_COMISION =
  '[COD_ORIGEN:12]<RCSLBTR_102><ID_MENSAJE>000626006GWC</ID_MENSAJE>' +
  '<MON_TRANSA MONEDA="CUP" IMPORTE="4960.00"/>' +
  '<CLI_ORDENA COD_SUCU="997" NUM_CUENTA="9238129976846537" OTR_DATOS=""/>' +
  '<DET_PAGO>TRANSFERENCIA POR BANCAMOVIL-BPA. ORDENADA POR: MICHEL A. MARRERO M. ' +
  'PAN: 923812XXXXXX6537 BENEFICIARIO: 0659834001469612 COMISI N DESCONTADA: 40.00</DET_PAGO>' +
  '<DET_GASTO>SHA</DET_GASTO></RCSLBTR_102>';

// Mensaje real anterior al cambio (id 405866): mismo formato, sin comisión.
const RAW_BPA_SIN_COMISION =
  '[COD_ORIGEN:12]<RCSLBTR_102><MON_TRANSA MONEDA="CUP" IMPORTE="5000.00"/>' +
  '<DET_PAGO>TRANSFERENCIA POR BANCAMOVIL-BPA. ORDENADA POR: AILER ZALDIVAR SANCHEZ ' +
  'PAN: 922412XXXXXX2676 BENEFICIARIO: 0659834001469612</DET_PAGO></RCSLBTR_102>';

test('extrae la comisión del mensaje real del BPA', () => {
  assert.equal(extractComision(RAW_BPA_CON_COMISION), 40);
});

test('devuelve 0 cuando el banco no descontó nada', () => {
  assert.equal(extractComision(RAW_BPA_SIN_COMISION), 0);
  assert.equal(extractComision('CREDITO RECIBIDO POR CORREO ELECTRONICO'), 0);
  assert.equal(extractComision(''), 0);
});

test('tolera las variantes de escritura de COMISIÓN', () => {
  // La actual (mojibake), y las dos que saldrían si el banco arregla el encoding.
  assert.equal(extractComision('... COMISI N DESCONTADA: 39.60'), 39.6);
  assert.equal(extractComision('... COMISIÓN DESCONTADA: 39.60'), 39.6);
  assert.equal(extractComision('... COMISION DESCONTADA: 39.60'), 39.6);
  assert.equal(extractComision('... comisi n descontada: 39.60'), 39.6);
});

test('maneja separador de miles', () => {
  assert.equal(extractComision('... COMISI N DESCONTADA: 1,040.00'), 1040);
});

test('funciona sobre observacionesRaw sin decodificar', () => {
  // observacionesRaw se guarda sin decodificar; el backfill aplica esto mismo.
  const escapado = RAW_BPA_CON_COMISION
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  assert.equal(extractComision(decodeHtmlEntities(escapado)), 40);
});

test('casa el bruto: neto + comisión == monto de la solicitud', () => {
  // El caso real: pidió 5000, el banco acreditó 4960 y descontó 40.
  assert.ok(importeCuadra({ importe: 4960, comisionDescontada: 40 }, 5000));
  // Monto no redondo (Mideyvis: 4950 → 4910.40 + 39.60).
  assert.ok(importeCuadra({ importe: 4910.4, comisionDescontada: 39.6 }, 4950));
});

test('sin comisión sigue siendo la igualdad exacta de siempre', () => {
  assert.ok(importeCuadra({ importe: 5000, comisionDescontada: 0 }, 5000));
  assert.ok(importeCuadra({ importe: 5000 }, 5000));           // campo ausente
  assert.ok(importeCuadra({ importe: 5000, comisionDescontada: null }, 5000));
});

test('NO casa una transferencia de 4960 sin comisión con una solicitud de 5000', () => {
  // El falso positivo a evitar: un cliente que transfirió 4960 de verdad no
  // puede quedarse con la solicitud de otro que pidió 5000.
  assert.equal(importeCuadra({ importe: 4960, comisionDescontada: 0 }, 5000), false);
});

test('NO casa si la comisión no completa el monto', () => {
  assert.equal(importeCuadra({ importe: 4900, comisionDescontada: 40 }, 5000), false);
});

test('el rango SQL cubre el neto de una comisión del 0,8%', () => {
  const r = rangoImporteNeto(5000);
  assert.ok(r.gte <= 4960 && 4960 <= r.lte, 'el neto real debe caer dentro del rango');
  assert.ok(r.lte === 5000, 'la comisión solo resta: el tope es el monto pedido');
});
