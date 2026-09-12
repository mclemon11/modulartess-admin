# Modulartess Admin

Panel administrativo privado de Modulartess.

## Propósito

Interfaz interna para que el equipo de Modulartess gestione la operación de la tienda: catálogo,
pedidos, inventario y clientes. No es un sitio público y no está pensado para ser indexado.

Este repositorio es **independiente** del frontend público (`modulartess-web`) y del backend
(`modulartess-backend`). No forma parte de un monorepo y no comparte código con ellos. El único
intercambio permitido con el backend es una copia versionada de su contrato OpenAPI, descrita más
abajo.

## Límites de responsabilidad

El panel es una capa de presentación con una frontera BFF en su propio servidor:

- Renderiza vistas y formularios administrativos.
- Su servidor Next.js realiza llamadas HTTP tipadas al backend NestJS protegido por IAM.

El panel **no**:

- Accede directamente a Firestore ni a Cloud Storage.
- Usa el SDK cliente de Firestore ni el SDK cliente de Cloud Storage.
- Usa `firebase-admin`.
- Incluye credenciales de cuentas de servicio.
- Contiene reglas comerciales (precios, impuestos, disponibilidad, estados de pedido).
- Almacena secretos, credenciales ni claves privadas.

Todo lo anterior está excluido de forma **permanente**, no pendiente de una fase futura.

El backend NestJS es la **autoridad** sobre los datos y las reglas de negocio. **OpenAPI es el
único contrato** entre ambos.

Las reglas permanentes del repositorio están en [`AGENTS.md`](./AGENTS.md).

## Firebase Authentication: la única integración de Firebase en el navegador

El panel usa el SDK cliente de Firebase **exclusivamente para Firebase Authentication**. Solo se
importan `firebase/app` y `firebase/auth`. No habilita el SDK cliente de Firestore, ni el de Cloud
Storage, ni Analytics, ni `firebase-admin`, ni el acceso directo a los datos. El panel no crea
colecciones ni documentos.

## Inicio de sesión (implementado)

El acceso es **cerrado**: las cuentas se crean fuera del panel. No hay registro público, ni enlace
de «Crear cuenta», ni proveedores federados, ni autenticación anónima, ni cambio o restablecimiento
de contraseña.

Rutas:

- `/iniciar-sesion` — formulario de correo y contraseña.
- `/verificar-correo` — página estática con instrucciones; no recibe correo ni token por query
  string y no afirma que la verificación se haya completado.

Comportamiento del flujo:

1. La persistencia de Firebase se fija a `inMemoryPersistence` y el idioma del SDK a `es`
   **antes** de autenticar. El idioma no se toma del navegador.
2. Se ejecuta `signInWithEmailAndPassword`.
3. Si las credenciales fallan, se muestra **un único mensaje genérico** en español. Todos los
   errores de credenciales y de estado de la cuenta comparten texto, de modo que la pantalla no
   permite enumerar cuentas.
4. Si el correo **no** está verificado, el usuario se conserva solo en memoria y la pantalla lo
   explica. El correo de verificación se envía **únicamente** al pulsar «Enviar correo de
   verificación»: nunca de forma automática, y siempre en español. Tras un envío correcto se
   descarta la referencia al usuario, se cierra la sesión y se navega a `/verificar-correo`; si
   falla antes del envío, el reintento es explícito y no hay bucles.
5. Si el correo **sí** está verificado, el navegador pide un ID token reciente, lo envía al BFF
   del panel e **intenta siempre** cerrar la sesión cliente de Firebase, salga bien o mal el
   intercambio. Si el cierre se confirma, navega a `/panel` con el enrutador; si `signOut` falla,
   la navegación es **completa con `location.replace`**, porque `inMemoryPersistence` vive lo que
   vive el documento y solo destruirlo garantiza que el SDK no siga autenticado. Se usa `replace` y
   no `assign` para que la página anterior no quede en el historial, donde la BFCache podría
   restaurarla con su memoria intacta. Si el canje falla, muestra un mensaje
   genérico y permite un nuevo intento; si además falla `signOut`, recarga el formulario con un
   código fijo en la URL, sin correo, UID, token ni contraseña.

La exclusión de operaciones no se apoya en el estado de React: hay dos candados síncronos que se
toman antes del primer `await`, de modo que dos submits —o dos envíos de correo— disparados antes
del siguiente render no pasan los dos. Una vez que Firebase confirma el envío del correo, el
candado queda **sellado**: ningún fallo posterior habilita un segundo envío.

