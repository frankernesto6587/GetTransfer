# Sistema de Solicitudes GT — Arquitectura Distribuida Offline-First (v4 FINAL)

## Contexto

El facturador introduce datos manuales (transfer) en POS con errores → matching falla. Las sedes tienen mala/nula conectividad. Se necesita un flujo donde el comercial crea solicitudes localmente, el facturador solo usa un código GT, y la conciliación bancaria se hace centralmente.

---

## Decisión arquitectónica: Sede local = Source of Truth temporal

La sede local es la **fuente de verdad temporal** hasta que GT central confirma recepción (`SYNC_ACKED`). Después, GT central es la fuente de verdad definitiva.

**Implicaciones:**
- Backup local obligatorio (política de backup de Odoo DB)
- Si sede pierde DB → re-sync completo desde GT central (endpoint de reconciliación)
- Si GT central pierde datos → replay de eventos desde sedes
- Cada cambio genera un evento inmutable → replay posible

---

## Modelo de datos

### Event sourcing ligero — `gt.solicitud.event` (Odoo local)

Cada cambio a una solicitud genera un evento inmutable. La sincronización envía **eventos**, no snapshots.

```python
class GtSolicitudEvent(models.Model):
    _name = 'gt.solicitud.event'
    _order = 'id asc'

    event_id = fields.Char(required=True, index=True)  # UUID, idempotency key
    solicitud_codigo = fields.Char(required=True, index=True)
    event_type = fields.Selection([
        ('CREATED', 'Creada'),
        ('CLAIMED', 'Reclamada'),
        ('ANNULLED', 'Anulada'),
    ], required=True)
    payload = fields.Text()  # JSON: { version, fields, claimed_by, etc. }
    # payload.version = solicitud.version al momento del evento (monotónico)
    # payload.fields = datos completos de la solicitud (para crear si falta CREATED)
    created_at = fields.Datetime(required=True, default=fields.Datetime.now)
    sede_id = fields.Char(required=True)

    # Sync
    sync_status = fields.Selection([
        ('pending', 'Pendiente'),
        ('synced', 'Sincronizado'),
        ('error', 'Error'),
    ], default='pending', index=True)
    sync_attempts = fields.Integer(default=0)
    sync_last_error = fields.Text()
    sync_at = fields.Datetime()
```

### Solicitud principal — `gt.solicitud` (Odoo local)

```python
class GtSolicitud(models.Model):
    _name = 'gt.solicitud'

    codigo = fields.Char(required=True, index=True, readonly=True)
    version = fields.Integer(default=1)  # Monotónico, incrementa en cada cambio

    # Cliente (de res.partner + partner.card)
    partner_id = fields.Many2one('res.partner')
    cliente_nombre = fields.Char(required=True)
    cliente_ci = fields.Char(required=True, index=True)
    cliente_cuenta = fields.Char(required=True, index=True)
    cliente_telefono = fields.Char()

    # Transferencia (del SMS)
    monto = fields.Monetary(required=True, currency_field='currency_id')
    currency_id = fields.Many2one('res.currency', default=lambda s: s.env.company.currency_id)
    canal_emision = fields.Char()
    transfer_code = fields.Char(index=True)
    notas = fields.Text()

    # Fingerprint para deduplicación de negocio
    fingerprint = fields.Char(index=True, compute='_compute_fingerprint', store=True)

    # Estados separados
    workflow_status = fields.Selection([
        ('pending', 'Pendiente'),
        ('claimed', 'Reclamada'),
        ('cancelled', 'Anulada'),
    ], default='pending', index=True)

    # Reclamación
    claimed_at = fields.Datetime()
    claimed_by = fields.Char()  # order_name POS
    payment_id = fields.Many2one('pos.payment')

    # Anulación
    cancelled_at = fields.Datetime()
    cancelled_by = fields.Char()
    cancel_reason = fields.Text()

    _sql_constraints = [
        ('codigo_unique', 'UNIQUE(codigo)', 'El código de solicitud debe ser único'),
    ]

    @api.depends('cliente_ci', 'cliente_cuenta', 'monto', 'transfer_code', 'create_date')
    def _compute_fingerprint(self):
        for r in self:
            fecha = r.create_date.strftime('%Y-%m-%d') if r.create_date else ''
            raw = f"{r.cliente_ci}|{r.cliente_cuenta}|{r.monto:.2f}|{r.transfer_code or ''}|{fecha}"
            r.fingerprint = hashlib.sha256(raw.encode()).hexdigest()[:16]
```

