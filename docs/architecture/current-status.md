# Estado actual

Última actualización: 2026-09-24.

## Fase

Fase 2 — primera vertical completa de sesión administrativa. Sobre la autenticación de la fase 1,
el objetivo era cerrar el recorrido: canjear el ID token en el BFF, guardar la sesión en una cookie
`__Host-` y proteger una ruta mínima verificándola contra el backend.

Fase 3 — despliegue. El panel **está desplegado en Cloud Run staging** con el material de este
repositorio: `Dockerfile`, `.dockerignore`, `deploy/cloudbuild.yaml`, `deploy/staging.sh` con
`preflight`/`build`/`deploy`/`verify`/`all`, y el runbook en `../../deploy/README.md`.

Fase 4 — catálogo. **Productos** está terminado de extremo a extremo y diseñado para escritorio y
móvil: listado, alta con contenido enriquecido, imágenes y variantes, detalle con edición por
secciones, inventario, variantes y publicación gobernada por `publicationReadiness`. El editor
editorial se rehízo sobre el contrato nuevo: topes visibles, campos opcionales declarados como
tales y características como filas ordenables.

Fase 5 — pedidos. **Pedidos** está implementado en su alcance mínimo y real: listado, ficha,
transiciones operativas y cancelación, todo contra las operaciones que publica el contrato.

Fase 6 — entrada y primera revisión visual. `/` deja de ser una pantalla y pasa a ser la puerta:
una redirección HTTP a `/panel`, sin duplicar la comprobación de sesión. Y el área ya terminada
—portada, listado de productos y alta/edición— se revisó a seis anchos reales contra el despliegue
de staging, con los defectos encontrados corregidos y ninguna funcionalidad añadida.

Fase 7 — sistema visual compartido y coordinación de Productos con Pedidos. Las dos superficies se
adaptaron a las referencias de diseño en todo lo que el contrato permite afirmar, se extrajeron sus
piezas en componentes, el recorrido de estados se reconstruyó sobre el historial y el detalle del
pedido ganó una sección de **Novedades**. Es trabajo de presentación: no se añadió ningún endpoint,
ningún campo ni ninguna regla.

Fase 8 — pago, simulador, recorrido definitivo y notificaciones. El backend publicó el estado del
pago, su historial, el buzón de avisos, el estado `ready_to_ship` y el simulador de staging, y la
copia del contrato se sincronizó. Con eso el panel completó lo que la fase 7 dejó declarado como
pendiente de fuente: el recorrido tiene sus **siete** hitos, el listado tiene las dos lecturas
—Pago y Estado—, la ficha tiene la tarjeta de pago con su historial, las notificaciones aparecen en
una tarjeta de **solo lectura** y las transiciones logísticas incorporan «Listo para envío». Nada
de esto se inventó: cada pieza tiene su endpoint o su campo en OpenAPI.

Fase 9 — Dashboard comercial. `/panel` deja de ser una portada de accesos y pasa a ser el resumen
real de la tienda, contra la única operación que el backend publica para ello:
`GET /v1/admin/dashboard/summary`. Ventas, pedidos, unidades, ticket promedio, evolución diaria,
operación, distribuciones, productos más vendidos, pedidos recientes y avisos de atención. Ni una
cifra se calcula en el panel.

Fase 10 — Wompi e integraciones. Una sección nueva, **Configuración → Integraciones**, con la
configuración de la pasarela, la bandeja de incidencias de pago y el ambiente financiero del
Dashboard. Las credenciales se escriben y no vuelven. Los cobros reales de Producción tienen control
propio con confirmación escrita (ver [0006](../decisions/0006-wompi-live-payments-activation.md)),
y **no se han activado**: queda para que una persona lo confirme desde el panel.

## Estado real del entorno

Esto es lo que ya existe fuera de este repositorio, y no debe describirse como pendiente:

| Hecho                                 | Estado                                               |
| ------------------------------------- | ---------------------------------------------------- |
| Firebase Authentication               | Habilitado                                           |
| Primera cuenta administrativa         | Creada, con el correo **verificado**                 |
| Claim `super_admin` de esa cuenta     | **Ya asignado**                                      |
| Bootstrap del backend                 | `completed`; **no puede repetirse**                  |
| Roles admitidos por backend y OpenAPI | `super_admin`, `master_admin`, `moderator`           |
| `master_admin` y `moderator`          | Implementados y publicados en el contrato            |
| Cuentas existentes                    | La `super_admin` del bootstrap                       |
| Backend desplegado                    | **`ADMIN_AUTH_MODE=firebase`**, `/v1/admin/*` activa |
| Backend `modulartess-backend-staging` | Ready, privado por IAM                               |
| `modulartess-admin-stg-run`           | Creada                                               |
| `roles/run.invoker` para el panel     | Concedido sobre el backend de staging                |
| Servicio `modulartess-admin-staging`  | **Desplegado**                                       |

## Implementado

| Área                | Estado | Detalle                                                         |
| ------------------- | ------ | --------------------------------------------------------------- |
| Repositorio         | Listo  | Independiente, sin relación de monorepo con los otros repos.    |
| Gestor de paquetes  | Listo  | pnpm 11.19.0, Node >=22.0.0.                                    |
| Next.js App Router  | Listo  | Next.js 16.3.4, React 19.2.8.                                   |
| TypeScript estricto | Listo  | `strict` más comprobaciones adicionales; `tsc --noEmit` limpio. |
| Estilos             | Listo  | CSS Modules y tokens en `globals.css`. Sin framework de CSS.    |
| Calidad             | Listo  | ESLint y Prettier con scripts de verificación.                  |
| Ruta raíz           | Listo  | `/` redirige con un `307` del servidor a `/panel`. Sin portada. |
| Pruebas unitarias   | Listo  | Vitest sobre módulos puros; sin red ni credenciales.            |
| Documentación       | Listo  | `AGENTS.md`, arquitectura y dos decisiones registradas.         |

### Autenticación (fase 1)

| Área                       | Estado | Detalle                                                        |
| -------------------------- | ------ | -------------------------------------------------------------- |
| SDK Firebase               | Listo  | Solo `firebase/app` y `firebase/auth`. Sin Firestore/Storage.  |
| Inicialización             | Listo  | Diferida, app con nombre explícito, validación de las 4 vars.  |
| Persistencia               | Listo  | `inMemoryPersistence` fijada antes de autenticar.              |
| Idioma del SDK             | Listo  | `languageCode = 'es'` explícito; no se usa el del navegador.   |
| Exclusión de operaciones   | Listo  | Candados síncronos en `useRef`, antes del primer `await`.      |
| `/iniciar-sesion`          | Listo  | Página Server Component con formulario cliente accesible.      |
| `/verificar-correo`        | Listo  | Página estática; sin correo ni token en la query string.       |
| Errores sin enumeración    | Listo  | Un único mensaje genérico para todo fallo de credenciales.     |
| Verificación bajo petición | Listo  | `sendEmailVerification` solo al pulsar el botón; luego cierra. |
| Envío único del correo     | Listo  | Candado sellado tras el envío; un fallo posterior no reabre.   |

### Sesión administrativa BFF (fase 2)

Implementado en el repositorio y comprobado con dobles locales.

| Área                      | Estado     | Detalle                                                                        |
| ------------------------- | ---------- | ------------------------------------------------------------------------------ |
| Copia OpenAPI             | Listo      | `openapi/backend-v1.json`, comiteada; build y runtime solo de ahí.             |
| Tipos generados           | Listo      | `src/lib/api/generated/schema.d.ts`; `pnpm api:check` los valida.              |
| Cliente del backend       | Listo      | `openapi-fetch` tipado, `server-only`, `no-store` y temporizador.              |
| Identity token IAM        | Listo      | `google-auth-library`, caché por audiencia con retirada en fallo.              |
| `POST` del BFF            | Listo      | Origin exacto, `application/json`, cuerpo en bytes UTF-8, `201`.               |
| `GET` del BFF             | Listo      | Verifica contra el backend. **Solo lectura**: nunca emite cookie.              |
| `DELETE` del BFF          | Listo      | Origin exacto, borra la cookie, `204`. Independiente del backend.              |
| Limpieza de sesión        | Listo      | Frontera cliente: `DELETE` y navegación solo tras el `204`.                    |
| Validación de orígenes    | Listo      | HTTPS salvo loopback; audiencia igual a la URL en `google-oidc`.               |
| `expiresAt`               | Listo      | RFC 3339 estricto con zona explícita; sin `Date.parse` permisivo.              |
| Cookie de sesión          | Listo      | `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`.                  |
| Integración con el login  | Listo      | ID token reciente, canje y cierre de Firebase tras el canje.                   |
| Cierre de la sesión SDK   | Listo      | Si `signOut` falla, `location.replace` destruye el documento.                  |
| Ruta protegida `/panel`   | Listo      | Server Component; verifica en cada visita; solo muestra el rol.                |
| Shell del panel           | Listo      | `layout.tsx`, sidebar, cabecera, breadcrumb, rol y cierre de sesión.           |
| Catálogo de productos     | Listo      | Listado, alta, detalle, edición, publicar, archivar e inventario en dos modos. |
| Pago del pedido           | Listo      | Estado, entorno, intentos e historial por intento. Sin método.                 |
| Simulador de pago         | Listo      | Staging, `payments.simulate`, botones del backend, `eventId` en RAM.           |
| Notificaciones            | Listo      | Tarjeta de solo lectura; sin preview ni reenvío, que no existen.               |
| Preparación para publicar | Listo      | `publicationReadiness` del backend, traducida y enlazada por sección.          |
| Precio en pesos           | Listo      | Se escribe y se lee `$ 1.450.000`; viaja el entero `1450000`.                  |
| Navegación                | Listo      | Cinco secciones, marca real y bloque de sesión en el shell.                    |
| Dashboard comercial       | Listo      | `GET /v1/admin/dashboard/summary`; período en la URL; sin cifras propias.      |
| Integraciones (Wompi)     | Listo      | Ambiente, cuatro llaves y guardar. Secretos write-only. Incidencias aparte.    |
| Envíos y Wallet           | Anunciadas | Pantallas «Próximamente»: su contrato no existe todavía.                       |
| Catálogo enriquecido      | Listo      | Clasificación, contenido visible y detalles adicionales, separados.            |
| Editor editorial          | Listo      | Topes de 180, 3000, 5 × 60; contadores, «Opcional» y orden real.               |
| Variantes                 | Listo      | Ejes, combinaciones, precio, inventario por modo y archivado por variante.     |
| Imágenes de producto      | Listo      | Subir, editar texto alternativo, orden, principal y archivar.                  |
| Alta completa             | Listo      | Un envío: crea el borrador, enriquece, sube y crea variantes.                  |
| Reanudación tras fallo    | Listo      | No recrea nada guardado; reintenta solo lo que falta.                          |
| Catálogo de categorías    | Listo      | Listar, buscar, filtrar, crear, renombrar, archivar y reactivar.               |
| Selector de categoría     | Listo      | Solo activas; alta en línea; archivadas históricas visibles y conservadas.     |
| Conflictos del catálogo   | Listo      | SKU, slug y versión por separado; desconocidos con referencia.                 |
| Editor de producto        | Listo      | Nombre arriba, pestañas «Datos del producto», barra lateral fija con sitio.    |
| Shell responsive          | Listo      | Sidebar fija en escritorio; cajón por debajo de 60rem.                         |
| Mutaciones por BFF        | Listo      | Nueve Route Handlers; el navegador no llama al backend.                        |
| Permisos por rol          | Listo      | Matriz explícita en `src/features/session/permissions.ts`.                     |
| ADR local del BFF         | Listo      | `../decisions/0003-admin-session-bff.md`.                                      |

### Material de despliegue (fase 3)

Preparado y comprobado con shims. Nada de esto se ha ejecutado contra la nube.

| Área                     | Estado | Detalle                                                              |
| ------------------------ | ------ | -------------------------------------------------------------------- |
| `Dockerfile`             | Listo  | Multi-stage, salida standalone, `tini` como PID 1, usuario `node`.   |
| `.dockerignore`          | Listo  | Excluye `.git`, `.env*`, artefactos y claves; conserva la plantilla. |
| `deploy/cloudbuild.yaml` | Listo  | Tag inmutable, nunca `latest`, sin secretos.                         |
| `deploy/staging.sh`      | Listo  | `preflight`/`build`/`deploy`/`verify`/`all`, con `--dry-run`.        |
| `.gcloudignore`          | Listo  | Filtra lo que gcloud **sube**; `.dockerignore` llega después.        |
| Harness con shims        | Listo  | `deploy/staging.test.sh`, 129 comprobaciones sin red.                |
| Runbook                  | Listo  | `../../deploy/README.md`.                                            |

### Desplegado en Cloud Run staging

| Área                | Estado     | Detalle                                                  |
| ------------------- | ---------- | -------------------------------------------------------- |
| Identidad del panel | Creada     | `modulartess-admin-stg-run`, su identidad de ejecución.  |
| `roles/run.invoker` | Concedido  | Solo sobre `modulartess-backend-staging`, sin condición. |
| Servicio del panel  | Desplegado | `modulartess-admin-staging`.                             |

La imagen copia al runner **tres** artefactos, no dos: `.next/standalone`, `.next/static` y
`public`. La salida `standalone` no incluye `public`, así que sin esa copia el servicio arranca
igual y devuelve `404` en todo lo que vive ahí —el logotipo de la marca, entre otras cosas—, que es
justo lo que se vio en el primer despliegue. `deploy/deploy.test.ts` lo exige.

## Previsto, todavía no implementado

Elementos que forman parte del diseño acordado, pero que aún no existen en el repositorio.

| Área                            | Estado        | Detalle                                                               |
| ------------------------------- | ------------- | --------------------------------------------------------------------- |
| Metas y presupuesto de venta    | Pendiente     | El contrato publica lo vendido, no contra qué compararlo.             |
| Clientes y usuarios admin.      | Pendiente     | El shell ya está preparado para añadirlos sin rehacerlo.              |
| Pasarela real de pago           | Pendiente     | El contrato solo publica el simulador de staging (`sandbox`).         |
| Reembolsos                      | Pendiente     | Sin operación de reembolso en el contrato.                            |
| Vista previa y reenvío de aviso | Pendiente     | No hay endpoint: la tarjeta de avisos es de solo lectura.             |
| Envíos                          | Pendiente     | Pantalla anunciada; el despacho no está publicado.                    |
| Addi y Odoo                     | Pendiente     | Integraciones fuera del contrato actual.                              |
| Búsqueda y filtros del catálogo | Pendiente     | Solo hay `pageToken` y `pageSize`: filtrar una página mentiría.       |
| Listado de la outbox            | Pendiente     | `failedNotifications` se cuenta; no hay pantalla que lo liste.        |
| Addi                            | Pendiente     | Sin contrato: se anuncia como pendiente y no ejecuta ninguna llamada. |
| Cobros reales de Wompi          | Sin activar   | El control existe; activarlo exige escribir «ACTIVAR PRODUCCIÓN».     |
| Colecciones, SEO, envío, dtos.  | Pendiente     | Sin publicar en OpenAPI; las referencias los muestran.                |
| Lectura aparte de variantes     | Pendiente     | Viajan dentro del producto; un `GET` propio no tendría uso.           |
| Paginación numérica             | Descartada    | El cursor es opaco: permite avanzar, no saltar de página.             |
| Reordenar imágenes arrastrando  | Pendiente     | Hoy se reordena con botones accesibles sobre el mismo PATCH.          |
| Biblioteca de medios            | Pendiente     | Sin endpoint que liste objetos del bucket.                            |
| CRUD de cuentas administrativas | Pendiente     | Vertical posterior; hoy solo existe la cuenta `super_admin`.          |
| Revocación al cerrar sesión     | Pendiente     | El contrato no publica un `DELETE`; el panel no lo inventa.           |
| IAM y autorización del backend  | Fuera de aquí | El panel no la ejerce; es autoridad del backend.                      |
| CI                              | Pendiente     | Hay pruebas unitarias, pero no pipeline.                              |