Nada de lo anterior se guarda: ni el correo, ni la contraseña, ni el UID, ni ningún token llegan a
`localStorage`, `sessionStorage`, cookies accesibles desde JavaScript, logs o URLs.

El detalle está en
[`docs/decisions/0002-firebase-auth-closed-sign-in.md`](./docs/decisions/0002-firebase-auth-closed-sign-in.md).

## Todavía pendiente en este repositorio

La vertical de sesión está **implementada y comprobada con dobles locales**. El backend ya está
listo del otro lado; lo que falta es **desplegar este panel** y probar el recorrido de extremo a
extremo con una cuenta real.

Estado real del entorno:

- Firebase Authentication está habilitado.
- Existe la primera cuenta administrativa, con el correo verificado.
- Su claim `super_admin` **ya fue asignado**.
- El bootstrap del backend quedó en `completed` y **no puede repetirse**.
- El backend de staging corre con **`ADMIN_AUTH_MODE=firebase`** y su superficie `/v1/admin/*`
  está **activa**, tras un IAM propio y sin invocadores anónimos.
- El panel **todavía no está desplegado**: la identidad `modulartess-admin-stg-run` no existe aún y
  no tiene `roles/run.invoker`. El procedimiento está en
  [`deploy/README.md`](./deploy/README.md).
- El backend y el contrato OpenAPI vigentes admiten **únicamente** `super_admin`. `master_admin` y
  `moderator` están decididos en la ADR 0007 del backend, pero todavía no están implementados ni
  aparecen en el contrato.

Todavía pendiente en este repositorio:

- Dashboard administrativo y operaciones de catálogo, pedidos, inventario y clientes.
- Revocación de la sesión en el proveedor al cerrar sesión: el contrato no publica un `DELETE`.
- Pipeline de integración continua y estrategia de despliegue.
- Acceso a Firestore o Cloud Storage desde el panel: excluido de forma permanente, no pendiente.

## Flujo de autenticación previsto entre el panel y el backend

El backend NestJS está desplegado como un **servicio de Cloud Run protegido por IAM**. Su endpoint
tiene una URL canónica direccionable por internet, pero no permite la invocación anónima: esas
solicitudes se rechazan con `403`. La URL no es un secreto.

Aun así, no se entrega al navegador del panel: no viaja en ninguna variable `NEXT_PUBLIC_*`, ni en
la configuración de cliente, ni en el bundle. El navegador no llama directamente al backend; dentro
del flujo administrativo, las llamadas pasan por el servidor Next.js (frontera BFF).

El flujo previsto es:

1. El navegador se autentica mediante Firebase Auth.
2. El navegador se comunica con el servidor Next.js del panel.
3. El servidor Next.js actúa como frontera BFF.
4. El servidor Next.js invoca el backend en Cloud Run con su identidad de ejecución.
5. El backend verifica la identidad administrativa y aplica autorización y reglas de negocio.

### Contrato del backend

| Aspecto         | Estado                                                               |
| --------------- | -------------------------------------------------------------------- |
| Endpoints       | `POST` y `GET /v1/admin/auth/session`                                |
| Sesión interna  | Encabezado `x-modulartess-admin-session`                             |
| `Authorization` | Reservado para el IAM de Cloud Run; no transporta la sesión personal |
| Claim exigido   | `modulartess_admin_role=super_admin`, firmado                        |
| Duración        | `28800` segundos, verificada comprobando la revocación               |
| `DELETE`        | **No existe** en el contrato; el panel no lo inventa                 |

### Los dos canales, separados

El BFF habla con el backend por dos vías que nunca se mezclan:

| Canal                         | Transporta                                  |
| ----------------------------- | ------------------------------------------- |
| `Authorization`               | **Solo** el identity token IAM de Cloud Run |
| `x-modulartess-admin-session` | **Solo** la sesión de la persona            |

En esta superficie no hay ningún service token.

### Sesión administrativa (implementada)

El navegador no llama nunca al backend. El BFF del panel es la única vía, y la sesión vive en una
cookie que el JavaScript del navegador no puede leer:

```
__Host-modulartess-admin-session
HttpOnly · Secure · SameSite=Strict · Path=/ · sin Domain
```

Endpoints del BFF, todos con `Cache-Control: no-store`:

| Método   | Ruta                      | Éxito | Qué hace                                                        |
| -------- | ------------------------- | ----- | --------------------------------------------------------------- |
| `POST`   | `/api/admin/auth/session` | `201` | Canjea el ID token, crea la cookie, devuelve principal y expiry |
| `GET`    | `/api/admin/auth/session` | `200` | Verifica contra el backend; **solo lectura**, nunca muta        |
| `DELETE` | `/api/admin/auth/session` | `204` | Borra la cookie local                                           |

