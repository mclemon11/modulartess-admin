# Estado actual

Última actualización: 2026-09-11.

## Fase

Fase 2 — primera vertical completa de sesión administrativa. Sobre la autenticación de la fase 1,
el objetivo era cerrar el recorrido: canjear el ID token en el BFF, guardar la sesión en una cookie
`__Host-` y proteger una ruta mínima verificándola contra el backend.

Fase 3 — preparación del despliegue. Está el material completo para llevar el panel a Cloud Run
staging: `Dockerfile`, `.dockerignore`, `deploy/cloudbuild.yaml`, `deploy/staging.sh` con
`preflight`/`build`/`deploy`/`verify`/`all`, y el runbook en `../../deploy/README.md`.

**Límite real:** el panel **todavía no está desplegado**. El backend ya tiene su superficie
administrativa activa, pero la identidad `modulartess-admin-stg-run` no existe aún y no tiene
`roles/run.invoker`. Hasta que se creen a mano (runbook, sección 2) y se despliegue, el recorrido
en Cloud Run sigue sin verificar.

## Estado real del entorno

Esto es lo que ya existe fuera de este repositorio, y no debe describirse como pendiente:

| Hecho                                 | Estado                                                |
| ------------------------------------- | ----------------------------------------------------- |
| Firebase Authentication               | Habilitado                                            |
| Primera cuenta administrativa         | Creada, con el correo **verificado**                  |
| Claim `super_admin` de esa cuenta     | **Ya asignado**                                       |
| Bootstrap del backend                 | `completed`; **no puede repetirse**                   |
| Roles admitidos por backend y OpenAPI | `super_admin`, `master_admin`, `moderator`            |
| `master_admin` y `moderator`          | Implementados en el contrato; **sin cuentas creadas** |
| Cuentas existentes                    | Solo la `super_admin` del bootstrap                   |
| Backend desplegado                    | **`ADMIN_AUTH_MODE=firebase`**, `/v1/admin/*` activa  |
| Backend `modulartess-backend-staging` | Ready, privado por IAM, revisión `...-00003-6hz`      |
| Invocador actual del backend          | `modulartess-web-stg-run`, el único                   |
| `modulartess-admin-stg-run`           | **No existe todavía**                                 |
| `roles/run.invoker` para el panel     | **No concedido todavía**                              |
| Servicio `modulartess-admin-staging`  | **No desplegado todavía**                             |

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

| Área                     | Estado | Detalle                                                              |
| ------------------------ | ------ | -------------------------------------------------------------------- |
| Copia OpenAPI            | Listo  | `openapi/backend-v1.json`, comiteada; build y runtime solo de ahí.   |
| Tipos generados          | Listo  | `src/lib/api/generated/schema.d.ts`; `pnpm api:check` los valida.    |
| Cliente del backend      | Listo  | `openapi-fetch` tipado, `server-only`, `no-store` y temporizador.    |
| Identity token IAM       | Listo  | `google-auth-library`, caché por audiencia con retirada en fallo.    |
| `POST` del BFF           | Listo  | Origin exacto, `application/json`, cuerpo en bytes UTF-8, `201`.     |
| `GET` del BFF            | Listo  | Verifica contra el backend. **Solo lectura**: nunca emite cookie.    |
| `DELETE` del BFF         | Listo  | Origin exacto, borra la cookie, `204`. Independiente del backend.    |
| Limpieza de sesión       | Listo  | Frontera cliente: `DELETE` y navegación solo tras el `204`.          |
| Validación de orígenes   | Listo  | HTTPS salvo loopback; audiencia igual a la URL en `google-oidc`.     |
| `expiresAt`              | Listo  | RFC 3339 estricto con zona explícita; sin `Date.parse` permisivo.    |
| Cookie de sesión         | Listo  | `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`.        |
| Integración con el login | Listo  | ID token reciente, canje y cierre de Firebase tras el canje.         |
| Cierre de la sesión SDK  | Listo  | Si `signOut` falla, `location.replace` destruye el documento.        |
| Ruta protegida `/panel`  | Listo  | Server Component; verifica en cada visita; solo muestra el rol.      |
| Shell del panel          | Listo  | `layout.tsx`, sidebar, cabecera, breadcrumb, rol y cierre de sesión. |
| Catálogo de productos    | Listo  | Listado, alta, detalle, edición, publicar, archivar e inventario.    |
| Catálogo enriquecido     | Listo  | Categoría, tipo, destacado, características y especificaciones.      |
| Variantes                | Listo  | Ejes, combinaciones, precio, inventario y archivado por variante.    |
| Imágenes de producto     | Listo  | Subir, editar texto alternativo, orden, principal y archivar.        |
| Alta completa            | Listo  | Un envío: crea el borrador, enriquece, sube y crea variantes.        |
| Reanudación tras fallo   | Listo  | No recrea nada guardado; reintenta solo lo que falta.                |
| Shell responsive         | Listo  | Sidebar fija en escritorio; cajón por debajo de 60rem.               |
| Mutaciones por BFF       | Listo  | Nueve Route Handlers; el navegador no llama al backend.              |
| Permisos por rol         | Listo  | Matriz explícita en `src/features/session/permissions.ts`.           |
| ADR local del BFF        | Listo  | `../decisions/0003-admin-session-bff.md`.                            |

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