Sobre el mecanismo de identidad: el flujo es navegador → Firebase Auth para la identidad, navegador
→ servidor Next.js, servidor Next.js (BFF) → backend de Cloud Run con su identidad de ejecución, y
verificación de la identidad administrativa en el backend. Está implementado de extremo a extremo
en este repositorio.

### Contrato de sesión

Decidido e implementado en el backend; el panel lo respeta y no lo reinventa.

| Aspecto         | Estado                                                               |
| --------------- | -------------------------------------------------------------------- |
| Endpoints       | `POST` y `GET /v1/admin/auth/session`                                |
| Sesión interna  | Encabezado `x-modulartess-admin-session`                             |
| `Authorization` | Reservado para el IAM de Cloud Run; no transporta la sesión personal |
| Claim exigido   | `modulartess_admin_role=super_admin`, firmado                        |
| Duración        | `28800` segundos, verificada comprobando la revocación               |
| `DELETE`        | **No existe** en el contrato                                         |

El lado del panel también está implementado, con sus decisiones registradas en
`../decisions/0003-admin-session-bff.md`: cookie `__Host-modulartess-admin-session` con `HttpOnly`,
`Secure`, `SameSite=Strict`, `Path=/` y sin `Domain`; expiración acotada por el `expiresAt` del
backend (RFC 3339 estricto) y por los `28800` segundos del contrato; sin renovación silenciosa;
`Origin` exacto en las rutas mutantes, validado contra una variable leída por separado; estados de
éxito exactos (`201` y `204`); verificación en cada lectura protegida; y limpieza de la cookie ante
`401` o `403` **por el `DELETE`**, nunca desde el `GET` ni desde un Server Component.

## Excluido de forma permanente

No son fases pendientes: son restricciones arquitectónicas que no cambian.

- Acceso directo del panel a Firestore o Cloud Storage, en cualquier fase.
- SDK cliente de Firestore, de Cloud Storage, de Analytics y de Messaging en el panel. El SDK
  `firebase` está instalado, pero solo se importan `firebase/app` y `firebase/auth`.
- Creación de colecciones o documentos desde el panel.
- `firebase-admin` en el panel.
- Registro público, «Crear cuenta», proveedores federados, autenticación anónima y cambio o
  restablecimiento de contraseña en el panel.
- Persistencia de la sesión de Firebase, del correo, de la contraseña, del UID o de tokens en
  `localStorage`, `sessionStorage`, cookies accesibles desde JavaScript, logs o URLs.
- Mensajes de error que permitan enumerar cuentas.
- Entrega del material de sesión al navegador: ni en JSON, ni en encabezados legibles por
  JavaScript, ni en logs, ni en la URL.
- Mutaciones desde un `GET` o desde un Server Component: escribir o borrar la cookie corresponde
  al `DELETE`, que valida `Origin`.
- `http` hacia hosts remotos: solo se admite en loopback.
- Decidir el éxito de una llamada del BFF por `response.ok` en lugar del estado exacto.
- Tratar un `signOut` fallido como inocuo: `inMemoryPersistence` vive lo que vive el documento, y
  sin cierre confirmado la navegación posterior tiene que ser `location.replace`. Ni `router.push`
  ni `location.assign` valen: el primero no destruye el documento y el segundo lo deja recuperable
  desde la BFCache al pulsar Atrás.
- Poner el correo, el UID, un token o la contraseña en la URL. Tras una navegación completa solo
  viaja un código fijo de una lista cerrada.
- Uso de `Authorization` para la sesión de la persona: ese canal está reservado al identity token
  IAM.
- Llamadas del navegador directamente al backend.
- Renovación silenciosa de la sesión administrativa.
- Endpoints del backend que el contrato OpenAPI no publique, incluido un `DELETE` de la sesión y
  cualquier operación de vista previa, reenvío o envío manual de una notificación.
- `reasonCode` escrito a mano desde un campo libre: el contrato lo acota pero no publica la lista
  de valores, así que el BFF lo descarta.
- Persistencia del `eventId` de una simulación en `localStorage`, `sessionStorage`, una cookie o la
  URL: vive en memoria y se descarta al cerrarse la operación.
- Generar un `eventId` nuevo tras una respuesta de red que no se llegó a leer: la primera petición
  pudo haberse aplicado.
- `openapi-fetch` en Client Components: solo se permite en módulos `server-only` del BFF.
- Credenciales de cuentas de servicio en el repositorio o en el entorno del panel.
- Cualquier variable `NEXT_PUBLIC_*` con la URL del backend, y cualquier otra vía que la entregue
  al navegador (configuración de cliente o bundle). El backend es un servicio de Cloud Run
  protegido por IAM: su URL es direccionable por internet y no es un secreto, pero rechaza la
  invocación anónima. La futura variable con esa URL será exclusivamente server-side, en el BFF.
- Llamadas directas del navegador del panel al backend: pasan siempre por el servidor Next.js.
- Reglas comerciales en el panel, incluida la disponibilidad: el backend la deriva y el panel solo
  muestra el inventario y el estado que recibe.
- Secretos o credenciales en el repositorio.
- Importar código fuente del backend, dependencias `file:`, symlinks, workspaces compartidos o
  dependencias de rutas locales de otro repositorio en build o en runtime.

## Descartado

- **WooCommerce**: descartado como dependencia objetivo. El panel no se construye contra
  WooCommerce ni contra su API REST, y no se considera una fuente de datos de destino. Ver
  `../decisions/0001-admin-application-boundary.md`.

### Alta de producto con contenido, imágenes y variantes

`POST /v1/admin/products` solo admite los campos base, y ni una imagen ni una variante se pueden
crear sin `productId` y sin la `expectedVersion` vigente. El panel lo resuelve **dentro de un solo
envío**, sin crear nada al abrir la pantalla ni al elegir un archivo:

1. Datos, clasificación, imágenes (`File` + `object URL`) y variantes viven en memoria. Nada llega
   al backend todavía.
2. Al pulsar «Crear producto» se crea el borrador con el BFF y se toman su `id` y su `version`.
3. Un `PATCH` guarda la clasificación, el contenido enriquecido y los **ejes de variación**. Se
   omite si no hay nada que enviar. Va antes que las variantes porque el backend exige que cada
   variante lleve exactamente los ejes declarados.
4. Las imágenes se suben **en serie**, cada una con la versión autoritativa que devolvió la
   anterior. En paralelo chocarían con un `409`.
5. Cada imagen lleva su propia `Idempotency-Key`, estable entre reintentos. Cambiar el archivo de
   una entrada la renueva: es otra operación.
6. Si la principal elegida no es la que fijó el backend —que marca la primera que recibe—, se
   designa con una llamada extra. Si coincide, no se gasta.
7. Las variantes se crean **en serie**, también con la última versión devuelta. No llevan clave de
   idempotencia: lo que evita duplicados es el SKU reservado globalmente y la combinación única.
8. Solo entonces se navega al detalle.

Si algo falla a mitad, lo guardado **no** se vuelve a enviar: la pantalla dice qué quedó creado
—producto, contenido, imágenes y variantes—, bloquea esos datos, deja solo lo pendiente y reintenta
desde la última versión autoritativa. No se publica nada automáticamente. Si falla la creación, los
campos, los archivos y las variantes se conservan en pantalla.

La lógica vive en `src/features/panel/create-product-flow.ts`, aislada de React para poder
comprobarla con dobles.

### Pedidos (fase 5)

Dos rutas —`/panel/pedidos` y `/panel/pedidos/[orderId]`—, ambas **renderizadas en el servidor** con
la sesión de la persona, y una entrada nueva en la navegación principal. Inventario sigue integrado
en Productos y **no** hay directorio de clientes: el cliente es un dato del pedido, no una entidad.

Listado, con los campos de `AdminOrderSummaryDto` y ninguno más: `publicId`, `customerName`,
`previewLine`, `itemCount`, `totalCop`, `paymentStatus`, `status`, `statusLabel`, `createdAt` y
`updatedAt`. Las columnas **Pago** y **Estado** van separadas y las dos salen del resumen, así que
la lista no abre ni un pedido: el contrato dice que ese dato «is already in the order document: the
row costs no extra read». Tabla amplia en
escritorio, tarjetas apiladas en móvil, badges de los siete estados e importes como `$ 1.450.000`,
sin «COP». Paginación **solo con `pageToken`**, porque el cursor es opaco: se avanza, no se salta a
una página concreta. Estados de carga, vacío —«Todavía no hay pedidos»—, error controlado y backend
no disponible.

La columna **Productos** enseña la primera línea del pedido con la foto, el nombre y las unidades
que trae `previewLine`, y añade «y N productos más» cuando `itemCount` es mayor que uno —esa resta
la hace el panel, porque el contrato dice que el backend no compone ese texto—. Cuando la línea no
tenía imagen se dice «Sin imagen» en lugar de disimularlo. Todo sale del **resumen**: la lista no
pide cada pedido por separado ni vuelve a leer el catálogo, y la foto es la de la instantánea, así
que un cambio posterior en el producto no reescribe lo que se vendió. En móvil esa miniatura abre la
tarjeta, con el nombre del producto bajo el del cliente.

Ficha, con la **instantánea** que trae el pedido: líneas con imagen, nombre, SKU, atributos,
cantidad, precio unitario y total; cliente con teléfono y correo; dirección con ciudad, departamento
e indicaciones; subtotal, envío y total; y las **Novedades**, que presentan ese historial
append-only de lo más reciente a lo más antiguo, más el recorrido de hitos dibujado desde el mismo
historial (ver «Recorrido de siete hitos» más abajo). **No se vuelve a leer el catálogo** para
reconstruir una línea: si el producto cambió después de la compra, el pedido tiene que seguir
diciendo qué se vendió y por cuánto.

Acciones resueltas por `orderActions`, una función **pura** sin jerarquía numérica, con su propia
batería de pruebas:

| Estado            | Acción            | `super_admin` | `master_admin` | `moderator` |
| ----------------- | ----------------- | ------------- | -------------- | ----------- |
| `paid`            | → `preparing`     | sí            | sí             | sí          |
| `preparing`       | → `ready_to_ship` | sí            | sí             | sí          |
| `ready_to_ship`   | → `shipped`       | sí            | sí             | sí          |
| `shipped`         | → `delivered`     | sí            | sí             | sí          |
| `pending_payment` | Cancelar          | sí            | sí             | **no**      |

Son **botones concretos** según el siguiente estado, no un selector: un desplegable con los siete
valores dejaría elegir transiciones que el backend rechaza. `pending_payment → paid` no se ofrece a
nadie: lo aplica el desenlace del pago. `delivered` y `cancelled` son finales. Cancelar depende
además del estado del pago (ver más abajo).

Toda mutación envía `expectedVersion` y **sustituye** el estado local con la respuesta autoritativa.
Ante `order_version_conflict` no se reintenta solo: se muestra «El pedido cambió» y se ofrece
recargar. Ante `order_cancellation_requires_refund` se explica que el reembolso todavía no existe, y
**no** se ofrece recargar, porque recargar no lo arregla. Para distinguir esos dos `409` el BFF ganó
un código propio, `refund_required`.

Cinco Route Handlers bajo `/api/admin/orders`, todos `server-only`: listado, ficha, cambio de
estado, cancelación y simulación de pago. Reutilizan la frontera que ya existía —sesión en cookie `__Host-`, validación
de `Origin` en las mutaciones, IAM, tiempo de espera, `no-store` y traducción a códigos estables—.
El navegador no conoce la URL del backend, ni la audiencia, ni el identity token, ni la cookie
interna, y **nada del pedido se guarda** en `localStorage` ni en `sessionStorage`.

Lo que las referencias de diseño muestran y **no** está, porque el contrato no lo publica: buscador,
filtros y chips por estado con sus conteos, tarjetas de métricas, rango de fechas, exportación,
«Pedidos que requieren atención», «Últimos pedidos», **método** de pago —tarjeta, marca, últimos
cuatro dígitos, referencia bancaria y fecha de cobro real—, descuento, canal de venta, selección
múltiple, paginación numérica, «Contactar cliente», «Imprimir», «Ver perfil», «Ver en mapa», notas
internas, observaciones del cliente y edición de cliente, dirección, líneas o precios. Tampoco hay
reembolso, ni pago manual, ni vista previa o reenvío de un aviso.

### Entrada del panel: la ruta raíz

`/` fue durante dos fases una portada técnica —«Panel administrativo en configuración»— que
enumeraba como **pendientes** la sesión BFF, el contrato OpenAPI y el catálogo, los pedidos y el
inventario. Las tres cosas llevaban fases implementadas: la pantalla se escribió en la fase 1 y
nadie volvió a tocarla, así que quedó describiendo un repositorio que ya no existía.

Ahora `/` no es una pantalla. Es una redirección declarada en `next.config.ts`, que Next resuelve
**antes del sistema de archivos y antes de renderizar**: el navegador recibe un `307` con
`location: /panel` y no llega a pintarse nada intermedio. Es temporal a propósito; un `308` se
cachea de forma indefinida y dejaría `/` secuestrado si algún día tuviera contenido propio.

La redirección **no** comprueba la sesión, y ahí termina su responsabilidad. Quien decide es
`/panel`, cuyo layout ya resuelve la cookie con `resolvePanelSession` y elige entre las cuatro
salidas que ya existían:

| Situación de la cookie             | Qué ocurre                                                    |
| ---------------------------------- | ------------------------------------------------------------- |
| No hay cookie                      | `redirect('/iniciar-sesion')` desde `resolvePanelSession`.    |
| Cookie válida                      | Se monta el shell y se pinta la portada del panel.            |
| Cookie rechazada (`401`/`403`)     | `SessionCleanup`: la frontera cliente borra la cookie y sale. |
| Backend caído o superficie apagada | `PanelUnavailable`: no expulsa a nadie por una caída.         |

Duplicar esa lógica en la raíz habría creado una segunda frontera de sesión capaz de contradecir a
la primera. `src/app/root-redirect.test.ts` fija el destino, el carácter temporal, la ausencia de
condiciones `has`/`missing` y —leyendo el árbol de fuentes— que ni la página ni su copy vuelvan.

Toda la superficie administrativa sigue siendo `noindex, nofollow`: lo declara el layout raíz en
`metadata.robots` y lo repite el layout del panel.

### Estado visual del panel

El panel tiene un solo sistema visual, compartido por todas las pantallas:

- **Marca**: el logotipo real (`public/assets/modulartess-logo.svg`) se sirve con `next/image` en el
  inicio de sesión, en la barra lateral y en la cabecera móvil. No queda ningún marcador dibujado
  con CSS.
- **Inicio de sesión**: dos columnas en escritorio —marca, «Bienvenido de nuevo» y una composición
  decorativa abstracta a la izquierda; tarjeta blanca con «Modulartess Admin», el distintivo de
  acceso administrativo y el formulario real a la derecha—. En móvil desaparece la columna
  decorativa. El formulario no cambió: los mismos campos, mensajes, `autocomplete` y candados.
- **Shell**: barra lateral blanca de ≈236 px con el logotipo, navegación con iconos de trazo y el
  elemento activo en degradado violeta; al pie, la sesión —avatar genérico, rol y cierre—. Fija en
  escritorio, estrecha entre 60 y 80 rem y cajón por debajo de 60 rem. La cabecera lleva el menú
  móvil, la ruta de la sección y el bloque de sesión; donde las referencias ponen buscador y campana
  no hay nada, porque ninguno tiene endpoint.
