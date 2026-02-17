# Diseño: Persistencia de Transferencias sin Duplicados

## Contexto
El scraper extrae transferencias de entrada (créditos) de BANDEC diariamente. Al ejecutarse periódicamente, puede traer transferencias ya guardadas. Necesitamos almacenarlas sin duplicados.

## Análisis de datos
- Verificado con 1,532 transacciones reales del extracto bancario
- `refOrigen` es **100% único** (0 duplicados en 1,532 registros)
- `refCorriente` se repite (es referencia de lote, no individual)

## Decisiones

### BD: SQLite
- Un solo proceso Node.js lee/escribe
- ~300 tx/mes, SQLite maneja millones
- 0 configuración, archivo `data/transfers.db`
- Compatible con migración futura a PostgreSQL

### Clave única: `refOrigen`
- Asignada por el banco, inmutable entre scrapes
- UNIQUE constraint en la tabla

### Anti-duplicados: `INSERT OR IGNORE`
- Si `refOrigen` ya existe, SQLite ignora el INSERT silenciosamente
- El scraper puede ejecutarse N veces sobre el mismo rango sin problemas

## Esquema

```sql
CREATE TABLE IF NOT EXISTS transferencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_origen TEXT UNIQUE NOT NULL,
  ref_corriente TEXT NOT NULL,
  fecha TEXT NOT NULL,
  importe REAL NOT NULL,
  tipo TEXT NOT NULL,
  nombre_ordenante TEXT,
  ci_ordenante TEXT,
  tarjeta_ordenante TEXT,
  cuenta_ordenante TEXT,
  id_cubacel TEXT,
  telefono_ordenante TEXT,
  canal_emision TEXT,
  sucursal_ordenante TEXT,
  num_debito TEXT,
  tipo_servicio TEXT,
  fecha_factura TEXT,
  formato TEXT,
  observaciones_raw TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fecha ON transferencias(fecha);
CREATE INDEX IF NOT EXISTS idx_nombre ON transferencias(nombre_ordenante);
CREATE INDEX IF NOT EXISTS idx_importe ON transferencias(importe);
```

## API REST (Express)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/transferencias | Listar con filtros (fecha, nombre, importe) |
| GET | /api/transferencias/:refOrigen | Obtener una por ref |
| GET | /api/resumen | Total por día, conteo, suma |
| POST | /api/scrape | Ejecutar scraping manual |

## Archivos a crear/modificar
- `src/db/database.ts` - Conexión SQLite + helpers
- `src/db/repository.ts` - CRUD de transferencias
- `src/api/server.ts` - Express + rutas
- `src/scrape-month.ts` - Modificar para guardar en BD después de scrapear