### Configuración de sede

```python
# En pos.config (ya existente)
gt_sede_prefix = fields.Char(string='Prefijo Sede GT')  # "L1", "L2", etc.
gt_sede_name = fields.Char(string='Nombre Sede GT')
gt_central_url = fields.Char(string='URL GT Central')
gt_central_token = fields.Char(string='Token GT Central')
```

### Solicitud en GT Central (Prisma)

```prisma
model Solicitud {
  id                Int       @id @default(autoincrement())
  codigo            String    @unique
  sedeId            String
  version           Int       @default(1)

  // Cliente
  clienteNombre     String
  clienteCi         String
  clienteCuenta     String
  clienteTelefono   String?
  odooPartnerId     Int?

  // Transferencia (SMS)
  monto             Decimal   @db.Decimal(16, 2)
  canalEmision      String?
  transferCode      String?
  notas             String?
  fingerprint       String?

  // Estados separados
  workflowStatus    String    @default("pending")
  // pending | claimed | cancelled

  reconStatus       String    @default("unmatched")
  // unmatched | suggested | matched

  // Creación
  creadoAt          DateTime
  creadoPor         String

  // Reclamación
  reclamadaAt       DateTime?
  reclamadaPor      String?

  // Conciliación
  transferenciaId   Int?      @unique
  transferencia     Transferencia? @relation(fields: [transferenciaId], references: [id])
  conciliadaAt      DateTime?
  conciliadaPor     String?
  matchNivel        Int?

  // Anulación
  anuladaAt         DateTime?
  anuladaPor        String?
  motivoAnulacion   String?

  // Sync
  syncReceivedAt    DateTime  @default(now())
  lastEventId       String?

  @@index([workflowStatus])
  @@index([reconStatus])
  @@index([sedeId])
  @@index([clienteCi])
  @@index([clienteCuenta])
  @@index([monto])
  @@index([fingerprint])
}

model SolicitudEvent {
  id              Int       @id @default(autoincrement())
  eventId         String    @unique  // UUID from sede
  solicitudCodigo String
  eventType       String    // CREATED | CLAIMED | ANNULLED
  payload         Json
  sedeId          String
  createdAt       DateTime
  receivedAt      DateTime  @default(now())

  @@index([solicitudCodigo])
  @@index([sedeId, createdAt])
}
```

---

## Reglas de negocio duras (transiciones de estado)

### workflow_status

```
pending → claimed     (solo si pending)
pending → cancelled   (solo si pending)
claimed → cancelled   (solo con rol admin + motivo obligatorio)
cancelled → ❌        (terminal, no se puede revertir)
```

**Cancelar una reclamada NO revierte el pago en POS.** Genera alerta para resolución manual.

### reconStatus

```
unmatched → suggested   (sistema encuentra candidatos)
unmatched → matched     (auto-match estricto o manual)
suggested → matched     (operador confirma match)
matched → ❌            (terminal; deshacer requiere rol admin)
```

### Reclamación atómica (Odoo local)

```python
def reclamar_solicitud(self, codigo, order_name):
    """Reclamación con bloqueo pesimista"""
    self.env.cr.execute("""
        UPDATE gt_solicitud
        SET workflow_status = 'claimed',
            claimed_at = NOW(),
            claimed_by = %s,
            version = version + 1
        WHERE codigo = %s
          AND workflow_status = 'pending'
        RETURNING id, version
    """, (order_name, codigo))
    result = self.env.cr.fetchone()
    if not result:
        raise UserError('Código no disponible (ya reclamado o anulado)')

    # Emitir evento
    self._emit_event(codigo, 'CLAIMED', {
        'claimed_by': order_name,
        'claimed_at': fields.Datetime.now().isoformat(),
    })
    return result[0]
```

---

