# AGENTS.md — Reglas permanentes del repositorio

Este archivo define las reglas obligatorias para cualquier persona o agente que trabaje en
`modulartess-admin`. Son permanentes: se aplican en todas las fases del proyecto, salvo que se
sustituyan mediante una decisión registrada en `docs/decisions/`.

## 1. Alcance del repositorio

- Este repositorio contiene **únicamente** el panel administrativo privado de Modulartess.
- Es un repositorio **independiente**. No es un monorepo ni parte de uno.
- Está prohibido importar, enlazar o modificar archivos de `modulartess-web` (frontend público) o
  `modulartess-backend` (API NestJS).
- Está prohibido añadir referencias por ruta (relativa o absoluta), symlinks, workspaces de pnpm o
  `file:` dependencies hacia esos repositorios.

### 1.1 Único intercambio permitido: el contrato OpenAPI

La prohibición anterior no es absoluta en un punto, y solo en ese punto. Está permitido:

- obtener una **copia versionada** del contrato OpenAPI publicado por el backend;
- guardar esa copia dentro de `modulartess-admin`, comiteada como cualquier otro archivo del
  repositorio;
- generar tipos a partir de esa copia local;
- actualizar esa copia mediante un procedimiento **explícito y verificable** (un comando o script
  documentado, ejecutado a propósito, cuyo resultado se revisa en el diff).

Sigue estando prohibido, sin excepción:

- importar código fuente del backend;
- usar dependencias `file:`;
- crear symlinks;
- leer módulos internos del backend (DTOs, entidades, servicios) y tratarlos como contrato;
- depender en tiempo de build o de ejecución de rutas locales de otro repositorio;
- crear un workspace compartido entre repositorios.

**OpenAPI sigue siendo el único contrato.** La copia local es un artefacto derivado del contrato
publicado, no una segunda fuente de verdad.

## 2. Límites de responsabilidad

El panel es **solo** una capa de presentación y una frontera BFF:

- Renderiza vistas y formularios administrativos.
- Su servidor Next.js realiza llamadas HTTP tipadas al backend NestJS protegido por IAM.

El panel **nunca**:

- Accede directamente a Firestore ni a Cloud Storage, por ningún medio.
- Usa el SDK cliente de Firestore ni el SDK cliente de Cloud Storage.
- Usa `firebase-admin`.
- Incluye credenciales de cuentas de servicio.
- Contiene reglas comerciales (precios, impuestos, descuentos, disponibilidad, estados de pedido,
  cálculos de inventario).
- Contiene secretos, credenciales, claves privadas ni tokens de larga duración.

El backend NestJS es la **única autoridad** sobre datos, validación y reglas de negocio.

### 2.1 Firebase Authentication: la única integración de Firebase en el navegador

El panel usa el SDK cliente de Firebase **exclusivamente para Firebase Authentication**. Es la
única integración de Firebase permitida dentro del navegador, y no habilita ninguna otra. Está
implementada: ver `docs/decisions/0002-firebase-auth-closed-sign-in.md`.

Solo se importan `firebase/app` y `firebase/auth`. Queda prohibido de forma **permanente**: el SDK
cliente de Firestore, el SDK cliente de Cloud Storage, Analytics, Messaging, `firebase-admin`, el
acceso directo a Firestore o Cloud Storage y cualquier credencial de cuenta de servicio. El panel
no crea colecciones ni documentos.

Reglas de uso, también permanentes:

- El acceso es **cerrado**: no hay registro público, ni enlaces de «Crear cuenta», ni proveedores
  federados, ni autenticación anónima, ni cambio o restablecimiento de contraseña.
- La persistencia se fija a `inMemoryPersistence` **antes** de autenticar. Ni la sesión de
  Firebase, ni el correo, ni la contraseña, ni el UID, ni ningún token se escriben en
  `localStorage`, `sessionStorage`, cookies accesibles desde JavaScript, logs o URLs.
- El `languageCode` del SDK se fija **explícitamente a `es`** antes de autenticar y antes de
  enviar cualquier correo. Prohibido `useDeviceLanguage()`: el idioma del navegador es una fuente
  variable.
- El cierre de la sesión cliente se **intenta siempre**, y un `signOut` fallido **no** se trata
  como inocuo: `inMemoryPersistence` sobrevive mientras viva el documento. Sin cierre confirmado, la
  navegación posterior debe ser **`location.replace`**. Prohibidos como fallback `router.push` (no
  destruye el documento) y `location.assign` (lo deja restaurable desde la BFCache al pulsar Atrás).
  Si hace falta comunicar algo tras esa recarga, solo se admite un código fijo de una lista cerrada
  en la URL; nunca el correo, el UID, un token ni la contraseña.