### Todavía no verificado en Cloud Run

| Área                     | Estado        | Detalle                                                  |
| ------------------------ | ------------- | -------------------------------------------------------- |
| Identidad del panel      | Sin crear     | `modulartess-admin-stg-run`; comando en el runbook.      |
| `roles/run.invoker`      | Sin conceder  | Solo sobre `modulartess-backend-staging`, sin condición. |
| Servicio del panel       | Sin desplegar | `modulartess-admin-staging`.                             |
| Recorrido completo real  | Sin verificar | Requiere el panel desplegado y el dominio autorizado.    |
| Identity token IAM real  | Sin verificar | Requiere la identidad creada y el binding concedido.     |
| Dominio en Firebase Auth | Sin autorizar | Obligatorio **antes** de la primera prueba manual.       |

## Previsto, todavía no implementado

Elementos que forman parte del diseño acordado, pero que aún no existen en el repositorio.

| Área                             | Estado        | Detalle                                                        |
| -------------------------------- | ------------- | -------------------------------------------------------------- |
| Métricas del dashboard           | Pendiente     | El backend no publica agregaciones; no se inventan.            |
| Pedidos, clientes y usuarios     | Pendiente     | El shell ya está preparado para añadirlos sin rehacerlo.       |
| Búsqueda y filtros del catálogo  | Pendiente     | `GET /v1/admin/products` solo admite `pageToken` y `pageSize`. |
| Contadores por estado            | Pendiente     | No hay agregaciones; las cifras de las referencias no existen. |
| Catálogo de categorías           | Pendiente     | No hay endpoint que las liste: se escriben nombre y slug.      |
| Colecciones, SEO, envío, dtos.   | Pendiente     | Sin publicar en OpenAPI; las referencias los muestran.         |
| Lectura aparte de variantes      | Pendiente     | Viajan dentro del producto; un `GET` propio no tendría uso.    |
| Paginación numérica              | Descartada    | El cursor es opaco: permite avanzar, no saltar de página.      |
| Reordenar imágenes arrastrando   | Pendiente     | Hoy se reordena con botones accesibles sobre el mismo PATCH.   |
| Biblioteca de medios             | Pendiente     | Sin endpoint que liste objetos del bucket.                     |
| CRUD de cuentas administrativas  | Pendiente     | Vertical posterior; hoy solo existe la cuenta `super_admin`.   |
| Revocación al cerrar sesión      | Pendiente     | El contrato no publica un `DELETE`; el panel no lo inventa.    |
| Roles `master_admin`/`moderator` | Pendiente     | Decididos en la ADR 0007 del backend, aún sin implementar.     |
| IAM y autorización del backend   | Fuera de aquí | El panel no la ejerce; es autoridad del backend.               |
| CI                               | Pendiente     | Hay pruebas unitarias, pero no pipeline.                       |
| Despliegue                       | Pendiente     | Sin estrategia definida para el panel privado.                 |

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

## Estado de los datos

No existen datos de ejemplo de productos, precios, inventario, pedidos ni clientes, ni acciones de
interfaz que no hagan nada. El panel no lee ni escribe en Firestore ni en Cloud Storage.

La autenticación y la sesión administrativa son **reales**, no simuladas: Firebase Authentication
verifica credenciales de verdad y el backend es la autoridad que valida la sesión. Lo que no existe
todavía es cualquier operación comercial, y el recorrido en Cloud Run sigue sin verificar porque
el panel aún no está desplegado.

## Decisiones registradas

- `../decisions/0001-admin-application-boundary.md` — límite de la aplicación administrativa.
- `../decisions/0002-firebase-auth-closed-sign-in.md` — inicio de sesión cerrado con Firebase
  Authentication.
- `../decisions/0003-admin-session-bff.md` — sesión administrativa a través de la frontera BFF.
- `../decisions/0004-enriched-catalogue-and-variants.md` — catálogo enriquecido y variantes.

## Siguiente fase propuesta

1. Crear `modulartess-admin-stg-run` y concederle `roles/run.invoker` sobre
   `modulartess-backend-staging` (runbook, sección 2).
2. Autorizar el dominio del panel en Firebase Authentication.
3. Desplegar con `deploy/staging.sh all` y verificar el recorrido con el `super_admin` real.
4. Construir el layout de la aplicación autenticada (navegación, cabecera, estados de carga y
   error).
5. Añadir la primera operación de lectura real sobre el contrato, ya con tipos generados.
6. Introducir el pipeline de integración continua.
7. Definir la estrategia de despliegue del panel.