## Deduplicación de negocio

Al crear solicitud, verificar `fingerprint`:

```python
def create_solicitud(self, vals):
    # Calcular fingerprint
    fp = compute_fingerprint(vals['cliente_ci'], vals['cliente_cuenta'],
                             vals['monto'], vals.get('transfer_code'))

    # Buscar duplicados activos (no cancelled) con mismo fingerprint
    existing = self.search([
        ('fingerprint', '=', fp),
        ('workflow_status', '!=', 'cancelled'),
    ])
    if existing:
        raise UserError(
            f'Posible duplicado: ya existe solicitud {existing[0].codigo} '
            f'con mismos datos. Confirme o anule la existente primero.'
        )

    # Crear con código único
    prefix = self._get_sede_prefix()
    codigo = f"{prefix}-{generate_code()}"
    # ...
```

---

## Auto-conciliación (GT Central)

### Match estricto (nivel 1 — auto)

**Monto EXACTO** (Decimal, sin tolerancia) + transferCode + cuenta + CI:

```typescript
const autoMatch = await prisma.transferencia.findFirst({
  where: {
    // No ya conciliada
    solicitud: null,
    // Los 4 campos EXACTOS
    importe: solicitud.monto,  // Decimal comparison, no tolerance
    refOrigen: solicitud.transferCode,
    cuentaOrdenante: solicitud.clienteCuenta,
    ciOrdenante: solicitud.clienteCi,
  }
});

if (autoMatch) {
  // Auto-conciliar
}
```

### Niveles para match manual

| Nivel | Criterios | Auto? |
|-------|-----------|-------|
| 1 | monto exacto + transferCode + cuenta + CI | ✅ SI |
| 2 | monto exacto + cuenta + CI (sin transferCode) | ❌ |
| 3 | monto exacto + CI | ❌ |
| 4 | monto exacto + cuenta | ❌ |
| 5 | monto exacto + nombre similar (≥50%) | ❌ |

**Sin tolerancia de monto en ningún nivel.** Si el banco reporta 10000.00 y la solicitud dice 10001.00, NO matchea automáticamente. Diferencia de monto = revisión manual obligatoria.

---

## Sincronización: Eventos, no snapshots

### Odoo local → GT Central

El cron envía **eventos pendientes**, no registros completos:

```python
def sync_events(self):
    events = self.env['gt.solicitud.event'].search([
        ('sync_status', '=', 'pending'),
        ('sync_attempts', '<', 10),
    ], limit=100, order='id asc')

    if not events:
        return

    batch = [{
        'event_id': e.event_id,
        'solicitud_codigo': e.solicitud_codigo,
        'event_type': e.event_type,
        'payload': json.loads(e.payload),
        'sede_id': e.sede_id,
        'created_at': e.created_at.isoformat(),
    } for e in events]

    try:
        response = requests.post(
            f"{url}/api/sync/events",
            json={'events': batch},
            headers={'Authorization': f'Bearer {token}'},
            timeout=30,
        )
        response.raise_for_status()
        result = response.json()

        for e in events:
            if e.event_id in result.get('acked', []):
                e.write({'sync_status': 'synced', 'sync_at': fields.Datetime.now()})
            elif e.event_id in result.get('errors', {}):
                e.write({
                    'sync_status': 'error',
                    'sync_attempts': e.sync_attempts + 1,
                    'sync_last_error': result['errors'][e.event_id],
                })
    except Exception as ex:
        for e in events:
            e.write({
                'sync_status': 'error' if e.sync_attempts >= 3 else 'pending',
                'sync_attempts': e.sync_attempts + 1,
                'sync_last_error': str(ex)[:500],
            })
```

### GT Central recibe eventos