- **Navegación**: cinco entradas fijas —Dashboard, Pedidos, Productos, Envíos y Wallet—, comprobadas
  en `src/features/panel/navigation.test.ts`.
- **Tokens compartidos** en `globals.css`: superficies, bordes, sombras, radios, tamaños de
  miniatura y una paleta de estado —éxito, información, aviso, peligro, neutro y marca— que usan
  por igual los badges del catálogo, los de pedidos y el recorrido de estados.
- **Piezas comunes**: tarjeta, cabecera de tarjeta con icono, tabla, superficie de listado que se
  disuelve en móvil, paginación por cursor, campo de precio, estados de vacío y de error. Pedidos
  no duplica ninguna: las compone desde la base del catálogo.
- **Estados**: cargando, lista vacía, backend no disponible, recurso no encontrado, conflicto de
  versión, acción en curso, resultado de una mutación, imagen ausente e inventario en cero se ven
  igual en todas las pantallas.
- **Dashboard**: el resumen comercial real, descrito más abajo. Métricas, evolución de ventas,
  operación, distribuciones, productos más vendidos, pedidos recientes y avisos de atención, todo
  desde una sola lectura del backend.
- **Envíos y Wallet**: pantallas reales con estado «Próximamente». Explican de qué se ocuparán
  —despacho y seguimiento; vendido y cancelado— y **no** pintan importes, ni siquiera en cero, ni
  movimientos de ejemplo. Existen para que su entrada de la barra lateral no acabe en un 404; su
  contrato todavía no está publicado.

Las diferencias con las referencias visuales están enumeradas arriba, sección por sección: todo lo
que falta es lo que el contrato no publica, y nada de eso se aparenta con adornos.

### Revisión visual a seis anchos (fase 6)

Portada, listado de productos y alta/edición se revisaron contra el despliegue de staging a 1440,
1280, 1024, 768, 390 y 360 px, midiendo el ancho de desplazamiento del documento y el tamaño real
de cada control en lugar de juzgar a ojo. No se reescribió arquitectura ni se cambió ningún
comportamiento: los cuatro arreglos salen de un defecto comprobado.

- **Desplazamiento horizontal del listado.** `/panel/productos` desplazaba la **página** 54 px a
  1440, 178 px a 1280 y 433 px a 1024. La tabla no tenía la culpa: ya scrolleaba dentro de su
  tarjeta. El causante era el `.sr-only` de la columna «Acciones», absoluto y sin bloque contenedor
  propio, que se posicionaba contra el bloque contenedor inicial y escapaba al `overflow-x` de
  `.tableScroll`, estirando el documento hasta el ancho completo de la tabla. `.tableScroll` pasa a
  ser `position: relative`, que es lo que lo convierte en ese bloque contenedor. La tabla sigue
  desplazándose dentro de su superficie; la página ya no.
- **`composes` no es transitivo.** `.buttonDanger` componía `.buttonSecondary`, que a su vez compone
  `.button`, y el build emitía solo las dos primeras clases. El resultado era un botón con los
  estilos nativos del navegador —22 px de alto, sin radio, sin tipografía y sin anillo de foco— en
  «Archivar producto», la acción más delicada del detalle. Ahora la clase base se nombra de forma
  explícita y el botón mide 44 px como los demás. `.uploadButtonDisabled` tenía la misma cadena de
  dos saltos y el mismo arreglo.
- **Objetivo táctil del cajón.** El botón de menú medía 36 px, y es el único camino hacia las
  secciones por debajo de 60 rem —donde la navegación deja de estar a la vista—, así que siempre es
  una acción táctil. Pasa a 44 px, que siguen cabiendo en la cabecera móvil de 52 px.
- **Acción de fila y de tarjeta.** `.rowAction` —«Editar», «Ver producto»— se quedaba en 35 px
  siendo _la_ acción de cada tarjeta en móvil. Se añade al bloque `@media (pointer: coarse)` que ya
  existía, que es donde este proyecto sube los controles a 44 px sin agrandar el escritorio.

Lo comprobado y correcto, que por eso no se tocó: la portada no desplaza a ningún ancho; el cajón
abre, oscurece el fondo con su velo a pantalla completa y ofrece enlaces de 44 px; los formularios
del alta y del detalle no tienen ningún campo sin etiqueta, ningún `aria-describedby` roto ni
identificadores duplicados, y su jerarquía de encabezados es `h1` seguido de `h2` por sección; las
secciones plegables siguen en su sitio; y `.input`, `.iconButton`, `.copInput` y `.checkbox` ya
subían a 44 px bajo `pointer: coarse`, así que su tamaño con ratón no es un defecto.

### Sistema visual y referencias de diseño (fase 7)

Tres referencias definen el lenguaje del panel —listado de Productos, listado de Pedidos y detalle
de un pedido, cada una en escritorio y en móvil—: fondo gris lila muy claro, tarjetas blancas de
borde fino y sombra suave, violeta como color principal, verde/naranja/rojo/azul para los estados,
tablas compactas, iconografía de trazo y alta densidad sin saturación. Eso es lo que se adoptó, y
vive en los tokens de `globals.css` más `catalog.module.css` y `orders.module.css`.

**Las imágenes no son una fuente contractual.** Traen datos, columnas, métricas, filtros y acciones
que el backend no publica, y esa parte no se copia. La lista completa de lo omitido, con su motivo,
está en las tres secciones siguientes; `src/app/panel/surfaces.test.ts` la comprueba archivo por
archivo, y varias de sus expectativas se **derivan de la copia de OpenAPI**, de modo que el día que
el backend publique un campo la prueba pide la columna en vez de quedarse callada.

Piezas extraídas en esta fase, para que ninguna pantalla vuelva a ser un archivo único:
`PanelPageHeader`, `RefreshButton`, `ProductsTable`, `ProductMobileCard`, `OrdersTable`,
`OrderMobileCard`, `OrderPreviewThumb` y las cinco tarjetas del detalle del pedido
(`OrderProductsCard`, `OrderCustomerCard`, `OrderAddressCard`, `OrderSummaryCard`,
`OrderActivityCard`). Las cinco últimas comparten archivo: son piezas de una sola pantalla, no se
usan fuera de ella, y repartirlas en cinco archivos de veinte líneas no las haría reutilizables.

«Actualizar» es la única acción nueva de las referencias que se implementó, y recarga de verdad:
las pantallas son `force-dynamic` y sus lecturas van con `no-store`, así que `router.refresh()`
vuelve a llamar al backend.

### Integraciones y Wompi (fase 10)

**Configuración → Integraciones → Wompi.** La sección se llama así y no «dev_apis» ni
«integraciones técnicas»: el nombre describe la tarea —«configurar con qué pasarela cobro»— y no la
implementación. «Configuración» entró como sexta entrada de la barra lateral, la última, y
`navigation.test.ts` fija esa lista.

La integración elegida es **Web Checkout alojado**: quien compra paga en la página de Wompi y
vuelve. El panel no procesa tarjetas, no tiene formulario de pago propio y no toca un CVC.

#### La cadena, y por dónde no pasa

    navegador del panel → BFF server-only → backend privado → Firestore / Secret Manager

El navegador **nunca** habla con Wompi, ni con Firestore, ni con Secret Manager. No es una
convención: una llamada directa al proveedor necesitaría la llave privada en el cliente, y una al
almacén de secretos necesitaría credenciales de Google que el panel no tiene ni debe tener. Una
prueba lee el código del cliente y falla si aparece `wompi.co`, `googleapis.com`, `secretmanager` o
`firestore`.

Las lecturas —estado de la integración, bandeja de incidencias— salen de **Server Components** con
la sesión de la persona, `force-dynamic` y `force-no-store`. Las tres mutaciones pasan por rutas BFF
propias, que validan `Origin`, exigen la cookie `__Host-` y traducen el fallo a un código estable:

| Ruta BFF                                          | Backend                                          |
| ------------------------------------------------- | ------------------------------------------------ |
| `PATCH /api/admin/integrations/wompi`             | `PATCH /v1/admin/integrations/wompi`             |
| `POST /api/admin/integrations/wompi/test`         | `POST /v1/admin/integrations/wompi/test`         |
| `PATCH /api/admin/payment-incidents/{id}/resolve` | `PATCH /v1/admin/payment-incidents/{id}/resolve` |

#### Dónde vive cada cosa

| Dato                                          | Dónde                        | Qué ve el panel               |
| --------------------------------------------- | ---------------------------- | ----------------------------- |
| Llave pública                                 | Configuración, Firestore     | Enmascarada: `pub_test_…a1b2` |
| Llave privada, secreto de Eventos, Integridad | **Google Secret Manager**    | Solo si hay versión guardada  |
| Ambiente activo, relojes, contadores          | Configuración, Firestore     | Tal cual                      |
| Versiones de secreto                          | Punteros en la configuración | Nunca                         |

**Ningún secreto vuelve al navegador.** El contrato lo declara en los dos sentidos —los cuatro
campos son `writeOnly` y la respuesta no los publica— y el panel no invierte esa dirección en ningún
punto.

#### Permisos

| Permiso               | Qué permite                                                       | Quién         |
| --------------------- | ----------------------------------------------------------------- | ------------- |
| `integrations.read`   | Ver el estado y la bandeja de incidencias                         | super, master |
| `integrations.manage` | Editar credenciales, encender, rotar, revocar, cerrar incidencias | super_admin   |

La diferencia no es de grado: leer el estado de la pasarela es operación, y decidir con qué
credencial cobra la tienda o afirmar que un descuadre está resuelto, no. El backend exige lo mismo
por su cuenta; **la UI oculta, no autoriza**.

#### La pantalla: ambiente, cuatro llaves, guardar

La pantalla se llama **Configurar Wompi** y hace una cosa. Antes explicaba la arquitectura entera
—resumen operativo, tres relojes, versión de la configuración, rotación, prueba de conexión y una
tarjeta grande sobre producción— y enterraba lo único que alguien viene a hacer aquí. Nada de
aquello era falso; simplemente no era el trabajo de esta pantalla.

Lo que muestra:

1. Título **Configurar Wompi** y una línea: «Selecciona el ambiente y pega las cuatro llaves que
   aparecen en Desarrolladores dentro de Wompi.»
2. Un selector con **Pruebas (Sandbox)** y **Producción**.
3. Los cuatro campos: Llave pública, Llave privada, Secreto de Eventos, Secreto de Integridad.
4. El botón **Guardar llaves**.
5. Un estado pequeño junto al selector: **Sin configurar** o **Configurado**, del ambiente elegido.
6. Debajo de ese estado, el interruptor de **pagos de prueba** (ver más abajo).
7. Al guardar bien: «Las llaves de Wompi quedaron guardadas correctamente.»
8. Un bloque plegado, **Configuración avanzada**, con la URL de eventos y la de retorno del
   ambiente seleccionado.

#### Activar pagos de prueba

Es el único control de encendido que queda, y vive **debajo del estado de credenciales**, no junto
a «Guardar llaves». El sitio es parte de lo que dice: guardar una credencial no mueve dinero
—la escribe en el almacén de secretos y mueve un puntero—, mientras que activar un ambiente es lo
que hace posible que se abra un checkout. El backend las trata como dos operaciones distintas y el
panel también.

| Estado de Sandbox       | Qué se ve                                                             |
| ----------------------- | --------------------------------------------------------------------- |
| Sin configurar          | **Nada.** No se pinta el control                                      |
| Configurado y apagado   | «Pagos de prueba desactivados» y el botón **Activar pagos de prueba** |
| Configurado y encendido | «Pagos de prueba activos» en verde y **Desactivar pagos de prueba**   |

Con Sandbox incompleto no se pinta un botón deshabilitado: invitaría a pulsarlo para averiguar por
qué, y lo que falta ya lo dice la insignia justo encima. El verde nunca va solo —lleva su texto—,
así que quien no lo distingue lee lo mismo.

El cuerpo lleva `environment: "sandbox"` **escrito, no tomado del selector**: si saliera del
selector, tener Producción elegido y pulsar aquí mandaría `environment: "production"`. Va con la
`expectedVersion` vigente y con `enabledForNewPayments` y nada más: ninguna credencial viaja en
esta operación, porque no las toca y mandarlas escribiría una versión nueva en el almacén de
secretos cada vez que alguien enciende o apaga. Un conflicto se traduce y relee; nunca se
reintenta solo con la versión vieja, y el resultado sale de releer el Server Component, no de
adelantarlo aquí.

Producción tiene **su propio control**, `ProductionPaymentsControl`, descrito en «Cobros reales de
Producción» más abajo. El de Pruebas no tiene rama de Producción: el formulario pinta uno u otro
según el ambiente seleccionado, y cada uno lleva su ambiente escrito.

Sin `integrations.manage` se ve el estado pero no el botón.

Medida en los componentes reales con su CSS real a 1440, 1280, 1024, 768, 390 y 360 px: sin
desbordamiento horizontal, sin texto vertical, tarjeta centrada y acotada en 44rem, cuatro campos
en dos columnas hasta 768 px y en una a partir de 390, «Guardar llaves» a 44 px de alto y de ancho
completo por debajo de 40rem, el interruptor de pagos de prueba a 44 px con su estado envolviendo
a su lado, y «Configuración avanzada» cerrada de partida en las seis.

La URL de eventos se queda porque Wompi la pide **por ambiente** en su propio panel y hay que poder
copiarla. Va plegada y no en una columna propia: no se toca cada vez, y no compite con las llaves.

El **interruptor de habilitar cobros** también está ahí, y no junto al botón de guardar, porque son
dos decisiones distintas: guardar una llave la escribe en el almacén de secretos y no mueve dinero;
encender un ambiente es lo que hace posible un cobro. El backend las separa desde esta fase, y el
panel lo refleja. En **Producción** el interruptor no se ofrece mientras el despliegue bloquee los
cobros; cuando los permite, activarlos exige confirmación escrita.

#### Los dos ambientes, y el error que se corrigió

El panel de Wompi enseña las llaves de **Producción** por omisión. El panel administrativo, en
cambio, mandaba siempre `environment: "sandbox"`, así que pegar esas llaves —lo más natural del
mundo— producía un `payment_integration_invalid` que no decía ni que las llaves eran de producción
ni que producción estuviera bloqueada.

Ahora el **ambiente seleccionado decide qué conjunto se actualiza**, y antes de enviar se comprueban
los prefijos contra ese ambiente:

| Selector   | Llaves pegadas           | Mensaje                                                                            |
| ---------- | ------------------------ | ---------------------------------------------------------------------------------- |
| Sandbox    | Las cuatro de Producción | «Estas llaves son de Producción. Cambia el ambiente a Producción para guardarlas.» |
| Producción | Las cuatro de Sandbox    | «Estas llaves son de Pruebas. Cambia el ambiente a Pruebas para guardarlas.»       |
| Cualquiera | Unas de cada ambiente    | «Las cuatro llaves deben pertenecer al mismo ambiente.»                            |
| Cualquiera | Algo que no lo es        | «Estos valores no parecen llaves de Wompi. Cópialos de nuevo desde Wompi.»         |
| Cualquiera | Falta alguna             | «Faltan llaves: …. Hacen falta las cuatro del ambiente seleccionado.»              |

La **mezcla** tiene mensaje propio porque es el único caso en el que mover el selector no arregla
nada: con dos llaves de cada ambiente, cualquiera que se elija deja dos fuera. Decir «cambia a
Producción» ahí mandaría a dar vueltas.