El éxito se decide por el estado **exacto**, no por `response.ok`: un `200` en el canje o un `202`
en el cierre significan que algo no salió como se esperaba, y tratarlos como éxito dejaría al panel
navegando sin cookie o dando por cerrada una sesión viva.

`POST` y `DELETE` validan `Origin` de forma exacta contra `MODULARTESS_ADMIN_ORIGIN`, que se lee
**por separado** del resto de la configuración: cerrar sesión no llama al backend, así que no puede
quedar bloqueado porque falten su URL, su audiencia o su modo de autenticación. Junto con
`SameSite=Strict`, la validación de `Origin` es la defensa CSRF de estas rutas.

La expiración de la cookie nunca supera el `expiresAt` del backend ni los `28800` segundos del
contrato, y no hay renovación silenciosa. `expiresAt` se acepta solo como `date-time` de RFC 3339
con zona explícita.

`/panel` es el shell del panel: barra lateral, cabecera con breadcrumb, rol visible y cierre de
sesión. Sobre él cuelga la primera sección operativa, **Productos**, con datos reales del backend.

| Ruta                           | Qué hace                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `/panel`                       | Portada. Sin métricas: el backend no publica agregaciones todavía.                               |
| `/panel/productos`             | Listado server-rendered, paginado con `pageToken`.                                               |
| `/panel/productos/nuevo`       | Alta con contenido, imágenes y variantes. El producto nace `draft`; el estado no se elige.       |
| `/panel/productos/[productId]` | Detalle, edición con `expectedVersion`, clasificación, variantes, imágenes, publicar y archivar. |

Mutaciones a través del BFF, nunca desde el navegador al backend:

| Método  | Ruta                                                                         |
| ------- | ---------------------------------------------------------------------------- |
| `POST`  | `/api/admin/products`                                                        |
| `PATCH` | `/api/admin/products/[productId]`                                            |
| `POST`  | `/api/admin/products/[productId]/publish`                                    |
| `POST`  | `/api/admin/products/[productId]/archive`                                    |
| `POST`  | `/api/admin/products/[productId]/inventory-adjustments`                      |
| `POST`  | `/api/admin/products/[productId]/images` (multipart)                         |
| `PATCH` | `/api/admin/products/[productId]/images/[imageId]`                           |
| `POST`  | `/api/admin/products/[productId]/images/[imageId]/archive`                   |
| `POST`  | `/api/admin/products/[productId]/variants`                                   |
| `PATCH` | `/api/admin/products/[productId]/variants/[variantId]`                       |
| `POST`  | `/api/admin/products/[productId]/variants/[variantId]/archive`               |
| `POST`  | `/api/admin/products/[productId]/variants/[variantId]/inventory-adjustments` |

No hay Route Handler de lectura para las variantes: la colección completa —activas y archivadas—
viaja dentro del producto en cada lectura y en la respuesta de cada mutación.

Permisos visibles: `super_admin` y `master_admin` publican y archivan —el producto, sus imágenes y
sus variantes—; `moderator` consulta, crea, edita y ajusta inventario, y no ve esas dos acciones.
Las variantes reutilizan esos mismos permisos: crear usa `products.create`, editar
`products.update`, el inventario `inventory.adjust` y archivar `products.archive`. Es usabilidad: el
backend rechaza igualmente cualquier petición que el rol no permita.

Un producto sin variantes se sigue vendiendo por su SKU, precio e inventario base. Con la primera
variante activa, el precio y el inventario pasan a gestionarse por variante: el ajuste base se
deshabilita con el motivo escrito, y los valores anteriores se conservan tal cual.

Las decisiones del catálogo enriquecido y de las variantes están en
[`docs/decisions/0004-enriched-catalogue-and-variants.md`](./docs/decisions/0004-enriched-catalogue-and-variants.md).

El detalle anterior del shell —lee la cookie en el servidor y verifica la sesión contra el backend—
sigue igual. No muestra UID ni correo, y no contiene datos comerciales.
Si el backend rechaza la sesión con `401` o `403`, la página **no redirige**: renderiza una
frontera cliente que llama al `DELETE` y navega al login solo tras el `204`. Si esa limpieza falla,
muestra un estado con reintento explícito, sin bucles.

