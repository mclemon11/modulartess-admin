# ADR 0010: zonas de envío en el panel

Fecha: 2026-10-03. Estado: aceptada e implementada.

Consume el contrato que publica el ADR 0025 del backend (zonas de envío v2), copiado del commit
`85da968` del backend con `pnpm api:update` y regenerado con `pnpm api:generate`. La copia es igual
byte a byte a `git show 1d278de:openapi/openapi.json` y una prueba fija su SHA-256. No cambia
ninguna regla de sesión de [`ADR 0002`](0002-firebase-auth-closed-sign-in.md) ni de
[`ADR 0003`](0003-admin-session-bff.md).

## Decisión

### Permisos

- `shipping.read` para los tres roles: consultar zonas, geografía, reglas, asignaciones, relaciones,
  operaciones de copia, análisis y vista previa. `shipping.manage` para `super_admin` y
  `master_admin`: crear, editar, copiar, activar, archivar, restaurar, descartar copias y asignar
  productos. Es la matriz del backend, tal cual.
- Sin `shipping.manage` todo se ve en **solo lectura**.

### Modelo

Una zona es **cobertura** (por código DIVIPOLA: respaldo nacional, departamentos completos,
municipios específicos y exclusiones) más **reglas**, cada una con una tarifa y un alcance
(`all`, `categories`, `products`). El flujo de cinco pasos —Información, Cobertura, Tarifas,
Productos, Revisión— guarda cada paso contra su propia operación, con `expectedVersion`.

### Ningún listado completo en memoria

- **Zonas**: `GET /v1/admin/shipping/zones` filtra (nombre, estado comercial, estado de copia, tipo
  de tarifa, vigencia y municipio) y pagina con un cursor opaco atado a los filtros. El panel lleva
  los filtros y el cursor en la URL; el formulario no lleva cursor, así que cambiar un filtro vuelve
  a la primera página. Un cursor de otros filtros es `cursor_invalid`, nunca otra página.
- **Municipio**: lo que se escribe se resuelve a código DIVIPOLA sobre la instantánea oficial; varias
  coincidencias se ofrecen para elegir. El nombre nunca viaja como filtro.
- **Productos**: los selectores usan la búsqueda del catálogo en el servidor (`q`, por nombre, SKU y
  slug) con su cursor. Un producto anterior a `adminSearchTokens` puede no aparecer por texto: el
  contrato no publica el campo, así que la interfaz lo explica y no inventa resultados.
- **Asignaciones de una regla**: página a página, con «Cargar más asignaciones».
- **Relaciones de un producto**: `GET /v1/admin/shipping/products/{id}/relations`, paginado.

### Relaciones

La ficha del producto muestra zona, estado, regla, versión, origen (producto, categoría, todos) y si
la relación es directa o heredada. Solo las directas se añaden o se retiran
(`POST …/relations`, hasta 20 cambios con la versión de cada regla); una heredada se ve como tal y
enlaza a su zona, sin botón de retirar. No se afirma qué regla gana: depende del destino, y para eso
está la vista previa.

### Restaurar y copiar

- **Restaurar como borrador** (`POST …/restore`): vuelve siempre a borrador, nunca a activa. Es una
  acción distinta de «Duplicar como borrador». Una copia descartada no se restaura.
- **Copias**: duplicar, consultar, reanudar y descartar responden el recurso tipado
  `ShippingCopyOperationDto` —`201` lista; `202` copiando o fallida; `200` lista o descartada según
  la operación—, y el BFF conserva el código del backend y comprueba que el estado le corresponda.
  Un fallo anterior a la operación (validación, versión, idempotencia, permisos) es el error normal
  y no trae identificador. La `Idempotency-Key` solo sirve para repetir **esa** petición si el
  desenlace fue incierto; no se guarda ni se muestra.
- La página `/panel/envios/copias/{copyOperationId}` se reconstruye siempre desde
  `GET /v1/admin/shipping/copy-operations/{id}`: en `copying` muestra fase y contadores y conserva
  consultar, reanudar y descartar (por si el backend no pudo marcar un fallo); en `ready`, la zona
  resultante enlazada; en `failed`, el motivo a partir de `failureCode` y el propio código, con
  Reanudar y Descartar; en `discarded`, el estado final. Descartar otra vez es idempotente.
- **`message` es informativo**: se enseña como texto y nunca decide nada. Ningún parser extrae
  identificadores de `message`, `description` ni del texto de un error; una prueba lo comprueba.

### Geografía

`/v1/geography/*` ya no exige token de servicio: el BFF la consulta con su identidad IAM normal, sin
la sesión de la persona. Se cachea un día y después se revalida con `If-None-Match`; un `304`
reutiliza lo que había. El navegador nunca llama al backend.

### Errores

Cada código publicado tiene su texto: conflicto de versión (el único, con estado incierto, que
ofrece recargar), zona, regla, producto u operación de copia inexistentes, cobertura ambigua,
transición inválida (incluida la restauración), copia fallida, idempotencia repetida, cursor
inválido, consulta sin índice disponible (`503` con filtros o búsqueda), y por elemento los motivos
de asignación y de relación. Un 409 desconocido no se convierte en conflicto de versión.

### Pruebas

`test/shipping/fake-backend.ts` es un backend en memoria tipado con los DTOs generados de `85da968`
(cursor con suma de comprobación, filtros, restaurar, operaciones de copia, relaciones, búsqueda con
índice y `ETag`). Vive fuera de `src/` y una prueba comprueba que nada de producción lo importa.

## Consecuencias

- La navegación pide `shipping.read` para «Envíos».
- El listado de productos gana selección múltiple con `shipping.manage`, con comparación previa
  leída del endpoint inverso.
- Pendiente del backend: ejecutar el backfill de `adminSearchTokens` y desplegar los índices; hasta
  entonces la búsqueda puede omitir productos antiguos o responder `query_unavailable`.