Cada fallo trae además un texto corto que se pinta **debajo del campo señalado** —«Es una llave de
Producción», «Esta llave es obligatoria»— y el foco salta al primero. Con cuatro campos
`type="password"`, idénticos en pantalla y sin enseñar su contenido, un único mensaje al pie no
dice en cuál está el problema. El error va en `role="alert"`, y el `aria-describedby` del campo
nombra **el error primero y la ayuda después**: primero qué hay que corregir, luego con qué
prefijo se corrige.

Esa comprobación es **ayuda, no autoridad**: vive en `wompi-credential-check.ts`, es pura, y el
backend vuelve a validarlo todo. Existe para no gastar una llamada y para poder explicar el error
donde se pegó. Los ocho prefijos están duplicados ahí a propósito: son un dato público y estable
del proveedor, no una regla de negocio.

El backend, por su parte, distingue tres códigos que el BFF traduce a mensajes propios:
`wompi_credentials_environment_mismatch`, `wompi_credential_prefix_invalid` y
`wompi_credentials_incomplete`. Ninguno lleva un valor, un fragmento ni una longitud.

**Guardar llaves de Producción es válido y no habilita cobros reales.** La pantalla nunca afirma lo
contrario.

#### Las credenciales, campo a campo

Los cuatro campos son `type="password"` con `autoComplete="new-password"` y `spellCheck` apagado, y
nacen vacíos.

`new-password`, no `off`: los navegadores llevan años ignorando `off` en campos de contraseña y
ofreciendo autocompletar igualmente, y `new-password` es la señal que sí respetan para no rellenar
ni guardar. Con `off`, un gestor de contraseñas podía quedarse la llave privada de la pasarela.

- **Se vacían solo al guardar correctamente.** Si el guardado falla, lo escrito se conserva: pegar
  cuatro credenciales cuesta, y un fallo de red no es motivo para obligar a repetirlo. Una vez
  guardadas, en cambio, no hay ninguna razón para dejarlas en el DOM.
- **`trim()` antes de enviar, y solo en los extremos.** Copiar del panel de Wompi arrastra un
  espacio o un salto de línea constantemente. El interior no se toca nunca: un espacio en medio es
  otra cadena, y el backend —que es la autoridad— lo rechaza.
- **Se exigen las cuatro.** El contrato admite mandar solo algunas —omitir una conserva la actual—,
  pero esta pantalla existe para pegar el juego completo de un ambiente, y aceptar tres dejaría una
  configuración a medias que no abre ningún checkout y parece guardada.
- Los valores viven en el estado del componente y en ningún sitio más: sin estado global, sin
  `localStorage`, sin `sessionStorage`, sin cookie y sin query string.
- **Ningún valor entra en un mensaje de error**, ni en un registro. Lo que se enseña es el texto
  traducido del código del BFF, o la comprobación local de prefijos.
- La llave pública se escribe también como contraseña aunque no lo sea: se pega junto a las otras
  tres, y un campo en claro en medio de tres ocultos invita a pegar la equivocada en el visible.
- `expectedVersion` viaja siempre. Ante un conflicto se relee la configuración y se muestra «La
  configuración cambió. Revisa el estado y vuelve a guardar.», conservando lo escrito.

#### URL de eventos

Se muestra de **solo lectura**, con botón de copiar, dentro de «Configuración avanzada», y la deriva
el backend de su propia configuración. No se construye en el panel: componerla con el origen del
navegador la ataría a desde dónde se abrió, y un panel abierto por un túnel local configuraría en
Wompi una URL que no existe fuera de esa máquina. Se muestra también la URL de retorno, por el mismo
motivo.

La ruta se publicará mediante **API Gateway**; Cloud Run sigue privado por IAM.

#### Lo que se retiró de la pantalla

El resumen operativo, los tres relojes, el contador de secretos retirados, la versión de la
configuración, la tarjeta de rotación, la de prueba de conexión, la tarjeta grande sobre producción
y los textos sobre API Gateway y reconciliación. La tarjeta de resumen de **Configuración →
Integraciones** sigue enseñando el estado general, y las incidencias tienen su propia pantalla; el
resto está documentado en el backend, que es donde ocurre.

La prueba de conexión sigue existiendo como ruta BFF y como endpoint del backend; lo que se quitó es
su tarjeta.

**Rotar un solo secreto ya no se puede desde aquí.** La pantalla exige las cuatro llaves del
ambiente, así que rotar el secreto de Eventos significa volver a pegar las cuatro. Es el precio de
que un formulario de cuatro campos no pueda dejar una configuración a medias, y el backend sigue
admitiendo el `PATCH` parcial: si hiciera falta una pantalla de rotación fina, se añadiría aparte.

#### Cobros reales de Producción

El backend levantó el bloqueo de su despliegue y responde `livePaymentsEnabled: true`. Eso **no
cobra nada**: `production.enabledForNewPayments` sigue en `false` hasta que una persona lo active
aquí. La decisión completa está en
[`0006-wompi-live-payments-activation.md`](../decisions/0006-wompi-live-payments-activation.md).

| Estado de Producción                           | Qué se ve                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Sin las cuatro llaves                          | **Nada**: solo el formulario de llaves                                    |
| Llaves guardadas y `livePaymentsEnabled=false` | «Este despliegue todavía bloquea los cobros reales». Sin botón            |
| Permitido y apagado                            | «Cobros reales desactivados» y el botón visible **Activar cobros reales** |
| `production.enabledForNewPayments=true`        | «Cobros reales activos» y **Desactivar cobros reales**                    |

- **Activar** abre una confirmación que dice que desde ese momento se cobra dinero real y pide
  escribir `ACTIVAR PRODUCCIÓN`. Es un `<form>` propio: el de llaves ya no envuelve el selector ni
  los interruptores, para que Intro en la frase no envíe las llaves.
- **El cuerpo** es `expectedVersion`, `environment: "production"` y `enabledForNewPayments`. Ninguna
  credencial ni campo vacío.
- **Después** se relee el estado con `router.refresh()`, se cierra la confirmación y la frase se
  vacía tras cualquier intento. Conflicto, permisos y `live_payments_not_enabled` tienen mensaje
  propio; el conflicto y el bloqueo releen.
- **Desactivar** no pide frase: no borra nada y los pagos en vuelo se siguen cerrando.
- Si Producción está encendida y el backend informa otro `activeEnvironment`, se dice.
- La tarjeta de Integraciones dice **Bloqueados**, **Sin llaves de Producción**, **Desactivados** o
  **Activos**, y ya no «Habilitados» por el solo hecho de que el despliegue lo permita.

#### Addi

Se anuncia como **pendiente de integración** y no ejecuta nada: sin botones, sin enlaces, sin
formulario y sin cifras. El backend ya contempla más de un proveedor, pero Addi no tiene contrato, y
un botón «Configurar» que llevara a un formulario vacío prometería una integración que no existe.

#### Incidencias de pago

Eventos que llegaron **con firma válida** y cuyos datos comerciales no cuadraban: otro monto, otra
moneda, una referencia desconocida, una transacción ya asociada a otro intento. No son intentos de
fraude rechazados —esos se caen antes, en la verificación de firma— sino inconsistencias reales
entre lo que se cobró y lo que creemos haber cobrado.

- Filtros por estado, ambiente y motivo, **en la URL**: se enlazan, el botón Atrás funciona y
  «Actualizar» recarga lo que se estaba mirando. Un valor que el contrato no publica no viaja.
- **Paginación por cursor opaco**, como el resto del panel: el enlace se llama «Página siguiente»
  y **sustituye** lo que se está viendo. No acumula resultados debajo de los actuales, y por eso no
  se llama «Cargar más»: con un cursor opaco eso no ocurre, ni podría sin un estado de cliente que
  el resto del panel no tiene. Los filtros vigentes viajan en el enlace, así que pasar de página no
  los pierde.
- Tabla en escritorio y tarjetas por debajo de 75rem: la tabla lleva siete columnas y dos son
  identificadores largos que no se parten por palabras.
- Cerrar exige `expectedVersion` y un `resolutionCode` de los **cinco** del contrato. **No hay texto
  libre**, y no es una carencia: una nota acabaría guardando el correo de quien pagó o un fragmento
  de la respuesta del proveedor.
- Una incidencia resuelta **puede reabrirse**. El contrato lo dice y la pantalla no la presenta como
  definitiva: sigue enseñando su motivo de cierre y añade que, si el mismo hecho vuelve a ocurrir,
  se reabre sola.
- La proyección lleva códigos cerrados e identificadores técnicos y **nada más**: sin payload, sin
  firma, sin correo, sin dirección, sin método de pago y sin monto recibido.

#### El contador de incidencias de la tarjeta

El contrato **no publica un total** de incidencias: la bandeja pagina por cursor. La tarjeta de
Wompi pide **una sola página** de 50 con `status=open`, y por eso no puede presentar el tamaño de
esa página como si fuera el total. Lo que hace es decir hasta dónde sabe, con un tipo explícito:

| Respuesta del backend | Qué muestra la tarjeta |
| --------------------- | ---------------------- |
| Sin `nextPageToken`   | La cantidad **exacta** |
| Con `nextPageToken`   | «N o más»              |
| La consulta falló     | «No disponible»        |

Lo que decide es **el cursor**, no que la página venga llena: 50 resultados sin cursor siguen siendo
un total exacto, y 50 con cursor son un mínimo. Con «N o más» la fila añade una línea que explica
que la bandeja pagina y que hay que abrirla para verlas todas.

«No disponible» no es cero y no se confunde con él: significa que no se sabe si hay incidencias.

**No se recorren todas las páginas** para dar un total —convertiría una tarjeta de resumen en tantas
llamadas como páginas haya, que es lo que la paginación por cursor existe para evitar— ni se
consulta el Dashboard para esto, que responde otra pregunta y con otro alcance.

#### Dashboard: ambiente financiero

`salesEnvironment` es un **filtro, no una etiqueta**. El contrato es tajante: ninguna cifra
monetaria significa nunca «sandbox + live», y para ver el otro ambiente hay que preguntar otra vez.
No hay ningún total combinado en la pantalla.

Con `sandbox`, un aviso va **antes de las cifras**, no se puede cerrar y dice que `approvedSales` no
es ingreso. El aviso lleva borde discontinuo además del color: la diferencia entre «esto es real» y
«esto no lo es» no puede depender de distinguir dos tonos. El enlace al otro ambiente dice cuántos
pedidos hay allí, para que «ver ventas reales» no parezca una pestaña vacía.

El ambiente vive en la URL junto al período, y cambiar uno conserva el otro. Nada se clasifica ni se
suma en el cliente: las métricas llegan resueltas. Períodos, rango personalizado, `truncated` y la
accesibilidad de la pantalla quedaron intactos.

**Incidencias abiertas** entró en «Requiere atención» como sexto contador, con enlace a la bandeja.

#### Accesibilidad

Un solo `h1` por pantalla, `h2` por tarjeta y `h3`/`h4` dentro. Cada control lleva `label` con
`for`/`id`, y la ayuda va enlazada con `aria-describedby`. Ningún estado depende solo del color: las
pastillas llevan texto completo, la tarjeta de Addi lleva borde discontinuo y el aviso de datos de
prueba también. Las confirmaciones son bloques en la pantalla, no diálogos nativos. El resultado de
copiar se anuncia con `aria-live`.

#### Medición responsive

Medido a 1440, 1280, 1024, 768, 390 y 360 px sobre los componentes reales con su CSS real,
reproduciendo la rejilla del shell. **Desplazamiento horizontal: cero en los seis anchos**, y ningún
texto vertical.

| Ancho | Tarjetas por fila | Incidencias |
| ----- | ----------------- | ----------- |
| 1440  | 2                 | Tabla       |
| 1280  | 2                 | Tabla       |
| 1024  | 2                 | Tarjetas    |
| 768   | 1                 | Tarjetas    |
| 390   | 1                 | Tarjetas    |
| 360   | 1                 | Tarjetas    |

Dos arreglos salen de la medición: las tarjetas de proveedor se apilan por debajo de 60rem —a 768
quedaban en dos columnas de 353 px con fechas largas y una llave enmascarada dentro— y los textos de
ayuda perdieron el énfasis de Markdown, que se estaba pintando como asteriscos literales en el DOM.

#### Pendiente de infraestructura

Nada de esto está en el repositorio del panel, y sin ello la integración no recibe eventos:

1. Precrear los secretos de sandbox en Secret Manager y dar el IAM mínimo al backend.
2. Publicar **solo** la ruta del webhook mediante API Gateway, manteniendo Cloud Run privado.
3. Configurar esa URL en el comercio de Wompi (sandbox).
4. Probar eventos reales de sandbox.
5. Activar Producción desde el panel **solo** cuando se decida cobrar, escribiendo la frase de
   confirmación. Este paso no lo ejecuta nadie más que la persona que lo decide.

Ninguno de esos pasos se hace desde el panel, y ninguno necesita un valor secreto en este
repositorio.

### Dashboard comercial (fase 9)

`/panel` consume **una sola operación**, `GET /v1/admin/dashboard/summary`, y pinta lo que devuelve.
Es un Server Component `force-dynamic` con `fetchCache = 'force-no-store'`: la llamada sale del
servidor de Next con la sesión de la persona, así que el navegador no conoce la URL del backend ni
la cookie. **No hay Route Handler**, y no es un olvido: un BFF aquí sería un salto de más sin nada
que añadir, porque no hay mutación que proteger ni `Origin` que validar.

**Ninguna cifra se calcula en el panel.** El contrato es explícito —«every figure comes from real
stored data; nothing is estimated, sampled or generated»— y la tentación concreta que hay que
evitar tiene nombre: derivar las ventas del listado de pedidos. No son lo mismo. Una venta se
atribuye a la fecha en que el pago se **aprobó**, no a la de creación del pedido, así que un pedido
hecho el 30 y pagado el 2 es una venta del mes siguiente. Sumar pedidos creados daría otra cosa con
aspecto de lo mismo.

#### El período vive en la URL

`/panel?period=today`, `?period=7d`, `?period=30d` y `?period=custom&from=…&to=…`. No hay estado de
React en el selector: los botones son **enlaces**, cambiar de período navega y vuelve a ejecutar el
Server Component. Eso es lo que hace que el resultado se pueda enlazar, que el botón Atrás funcione
y que «Actualizar» recargue exactamente lo que se estaba mirando.

| Regla                                         | Qué hace el panel                                           |
| --------------------------------------------- | ----------------------------------------------------------- |
| Valor por defecto                             | `30d`                                                       |
| `period` desconocido                          | Cae en `30d` en lugar de gastar un `400`                    |
| Parámetro repetido                            | Se conserva **el primero**                                  |
| `from`/`to` con un período que no es `custom` | Se descartan: el contrato los rechaza                       |
| `from`/`to` con forma que no es `YYYY-MM-DD`  | No se envían                                                |
| Rango invertido o demasiado largo             | Viaja tal cual: lo rechaza el backend, que es quien lo sabe |

**El panel no calcula ni una fecha.** Son días de calendario colombianos, y derivarlos del reloj de
quien mira daría un día distinto según dónde esté —que es cómo un resumen «de hoy» acaba siendo el
de ayer—. El rango resuelto y el de comparación llegan en `period.from`, `period.to`,
`period.previousFrom` y `period.previousTo`, y la pantalla los escribe. Una prueba lee el módulo y
falla si aparece un `new Date(`, un `Date.now(` o un `setDate(`.

El rango personalizado es un formulario `GET` de verdad, con dos campos `date` etiquetados: al
enviarlo el navegador construye la URL y navega. Funciona sin JavaScript.

#### Período contra fotografía

Son dos lecturas distintas y la pantalla lo declara, porque mezclarlas produce cifras falsas sin que
nada parezca roto:

| Del **período** seleccionado        | De **ahora mismo**, no cambia con el período |
| ----------------------------------- | -------------------------------------------- |
| `commerce` (las cinco métricas)     | `operations` (los ocho contadores)           |
| `salesSeries` (la evolución diaria) | `ordersByStatus` y `paymentsByStatus`        |
| `topProducts`                       | `attention`                                  |