```typescript
// POST /api/sync/events
// Authorization: Bearer {sede_token}
// Header: X-Sede-Signature: HMAC-SHA256(payload, sede_secret)

// 1. Validar token → identificar sede
// 2. Verificar HMAC del payload
// 3. Procesar eventos (fuera de orden tolerado)

const acked: string[] = [];
const errors: Record<string, string> = {};

for (const event of events) {
  try {
    // Idempotencia fuerte: si event_id ya procesado, skip
    const existing = await prisma.solicitudEvent.findUnique({
      where: { eventId: event.event_id }
    });
    if (existing) { acked.push(event.event_id); continue; }

    // Guardar evento inmutable
    await prisma.solicitudEvent.create({ data: { ... } });

    // Aplicar al registro — TOLERANTE A ORDEN
    await applyEvent(event);

    acked.push(event.event_id);
  } catch (err) {
    errors[event.event_id] = err.message;
  }
}

return { acked, errors };

// --- Aplicar evento (tolerante a eventos fuera de orden) ---

async function applyEvent(event: SyncEvent) {
  const sol = await prisma.solicitud.findUnique({
    where: { codigo: event.solicitud_codigo }
  });

  switch (event.event_type) {
    case 'CREATED': {
      if (sol) return; // Ya existe, skip (idempotente)
      await prisma.solicitud.create({
        data: {
          codigo: event.solicitud_codigo,
          sedeId: event.sede_id,
          version: event.payload.version,
          lastEventId: event.event_id,
          ...event.payload.fields,
        }
      });
      break;
    }

    case 'CLAIMED': {
      if (!sol) {
        // CREATED no llegó aún → crear desde el CLAIMED (event sourcing real)
        await prisma.solicitud.create({
          data: {
            codigo: event.solicitud_codigo,
            sedeId: event.sede_id,
            version: event.payload.version,
            lastEventId: event.event_id,
            workflowStatus: 'claimed',
            reclamadaAt: event.payload.claimed_at,
            reclamadaPor: event.payload.claimed_by,
            // Datos del cliente vienen en payload
            ...event.payload.fields,
          }
        });
        break;
      }
      // Ya existe → solo aplicar si versión mayor
      if (sol.version >= event.payload.version) return; // Evento viejo
      if (sol.lastEventId === event.event_id) return; // Ya aplicado

      // Transición válida: pending → claimed
      // O: ya claimed (idempotente)
      if (sol.workflowStatus !== 'pending' && sol.workflowStatus !== 'claimed') {
        throw new Error(`Cannot claim: status is ${sol.workflowStatus}`);
      }
      await prisma.solicitud.update({
        where: { codigo: event.solicitud_codigo },
        data: {
          workflowStatus: 'claimed',
          reclamadaAt: event.payload.claimed_at,
          reclamadaPor: event.payload.claimed_by,
          version: event.payload.version,
          lastEventId: event.event_id,
        }
      });
      break;
    }

    case 'ANNULLED': {
      if (!sol) {
        // CREATED no llegó → crear como cancelled
        await prisma.solicitud.create({
          data: {
            codigo: event.solicitud_codigo,
            sedeId: event.sede_id,
            version: event.payload.version,
            lastEventId: event.event_id,
            workflowStatus: 'cancelled',
            anuladaAt: event.payload.cancelled_at,
            ...event.payload.fields,
          }
        });
        break;
      }
      if (sol.version >= event.payload.version) return;
      if (sol.lastEventId === event.event_id) return;
      // No anular si ya conciliada
      if (sol.reconStatus === 'matched') {
        throw new Error('Cannot annul: already reconciled');
      }
      await prisma.solicitud.update({
        where: { codigo: event.solicitud_codigo },
        data: {
          workflowStatus: 'cancelled',
          anuladaAt: event.payload.cancelled_at,
          anuladaPor: event.payload.cancelled_by,
          motivoAnulacion: event.payload.cancel_reason,
          version: event.payload.version,
          lastEventId: event.event_id,
        }
      });
      break;
    }
  }
}
```

**Garantías enterprise:**
- **Eventos fuera de orden:** Si CLAIMED llega antes que CREATED → crea el registro completo desde CLAIMED
- **Versión del evento:** Central usa la versión del payload (no increment local)
- **Idempotencia fuerte:** `lastEventId` evita reprocesar el mismo evento
- **Clock drift:** La lógica usa `version` (monotónico por sede), nunca `created_at` para decisiones
- **Partial failure:** Cada evento se procesa individualmente; response incluye `acked` y `errors` por separado

### Validaciones enterprise adicionales (nivel élite)

