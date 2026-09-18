# Estado actual

Última actualización: 2026-09-18.

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
transiciones operativas y cancelación, todo contra las cuatro operaciones que publica el contrato.
El pago no existe todavía, así que ningún pedido llega a `paid` por ahora.

Fase 6 — entrada y primera revisión visual. `/` deja de ser una pantalla y pasa a ser la puerta:
una redirección HTTP a `/panel`, sin duplicar la comprobación de sesión. Y el área ya terminada
—portada, listado de productos y alta/edición— se revisó a seis anchos reales contra el despliegue
de staging, con los defectos encontrados corregidos y ninguna funcionalidad añadida.

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

| Área                      | Estado     | Detalle                                                               |
| ------------------------- | ---------- | --------------------------------------------------------------------- |
| Copia OpenAPI             | Listo      | `openapi/backend-v1.json`, comiteada; build y runtime solo de ahí.    |
| Tipos generados           | Listo      | `src/lib/api/generated/schema.d.ts`; `pnpm api:check` los valida.     |
| Cliente del backend       | Listo      | `openapi-fetch` tipado, `server-only`, `no-store` y temporizador.     |
| Identity token IAM        | Listo      | `google-auth-library`, caché por audiencia con retirada en fallo.     |
| `POST` del BFF            | Listo      | Origin exacto, `application/json`, cuerpo en bytes UTF-8, `201`.      |
| `GET` del BFF             | Listo      | Verifica contra el backend. **Solo lectura**: nunca emite cookie.     |
| `DELETE` del BFF          | Listo      | Origin exacto, borra la cookie, `204`. Independiente del backend.     |
| Limpieza de sesión        | Listo      | Frontera cliente: `DELETE` y navegación solo tras el `204`.           |
| Validación de orígenes    | Listo      | HTTPS salvo loopback; audiencia igual a la URL en `google-oidc`.      |
| `expiresAt`               | Listo      | RFC 3339 estricto con zona explícita; sin `Date.parse` permisivo.     |
| Cookie de sesión          | Listo      | `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`.         |
| Integración con el login  | Listo      | ID token reciente, canje y cierre de Firebase tras el canje.          |
| Cierre de la sesión SDK   | Listo      | Si `signOut` falla, `location.replace` destruye el documento.         |
| Ruta protegida `/panel`   | Listo      | Server Component; verifica en cada visita; solo muestra el rol.       |
| Shell del panel           | Listo      | `layout.tsx`, sidebar, cabecera, breadcrumb, rol y cierre de sesión.  |
| Catálogo de productos     | Listo      | Listado, alta, detalle, edición, publicar, archivar e inventario.     |
| Preparación para publicar | Listo      | `publicationReadiness` del backend, traducida y enlazada por sección. |
| Precio en pesos           | Listo      | Se escribe y se lee `$ 1.450.000`; viaja el entero `1450000`.         |
| Portada y navegación      | Listo      | Cinco secciones, portada con tarjetas, marca real y bloque de sesión. |
| Envíos y Wallet           | Anunciadas | Pantallas «Próximamente»: su contrato no existe todavía.              |
| Catálogo enriquecido      | Listo      | Clasificación, contenido visible y detalles adicionales, separados.   |
| Editor editorial          | Listo      | Topes de 180, 3000, 5 × 60; contadores, «Opcional» y orden real.      |
| Variantes                 | Listo      | Ejes, combinaciones, precio, inventario y archivado por variante.     |
| Imágenes de producto      | Listo      | Subir, editar texto alternativo, orden, principal y archivar.         |
| Alta completa             | Listo      | Un envío: crea el borrador, enriquece, sube y crea variantes.         |
| Reanudación tras fallo    | Listo      | No recrea nada guardado; reintenta solo lo que falta.                 |
| Shell responsive          | Listo      | Sidebar fija en escritorio; cajón por debajo de 60rem.                |
| Mutaciones por BFF        | Listo      | Nueve Route Handlers; el navegador no llama al backend.               |
| Permisos por rol          | Listo      | Matriz explícita en `src/features/session/permissions.ts`.            |
| ADR local del BFF         | Listo      | `../decisions/0003-admin-session-bff.md`.                             |

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