Las tarjetas de operación y atención lo dicen en su propio texto: «Fotografía de ahora mismo. No
cambia al cambiar el período». Sin esa frase, pasar a «Hoy» y ver los mismos ocho números se lee
como un fallo —o peor, los números se leen como si fueran del día—.

#### Las cinco métricas

| Tarjeta           | Campo                                | Qué es, según el contrato                       |
| ----------------- | ------------------------------------ | ----------------------------------------------- |
| Ventas aprobadas  | `approvedSales.currentAmountCop`     | Suma de pedidos con pago aprobado en el período |
| Pedidos creados   | `createdOrders.currentCount`         | Intenciones de compra, **no** ventas            |
| Pedidos pagados   | `approvedOrders.currentCount`        | Primer pago válido aprobado en el período       |
| Unidades vendidas | `unitsSold.currentCount`             | Unidades de cada línea, no número de líneas     |
| Ticket promedio   | `averageOrderValue.currentAmountCop` | Ventas ÷ pedidos pagados; cero si no hubo       |

Cada una muestra el valor actual, el del período anterior y el cambio. Los importes se formatean
con el helper monetario de siempre: `$ 1.450.000`, sin «COP».

`changePercent` es lo que más fácil se presenta mal, y por eso vive en una función pura con sus
propias pruebas:

| Valor    | Se pinta            |
| -------- | ------------------- |
| positivo | `↑ 12,5 %`          |
| negativo | `↓ 8,3 %`           |
| `0`      | `Sin cambio`        |
| `null`   | `Sin base anterior` |

`null` **no se convierte en cero**: significa que el período anterior fue cero y el actual no, o
sea que el cambio no existe. Pintarlo como `0 %` diría que no hubo variación cuando la hubo entera.
Tampoco se muestra `Infinity`, `NaN` ni un «100 %» de relleno. La dirección va en el texto y en una
frase para lector de pantalla, nunca solo en el color de la pastilla.

#### Lectura truncada

Cuando `summary.truncated` es `true`, las cifras del período son un **mínimo**. El contrato explica
por qué se publica en vez de esconderse: «a partial sum presented as a total is a false figure». El
panel muestra un aviso **antes** de las tarjetas, sin botón de cerrar, con el texto «La consulta
alcanzó su límite de lectura. Las cifras mostradas son valores mínimos y pueden existir más
movimientos». **Ninguna cifra se cambia**: lo que cambia es lo que se puede afirmar de ellas.

#### Evolución de ventas

Un SVG dibujado a mano, sin librería de gráficas: un área, una línea y unas etiquetas caben en
cincuenta líneas, y una dependencia entera traería su propio modelo de datos, su tema y su manera
de romperse. Es un Server Component porque no hay interacción.

**No hay tooltip**, y tampoco es un olvido: un tooltip que solo aparece al pasar el ratón deja fuera
a quien navega con teclado y a quien usa una pantalla táctil. La lectura exacta vive en un
`details` con la tabla de valores por día —fecha, ventas aprobadas, pagados y creados—, abierto a
todo el mundo y no escondido en un `sr-only`.

La geometría vive en `dashboard-chart.ts`, puro y probado, que es donde está lo que puede romper un
gráfico sin que nada parezca roto:

- **todos los puntos se conservan**; lo que se reduce son las **etiquetas**, a seis como mucho,
  siempre con la primera y la última;
- **nunca se divide por cero**: la serie entera en cero se apoya en el suelo y se dice con palabras,
  y un solo día se dibuja centrado;
- **las fechas van como vienen**, ascendentes y en día colombiano.

`approvedOrders` y `createdOrders` se muestran como contexto en texto, **fuera de la escala
monetaria**: son conteos, y superponerlos al eje de pesos invitaría a comparar dos magnitudes que no
se comparan.

#### Distribuciones, productos y pedidos recientes

Las barras usan la `label` que manda el backend y conservan `status` como clave. Se incluyen los
estados con cero, y con el total en cero **no se inventa ningún porcentaje**: la barra queda con
trazo discontinuo. La tarjeta explica que `paymentsByStatus` puede sumar menos que `ordersByStatus`,
porque los pedidos anteriores al modelo de pago no tienen bloque de pago.

`topProducts` sale de la instantánea histórica: el nombre y la imagen son los del momento de la
venta. El contrato lo subraya —«It is never read from the current catalogue»— y releer el catálogo
reescribiría lo que se vendió además de convertir una tarjeta en cinco llamadas. Sin estrellas, sin
calificaciones y sin descuentos.

`recentOrders` viaja **dentro del propio resumen**, con la misma proyección que el listado, así que
no se pide ni un pedido por separado. Comparte las piezas de Pedidos: miniatura de la instantánea,
pastilla de pago, pastilla de estado y formato monetario. Tabla compacta en escritorio y tarjetas
apiladas por debajo de 75rem.

#### Requieren atención

Los cinco contadores del contrato y ninguno más. Tres llevan al listado que corresponde;
`failedNotifications` **no lleva a ninguna parte** porque la outbox no tiene superficie
administrativa, y se dice en lugar de inventar una pantalla. No hay botones «Resolver»,
«Reintentar» ni «Ver notificaciones»: esos endpoints no existen. Con los cinco en cero la tarjeta
dice «Sin novedades» en lugar de enseñar cinco ceros.

Los enlaces no llevan filtros en la URL. El listado todavía no los admite, y un enlace con un
parámetro que nadie lee prometería un filtro que no ocurre.

#### Estados vacíos y errores

El Dashboard sigue siendo útil con todo en cero: **no se sustituye la pantalla por un vacío
global**. Las tarjetas muestran cero, el gráfico dibuja su línea en el suelo y lo explica,
`topProducts` y `recentOrders` tienen su vacío local, y atención dice «Sin novedades».

| Código del contrato       | Qué se muestra                                   | Salidas                       |
| ------------------------- | ------------------------------------------------ | ----------------------------- |
| `dashboard_query_invalid` | «El período seleccionado no es válido»           | Reintentar · Volver a 30 días |
| `admin_forbidden`         | «Tu rol no tiene acceso al resumen de la tienda» | Reintentar                    |
| `dashboard_unavailable`   | «No pudimos cargar el resumen de la tienda»      | Reintentar                    |
| `admin_session_required`  | El tratamiento central de sesión, que ya existía | —                             |

«Volver a 30 días» solo aparece con una consulta inválida: ofrecerlo ante una caída sería un consejo
inútil, y ante una falta de permiso, engañoso. No se muestra ningún mensaje ni código interno del
backend. Los controles de período se pintan **también** en la pantalla de error, porque quien acaba
de pedir un rango imposible los necesita justo ahí.

#### Comportamiento responsivo, medido

Los estilos viven en `src/features/panel/dashboard.module.css`, aparte a propósito para que
`catalog.module.css` no se convierta en el cajón de todo el panel. Se midió a 1440, 1280, 1024, 768,
390 y 360 px sobre los componentes reales con su CSS real, reproduciendo la rejilla del shell
—barra lateral completa, compacta entre 60 y 80rem, cajón por debajo— porque las media queries miran
el viewport y no el contenedor.

| Ancho | Contenido | Métricas | Principal  | Secundarios | Pedidos recientes |
| ----- | --------- | -------- | ---------- | ----------- | ----------------- |
| 1440  | 1204 px   | 5        | 2 columnas | 2 columnas  | Tabla             |
| 1280  | 1080 px   | 5        | 2 columnas | 2 columnas  | Tabla             |
| 1024  | 824 px    | 3        | 1 columna  | 2 columnas  | Tarjetas          |
| 768   | 768 px    | 2        | 1 columna  | 1 columna   | Tarjetas          |
| 390   | 390 px    | 1        | 1 columna  | 1 columna   | Tarjetas          |
| 360   | 360 px    | 1        | 1 columna  | 1 columna   | Tarjetas          |

**Desplazamiento horizontal de la página: cero en los seis anchos**, y ningún texto vertical. Los
cuatro arreglos salen de un defecto comprobado, no de una intuición:

- **La quinta métrica caía sola.** Con `auto-fit` y un mínimo de 13rem, a 1280 px el contenido útil
  —1016 px, porque ahí la barra lateral está compacta— solo daba para cuatro. Los cortes pasan a
  escribirse en `min-width`, y en `min-width` y no en `max-width` porque 1280 px son 80rem
  **exactos**: ese píxel es el que separa «cinco métricas» de «cuatro y una».
- **El nombre del cliente se escribía en vertical.** A 1024 px la tabla de pedidos recientes pedía
  781 px dentro de una caja de 713, y el navegador aplastaba esa columna hasta 13 px de ancho por
  504 de alto. La tabla pasa a tarjetas en 75rem —el mismo corte que la rejilla principal— y el
  nombre deja de partirse entre letras.
- **«Aplicar» era un rectángulo gris.** El botón reutilizaba la pastilla del selector, que no lleva
  fondo, así que quedaba con el fondo por defecto del navegador y el texto ilegible. Pasa a usar el
  botón secundario del panel.
- **El selector de período se partía en dos.** `catalog.module.css` da a cada acción del encabezado
  `flex: 1 1 9rem` por debajo de 40rem, y con esa base el selector y el formulario de fechas se
  colocaban uno al lado del otro: «Hoy | 7 días» arriba y «30 días» debajo. Hace falta anular la
  base, no solo pedir `width: 100%`.

#### Accesibilidad

Un solo `h1` —el de `PanelPageHeader`—, tarjetas en `h2` y subsecciones en `h3`. El selector de
período es un `nav` con nombre accesible y marca el activo con `aria-current="true"`, que es lo que
un lector de pantalla anuncia; el estilo cuelga de ese atributo para que la marca visual y la
accesible no puedan separarse. Los dos campos de fecha tienen `label` real con `for`/`id`. El
gráfico es un `role="img"` con `aria-label` que dice el rango y el máximo diario, más la tabla de
valores. Ninguna tendencia se comunica solo con color: la flecha y el signo van en el texto y la
frase completa en un `sr-only`. El aviso de truncado es un `role="status"`. Las imágenes de producto
llevan `alt` con el nombre histórico, y los iconos repetidos van con `aria-hidden`.

#### Lo que el Dashboard no muestra

Ni **Wompi**, ni **Addi**, ni ningún otro proveedor o integración: no tienen contrato, y un nombre
de proveedor en un panel administrativo se toma por una integración que existe. Tampoco metas de
venta, comparativas contra presupuesto, márgenes, devoluciones ni clientes como entidad. Una prueba
lee el código fuente y falla si alguno aparece. **Envíos y Wallet siguen siendo superficies
pendientes**, con su pantalla «Próximamente»; el Dashboard ya no anuncia nada como próximo.

#### Límites heredados del backend

Se documentan porque quien lee las cifras tiene que conocerlos:

- **Pedidos legados sin `approvedAt`**: los escritos antes del modelo de pago reportan `null` hasta
  su próxima escritura válida, así que pueden no entrar todavía en las ventas históricas.
- **`paymentsByStatus` puede sumar menos que `ordersByStatus`**: los pedidos sin bloque de pago no
  se cuentan en ninguno de los estados de pago. La tarjeta lo explica en pantalla.
- **El inventario bajo solo cubre productos base**: los que venden por variante no se cuentan
  porque el modelo no guarda un umbral por variante, e inventarlo convertiría una alerta operativa
  en una cifra sin respaldo. La tarjeta también lo dice.
- **`failedNotifications` no tiene listado**: se cuenta, y el detalle llegará cuando el contrato
  publique una superficie para la outbox.
- **Máximo de 92 días** en un rango personalizado, y el rechazo lo emite el backend.

### Pedido y pago son dos lecturas distintas

El estado del **pedido** dice por dónde va el trabajo; el estado del **pago** dice si el dinero
llegó. El contrato publica los dos por separado —`order.status` y `payment.status`— y el panel
mantiene la separación en todas las pantallas: dos columnas en el listado, dos pastillas en la
cabecera del detalle, dos escalas de color que no comparten ningún token, y dos historiales
distintos.

**El texto del estado del pedido ya no lo escribe el panel.** El contrato publica la etiqueta
autoritativa en `AdminOrderSummaryDto.statusLabel`, en `AdminOrderDto.statusLabel` y, hito a hito,
en `timeline[].label` y `paymentEvents[].label`. `order-status.ts` dejó de tener tabla de
traducciones y se quedó con lo que sí es del panel: la variante visual y un último recurso —si la
etiqueta llegara vacía se pinta el valor técnico—. El motivo está en el propio contrato:
`pending_payment` se lee «Pedido recibido» como hito y «Pendiente de pago» como estado, y esa regla
«cannot be derived from the enum». Dos tablas habrían acabado diciendo cosas distintas del mismo
pedido en el panel y en la tienda.

El **pago** sí conserva un mapa cerrado, y no contradice lo anterior: `AdminOrderSummaryDto`
publica `paymentStatus` **sin** etiqueta, porque una fila del listado no trae la ficha de pago.
Vive en `payment-status.ts` y una prueba lo compara contra el enum del contrato.

| `paymentStatus` | Panel         |
| --------------- | ------------- |
| `pending`       | Pendiente     |
| `processing`    | Procesando    |
| `approved`      | Pagado        |
| `declined`      | Rechazado     |
| `expired`       | Vencido       |
| `error`         | Error técnico |

Donde sí hay etiqueta —el detalle, con `payment.statusLabel`, y cada evento con su `label`— se usa
la del backend.

### Recorrido de siete hitos

Son siete, y están los siete: pedido recibido, pago confirmado, pedido confirmado, en producción,
listo para envío, enviado y entregado. Los arma `order-journey.ts`, una función pura, combinando
**dos** historiales.

| Hito              | Fuente                                 |
| ----------------- | -------------------------------------- |
| Pedido recibido   | `timeline` → primera `pending_payment` |
| Pago confirmado   | `paymentEvents` → primera `approved`   |
| Pedido confirmado | `timeline` → primera `paid`            |
| En producción     | `timeline` → primera `preparing`       |
| Listo para envío  | `timeline` → primera `ready_to_ship`   |
| Enviado           | `timeline` → primera `shipped`         |
| Entregado         | `timeline` → primera `delivered`       |

**El desempate por marca de tiempo es explícito y está probado.** El contrato avisa de que la
entrada de pago y la del pedido se escriben en la misma transacción y pueden llevar el mismo `at`,
«so sorting by `at` alone does not decide between them». En el recorrido no hay ningún `sort` que
tenga que decidirlo: cada hito se resuelve contra **su** fuente y la posición es la del diseño, así
que «Pago confirmado» va siempre antes que «Pedido confirmado» aunque compartan instante. Las
fechas no se tocan: separarlas para que «se vea mejor» sería falsear el historial.

Reglas que la implementación respeta y que están cubiertas por pruebas:

- **Lo que marca un hito es el historial**, no la posición del estado actual.
- **Solo `approved` completa «Pago confirmado».** Un intento rechazado, vencido o con error no
  completa ningún hito; queda en el historial de pago, que es otra tarjeta.
- **Compatibilidad con pedidos anteriores.** Un pedido cuyo recorrido fue `preparing → shipped`
  —`ready_to_ship` no existía cuando se procesó— enseña ese hito como **no registrado**: círculo de
  borde discontinuo con un guion en vez del check, texto «No registrado: el pedido avanzó sin dejar
  constancia de este paso» para el lector de pantalla, y una nota discreta bajo el recorrido. No se
  le inventa fecha y **no se afirma que ocurriera**. «No registrado» y «pendiente» son dos cosas
  distintas, y el stepper las distingue por forma, no solo por color.