**1. Validación estricta de payload (Zod en GT central):**
```typescript
const solicitudPayloadSchema = z.object({
  version: z.number().int().positive(),
  fields: z.object({
    clienteNombre: z.string().min(1),
    clienteCi: z.string().min(1),
    clienteCuenta: z.string().min(1),
    monto: z.number().positive(),
    canalEmision: z.string().optional(),
    transferCode: z.string().optional(),
  }),
});

// En applyEvent(), ANTES de crear/actualizar:
const parsed = solicitudPayloadSchema.safeParse(event.payload);
if (!parsed.success) {
  throw new Error(`Invalid payload: ${parsed.error.message}`);
}
```

**2. Logging de inconsistencias (no silenciar eventos fuera de orden):**
```typescript
// En cada case del switch:
if (event.payload.version < sol.version) {
  logger.warn('Outdated event received', {
    eventId: event.event_id,
    eventType: event.event_type,
    eventVersion: event.payload.version,
    currentVersion: sol.version,
    sedeId: event.sede_id,
    codigo: event.solicitud_codigo,
  });
  // Acked pero no aplicado — loggeado para auditoría
  return;
}

// En CREATED, validar consistencia si ya existe:
if (sol && sol.fingerprint !== event.payload.fields.fingerprint) {
  logger.error('Data mismatch on duplicate CREATED', {
    eventId: event.event_id,
    existingFingerprint: sol.fingerprint,
    eventFingerprint: event.payload.fields.fingerprint,
  });
}
```

**3. Dead-letter queue para eventos irrecuperables (Odoo local):**
```python
# En gt.solicitud.event:
sync_status = fields.Selection([
    ('pending', 'Pendiente'),
    ('synced', 'Sincronizado'),
    ('error', 'Error Reintentable'),
    ('dead', 'Error Permanente'),  # Dead letter
], default='pending', index=True)

# En sync_events():
if e.sync_attempts >= 10:
    e.write({
        'sync_status': 'dead',
        'sync_last_error': f'Max retries exceeded. Last: {str(ex)[:200]}'
    })
    # Notificar (log + alerta en dashboard)
    continue
```

Dashboard muestra eventos `dead` con botón de "reintentar manual" (admin).

**4. Métricas de observabilidad (GT central):**
```typescript
// Endpoint: GET /api/sync/metrics
{
  sedes: {
    "L1": {
      last_sync: "2026-03-25T14:30:00Z",
      events_today: 45,
      events_pending: 3,    // Lo que sede reportó tener pendiente
      events_dead: 0,
      avg_latency_ms: 2300, // Tiempo entre created_at y receivedAt
      error_rate_24h: 0.02, // 2% de eventos con error
    },
    "L2": { ... }
  },
  global: {
    total_events_24h: 120,
    total_solicitudes: 450,
    unmatched_claimed: 15,  // Reclamadas sin conciliar
    sync_health: "healthy", // healthy | degraded | critical
  }
}
```

**5. Fingerprint con fecha segura (Odoo):**
```python
@api.depends('cliente_ci', 'cliente_cuenta', 'monto', 'transfer_code', 'create_date')
def _compute_fingerprint(self):
    for r in self:
        # Usar context_today para evitar timezone drift
        fecha = fields.Date.context_today(r).strftime('%Y-%m-%d')
        raw = f"{r.cliente_ci}|{r.cliente_cuenta}|{r.monto:.2f}|{r.transfer_code or ''}|{fecha}"
        r.fingerprint = hashlib.sha256(raw.encode()).hexdigest()[:16]
```

**6. Índice compuesto para sync/reconcile:**
```prisma
// En schema.prisma, modelo SolicitudEvent:
@@index([sedeId, createdAt])

// En modelo Solicitud:
@@index([sedeId, creadoAt])
@@index([workflowStatus, reconStatus])
```

---

## Hardening final (nivel élite top 1%)

### 1. Conflicto en CREATED duplicado — detectar corrupción

