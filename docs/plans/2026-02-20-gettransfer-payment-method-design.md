# GetTransfer Payment Method — Design Document

**Fecha:** 2026-02-20
**Alcance:** GetTransfer API + Odoo 17 Addon (pos_payment_methods_extended)

---

## Objetivo

Agregar un nuevo metodo de pago al POS de Odoo 17 que permite reclamar transferencias confirmadas en el sistema GetTransfer. El cajero introduce el codigo de confirmacion (GT-XXXXXXXX), Odoo consulta la API, muestra los datos y si el cajero confirma, marca la transferencia como reclamada.

---

## Parte 1: Cambios en GetTransfer (API + Frontend)

### 1.1 Modelo Transferencia — Nuevos campos

```prisma
claimedAt   DateTime?
claimedBy   String?     // Referencia de la orden Odoo (ej: "POS/2026-02-20/0005")
```

- `claimedAt`: null = no reclamada, con fecha = reclamada (mismo patron que confirmedAt)
- `claimedBy`: referencia de la factura/orden de Odoo que reclamo el codigo
- Indice en `claimedAt` para consultas rapidas

### 1.2 Nueva tabla ApiToken

```prisma
model ApiToken {
  id        Int      @id @default(autoincrement())
  token     String   @unique        // UUID v4, texto plano
  name      String   @default("")   // Descripcion (ej: "Odoo POS Sucursal 1")
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
}
```

- Solo un token activo a la vez
- Regenerar desactiva el anterior y crea uno nuevo
- Token almacenado en texto plano, siempre visible desde la configuracion

### 1.3 Nuevos endpoints (protegidos con token)

Todos bajo `/api/reclamar/*`. Requieren header `Authorization: Bearer <token>`.

#### GET /api/reclamar/verificar
- Valida que el token es correcto
- Respuesta: `{ ok: true }`
- Errores: 401 si token invalido

#### GET /api/reclamar/:codigo
- Busca transferencia por codigo de confirmacion
- Validaciones: existe, esta confirmada, NO esta reclamada
- Respuesta: todos los datos de la transferencia
- No modifica nada en la base de datos
- Errores:
  - 401: Token invalido
  - 404: Codigo no encontrado
  - 409: "Transferencia no confirmada" o "Transferencia ya reclamada"

#### POST /api/reclamar/:codigo
- Body: `{ "odooRef": "POS/2026-02-20/0005" }` (requerido)
- Mismas validaciones que GET + marca `claimedAt = now()` y `claimedBy = odooRef`
- Respuesta: transferencia actualizada como confirmacion
- Errores: mismos que GET + 500 si falla la actualizacion

### 1.4 Middleware de autenticacion

- Solo aplica a rutas `/api/reclamar/*`
- Lee header `Authorization: Bearer <token>`
- Busca en tabla ApiToken donde `token = <token>` y `active = true`
- Si no coincide: 401 `{ error: "Token de autenticacion invalido" }`
- Los endpoints existentes (dashboard, confirmar, transferencias) NO requieren token

### 1.5 Frontend GetTransfer — Vista Configuracion

Nueva vista "Configuracion" en el sidebar con:

- **Token API activo**: muestra el UUID actual o "Sin token generado"
- **Boton "Generar Token"**: crea un nuevo token (si no existe ninguno)
- **Boton "Regenerar Token"**: pide confirmacion ("Esto invalidara el token actual. Las conexiones existentes dejaran de funcionar."), desactiva el anterior y genera uno nuevo
- **Nombre/descripcion**: campo editable para identificar el token

### 1.6 Dashboard y tabla — Nuevo estado

- En la tabla de transferencias agregar columna "Reclamada" con badge similar a "Confirmado"
- Mostrar fecha de reclamo y referencia Odoo (claimedBy) cuando exista

---

## Parte 2: Cambios en Odoo 17 (Addon)

### 2.1 Configuracion del POS (res.config.settings / pos.config)

Nuevos campos en pos.config (accesibles desde Ajustes del POS):

- `gt_api_url` (Char): URL base del API GetTransfer (ej: `http://192.168.1.50:3000`)
- `gt_api_token` (Char): Token UUID v4 de autenticacion
- **Boton "Verificar Conexion"**: llama GET /api/reclamar/verificar, muestra notificacion exito/error