- **Cancelado es una salida, no un octavo paso.** Se conservan los hitos alcanzados, los que no
  llegarán se quedan sin completar, la cancelación se cuenta aparte con su fecha, y un pedido
  cancelado no está «en» ningún hito.

### Acciones logísticas

`orderActions` es una función pura y decide **solo qué se muestra**. Ofrece como mucho la
**siguiente** transición válida, nunca un selector con todos los estados.

| Estado          | Acción            | Etiqueta                |
| --------------- | ----------------- | ----------------------- |
| `paid`          | → `preparing`     | Marcar en producción    |
| `preparing`     | → `ready_to_ship` | Marcar listo para envío |
| `ready_to_ship` | → `shipped`       | Marcar enviado          |
| `shipped`       | → `delivered`     | Marcar entregado        |

`preparing → shipped` **ya no se ofrece**: el contrato lo rechaza desde que existe `ready_to_ship`,
porque saltárselo perdía la única señal que distingue un pedido todavía en el taller de uno
terminado esperando al transportador. Los pedidos que ya lo tienen en su historial se siguen
leyendo, y pueden seguir avanzando. `pending_payment → paid` tampoco está aquí: lo aplica el
desenlace del pago, en la misma transacción que lo confirma.

### Cancelar depende también del estado del pago

Ya no basta con mirar `order.status`. Con un intento de pago **en curso** cancelar es una carrera:
el intento puede aprobarse entre que se lee la pantalla y se pulsa, y entonces se estaría
cancelando un pedido recién cobrado.

| `order.status`    | `payment.status`                       | ¿Se ofrece cancelar?    |
| ----------------- | -------------------------------------- | ----------------------- |
| `pending_payment` | `pending`/`declined`/`expired`/`error` | Sí, con `orders.cancel` |
| `pending_payment` | `processing`                           | **No**                  |
| Cualquier otro    | Cualquiera                             | No                      |

`moderator` no tiene `orders.cancel` en ningún caso: cancelar es irreversible. El backend sigue
siendo la autoridad, y una prueba dedicada impide que el panel vuelva a ofrecer cancelar con el
pago en curso.

### Información de pago

Tarjeta con lo que publica `OrderPaymentDto` y nada más: el estado con su `statusLabel`, el badge
derivado de `payment.status`, el entorno, el número de intentos y la última actualización.

Cuando `environment` es `sandbox` la tarjeta lo marca con un distintivo **«Simulación»** de borde
discontinuo —forma distinta, no solo color— y lo dice con todas las letras: «Entorno de pruebas. No
se realizó un cobro real». El contrato es explícito al respecto, y dejarlo implícito es exactamente
cómo alguien acaba creyendo que un pedido está cobrado. Con `attemptNumber` en cero se explica que
«todavía no se ha iniciado un intento de pago» en lugar de dejar un cero suelto.

**No hay método de pago**: ni tarjeta, ni marca, ni cuatro últimos dígitos, ni referencia bancaria,
ni fecha de cobro real. El contrato no publica ninguna de esas cosas, y en un panel administrativo
un dato inventado se toma por bueno.

El **historial de pago** va en su propia tarjeta, agrupado por intento —dos intentos son dos
historias, y aplanarlos haría leer un rechazo del primero como si fuera del segundo—. De cada
evento se pinta la etiqueta del backend, cuándo ocurrió, su entorno, el `publicMessage` cuando
existe y el motivo **solo** si el panel tiene una traducción cerrada para ese código. No se enseña
el `eventId`, ni el `source` técnico, ni ningún valor interno sin traducir, ni payloads.

### Simulador de pago (staging)

`POST /v1/admin/orders/{orderId}/payment-simulation` existe en el contrato y **no es una pasarela**:
solo está viva con `PAYMENT_SIMULATION_MODE=enabled` junto a `INTEGRATION_MODE=mock`, y si no,
responde `404` como si la ruta no existiera. Una aprobación mueve el pedido a `paid` para poder
recorrer el ciclo, pero no representa un cobro y no toca el inventario.

El panel lo muestra **solo** si se cumplen las tres condiciones a la vez, y las tres vienen de
fuera: `order.paymentSimulationEnabled`, `order.availableSimulationEvents` no vacío y el permiso
`payments.simulate`. Ese permiso se añadió a la matriz explícita de
`src/features/session/permissions.ts` y se concede **solo a `super_admin`**, siguiendo al contrato.
No se deduce de `orders.update_status`: mover el trabajo del día y decidir el desenlace de un pago
son cosas distintas.

Los botones salen **exclusivamente** de `availableSimulationEvents` —«the panel renders these
instead of reimplementing the state machine»—, con las etiquetas «Simular procesamiento»,
«Simular aprobación», «Simular rechazo», «Simular vencimiento» y «Simular error técnico». No hay
selector, ni campo libre, ni `reasonCode` escrito a mano: el contrato lo admite como código
acotado pero no publica la lista de valores, así que el BFF lo descarta antes de tocar el backend.

Antes de `approved`, `declined`, `expired` o `error` aparece una confirmación en la propia pantalla
—no un `confirm()` del navegador, que bloquea el documento— con el `publicId`, el resultado, el
aviso de entorno de pruebas, la aclaración de que no hay cobro y qué más se va a mover: historial y
avisos en vista previa o suprimidos.

### El `eventId` y la idempotencia

Es la pieza delicada de la fase y vive en un módulo puro, `payment-idempotency.ts`, con sus propias
pruebas. El contrato lo define así: «Replaying the same eventId with the same outcome changes
nothing; reusing it with a different outcome is a conflict». De ahí, tres reglas:

- se genera con `crypto.randomUUID()` **una vez por operación lógica**;
- **se reutiliza** al repetir exactamente la misma petición tras un resultado de red ambiguo,
  porque la primera pudo haberse aplicado y un identificador nuevo la duplicaría;
- se descarta en cuanto la operación se cierra, con éxito o con un rechazo definitivo del contrato.

Vive en memoria, en una `useRef` que se lee y se escribe **antes del primer `await`**, en el mismo
turno en que se toma el candado síncrono. **No** se guarda en `localStorage`, ni en
`sessionStorage`, ni en una cookie, ni en la URL: un identificador idempotente que sobrevive a su
operación deja de proteger. Cada petición lleva siempre `event`, `expectedVersion` y `eventId`.

`orders-client.ts` distingue el rechazo definitivo del resultado desconocido. Un código del
contrato —400, 401, 403, 404, 409— es una respuesta y cierra la operación; un corte de red, un 503
o un cuerpo ilegible se marcan `ambiguous`, y entonces la pantalla no dice que falló: dice que no
se recibió respuesta, que pudo haberse aplicado, y ofrece **reintentar la misma operación** o
recargar.

Errores cerrados que el panel traduce, y solo esos:

| Estado | Código                             | Qué dice el panel                           |
| ------ | ---------------------------------- | ------------------------------------------- |
| 400    | `order_invalid`                    | Revisa los datos                            |
| 401    | `admin_session_required`           | La sesión caducó                            |
| 403    | `admin_forbidden`                  | Tu rol no permite esta acción               |
| 404    | `order_not_found`                  | Ese pedido ya no existe                     |
| 404    | simulador apagado                  | El simulador no está habilitado aquí        |
| 409    | `order_version_conflict`           | El pedido cambió · ofrece recargar          |
| 409    | `order_payment_transition_invalid` | Ese resultado no cabe · ofrece recargar     |
| 409    | `order_payment_conflict`           | Ese intento ya se registró con otro result. |
| 503    | `order_unavailable`                | El servicio no responde                     |

Ante un conflicto de versión **no se reintenta solo**. Ante un `order_payment_conflict` tampoco se
ofrece recargar: el intento ya quedó registrado y volver a leer no lo cambia.

Tras un éxito, el pedido completo se **sustituye** por el `AdminOrderDto` que devolvió el backend.
No se fabrican eventos, no se incrementa la versión y no se toca nada de forma optimista.

### Notificaciones: solo lectura

`AdminOrderDto.notifications` es el buzón que el backend escribió. La tarjeta lo muestra y **no
tiene ni un control**: no hay vista previa, ni reenvío, ni envío manual, y no es una omisión de
diseño —el contrato no publica ninguna de esas operaciones, y un botón que no llama a nada es peor
que el hueco que deja—.

De cada aviso se pinta el nombre amigable del `eventKey`, la audiencia (Cliente / Administración),
el modo de entrega (Deshabilitado / Vista previa / Proveedor), el estado, los intentos y las fechas
de creación, envío y próximo intento. El `lastErrorCode` se traduce si el panel lo conoce y, si no,
se resume sin enseñar el código.

**No se muestra el destinatario**, que el contrato deliberadamente no publica —«Bodies and
recipients are never returned»—, ni el asunto, ni el cuerpo.

Los tres estados que se prestan a confusión llevan su frase, no solo un color:

| Estado       | Panel          | Frase obligatoria                                                |
| ------------ | -------------- | ---------------------------------------------------------------- |
| `previewed`  | Previsualizado | La plantilla se generó para revisión. No se envió un correo.     |
| `suppressed` | Suprimido      | El envío estaba deshabilitado para este entorno.                 |
| `failed`     | Falló          | El pedido se actualizó, pero la notificación no pudo entregarse. |

`previewed` no se presenta como `sent`, `suppressed` no se presenta como error, y un `failed` no se
presenta como un fallo de la transición del pedido, que sí se aplicó.

`order_ready_to_ship` aparece con la etiqueta «Listo para envío» tanto aquí como en Novedades. El
panel **no** envía ese correo: el backend escribió el outbox al confirmar la transición.

### Novedades del pedido

Una sola lectura de todo lo que le ha pasado al pedido. La arma `order-activity.ts`, una función
pura, combinando las **tres** corrientes: `timeline`, `paymentEvents` y `notifications`.

Se mezcla **para mostrar** y no en el modelo: cada entrada conserva su `kind`, y los tipos de
origen siguen separados. Un pago rechazado y un pedido cancelado no son lo mismo, y aplanarlos en
una lista sin procedencia es un error difícil de deshacer.

Los títulos son los que publica el backend —`timeline[].label` y `paymentEvents[].label`—; el panel
pone el color del punto y la frase que explica el cambio, nada más.

**El desempate es explícito.** La función devuelve la secuencia **cronológica**, y cuando dos
entradas comparten marca de tiempo el orden es: primero el evento de **pago**, que es la causa;
después la entrada del **pedido**, que es la consecuencia; y por último el **aviso**, que se manda
después de las dos. Dentro de una misma corriente manda el orden en que el backend las escribió. La
tarjeta invierte la lista para pintar lo último arriba.

Los avisos de un mismo `eventKey` se cuentan **una vez**: un `payment_approved` escribe un correo
al cliente y otro a administración, y emitir una línea por cada uno repetiría «Pago confirmado» dos
veces seguidas y haría parecer que el pago se aprobó dos veces. La entrada agrupada dice a quién
iban y cómo acabaron.

Nada de lo que sale expone identificadores de evento, origen interno, cuerpos, destinatarios ni
direcciones.

### Revisión visual de la fase B

Listado y detalle se midieron a **1440, 1280, 1024, 768, 390 y 360 px** sobre los componentes
reales con su CSS real, montados en un banco de pruebas fuera del repositorio, midiendo el ancho de
desplazamiento del documento en lugar de juzgar a ojo. El desplazamiento horizontal de la página es
**cero en los seis anchos**; la tabla sigue desplazándose dentro de su tarjeta, que es lo previsto.

El recorrido de siete hitos no cabía en una fila en pantallas medianas, así que por debajo de 60rem
pasa a cuatro columnas repartidas en dos filas y por debajo de 30rem a tres. Ninguna etiqueta se
corta ni se vuelve vertical en ningún ancho: se comprobó comparando el ancho visible con el
`scrollWidth` de cada etiqueta. En rejilla por filas la línea que une los pasos desaparece, porque
ahí ya no describe el recorrido.

Lo demás se comprobó y no necesitó cambios: las dos pastillas de la tarjeta móvil envuelven en
lugar de desbordar, la confirmación del simulador es un bloque en la propia pantalla y se lee
entera a 390 px, el historial de pago separa los intentos, y ningún estado depende solo del color
—cada pastilla lleva su texto, el distintivo de simulación lleva borde discontinuo, y el hito no
registrado lleva guion y borde discontinuo—.

### Alta y edición de producto: composición

Rediseñadas el 2026-09-24 con la jerarquía de un editor de comercio y la identidad del panel. Ver
[`0007-category-catalog-and-product-editor.md`](../decisions/0007-category-catalog-and-product-editor.md).

- **Arriba, a todo el ancho:** el nombre del producto, y debajo SKU y URL (inmutables en la
  edición).
- **Área principal:** «Descripción» —corta, detallada y características— y una tarjeta «Datos del
  producto» con cinco pestañas: General (precio), Inventario, Clasificación (tipo y destacado),
  Variantes y Detalles. Los paneles no se desmontan: lo escrito sigue al cambiar de pestaña.
- **Barra lateral de 21rem:** estado y acciones —Guardar borrador y Publicar en el alta;
  Actualizar, Publicar y Archivar en la edición—, preparación con los errores pendientes enlazados,
  categoría e imágenes. Se fija con `position: sticky` solo desde 64rem de ancho y 46rem de alto, y
  desplaza por dentro si no cabe.
- **Vista previa:** un botón que abre un `<dialog>` modal, no una columna permanente.
- **Móvil y tableta:** una columna en ese mismo orden; las pestañas desplazan dentro de su tarjeta.

Tras un error, el foco va al primer campo con problema y, si vive en una pestaña, la abre antes. El
alta, si falla después del `POST`, dice «El producto fue creado como borrador», el paso exacto que
falló, y ofrece «Abrir producto» y «Reintentar lo pendiente» sin volver a crear nada.

### Catálogo de categorías

`/panel/productos/categorias`, con entrada «Categorías» junto a «Nuevo producto». Lista con
búsqueda, filtros Activas / Archivadas / Todas y paginación de 20, sobre el catálogo **entero**: el
contrato no publica buscador, así que se leen hasta 10 páginas de 100 y se avisa si se alcanza el
tope. Nombre, slug, estado y contadores —«No disponible» cuando llegan `null`, nunca cero—. Crear
propone el slug desde el nombre y lo deja revisar; después no se edita. Renombrar, archivar
(con confirmación) y reactivar mandan la `expectedVersion` de la fila.

En el producto, la categoría se elige con un selector buscable conectado a ese catálogo: solo
activas, «Sin categoría» admitido y «Crear categoría» en línea, que elige la creada. La categoría
archivada de un producto histórico se enseña «Archivada» y no se cambia ni se reenvía sola.

#### Pendiente del backend: índices de `product_categories`

En staging (backend `00027-4bq`), `GET /v1/admin/product-categories` responde `503`
`catalogue_unexpected_failure`. El backend ordena por `name` + `id`, y filtrando por `status` +
`name` + `id`: las dos consultas exigen índices compuestos en Firestore que no están declarados en
su `firestore.indexes.json` ni desplegados. No se compensa en el panel. Mientras falten:

- La página Categorías enseña su estado de error con «Reintentar».
- El selector del producto dice que no pudo leer el catálogo, deja guardar sin cambiar la categoría
  y **no** afirma que la categoría actual «no está en el catálogo»: sin catálogo, no se sabe.

### Conflictos del catálogo

`product_sku_conflict`, `product_slug_conflict` y `product_version_conflict` ya no se aplanan en
«Alguien modificó este producto». Los dos primeros marcan y enfocan su campo; solo el tercero
ofrece recargar. Un `409` desconocido llega como `conflict_unrecognized` con su código visible para
diagnóstico.