```typescript
case 'CREATED': {
  if (sol) {
    // Ya existe → validar consistencia (no solo skip)
    if (sol.fingerprint !== computeFingerprint(event.payload.fields)) {
      logger.error('CREATED CONFLICT: data mismatch on existing solicitud', {
        eventId: event.event_id,
        codigo: event.solicitud_codigo,
        existingFingerprint: sol.fingerprint,
        newFingerprint: computeFingerprint(event.payload.fields),
      });
      throw new Error('CREATED conflict: data mismatch — requires manual resolution');
    }
    return; // Idempotente, datos iguales
  }
  // ...crear
}
```

### 2. Detección de gaps de versión (pérdida de eventos)

```typescript
// En applyEvent(), después de obtener sol:
if (sol && event.payload.version > sol.version + 1) {
  logger.warn('Version gap detected — possible missing events', {
    codigo: event.solicitud_codigo,
    currentVersion: sol.version,
    eventVersion: event.payload.version,
    gap: event.payload.version - sol.version - 1,
    sedeId: event.sede_id,
  });
  // Aplicar de todas formas (tolerante), pero loggear para investigación
}
```

### 3. Hash de integridad por evento individual

Cada evento incluye un hash de su payload para detectar corrupción en tránsito:

**En Odoo (al emitir evento):**
```python
import hashlib, json

payload_str = json.dumps(payload, sort_keys=True, default=str)
payload_hash = hashlib.sha256(payload_str.encode()).hexdigest()[:32]

self.env['gt.solicitud.event'].create({
    'event_id': str(uuid4()),
    'payload': payload_str,
    'payload_hash': payload_hash,
    # ...
})
```

**En GT central (al recibir):**
```typescript
const computedHash = sha256(JSON.stringify(event.payload, Object.keys(event.payload).sort()))
  .slice(0, 32);
if (computedHash !== event.payload_hash) {
  errors[event.event_id] = 'Payload integrity check failed';
  continue;
}
```

Nuevo campo en `gt.solicitud.event`:
```python
payload_hash = fields.Char(size=32)  # SHA256 truncado
```

### 4. Duplicados cross-sede — estrategia explícita

**Decisión:** PERMITIR duplicados cross-sede, detectar y alertar.

Razón: un cliente puede legítimamente ir a 2 sedes. Bloquear sería peor que alertar.

```typescript
// Al recibir CREATED, buscar solicitudes similares de OTRA sede:
const crossDup = await prisma.solicitud.findFirst({
  where: {
    fingerprint: computeFingerprint(event.payload.fields),
    sedeId: { not: event.sede_id },
    workflowStatus: { not: 'cancelled' },
  }
});

if (crossDup) {
  logger.warn('Cross-sede duplicate detected', {
    newCodigo: event.solicitud_codigo,
    newSede: event.sede_id,
    existingCodigo: crossDup.codigo,
    existingSede: crossDup.sedeId,
  });
  // Crear de todas formas, pero marcar para revisión
  // Flag en el registro: crossDupOf = crossDup.codigo
}
```

Nuevo campo opcional en Solicitud:
```prisma
crossDupOf    String?   // Código de posible duplicado cross-sede
```

Dashboard muestra alertas de duplicados cross-sede para resolución manual.

### 5. Snapshotting para performance a largo plazo

Cada 100 eventos por solicitud (o mensual por sede), guardar snapshot:

```prisma
model SolicitudSnapshot {
  id              Int       @id @default(autoincrement())
  solicitudCodigo String
  snapshotAt      DateTime  @default(now())
  version         Int
  state           Json      // Estado completo de la solicitud
  lastEventId     String

  @@index([solicitudCodigo])
}
```

**Uso:** Al reconstruir estado (replay), partir del último snapshot en vez de desde evento 0.

**Cuándo crear snapshot:**
- Cron semanal: para todas las solicitudes con >50 eventos sin snapshot
- Al conciliar (transición importante)

### 6. Eventos: nunca borrar, archivar en frío

```
gt_solicitud_event (activa) ──[>90 días synced]──→ gt_solicitud_event_archive (fría)
```

Tabla archive: misma estructura, sin índices de sync (read-only). Endpoint admin para consultar histórico.

### Seguridad del sync