Las decisiones están en
[`docs/decisions/0003-admin-session-bff.md`](./docs/decisions/0003-admin-session-bff.md).

## Contrato OpenAPI versionado

`openapi/backend-v1.json` es una copia comiteada del contrato publicado por el backend. El build y
el runtime dependen **solo** de esa copia: este repositorio no lee ningún otro repositorio en build
ni en runtime, y no usa dependencias `file:`, symlinks ni workspaces compartidos.

```bash
pnpm api:update <ruta-al-openapi.json>   # Refresca la copia desde un origen pasado por argumento
pnpm api:generate                        # Regenera src/lib/api/generated/schema.d.ts
pnpm api:check                           # Falla si los tipos no coinciden con la copia
```

El script no fija ninguna ruta a otro repositorio: el origen se pasa siempre como argumento y el
resultado se revisa en el diff. Los módulos internos del backend no son un contrato.

## Requisitos

- Node.js `>=22.0.0`
- pnpm `11.19.0`

## Comandos locales

```bash
pnpm install        # Instalar dependencias
pnpm dev            # Servidor de desarrollo en http://localhost:3000
pnpm build          # Compilación de producción
pnpm start          # Servir la compilación de producción
pnpm lint           # ESLint
pnpm typecheck      # Comprobación de tipos (tsc --noEmit)
pnpm format         # Formatear con Prettier
pnpm format:check   # Verificar formato sin escribir
pnpm test           # Pruebas unitarias con Vitest
pnpm api:check      # Verifica que los tipos coinciden con la copia del contrato
```

Despliegue (ver [`deploy/README.md`](./deploy/README.md)):

```bash
deploy/staging.sh config             # Configuración resuelta; no toca la nube
deploy/staging.sh preflight          # Comprobaciones de solo lectura, bloqueantes
deploy/staging.sh all --dry-run      # Vista previa completa sin mutaciones
deploy/staging.sh all                # preflight + build + deploy + verify
```

## Variables de entorno

[`.env.example`](./.env.example) declara los **nombres** de las variables necesarias, nunca sus
valores. Los valores locales van en `.env` o `.env.local`, ambos ignorados por Git y nunca
comiteados.

Firebase Authentication necesita cuatro variables:

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

Son identificadores públicos del cliente Firebase, no secretos: viajan al navegador por diseño. Lo
que protege el proyecto es la autorización del backend, no ocultarlos. No se incluyen
`storageBucket`, `messagingSenderId` ni `measurementId`, porque el panel no usa Storage, Firestore,
Messaging ni Analytics.

Si faltan, `pnpm build` sigue funcionando y el formulario muestra un estado controlado en español
con los nombres de las variables ausentes; nunca con sus valores.

No habrá ninguna variable `NEXT_PUBLIC_` con la URL del backend. El backend es un servicio de
Cloud Run protegido por IAM: su URL es direccionable por internet y no es un secreto, pero rechaza
la invocación anónima. En una fase posterior el BFF tendrá una variable **exclusivamente
server-side** con esa URL e invocará Cloud Run usando su identidad de ejecución.

## Estado actual

Base técnica mínima, limpia y compilable. En concreto, el repositorio contiene:

- Aplicación Next.js con App Router y TypeScript estricto.
- Layout raíz con los metadatos de Modulartess Admin e indexación desactivada.
- Página inicial renderizada en el servidor con el mensaje «Panel administrativo en configuración».
- Inicio de sesión cerrado con Firebase Authentication y verificación del correo.
- Estilos sobrios y responsive mediante CSS Modules, sin componentes copiados del storefront.
- Configuración de ESLint, Prettier, Vitest y scripts de verificación.
- Documentación de arquitectura y las decisiones registradas.

Más allá de la autenticación no hay funcionalidad operativa, ni acciones simuladas, ni datos de
ejemplo. El detalle está en
[`docs/architecture/current-status.md`](./docs/architecture/current-status.md).

## Funcionalidades pendientes

- Despliegue del panel en Cloud Run y verificación del recorrido completo con el `super_admin`
  real, tras autorizar el dominio en Firebase Authentication.
- Roles `master_admin` y `moderator`, cuando el backend los implemente y los publique.
- Layout de aplicación autenticada (navegación, cabecera, estados de carga y error).
- Gestión de catálogo y de inventario.
- Gestión de pedidos.
- Gestión de clientes.
- Subida de medios delegada al backend (el panel nunca escribe en Cloud Storage).
- Pruebas automatizadas y pipeline de integración continua.
- Estrategia de despliegue del panel privado.