La zona de carga de imágenes no enseña el control nativo del navegador: es un área de borde
discontinuo con icono, el texto «Arrastra y suelta las imágenes de tu producto aquí» y un botón
«Agregar imágenes». El `input[type=file]` sigue ahí, dentro de su etiqueta y oculto solo
visualmente, así que se enfoca con el tabulador; soltar archivos entra por la misma función que
elegirlos, con la misma cola, los mismos límites y las mismas validaciones. La edición de un
producto ya creado usa la misma zona, adaptada a su flujo: elegir archivo, describirlo y subirlo en
el acto.

### Preparación para publicar

`AdminProductDto.publicationReadiness` llega calculado por el backend —contenido, precio, variantes
e inventario incluidos— con `ready` y la lista cerrada de `missing`. El panel:

- traduce **los nueve códigos** del contrato a texto en español, con un mapa exhaustivo por
  tipo: si el backend añade uno, el proyecto deja de compilar;
- enlaza cada requisito con la sección de la misma pantalla donde se resuelve;
- habilita «Publicar producto» solo cuando `ready` es `true` y el rol tiene `products.publish`;
- reemplaza la evaluación con la respuesta autoritativa de **cada** mutación, sin tocarla de forma
  optimista en React.

No se recalcula ninguna regla de publicación en el panel: `publish` consume esa misma evaluación, y
una segunda implementación acabaría diciendo «listo» sobre algo que el backend rechaza.

**Casi nada del contenido editorial es un requisito de publicación.** El contrato retiró primero
`primary_image` y `gallery`, y después `description`, `features`, `materials`, `measurements`,
`warranty` y `care`. De los quince códigos originales quedan **nueve**:

| Código                        | Sección a la que lleva |
| ----------------------------- | ---------------------- |
| `name`                        | Información básica     |
| `sku`                         | Información básica     |
| `slug`                        | Información básica     |
| `short_description`           | Información básica     |
| `category`                    | Clasificación          |
| `product_type`                | Clasificación          |
| `positive_price`              | Precio                 |
| `sellable_option`             | Variantes              |
| `unique_variant_combinations` | Variantes              |

De lo editorial solo `short_description` bloquea. Un producto **sin imágenes, sin descripción
detallada, sin características y sin ninguno de los cuatro detalles adicionales** se publica. Las
secciones siguen existiendo y conservan sus anclas —`seccion-imagenes`, `seccion-contenido`,
`seccion-detalles`—, pero ya no reciben requisitos.

Para que ese silencio no se lea como un olvido, el checklist cierra siempre con una línea que dice
cuáles son opcionales, en los dos estados: pendiente y listo. Un campo opcional vacío se anuncia
como «Opcional» junto a su etiqueta y **no** se pinta como error.

Subir imágenes es **opcional en todo momento**, no un paso previo aplazado: se pueden crear y
publicar productos con cero imágenes y añadirlas después, o no añadirlas nunca. Una vez creado el
producto siguen disponibles, con la misma `expectedVersion` y los mismos permisos de siempre, subir
(`POST .../images`), editar el texto alternativo, reordenar por `position`, elegir la principal con
`isPrimary` y archivar (`POST .../images/{imageId}/archive`).

Donde no hay imagen se dice **«Sin imagen»** —en el listado, en la miniatura de la ficha y en la
vista previa del alta—, en lugar de disimularlo con un marcador decorativo. Ese hueco es del panel:
el placeholder gráfico de la Web no se guarda en Firestore ni se envía al backend.

### Editor editorial del producto

El formulario de alta y el de edición comparten las mismas piezas y el mismo agrupado, de arriba
abajo: **Información básica**, **Clasificación**, **Contenido visible**, **Detalles adicionales**,
**Precio e inventario**, **Imágenes** y **Variantes**. En el alta, Información básica y
Clasificación comparten la columna estrecha e Imágenes ocupa la ancha a partir de 88rem; por debajo
todo se apila en ese mismo orden. Detalles adicionales es un `<details>` plegado por omisión —es lo
único opcional de punta a punta—, y se abre solo y no se deja cerrar mientras haya un error dentro:
plegar acorta la pantalla, no esconde problemas.

Los topes son los que publica el contrato, y ninguno se escribe dos veces:

| Campo                 | Tope   | Publicación                 |
| --------------------- | ------ | --------------------------- |
| Descripción corta     | 180    | **Necesaria para publicar** |
| Descripción detallada | 3000   | Opcional                    |
| Características       | 5 × 60 | Opcional                    |
| Materiales            | 2000   | Opcional                    |
| Medidas               | 2000   | Opcional                    |
| Garantía              | 2000   | Opcional                    |
| Cuidados              | 2000   | Opcional                    |

Las constantes viven en `src/lib/api/variant-limits.ts` y `src/lib/api/contract.test.ts` las compara
**contra la copia del contrato**, no contra números repetidos en la prueba: si el backend mueve un
tope y se actualiza la copia, lo que falla es la constante desactualizada.

- **Descripción corta**: `textarea` de dos líneas, no un `input`. Contador «N de 180» y la ayuda
  «Resumen visible junto al precio…». Su etiqueta dice que es necesaria para publicar, pero el panel
  **no** evalúa esa regla: vacía no bloquea el guardado, y quien dice que falta es el código
  `short_description` del backend. Lo que sí bloquea es pasarse de 180.
- **Descripción detallada**: se llama así —antes era «Descripción»—, marcada «Opcional», con
  contador «N de 3000» y la ayuda que la separa de materiales, medidas, garantía y cuidados.
- **Características destacadas**: cinco filas editables con **Subir**, **Bajar**, **Quitar** y
  **Añadir característica**, contador «N de 5», contador «N de 60» por fila y error por fila.
  También se marca la repetida, plegando acentos y mayúsculas como pide el contrato. Debajo, una
  previsualización compacta de la franja de beneficios **en el orden guardado**. El contrato sigue
  siendo `string[]`: las filas son presentación, no un modelo paralelo, y una fila vacía es una fila
  sin escribir —no se envía y no es un error—.
- **Detalles adicionales**: los cuatro textos con su ayuda propia —composición y herrajes; ancho,
  alto y profundidad con unidad; duración y alcance real; limpieza y mantenimiento—, todos
  «Opcional».

Cada contador, cada ayuda y cada error entran en el `aria-describedby` de su campo, con `id`
propios; los errores llevan `role="alert"` y `aria-invalid`. Los contadores **no** son regiones
vivas: anunciarlos en cada pulsación taparía lo que se está escribiendo.
`src/features/panel/editorial-fields.test.tsx` lo comprueba sobre el HTML que React produce de
verdad, con `renderToStaticMarkup`, sin necesidad de un DOM.

Un campo vacío **viaja vacío**. El `placeholder` es una ayuda visual del navegador y nunca se
guarda ni se envía en su lugar. En la edición, la cadena vacía es justo lo que borra un campo, así
que el cuerpo del `PATCH` la lleva; en el alta se omite lo vacío, porque no hay nada que borrar
todavía.

Las variantes no cambiaron de editor, solo ganaron una advertencia en las dos pantallas: un color,
un acabado o una medida se gestionan como variante **solo** cuando cada combinación es un artículo
vendible de verdad, con su SKU, su precio y su inventario. Texto libre no se convierte en variantes.

### Guardar borrador y publicar

El alta ofrece dos intenciones sobre **el mismo** guardado completo:

- **Guardar borrador** ejecuta la secuencia y se queda ahí.
- **Publicar producto** ejecuta exactamente la misma secuencia y, solo después, mira la preparación
  de la última respuesta: con `ready: true` publica con esa versión; con `ready: false` conserva el
  borrador, enumera lo que falta y **no** llama a `publish`.

Ningún producto nace publicado, y no hay selector de estado.

### Lo que las referencias piden y el contrato no permite (fase 7)

Nada de esto es un olvido. Cada línea espera a que OpenAPI lo publique.

**Listado de Productos.** Las cuatro tarjetas de métricas —Publicados, Borradores, Archivados, Sin
stock— con su variación mensual; el buscador; los chips por estado con conteos; los seis selectores
de filtro; la columna «Visibilidad»; «Exportar»; la selección múltiple; y la columna derecha con
«Filtros rápidos», «Resumen del catálogo» y «Acciones sugeridas». `GET /v1/admin/products` solo
admite `pageToken` y `pageSize`: un contador calculado con la página cargada diría el número de esa
página y se leería como el del catálogo entero, y un buscador que filtrara esa misma página se
presentaría como búsqueda global sin serlo. Sin métricas, el listado ocupa todo el ancho.

**Listado de Pedidos.** Las cinco tarjetas de métricas; el buscador; los chips con conteos; el
rango «Últimos 30 días»; «Exportar»; la selección múltiple; la columna **Pago**; el correo del
cliente bajo su nombre; y las dos columnas de la derecha, «Pedidos que requieren atención» y
«Últimos pedidos». `AdminOrderSummaryDto` publica `publicId`, `customerName`, `itemCount`,
`previewLine`, `totalCop`, `status`, `createdAt` y `updatedAt`, y nada más: ni `paymentStatus` ni
el correo. Pedir la ficha de cada pedido para rellenar dos columnas convertiría una pantalla en
veinte llamadas.

**Detalle del pedido.** La tarjeta «Información de pago» con método, tarjeta, referencia bancaria y
fecha de cobro; el descuento; el canal de venta; las observaciones del cliente; las notas internas;
«Contactar cliente»; «Imprimir pedido»; «Ver perfil»; «Ver en mapa»; y la edición de la dirección.
Tampoco hay reembolso. Los atributos de cada línea son los que trae su instantánea: no se reserva
un hueco fijo para «Color» y «Medida» que una línea puede no tener.

**Navegación.** La referencia lista Carritos abandonados, Categorías, Inventario como sección
aparte, Clientes, Cupones, Banners, Colecciones, Media/Assets, Home, Usuarios administrativos,
Configuración general y Perfil. Ninguna tiene ruta ni contrato. Tampoco se añadió **«Ir a la
tienda»**: el repositorio no conoce ninguna URL de la tienda pública —no está en el contrato, ni en
la configuración, ni en `.env.example`—, y escribirla a mano sería inventarla.

**Cabecera.** Sin buscador global, sin campana y sin contador de avisos: ninguno tiene superficie en
OpenAPI, y un contador fijo es un dato inventado. El outbox de correo del backend no es una campana
del panel. La persona se identifica por su **rol real**; no existe ningún «Admin».

**Paginación.** Por cursor opaco en las dos superficies: cantidad visible, «Cargar más» y el final
del listado. No hay paginación numérica, ni total global, ni total de páginas, ni salto directo,
porque el contrato devuelve un `pageToken` que permite avanzar y nada más.

### Compuerta del contrato de pagos y notificaciones (fase 7)

El artefacto OpenAPI del backend se comprobó **una vez** al cerrar la fase. Publica ya casi todo lo
que hace falta para la superficie de pagos: los seis estados de pago, `payment` en el detalle,
`paymentStatus` en el resumen, el historial `paymentEvents`, `environment`, `attemptNumber`,
`availableSimulationEvents`, el endpoint administrativo de simulación con `expectedVersion` y
`eventId` idempotente, el permiso `payments.simulate` y el outbox de notificaciones con su modo y
su estado de entrega.

Falta **una** pieza: `ready_to_ship` no aparece en ningún enum de estado del pedido, y la
transición publicada sigue siendo `preparing → shipped`.

Por eso la copia local **no se sincronizó**. No es formalismo: `ready_to_ship` cambia la máquina de
estados, y con ella la tabla de transiciones que decide qué acción se ofrece y el hito «Listo para
envío» del recorrido. Sincronizar ahora dejaría el panel con pagos nuevos sobre un recorrido
antiguo y obligaría a rehacer ese trabajo al llegar el estado que falta.

Queda pendiente, para cuando el contrato lo publique: la tarjeta de información de pago con su
aviso permanente de sandbox, el panel de simulación con los botones derivados de
`availableSimulationEvents`, el permiso `payments.simulate` en la matriz, la tarjeta de
notificaciones, los dos hitos que faltan del recorrido, la columna **Pago** del listado y la acción
«Marcar listo para envío».

## Inventario: las dos modalidades del contrato

El contrato sustituyó `stockQuantity` y `lowStockThreshold` por un único objeto `inventory`, y el
panel lo siguió entero: ninguno de esos dos campos planos existe ya en el Admin, ni en lectura, ni
en el alta, ni en la edición.

### Qué publica el contrato

| Pieza                                                               | Qué es                                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `InventoryControlDto`                                               | Proyección de lectura: `mode`, `quantity`, `lowStockThreshold`, `availability`, `manualAvailability`. |
| `SetInventoryControlDto`                                            | Lo que se escribe. Solo `mode` es obligatorio.                                                        |
| `SetInventoryRequestDto`                                            | `expectedVersion` + `inventory`.                                                                      |
| `PUT /v1/admin/products/{productId}/inventory`                      | Inventario del producto base.                                                                         |
| `PUT /v1/admin/products/{productId}/variants/{variantId}/inventory` | Inventario de una variante.                                                                           |

`inventory` aparece en `AdminProductDto`, `AdminProductVariantDto`, `CreateProductRequestDto` y
`CreateProductVariantRequestDto`. En el alta es **opcional**: omitirlo crea el producto con cero
unidades controladas, que es lo que el contrato dice y lo que hacía el contrato anterior.

### `tracked` frente a `availability`

**Controlar cantidad** (`tracked`): se escribe cuántas unidades hay y un umbral de aviso. La
disponibilidad la deriva el backend de esa cantidad.

**Solo disponibilidad** (`availability`): se elige «Con existencias» o «Sin existencias». **No hay
cantidad**, y no la hay de verdad: el contrato manda `quantity` y `lowStockThreshold` en `null`, y
ese `null` significa «no aplica», nunca cero. El panel no lo aplana, no precarga un cero al cambiar
de modo y no escribe ninguno de esos dos campos en el cuerpo. El propio contrato los declara
«REJECTED» en el modo contrario.

Las etiquetas comerciales están en español —«Controlar cantidad», «Solo disponibilidad», «Con
existencias», «Sin existencias»— y los códigos siguen siendo los del contrato, en inglés.

El tipo que se escribe es una **unión discriminada** derivada del esquema generado, no un DTO a
mano: `openapi-typescript` convierte en obligatorio todo campo con `default`, y
`lowStockThreshold: 0` lo es, de modo que el tipo plano exigía mandarlo también en `availability`.
Cada campo conserva el tipo que generó el contrato —`Pick` sobre el esquema— y lo único que se
añade es la discriminación por `mode`, que un objeto plano de OpenAPI no puede expresar.

### Valor final, nunca delta

La experiencia administrativa por diferencia **desapareció**. Para pasar de 8 a 15 se escribe 15;
para agotar, 0. No hay campo «Diferencia», no hay campo «Motivo» y no hay controles `+N`/`−N`. Los
endpoints de ajuste por delta siguen en el contrato y en el BFF —no hacía falta quitarlos— pero el
cliente del navegador ya no los expone y ninguna pantalla los importa.

El motivo no es de estilo: una diferencia no se puede expresar en modo disponibilidad, y en modo
cantidad hacía creer que se estaban registrando movimientos de almacén que nadie consulta.

### Base frente a variantes

Con una variante activa, lo que se vende es el inventario de **cada variante**. El valor base sigue
existiendo y no se borra, pero deja de gobernar: la ficha no ofrece su edición y dice «Inventario
gestionado por variantes».

En el listado, un producto con variantes activas no enseña su inventario base sino un resumen de
presentación construido con las variantes recibidas: «24 unidades en 4 variantes», «3 con
existencias · 1 sin existencias», «Inventario mixto · 2 con cantidad · 2 por disponibilidad» o
«Variantes sin existencias». La suma es **informativa**: no se le aplica el umbral del producto, no
decide disponibilidad y no se usa para ninguna regla de compra. Cuando los modos se mezclan no se
suma nada, porque sumar solo las que llevan conteo presentaría como total algo que no lo es.