- La exclusión de operaciones **no** se apoya en el estado de React. Un candado síncrono (`useRef`)
  se toma antes del primer `await`; `busy` queda solo para la representación visual. Cuando una
  operación ya produjo un efecto externo que no debe repetirse, el candado se sella y ningún fallo
  posterior lo reabre.
- Los errores de credenciales producen **un único mensaje genérico en español**. Nunca se muestran
  mensajes que permitan enumerar cuentas ni códigos de Firebase.
- El correo de verificación se envía **solo** cuando la persona lo pide de forma explícita, nunca
  de forma automática.

## 3. Contrato con el backend

- **OpenAPI es el único contrato** entre el panel y el backend. El contrato publica hoy tres roles
  (`super_admin`, `master_admin`, `moderator`) y dos superficies administrativas: el catálogo bajo
  `/v1/admin/products` —producto, imágenes, inventario, variantes y transiciones de estado— y los
  pedidos bajo `/v1/admin/orders`. Aquí no se fija cuántas operaciones tiene cada una: ese número
  cambia con el backend, y la copia comiteada del contrato es la que manda. El estado vigente se
  describe en `docs/architecture/current-status.md`.
- No se inventan endpoints, formas de respuesta ni campos que no estén en la especificación.
- Los tipos de las respuestas se derivan del contrato, no se escriben a mano por conveniencia.
- Si algo falta en el contrato, se corrige en el backend; no se compensa en el panel.
- La copia local del contrato se obtiene y actualiza según la sección 1.1.

## 4. Arquitectura técnica

- Next.js App Router.
- TypeScript en modo estricto. Prohibido `any` implícito o explícito y `@ts-ignore` sin una
  justificación escrita en el propio código.
- **Server Components por defecto.** `'use client'` solo cuando exista interacción real del usuario
  (estado, eventos, APIs del navegador).
- CSS Modules para los estilos de componentes. Los tokens compartidos viven en `globals.css`.
- Sin frameworks de CSS utilitario ni librerías de estado global.

### 4.1 El backend está protegido por IAM; el servidor Next.js es la frontera

El backend NestJS está desplegado como un **servicio de Cloud Run protegido por IAM**. Su endpoint
tiene una URL canónica direccionable por internet, pero no permite la invocación anónima: esas
solicitudes se rechazan con `403`. La URL no es un secreto, y la seguridad no depende de ocultarla:
la protección efectiva es IAM y la autorización administrativa que se aplicará en el backend.

Aun así, esa URL no se entrega al navegador del panel: no viaja en ninguna variable `NEXT_PUBLIC_*`,
ni en la configuración de cliente, ni en el bundle. El navegador no llama directamente al backend;
dentro del flujo administrativo, las llamadas pasan por el servidor Next.js (frontera BFF). En una
fase posterior el BFF tendrá una variable **exclusivamente server-side** con la URL del backend e
invocará Cloud Run usando su identidad de ejecución.

El backend también es consumido por el frontend público mediante su propia identidad: el BFF
administrativo es la única vía de este panel hacia el backend, no el único consumidor del backend.

El flujo previsto es:

1. El navegador se autentica mediante Firebase Auth.
2. El navegador se comunica con el servidor Next.js del panel.
3. El servidor Next.js actúa como frontera BFF.
4. El servidor Next.js invoca el backend en Cloud Run con su identidad de ejecución.
5. El backend verifica la identidad administrativa y aplica autorización y reglas de negocio.

El backend definió e implementó su lado del contrato de sesión administrativa:

- Endpoints `POST` y `GET /v1/admin/auth/session`.
- La sesión interna viaja en el encabezado `x-modulartess-admin-session`.
- `Authorization` queda **reservado para el IAM de Cloud Run** y no se usa para la sesión de la
  persona.
- El backend exige el claim firmado `modulartess_admin_role=super_admin`.
- La sesión dura `28800` segundos y se verifica **comprobando la revocación**.
- El contrato **no** publica ningún `DELETE` de esa ruta.

El lado del panel también está implementado: ver
`docs/decisions/0003-admin-session-bff.md`. Reglas permanentes que salen de ahí:

- La sesión vive en una única cookie llamada `__Host-modulartess-admin-session`, con `HttpOnly`,
  `Secure`, `SameSite=Strict`, `Path=/` y **sin `Domain`**.
- Su expiración nunca supera el `expiresAt` del backend ni los `28800` segundos del contrato, y
  **no hay renovación silenciosa**.
- `POST` y `DELETE` del BFF validan `Origin` de forma **exacta** contra una variable server-only.
- Cada lectura protegida verifica la sesión con `GET` contra el backend. Un `401` o `403` borra la
  cookie local.
- `DELETE` cierra la sesión **local** borrando la cookie. No se inventa ningún `DELETE` en el
  backend.
- El navegador nunca recibe el material de sesión: ni en JSON, ni en encabezados legibles, ni en
  logs, ni en la URL.

