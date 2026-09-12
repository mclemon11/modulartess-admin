# Estado actual

Última actualización: 2026-09-12.

## Fase

Fase 2 — primera vertical completa de sesión administrativa. Sobre la autenticación de la fase 1,
el objetivo era cerrar el recorrido: canjear el ID token en el BFF, guardar la sesión en una cookie
`__Host-` y proteger una ruta mínima verificándola contra el backend.

Fase 3 — despliegue. El panel **está desplegado en Cloud Run staging** con el material de este
repositorio: `Dockerfile`, `.dockerignore`, `deploy/cloudbuild.yaml`, `deploy/staging.sh` con
`preflight`/`build`/`deploy`/`verify`/`all`, y el runbook en `../../deploy/README.md`.

Fase 4 — catálogo. **Productos** está terminado de extremo a extremo y diseñado para escritorio y
móvil: listado, alta con contenido enriquecido, imágenes y variantes, detalle con edición por
secciones, inventario, variantes y publicación gobernada por `publicationReadiness`.

Fase 5 — pedidos. **Pedidos** está implementado en su alcance mínimo y real: listado, ficha,
transiciones operativas y cancelación, todo contra las cuatro operaciones que publica el contrato.
El pago no existe todavía, así que ningún pedido llega a `paid` por ahora.

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
| Página inicial      | Listo  | Server Component; «Panel administrativo en configuración».      |
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
| Catálogo enriquecido      | Listo      | Categoría, tipo, destacado, características y especificaciones.       |
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

## Previsto, todavía no implementado

Elementos que forman parte del diseño acordado, pero que aún no existen en el repositorio.

| Área                            | Estado        | Detalle                                                         |
| ------------------------------- | ------------- | --------------------------------------------------------------- |
| Métricas del dashboard          | Pendiente     | El backend no publica agregaciones; no se inventan.             |
| Pedidos, clientes y usuarios    | Pendiente     | El shell ya está preparado para añadirlos sin rehacerlo.        |
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
`itemCount`, `totalCop`, `status`, `createdAt` y `updatedAt`. Tabla amplia en escritorio, tarjetas
apiladas en móvil, badges de los seis estados e importes como `$ 1.450.000`, sin «COP». Paginación
**solo con `pageToken`**, porque el cursor es opaco: se avanza, no se salta a una página concreta.
Estados de carga, vacío —«Todavía no hay pedidos»—, error controlado y backend no disponible.

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

### Estado visual del panel

El panel tiene un solo sistema visual, compartido por todas las pantallas:

- **Marca**: el logotipo real (`public/assets/logo modulartess.svg`) se sirve con `next/image` en el
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

### Preparación para publicar

`AdminProductDto.publicationReadiness` llega calculado por el backend —imágenes y variantes
incluidas— con `ready` y la lista cerrada de `missing`. El panel:

- traduce **los diecisiete códigos** del contrato a texto en español, con un mapa exhaustivo por
  tipo: si el backend añade uno, el proyecto deja de compilar;
- enlaza cada requisito con la sección de la misma pantalla donde se resuelve;
- habilita «Publicar producto» solo cuando `ready` es `true` y el rol tiene `products.publish`;
- reemplaza la evaluación con la respuesta autoritativa de **cada** mutación, sin tocarla de forma
  optimista en React.

No se recalcula ninguna regla de publicación en el panel: `publish` consume esa misma evaluación, y
una segunda implementación acabaría diciendo «listo» sobre algo que el backend rechaza.

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