### La Idempotency-Key va atada al cuerpo exacto

Guardar la clave hasta el éxito no basta, y el hueco era real: tras un fallo se podía reabrir el
formulario, escribir otra cantidad o cambiar de modo, y ese cuerpo **distinto** viajaba con la
clave del intento anterior. Para el backend eran la misma operación, así que la segunda podía
descartarse y devolver el resultado de la primera.

La clave se guarda junto a la **huella** de la operación que representa. La huella se construye
campo a campo —sin `JSON.stringify` sobre un objeto cuyo orden de claves no es un contrato— y lleva:

- el tipo de operación (`inventory.set`);
- el `productId`;
- el `variantId`, o `-` en el inventario base;
- la `expectedVersion`;
- el cuerpo canónico: `tracked` con `quantity` y `lowStockThreshold` —un umbral ausente se
  normaliza a cero, que es lo que el backend guarda—, o `availability` con `status` y nada más.

Cuándo se conserva y cuándo se reemplaza:

| Situación                                       | Clave                                          |
| ----------------------------------------------- | ---------------------------------------------- |
| Reintentar el mismo destino, versión y cuerpo   | **la misma**                                   |
| Cambiar cantidad, umbral, modo o disponibilidad | nueva                                          |
| Cambiar de `expectedVersion` tras recargar      | nueva                                          |
| Otra variante, u otro producto                  | nueva, y la pendiente de la primera sigue viva |
| La operación se completa                        | se libera                                      |
| Fallo de red, `503` o resultado ambiguo         | **se conserva**                                |

El registro guarda una clave **por destino** —el producto base o cada variante—, así que editar la
variante B no hace que el reintento pendiente de la A estrene clave.

### El editor solo se cierra cuando el backend confirma

Antes se cerraba siempre: la tarjeta del producto lo hacía después de `await onSubmit(body)` —una
promesa resuelta no dice si la operación salió bien— y la fila de variante ni siquiera esperaba.
Tras un error había que reabrirlo y reescribirlo, y reescribirlo con otra cantidad era exactamente
lo que colaba un cuerpo distinto con la clave anterior.

Ahora el callback devuelve un resultado explícito (`{ applied: boolean }`) y la decisión vive en
dos funciones puras de `inventory-control.ts`: `planInventorySubmit` —no enviar, pedir confirmación
o enviar— y `afterInventorySubmit` —cerrar o seguir abierto—. En un fallo el formulario se queda
abierto con el borrador intacto, el mensaje de error visible y, si fue un `409`, la opción de
recargar. Nada se actualiza de forma optimista, y el cierre comprueba que el componente siga montado.

### BFF e idempotencia

Dos rutas server-only nuevas, `PUT /api/admin/products/{productId}/inventory` y
`PUT /api/admin/products/{productId}/variants/{variantId}/inventory`. Pasan por `handleMutation`,
que es quien valida `Origin` contra la variable server-only, exige la cookie `__Host-`, comprueba
el `Content-Type` y el tamaño del cuerpo, traduce los estados del contrato y responde `no-store`.
El cuerpo se construye **campo a campo desde el modo** en `parseSetInventoryControl`: no se copia
nada de lo que llegó del navegador.

La `Idempotency-Key` la genera el cliente, viaja en el cuerpo y sale en el encabezado que exige el
contrato. Se conserva mientras se reintenta **la misma** operación y se descarta solo al
completarse: liberarla al fallar convertiría un reintento en una operación nueva. La regla vive en
`src/features/panel/operation-key.ts`, que es un módulo puro para poder comprobarla.

`expectedVersion` es obligatorio en las dos rutas, y en la de variante es la versión del
**producto**: el contrato versiona el producto entero. Un `409` no se reintenta: se explica y se
ofrece recargar. No hay actualización optimista en ningún punto —el estado sale de la respuesta
autoritativa— y si nada cambió no se llama.

## Portada y Galería

Las imágenes dejaron de ser una rejilla con una marca encima. Son **dos bloques separados** en el
alta y en la ficha, con sus anclas propias (`#portada`, `#galeria`):

- **Portada**: la única imagen con `isPrimary: true`, la primera que se ve en la tienda. Se puede
  subir otra o ascender cualquier imagen de la galería con «Hacer portada». La portada anterior
  **no se archiva ni se borra**: pasa a la galería.
- **Galería**: todo lo demás, con selector múltiple, arrastrar y soltar, vista previa antes de
  subir, y por archivo su nombre, su tamaño, su texto alternativo, su estado, quitar, cambiar
  archivo, mover y convertir en portada.

Mientras no haya portada, la galería **no admite archivos** y guía a agregarla primero. No es una
restricción arbitraria: el backend marca como principal la primera imagen que recibe, así que una
operación presentada como «Galería» habría decidido la portada sin decirlo.

El contador cuenta las diez activas del contrato **incluyendo la portada**. Las imágenes siguen
siendo opcionales para publicar.

### Cómo se representa una candidata a portada

Una entrada de la cola lleva su **intención** —`cover` o `gallery`— y no se deduce de su posición.
Ahí estaba un fallo real: «Cambiar portada» encolaba igual que la galería, así que el archivo
elegido viajaba con el lote, quedaba como una imagen más y nadie mandaba el `PATCH` que la marca
principal. La pantalla decía que la portada había cambiado y no había cambiado.

Reglas que salen de eso, todas comprobadas:

- Solo puede existir **una** candidata. Elegir otro archivo en el bloque Portada sustituye a la
  anterior y revoca su vista previa; si la anterior ya se había subido, no se sustituye en silencio.
- La candidata se pinta **dentro del bloque Portada**, también cuando ya hay una portada activa: es
  el archivo que va a sustituirla.
- Lo elegido desde Galería aparece **solo** en Galería y no puede ascender por descarte. `resolve
Primary` devuelve la entrada con intención de portada o `null`; ya no cae en «la primera de la
  lista», que era lo que convertía una imagen de galería en la portada del producto.
- Mover no cruza la frontera entre los dos bloques.
- La galería sigue bloqueada mientras no haya una portada real **o** una candidata identificada.
- El tope de diez activas cuenta las imágenes activas del producto más las entradas **que faltan
  por subir** (`pendingUploads`), no la cola entera. Una candidata que ya se subió y espera su
  `PATCH` sigue en la cola, pero el backend ya la devolvió dentro de `product.images`: sumarla otra
  vez contaba una imagen dos veces, enseñaba un total mayor que el real y podía dar el límite por
  alcanzado con un hueco libre. La misma cuenta gobierna el contador, `atLimit` y la guarda de
  encolado. Sustituir la candidata no ocupa un hueco nuevo.
- `altText` sigue siendo obligatorio por archivo, también en la portada.

En el alta la intención es la misma pieza: el formulario deriva su `primaryEntryId` de ella, y si
hay imágenes en cola sin candidata **bloquea el envío** en lugar de elegir una por su cuenta.

### El cambio de portada es una operación de dos pasos

Vive en `cover-flow.ts`, aparte del lote de galería:

1. Subir el archivo con su `Idempotency-Key` y la versión vigente.
2. Marcar esa imagen como principal con la versión que devolvió el paso 1.

El paso 2 **se salta** cuando el backend ya devolvió la imagen como principal —lo que pasa con la
primera imagen de un producto—, y eso se comprueba en la respuesta en lugar de darlo por hecho. El
éxito también se comprueba: un `200` que no deja la imagen con `isPrimary: true` se trata como
fallo (`cover_not_applied`), porque «Portada actualizada» es una afirmación sobre lo que verá la
tienda. La portada anterior queda activa y pasa a la galería; nunca se archiva ni se borra.

### Reanudación tras una subida correcta y un PATCH fallido

La entrada guarda el `uploadedImageId` que devolvió el paso 1. Con él:

- el reintento entra **directo al paso 2** y no vuelve a mandar el archivo;
- se conserva la versión autoritativa que hace falta para ese `PATCH`;
- el estado de la entrada es `awaitingCover` —«Subida; falta marcarla como portada»—, que no es ni
  «subida» ni «falló»: el archivo está, la operación no ha terminado;
- deja de contar como pendiente para el límite, porque ya está entre las activas del producto.

Si falla **antes** de saberse el resultado de la subida, la entrada conserva su `Idempotency-Key`,
así que el reintento es el mismo envío. Reemplazar el archivo renueva la clave y borra el
`uploadedImageId`: es otro archivo, y dar por bueno el id anterior marcaría como portada una
imagen que ya no es la elegida. Quitar la candidata limpia la intención y revoca su `object URL`.

### Lote secuencial y recuperación parcial

El alta y la edición comparten **una sola** implementación de cola —`image-queue.ts`— y un solo
lote —`uploadQueueSequentially`, en `create-product-flow.ts`—.

Elegir archivos no sube nada. Cada entrada recibe su identidad local, su `object URL`, su texto
alternativo y su `Idempotency-Key`, y el lote arranca con «Subir N imágenes». Las subidas van
**estrictamente en serie**, cada una con la versión que devolvió la anterior, y se informa
«Subiendo 2 de 5». Nunca `Promise.all`: cada subida incrementa la versión del producto, así que
lanzarlas a la vez no es una optimización sino un `409` garantizado.

Si una falla, el lote se detiene: las completadas salen de la cola y **no se reenvían**, las
pendientes se quedan con su clave intacta y el archivo fallido conserva la suya, de modo que el
reintento es la misma operación. Un `409` detiene el lote, lo explica y ofrece recargar. Las
`object URL` se revocan al quitar, al reemplazar, al completar y al desmontar.

El texto alternativo es obligatorio por imagen, respeta el tope del contrato, nunca se precarga con
el nombre del archivo, nunca se copia a las demás y su error se pinta **junto a su entrada**: con
cinco archivos pendientes, «falta un texto alternativo» no dice a cuál.

## Guía para administrar un producto

Un botón visible —«Ver guía para crear un producto»— en el alta y en la ficha abre un `<dialog>`
nativo con ocho apartados: información básica, clasificación y descripción, los dos modos de
inventario, inventario por variantes, Portada y Galería, texto alternativo, variantes, y checklist
y publicación. Explica que las imágenes son opcionales, que guardar no publica, que el checklist lo
calcula el backend, que una variante necesita SKU, precio e inventario propios y que «Solo
disponibilidad» no lleva cantidad.

El `<dialog>` nativo es lo que resuelve la accesibilidad sin librerías de tours: `showModal()` mueve
el foco dentro y lo retiene, `Escape` cierra sin escucharlo, y el resto de la página queda inerte.
El cierre es un botón con nombre accesible, la jerarquía empieza en `h2` —el único `h1` es el del
producto—, no se abre sola, no guarda nada en storage y se puede volver a consultar siempre. Cada
apartado enlaza a un ancla **que existe** en la pantalla desde la que se abrió, y una prueba lo
comprueba contra el código de las dos pantallas.

Cada bloque lleva además su propia ayuda breve, para no depender del tutorial.

## Responsive del catálogo

Medido a 1440, 1280, 1024, 768, 390 y 360 px sobre los componentes reales con su CSS real:

- Sin desbordamiento horizontal en ninguna anchura.
- Sin texto vertical en ninguna anchura.
- Portada siempre antes que Galería, también en móvil.
- Los dos modos de inventario se ofrecen en dos columnas hasta 768 px y en una a partir de 390 px.
- Cantidad y umbral comparten fila en escritorio y se apilan en móvil.
- El listado pasa de tabla a tarjetas por debajo de 768 px.
- Con `pointer: coarse`, los controles de inventario, imágenes y variantes llegan a 44 px.

### Limitaciones conocidas

- No hay catálogo de categorías: sin endpoint que las liste, se siguen escribiendo a mano.
- El resumen de variantes se construye con lo que trae `AdminProductDto`; si un producto superara
  lo que ese documento incluye, el resumen sería de lo recibido, y por eso se presenta como
  informativo.
- El texto alternativo de una imagen ya subida se guarda con su propio `PATCH`, uno por imagen: no
  hay operación en lote para eso en el contrato.
- El `PATCH` que marca una imagen como principal **no** lleva `Idempotency-Key`: el contrato no la
  publica para esa ruta, y no hace falta —escribir `isPrimary: true` dos veces deja lo mismo—.
- Si la subida de la portada sale bien y el `PATCH` falla, la imagen queda en el producto como una
  más hasta que se reintente. Es el estado honesto: existe, y todavía no es la portada.
- El orden de la galería se cambia con botones «Subir» y «Bajar», no arrastrando: es lo que
  funciona con teclado y lector de pantalla sin añadir una librería.
- Los enlaces del título de cada tarjeta móvil del listado siguen midiendo 20 px de alto; la acción
  de la tarjeta —«Editar»— es la que llega a 44 px.

## Estado de los datos

No existen datos de ejemplo de productos, precios, inventario, pedidos ni clientes, ni acciones de
interfaz que no hagan nada. El panel no lee ni escribe en Firestore ni en Cloud Storage.

La autenticación, la sesión administrativa, el catálogo y los pedidos son **reales**, no simulados:
Firebase Authentication verifica credenciales de verdad, el backend es la autoridad que valida la
sesión, y cada producto y cada pedido que se ven en pantalla vienen de `/v1/admin/products` y
`/v1/admin/orders`. El **simulador de pago** es la única pieza deliberadamente no real, y lo dice
en pantalla: es de staging, queda registrado con `environment=sandbox` y no representa un cobro. Lo
que no existe todavía es la pasarela de verdad, el reembolso y los clientes como entidad.

## Decisiones registradas

- `../decisions/0001-admin-application-boundary.md` — límite de la aplicación administrativa.
- `../decisions/0002-firebase-auth-closed-sign-in.md` — inicio de sesión cerrado con Firebase
  Authentication.
- `../decisions/0003-admin-session-bff.md` — sesión administrativa a través de la frontera BFF.
- `../decisions/0004-enriched-catalogue-and-variants.md` — catálogo enriquecido y variantes.

## Pendiente del backend para Pedidos

Nada de esto se compensa en el panel; cuando exista en el contrato, se implementará aquí:

- **Pasarela real**: el webhook verificado del proveedor, con `environment=live`. Hoy el único
  origen de un resultado de pago es el simulador de staging, y el panel lo marca como tal en todas
  las pantallas donde aparece.
- **Descuento de inventario al pagar**, que irá en la misma transacción que confirma el cobro. El
  contrato dice explícitamente que una aprobación simulada **no** toca el stock.
- **Reembolsos**, y con ellos la cancelación de un pedido ya pagado.
- **Vista previa, reenvío y envío manual de un aviso**: sin endpoint, la tarjeta de Notificaciones
  es de solo lectura y no monta ningún control.
- **Envíos**: cotización, transportadora y guía. `shippingCop` llega siempre en cero.
- **Facturación, Addi y Odoo.**
- Búsqueda, filtros y contadores agregados de pedidos.
- Clientes como entidad con historial propio.

## Siguiente fase propuesta

1. Crear las cuentas `master_admin` y `moderator` y comprobar en staging que cada rol ve exactamente
   las acciones de su fila de la matriz.
2. Introducir el pipeline de integración continua.
3. Abrir la siguiente sección operativa cuando el contrato publique sus operaciones: envíos o
   usuarios administrativos, sobre el mismo shell.
4. Sustituir el simulador por la pasarela real en cuanto el contrato publique el webhook
   verificado. El panel no necesita cambiar de forma: ya consume `payment`, `paymentEvents` y
   `environment`, y `live` se distingue de `sandbox` en el mismo sitio.