El backend desplegado en staging corre con **`ADMIN_AUTH_MODE=firebase`** y su superficie
`/v1/admin/*` está **activa**. Sigue siendo privado por IAM. La cuenta `super_admin` existe, con el
correo verificado y el bootstrap `completed`.

El panel está desplegado en Cloud Run staging como `modulartess-admin-staging`, con su identidad de
ejecución y el `roles/run.invoker` sobre el backend. El procedimiento vive en `deploy/README.md` y
el estado vigente del entorno, en `docs/architecture/current-status.md`: este archivo fija reglas,
no lleva la cuenta del despliegue.

## 5. Dependencias

- Gestor de paquetes: **pnpm** (versión fijada en `packageManager`).
- Node.js `>=22.0.0`.
- Se añade una dependencia solo cuando es **necesaria ahora**, no por anticipación.
- El SDK modular `firebase` está instalado y se usa **solo** para Authentication (`firebase/app` y
  `firebase/auth`).
- `openapi-fetch` está instalado y **permitido solo en módulos `server-only` del BFF**. Queda
  **prohibido en Client Components**: el navegador no llama nunca al backend. Esta regla sustituye
  la prohibición temporal anterior (ver `docs/decisions/0003-admin-session-bff.md`).
- `google-auth-library` está instalado y se usa **solo** para obtener el identity token IAM de
  Cloud Run, desde un módulo `server-only`.
- `server-only` está instalado y es la barrera de la frontera: los módulos del BFF empiezan con
  `import 'server-only'`, de modo que una importación desde el cliente rompe el build.
- Prohibido añadir, en esta fase: Tailwind, Redux o cualquier cliente de base de datos.
- Prohibido añadir, de forma permanente: `firebase-admin` y cualquier cliente directo de Firestore
  o Cloud Storage.
- Las versiones de Next.js, React y TypeScript se mantienen alineadas con el frontend público.

## 6. Datos

- Prohibido crear datos ficticios de productos, precios, inventario, pedidos o clientes, incluso
  como marcador de posición visual. El catálogo del panel se pinta **solo** con lo que devuelve el
  backend.
- El panel solo pinta lo que OpenAPI publica. El contrato ya publica la clasificación —`category` y
  `productType`, como `slug` + `name`— y las variantes, y ambas están implementadas. Lo que sigue
  sin publicar —colecciones, SEO, envíos, descuentos, buscador, filtros y contadores agregados— no
  se implementa mientras no exista en el contrato, ni siquiera como adorno. Tampoco hay un catálogo
  de categorías: sin endpoint que las liste, no se ofrece un selector con opciones inventadas.
- Los permisos por rol viven en `src/features/session/permissions.ts`, en una matriz explícita. No
  se deducen por jerarquía numérica: ocultar un botón es usabilidad, y la autoridad sigue siendo el
  backend, que rechaza cualquier petición fabricada. Las acciones sobre variantes reutilizan los
  permisos que ya exige el contrato —`products.create`, `products.update`, `inventory.adjust` y
  `products.archive`—, sin inventar ninguno nuevo.
- La disponibilidad la deriva el backend. El panel muestra el inventario y el estado que recibe y
  no calcula si algo está disponible: eso es una regla comercial.
- Prohibido implementar login simulado o sesiones falsas.
- Si una pantalla aún no tiene datos reales, debe declarar explícitamente que está pendiente.

## 7. Seguridad

- Nunca se comitean archivos `.env` reales, claves JSON, certificados ni credenciales.
- `.env.example` es una **plantilla versionada**: documenta nombres de variables con el valor
  vacío, jamás valores reales, y nunca se rellena copiando desde otro archivo. Los valores locales
  viven en `.env` o `.env.local`, ambos ignorados por Git.
- Ninguna variable `NEXT_PUBLIC_*` puede contener información sensible: se expone al navegador. Las
  cuatro variables de Firebase Auth son identificadores públicos del cliente, no secretos; aun así
  sus valores nunca se comitean.
- La URL del backend no es un secreto, pero tampoco se publica al navegador del panel: no vive en
  ninguna variable `NEXT_PUBLIC_*`, ni en la configuración de cliente, ni en el bundle. La futura
  variable que la contenga será exclusivamente server-side.

## 8. Documentación y calidad

- Toda decisión arquitectónica relevante se registra en `docs/decisions/` con numeración
  incremental.
- `docs/architecture/current-status.md` se actualiza al cerrar cada fase.
- Antes de dar por terminado un cambio deben pasar: `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test` y `pnpm build`.
- Las pruebas son unitarias y puras (Vitest): no usan credenciales reales ni acceden a Firebase por
  red.

## 9. Autoría

- El código y la documentación no incluyen atribuciones a herramientas de IA ni a asistentes, ni en
  los archivos, ni en los comentarios, ni en los mensajes de commit.