**Cada request de sync incluye:**
1. `Authorization: Bearer {sede_token}` → identifica la sede
2. `X-Sede-Signature: HMAC-SHA256(body, sede_secret)` → integridad del payload
3. `X-Sede-Id: L1` → validado contra el token (backend rechaza si no coincide)

**En GT central:**
```typescript
// Validar que sede_id del token coincida con sede_id en eventos
for (const event of events) {
  if (event.sede_id !== tokenSedeId) {
    errors[event.event_id] = 'Sede mismatch';
    continue;
  }
}
```

**Rate limit:** máx 100 eventos por request, máx 10 requests/min por sede.
**Rotación de tokens:** endpoint admin para regenerar token de sede.

### Sync: Replay protegido y reconciliación

**Endpoint para re-sync filtrado (evitar replay masivo):**
```
GET /api/sync/missing?sede_id=L1&since=2026-03-20T00:00:00Z
→ Retorna lista de event_ids que el central YA tiene para esa sede desde esa fecha
→ La sede local compara y solo reenvía los que faltan
```

**Endpoint de reconciliación:**
```
GET /api/sync/reconcile?sede_id=L1&from=2026-03-01&to=2026-03-25
→ Retorna: { total_events: 450, total_solicitudes: 120, by_status: {...} }
→ La sede compara con sus conteos locales → si hay diferencia → re-sync selectivo
```

### Limpieza de eventos (TTL)

- Eventos `synced` con más de 90 días → archivar (mover a tabla `gt_solicitud_event_archive`)
- Nunca borrar eventos `pending` o `error`
- Cron semanal de archivado

### Estrategia de sync completa

| Mecanismo | Frecuencia | Propósito |
|-----------|------------|-----------|
| Cron automático | Cada 5 min | Sync normal de eventos pendientes |
| Botón "Forzar sync" | Manual | Sync inmediato desde UI de sede |
| Sync on-recovery | Al detectar red | Push inmediato de backlog |
| Health check | Cada 15 min | GT central pinga cada sede |
| Reconciliación | Manual/semanal | Comparar conteos local vs central por rango de fechas |
| Re-sync completo | Admin | Reenvío de todos los eventos de un rango |

### Alertas

- Eventos `pending` más viejos de 1 hora → alerta amarilla
- Eventos `error` con 5+ intentos → alerta roja
- Sede sin sync en 30+ min → alerta de desconexión
- Diferencia de conteo local vs central → alerta de inconsistencia

---

## Relación solicitud → pago POS → contabilidad

### Ciclo de vida del pago

1. **Solicitud creada** (comercial) → código GT disponible
2. **POS acepta pago** (facturador) → `pos.payment` creado localmente con gt_* fields
3. **Venta cerrada** → incluida en cierre de caja normalmente
4. **Sync** → evento CLAIMED llega a GT central
5. **Conciliación** → GT central machea con transferencia del banco

### ¿Qué pasa si no concilia?

- La solicitud queda en `reconStatus: unmatched` en GT central
- Dashboard muestra solicitudes reclamadas sin conciliar (por sede, por fecha)
- NO se revierte automáticamente el pago en POS (ya cerró caja)
- **Resolución manual:** admin investiga y:
  - Encuentra transferencia correcta → concilia manual
  - No existe transferencia → marca para seguimiento/investigación
  - Error del comercial → solicitud se anota, no se anula post-cierre

### Cierre de caja

El cierre de caja no depende de la conciliación bancaria. El pago existe localmente en POS como `payment_type='gettransfer'` con gt_codigo. La conciliación es posterior y no bloquea operación.

---

## Política de edición y anulación

| Acción | Quién puede | Condiciones |
|--------|-------------|-------------|
| Editar solicitud pendiente | Comercial | Solo si `workflow_status = pending` |
| Anular solicitud pendiente | Comercial | Solo si `workflow_status = pending` |
| Anular solicitud reclamada | Admin | Requiere motivo, genera alerta |
| Anular solicitud conciliada | ❌ | No permitido — deshacer conciliación primero |
| Deshacer conciliación | Admin | Solo `reconStatus = matched` → vuelve a `unmatched` |

---

## Códigos únicos por sede