| Área                            | Estado        | Detalle                                                         |
| ------------------------------- | ------------- | --------------------------------------------------------------- |
| Métricas del dashboard          | Pendiente     | El backend no publica agregaciones; no se inventan.             |
| Clientes y usuarios admin.      | Pendiente     | El shell ya está preparado para añadirlos sin rehacerlo.        |
| Pago y reembolsos               | Pendiente     | Sin pasarela ni operación de reembolso en el contrato.          |
| Envíos                          | Pendiente     | Pantalla anunciada; el despacho no está publicado.              |
| Addi y Odoo                     | Pendiente     | Integraciones fuera del contrato actual.                        |
| Búsqueda y filtros del catálogo | Pendiente     | Solo hay `pageToken` y `pageSize`: filtrar una página mentiría. |
| Contadores por estado           | Pendiente     | No hay agregaciones; las cifras de las referencias no existen.  |
| Catálogo de categorías          | Pendiente     | No hay endpoint que las liste: se escriben nombre y slug.       |
| Colecciones, SEO, envío, dtos.  | Pendiente     | Sin publicar en OpenAPI; las referencias los muestran.          |
| Lectura aparte de variantes     | Pendiente     | Viajan dentro del producto; un `GET` propio no tendría uso.     |
| Paginación numérica             | Descartada    | El cursor es opaco: permite avanzar, no saltar de página.       |
| Reordenar imágenes arrastrando  | Pendiente     | Hoy se reordena con botones accesibles sobre el mismo PATCH.    |
| Biblioteca de medios            | Pendiente     | Sin endpoint que liste objetos del bucket.                      |
| CRUD de cuentas administrativas | Pendiente     | Vertical posterior; hoy solo existe la cuenta `super_admin`.    |
| Revocación al cerrar sesión     | Pendiente     | El contrato no publica un `DELETE`; el panel no lo inventa.     |
| IAM y autorización del backend  | Fuera de aquí | El panel no la ejerce; es autoridad del backend.                |
| CI                              | Pendiente     | Hay pruebas unitarias, pero no pipeline.                        |

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
- Endpoints del backend que el contrato OpenAPI no publique, incluido un `DELETE` de la sesión.
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
`previewLine`, `itemCount`, `totalCop`, `status`, `createdAt` y `updatedAt`. Tabla amplia en
escritorio, tarjetas apiladas en móvil, badges de los seis estados e importes como `$ 1.450.000`,
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
e indicaciones; subtotal, envío y total; y el historial append-only en orden cronológico, más el
recorrido de estados dibujado desde ese mismo historial. **No se vuelve a leer el catálogo** para
reconstruir una línea: si el producto cambió después de la compra, el pedido tiene que seguir
diciendo qué se vendió y por cuánto.

Acciones resueltas por `orderActions`, una función **pura** sin jerarquía numérica, con su propia
batería de pruebas:

| Estado            | Acción        | `super_admin` | `master_admin` | `moderator` |
| ----------------- | ------------- | ------------- | -------------- | ----------- |
| `paid`            | → `preparing` | sí            | sí             | sí          |
| `preparing`       | → `shipped`   | sí            | sí             | sí          |
| `shipped`         | → `delivered` | sí            | sí             | sí          |
| `pending_payment` | Cancelar      | sí            | sí             | **no**      |

Son **botones concretos** según el siguiente estado, no un selector: un desplegable con los seis
valores dejaría elegir transiciones que el backend rechaza. `pending_payment → paid` no se ofrece a
nadie: es del webhook de pagos. `delivered` y `cancelled` son finales.

Toda mutación envía `expectedVersion` y **sustituye** el estado local con la respuesta autoritativa.
Ante `order_version_conflict` no se reintenta solo: se muestra «El pedido cambió» y se ofrece
recargar. Ante `order_cancellation_requires_refund` se explica que el reembolso todavía no existe, y
**no** se ofrece recargar, porque recargar no lo arregla. Para distinguir esos dos `409` el BFF ganó
un código propio, `refund_required`.

