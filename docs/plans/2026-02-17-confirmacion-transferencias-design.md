# Sistema de Confirmacion de Transferencias

## Problema

El cajero necesita confirmar que una transferencia bancaria BANDEC llego a la cuenta, generar un codigo unico (tipo cheque) y entregar un comprobante imprimible al cliente para pasar a facturacion.

## Flujo

1. Cliente llega y da datos al cajero (nombre, importe, opcionalmente CI o ref destino)
2. Cajero busca en el sistema — solo muestra transferencias sin confirmar
3. Cajero selecciona la transferencia correcta y confirma
4. Sistema genera codigo alfanumerico unico `GT-XXXXXXXX`
5. Cajero imprime comprobante con codigo + datos de la transferencia

## Modelo de datos

Agregar 2 campos al modelo `Transferencia` existente:

```prisma
codigoConfirmacion  String?   @unique
confirmedAt         DateTime?
```

- `null` = transferencia pendiente (no confirmada)
- Con valor = confirmada, no se puede volver a confirmar
- `@unique` previene duplicados y permite busqueda rapida por codigo

## Codigo alfanumerico

- Paquete: `nanoid`
- Alfabeto: `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (30 chars, sin ambiguos)
- Longitud: 8 caracteres
- Formato: `GT-XXXXXXXX`
- Combinaciones: 30^8 = ~656 mil millones

## API

### POST /api/confirmar/buscar

Busca transferencias pendientes (sin codigo).

```json
{
  "importe": 10000,
  "nombre": "JUAN",
  "ci": "99030315323",        // opcional
  "refCorriente": "YY600..."  // opcional
}
```

Filtros: `importe` exacto + `nombreOrdenante` contains (case-insensitive) + `codigoConfirmacion IS NULL`. CI y ref destino como filtros adicionales opcionales.

### POST /api/confirmar/:id

Confirma transferencia y genera codigo.

- Verifica que existe y `codigoConfirmacion === null`
- Genera codigo con nanoid
- Guarda `codigoConfirmacion` + `confirmedAt = now()`
- Retorna transferencia con codigo

### GET /api/confirmar/:codigo

Consulta por codigo (verificacion futura, facturacion).

## Frontend

### Vista "Confirmar" (nueva en sidebar)

**Paso 1 — Busqueda:**
- Importe (obligatorio) + Nombre (obligatorio)
- CI (opcional) + Ref Destino (opcional)
- Boton "Buscar"

**Paso 2 — Resultados:**
- Lista de matches pendientes con: fecha, nombre, importe, canal, CI
- 0 resultados: mensaje "No se encontro"
- 1+: boton "Confirmar" en cada fila

**Paso 3 — Confirmacion:**
- Modal: "Confirmar transferencia de $X de NOMBRE?"
- Al aceptar: POST /api/confirmar/:id
- Muestra codigo en grande + boton "Imprimir comprobante"

### Comprobante imprimible (HTML + CSS print)

- Titulo: "GETTRANSFER — Comprobante de Confirmacion"
- Codigo en grande
- Datos: fecha, ordenante, CI, importe, canal, ref origen
- Fecha/hora de confirmacion
- Linea de firma

### Cambios en vistas existentes

- Columna "Estado" en TransferTable: badge verde "Confirmada" / gris "Pendiente"
- Metrica "Confirmadas hoy" en Dashboard (opcional)

## Paquetes nuevos

- `nanoid` (backend)