**Formato:** `{SEDE_PREFIX}-{RANDOM_8}`

Charset: `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (sin 0/1/I/L/O)

| Sede | Prefix | Ejemplo |
|------|--------|---------|
| POS Mayorista | L1 | L1-ABCD1234 |
| POS Yasmani | L2 | L2-EFGH5678 |
| POS Central | L3 | L3-IJKL9012 |

Unicidad garantizada por: prefijo único + constraint UNIQUE(codigo) en ambas DBs.

---

## Archivos a crear/modificar

### Odoo Module (`pos_payment_methods_extended`)

| Archivo | Acción |
|---------|--------|
| `models/gt_solicitud.py` | **Crear** — Modelo + lógica de negocio + fingerprint |
| `models/gt_solicitud_event.py` | **Crear** — Event sourcing ligero |
| `models/gt_sync_service.py` | **Crear** — Sync de eventos + reconciliación |
| `controllers/gt_controller.py` | **Crear** — /gt/solicitud/buscar, /reclamar (POS local) |
| `views/gt_solicitud_views.xml` | **Crear** — Tree/form/search + dashboard sync |
| `data/gt_cron.xml` | **Crear** — Crons de sync + health check |
| `models/pos_config.py` | **Modificar** — gt_sede_prefix, gt_sede_name |
| `static/src/js/popups/GetTransferPopup.js` | **Modificar** — Buscar local primero |
| `__manifest__.py` | **Modificar** — Nuevos archivos |

### GT Central Backend

| Archivo | Acción |
|---------|--------|
| `prisma/schema.prisma` | **Modificar** — Solicitud + SolicitudEvent (Decimal) |
| `src/api/routes/sync.ts` | **Crear** — Recibir eventos, health check, reconciliación |
| `src/api/routes/solicitudes.ts` | **Crear** — CRUD read-only + dashboard |
| `src/api/routes/conciliar.ts` | **Crear** — Conciliación banco ↔ solicitudes |
| `src/api/routes/reclamar.ts` | **Modificar** — Buscar en Solicitud además de Transferencia |
| `src/api/server.ts` | **Modificar** — Registrar rutas |

### GT Central Frontend

| Archivo | Acción |
|---------|--------|
| `frontend/src/views/SolicitudesView.tsx` | **Crear** — Lista centralizada |
| `frontend/src/views/ConciliarView.tsx` | **Crear** — Conciliación banco ↔ solicitudes |
| `frontend/src/views/SyncDashboardView.tsx` | **Crear** — Estado de sync por sede + alertas |
| `frontend/src/lib/api.ts` | **Modificar** — Funciones API |
| `frontend/src/App.tsx` | **Modificar** — Rutas |

---

## Orden de implementación

1. **Fase 1:** Schema Prisma (Solicitud + SolicitudEvent con Decimal) + migración
2. **Fase 2:** Modelo Odoo gt.solicitud + gt.solicitud.event + formulario creación + reclamación atómica
3. **Fase 3:** POS popup modificado (local-first)
4. **Fase 4:** Sync de eventos Odoo → GT central (cron + endpoint + idempotencia)
5. **Fase 5:** Conciliación central (auto-match estricto + manual)
6. **Fase 6:** Dashboard central (solicitudes + conciliación + sync status + alertas)
7. **Fase 7:** Reconciliación y re-sync (health checks, comparación conteos, replay)

---

## Verificación

1. Crear solicitud en sede L1 → código L1-XXXX, fingerprint calculado
2. Intentar duplicado con mismos datos → rechazado por fingerprint
3. Reclamar en POS local (2 cajas simultáneas) → solo 1 éxito (atómica)
4. Desconectar internet → crear + reclamar → eventos en cola local
5. Reconectar → cron sincroniza → GT central recibe eventos en orden
6. Reenviar mismo evento → idempotente (no duplica)
7. Scraper trae transferencia → auto-match estricto (4 campos exactos) → conciliada
8. Transferencia con monto ±1 → NO auto-matchea → va a sugerido/manual
9. Anular solicitud reclamada → solo admin, genera alerta
10. Dashboard muestra: backlog sync, solicitudes sin conciliar, alertas por sede