**Guia de ayuda en la configuracion:**
```
Como configurar GetTransfer:
1. Abra la aplicacion GetTransfer en el navegador
2. Vaya a Configuracion en el menu lateral
3. Haga clic en "Generar Token" para crear un token de acceso
4. Copie la URL del navegador (sin la ruta, ej: http://192.168.1.50:3000)
5. Copie el token generado
6. Pegue ambos valores aqui y presione "Verificar Conexion"
```

### 2.2 Metodo de pago — Nuevo tipo

Agregar al selection `payment_type`:
```python
('gettransfer', 'GetTransfer')
```

No requiere campos adicionales de configuracion (como foreign_currency o exchange_rate).

### 2.3 Campos nuevos en pos.payment (prefijo gt_)

```python
gt_codigo           = fields.Char('Codigo GT')              # GT-XXXXXXXX
gt_nombre_ordenante = fields.Char('Nombre Ordenante')
gt_ci_ordenante     = fields.Char('CI Ordenante')
gt_tarjeta_ordenante = fields.Char('Tarjeta Ordenante')
gt_cuenta_ordenante = fields.Char('Cuenta Ordenante')
gt_canal_emision    = fields.Char('Canal Emision')
gt_ref_corriente    = fields.Char('Ref Destino')
gt_ref_origen       = fields.Char('Ref Origen')
gt_fecha            = fields.Char('Fecha Transferencia')
gt_importe          = fields.Float('Importe Transferencia', digits=(16, 2))
```

Todos de solo lectura — se llenan automaticamente desde la respuesta de la API.

### 2.4 Frontend POS — GetTransferPopup

Popup que se abre al seleccionar metodo de pago tipo "gettransfer":

```
+-------------------------------------+
|  Verificar Codigo GetTransfer       |
|                                     |
|  Codigo: [GT-________] [Buscar]     |
|                                     |
|  -- Datos de la Transferencia --    |
|  Ordenante:  JUAN ARIEL VERDE       |
|  CI:         94042940260             |
|  Cuenta:     9234-0699-9114-1965    |
|  Importe:    $9,600.00              |
|  Fecha:      2026-02-15             |
|  Canal:      Transfermovil          |
|  Codigo:     GT-84F5FPC5            |
|                                     |
|  [Cancelar]           [Confirmar]   |
+-------------------------------------+
```

**Comportamiento:**
- Input del codigo + boton "Buscar"
- Los datos aparecen solo despues de respuesta exitosa
- "Confirmar" solo habilitado cuando hay datos cargados
- "Confirmar" hace el POST de reclamar, si OK cierra popup y crea linea de pago
- Si POST falla, muestra error y NO cierra el popup

### 2.5 PaymentScreen extension

- Al agregar pago tipo `gettransfer` → abre GetTransferPopup
- Al confirmar popup → crea linea de pago con monto de la API
- El monto no es editable por el cajero (viene de la transferencia)

### 2.6 Validacion en validateOrder

- Si hay pago tipo `gettransfer`, validar que tenga `gt_codigo` (ya fue verificado y reclamado)

### 2.7 pos.order — create_from_ui

- Extraer campos `gt_*` del payment data y guardarlos en pos.payment

### 2.8 Vistas backend

- Nueva accion "Pagos GetTransfer" en menu "Pagos Extendidos"
- Filtro: `payment_type = 'gettransfer'`
- Columnas: fecha, orden, sesion, gt_codigo, gt_nombre_ordenante, gt_ci_ordenante, gt_cuenta_ordenante, gt_importe, monto pagado
- Vista form con todos los campos gt_* en solo lectura

### 2.9 Guia en configuracion

En la vista de ajustes, debajo de los campos URL y Token, un bloque de ayuda:

```
GetTransfer - Sistema de Gestion de Transferencias

Para conectar Odoo con GetTransfer necesita:

1. Acceder a la aplicacion GetTransfer desde el navegador
   (consulte con su administrador la direccion)
2. En el menu lateral, ir a "Configuracion"
3. Hacer clic en "Generar Token" para obtener un token de acceso
4. Copiar la URL base (ejemplo: http://192.168.1.50:3000)
5. Copiar el token generado (formato UUID)
6. Pegar ambos valores en los campos de arriba
7. Presionar "Verificar Conexion" para confirmar que todo funciona

Nota: Si regenera el token en GetTransfer, debera actualizarlo aqui tambien.
```