Cuatro Route Handlers bajo `/api/admin/orders`, todos `server-only`: listado, ficha, cambio de
estado y cancelación. Reutilizan la frontera que ya existía —sesión en cookie `__Host-`, validación
de `Origin` en las mutaciones, IAM, tiempo de espera, `no-store` y traducción a códigos estables—.
El navegador no conoce la URL del backend, ni la audiencia, ni el identity token, ni la cookie
interna, y **nada del pedido se guarda** en `localStorage` ni en `sessionStorage`.

Lo que las referencias de diseño muestran y **no** está, porque el contrato no lo publica: buscador,
filtros y chips por estado con sus conteos, tarjetas de métricas, rango de fechas, exportación,
«Pedidos que requieren atención», «Últimos pedidos», método y estado de pago, descuento, canal de
venta, miniatura del producto en el listado, selección múltiple, paginación numérica, «Contactar
cliente», «Imprimir», «Ver perfil», «Ver en mapa», notas internas, observaciones del cliente y
edición de cliente, dirección, líneas o precios. Tampoco hay reembolso ni pago manual.

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
- **Portada**: cuadrícula de tarjetas grandes hacia Pedidos, Productos, Envíos y Wallet, con el rol
  de la sesión. Sin ventas, pedidos recientes, productos más vendidos, gráficas ni porcentajes: el
  backend no publica agregaciones.
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

### Alta de producto: composición

Una sola pantalla, `/panel/productos/nuevo`, con la columna de trabajo a la izquierda y una vista
previa de 21rem a la derecha que se apila debajo en cuanto la ventana baja de 64rem. Arriba, una
barra compacta con «Guardar borrador» y «Publicar producto». A partir de 88rem —el ancho en el que
la columna principal deja sitio de verdad— Información e Imágenes comparten la primera fila;
Precio e Inventario son tarjetas compactas, y Características y Variantes ocupan el ancho completo.

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

## Estado de los datos

No existen datos de ejemplo de productos, precios, inventario, pedidos ni clientes, ni acciones de
interfaz que no hagan nada. El panel no lee ni escribe en Firestore ni en Cloud Storage.

La autenticación, la sesión administrativa y el catálogo son **reales**, no simulados: Firebase
Authentication verifica credenciales de verdad, el backend es la autoridad que valida la sesión y
cada producto que se ve en pantalla viene de `/v1/admin/products`. Lo que no existe todavía es
cualquier operación comercial fuera del catálogo: pedidos, clientes y pagos.

## Decisiones registradas

- `../decisions/0001-admin-application-boundary.md` — límite de la aplicación administrativa.
- `../decisions/0002-firebase-auth-closed-sign-in.md` — inicio de sesión cerrado con Firebase
  Authentication.
- `../decisions/0003-admin-session-bff.md` — sesión administrativa a través de la frontera BFF.
- `../decisions/0004-enriched-catalogue-and-variants.md` — catálogo enriquecido y variantes.

## Pendiente del backend para Pedidos

Nada de esto se compensa en el panel; cuando exista en el contrato, se implementará aquí:

- **Pago**: webhook de Wompi y el paso `pending_payment → paid`. Hasta entonces ningún pedido avanza
  más allá de pendiente de pago, y la única acción ejecutable de verdad es cancelar.
- **Descuento de inventario al pagar**, que va en la misma transacción del webhook.
- **Reembolsos**, y con ellos la cancelación de un pedido ya pagado.
- **Envíos**: cotización, transportadora y guía. `shippingCop` llega siempre en cero.
- **Facturación, Addi y Odoo.**
- Búsqueda, filtros y contadores agregados de pedidos.
- Clientes como entidad con historial propio.

## Siguiente fase propuesta

1. Crear las cuentas `master_admin` y `moderator` y comprobar en staging que cada rol ve exactamente
   las acciones de su fila de la matriz.
2. Introducir el pipeline de integración continua.
3. Abrir la siguiente sección operativa cuando el contrato publique sus operaciones: pedidos o
   usuarios administrativos, sobre el mismo shell.