---

## Parte 3: Flujo completo

### Preparacion (una sola vez)
1. GetTransfer frontend → Configuracion → Generar Token → copiar UUID
2. Odoo → Ajustes POS → pegar URL + Token → Verificar Conexion → OK
3. Odoo → Metodos de Pago → crear uno tipo "GetTransfer"

### Flujo de venta
1. Cajero cobra venta → selecciona metodo "GetTransfer"
2. Se abre popup con campo de codigo vacio
3. Cajero escribe `GT-84F5FPC5` → presiona "Buscar"
4. POS hace `GET /api/reclamar/GT-84F5FPC5` con Bearer token
5. API valida: existe, confirmada, no reclamada → devuelve datos
6. Popup muestra todos los datos de la transferencia
7. Cajero verifica → presiona "Confirmar"
8. POS hace `POST /api/reclamar/GT-84F5FPC5` con `{ odooRef: "POS/2026-02-20/0005" }`
9. API marca claimedAt + claimedBy → responde OK con datos
10. POS crea linea de pago con monto e info de la transferencia
11. Popup se cierra

### Tabla de errores
| Momento   | Error                | Mensaje al cajero                                          |
|-----------|----------------------|------------------------------------------------------------|
| Buscar    | API no accesible     | "No se puede conectar al servidor GetTransfer"             |
| Buscar    | Token invalido       | "Token de autenticacion invalido"                          |
| Buscar    | Codigo no existe     | "Codigo no encontrado"                                     |
| Buscar    | No confirmada        | "Esta transferencia no ha sido confirmada"                 |
| Buscar    | Ya reclamada         | "Esta transferencia ya fue reclamada"                      |
| Confirmar | POST falla           | "No se pudo reclamar la transferencia. Intente nuevamente" |
| Confirmar | API no responde      | "Sin respuesta del servidor. La transferencia NO fue reclamada" |

---

## Parte 4: Archivos a modificar/crear

### GetTransfer
| Archivo | Accion |
|---|---|
| `prisma/schema.prisma` | Agregar claimedAt, claimedBy a Transferencia + modelo ApiToken |
| `src/db/repository.ts` | Funciones: reclamarTransferencia, buscarParaReclamar, CRUD de ApiToken |
| `src/api/routes/reclamar.ts` | Nuevos endpoints GET/POST /api/reclamar/* |
| `src/api/routes/token.ts` | Endpoints CRUD para gestion de tokens |
| `src/api/middleware/auth.ts` | Middleware Bearer token |
| `src/api/server.ts` | Registrar nuevas rutas + middleware |
| `frontend/src/views/ConfigView.tsx` | Nueva vista de configuracion con gestion de token |
| `frontend/src/App.tsx` | Agregar ruta Configuracion al sidebar |
| `frontend/src/lib/api.ts` | Funciones API para token |
| `frontend/src/components/TransferTable.tsx` | Columna "Reclamada" |

### Odoo (pos_payment_methods_extended)
| Archivo | Accion |
|---|---|
| `models/pos_payment_method.py` | Agregar 'gettransfer' al selection |
| `models/pos_payment.py` | Agregar campos gt_* |
| `models/pos_config.py` | Nuevo: campos gt_api_url, gt_api_token + verificar conexion |
| `models/res_config_settings.py` | Nuevo: exponer campos de pos.config en ajustes |
| `models/pos_session.py` | Cargar config GT al frontend |
| `models/pos_order.py` | Procesar campos gt_* en create_from_ui |
| `views/res_config_settings_views.xml` | Vista de ajustes con URL, token, guia |
| `views/pos_payment_views.xml` | Accion y vistas para pagos GetTransfer |
| `static/src/js/GetTransferPopup.js` | Popup del POS |
| `static/src/xml/GetTransferPopup.xml` | Template del popup |
| `static/src/js/PaymentScreenExtension.js` | Abrir popup al seleccionar GetTransfer |
| `static/src/js/pos_payment_extension.js` | Serializar campos gt_* |
| `static/src/js/payment_extension.js` | Export/import JSON de campos gt_* |
| `static/src/css/pos_payment_extended.css` | Estilos del popup |
| `security/ir.model.access.csv` | Permisos si se crean modelos nuevos |
| `__manifest__.py` | Agregar nuevos archivos |
