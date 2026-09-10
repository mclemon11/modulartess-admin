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
- La exclusión de operaciones **no** se apoya en el estado de React. Un candado síncrono (`useRef`)
  se toma antes del primer `await`; `busy` queda solo para la representación visual. Cuando una
  operación ya produjo un efecto externo que no debe repetirse, el candado se sella y ningún fallo
  posterior lo reabre.
- Los errores de credenciales producen **un único mensaje genérico en español**. Nunca se muestran
  mensajes que permitan enumerar cuentas ni códigos de Firebase.
- El correo de verificación se envía **solo** cuando la persona lo pide de forma explícita, nunca
  de forma automática.

## 3. Contrato con el backend

- **OpenAPI es el único contrato** entre el panel y el backend.
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

El backend **ya definió e implementó** su lado del contrato de sesión administrativa:

- Endpoints `POST` y `GET /v1/admin/auth/session`.
- La sesión interna viaja en el encabezado `x-modulartess-admin-session`.
- `Authorization` queda **reservado para el IAM de Cloud Run** y no se usa para la sesión de la
  persona.
- El backend exige el claim firmado `modulartess_admin_role=super_admin`.
- La sesión dura `28800` segundos y se verifica **comprobando la revocación**.
- Esa superficie permanece **desactivada en staging**.

Ese contrato es la referencia, y no se contradice ni se reinventa desde aquí. En este repositorio
siguen pendientes: la copia versionada del contrato OpenAPI, los tipos generados desde ella, la
**ADR local del BFF**, la definición de la cookie `__Host-` concreta, las defensas de CSRF y
comprobación de `Origin`, y la implementación de la frontera. Hasta que esa ADR local exista no se
fijan aquí el nombre de la cookie, sus atributos ni el esquema de CSRF.

## 5. Dependencias

- Gestor de paquetes: **pnpm** (versión fijada en `packageManager`).
- Node.js `>=22.0.0`.
- Se añade una dependencia solo cuando es **necesaria ahora**, no por anticipación.
- El SDK modular `firebase` está instalado y se usa **solo** para Authentication (`firebase/app` y
  `firebase/auth`).
- Prohibido añadir, en esta fase: Tailwind, Redux, `openapi-fetch` o cualquier cliente de base de
  datos.
- Prohibido añadir, de forma permanente: `firebase-admin` y cualquier cliente directo de Firestore
  o Cloud Storage.
- Las versiones de Next.js, React y TypeScript se mantienen alineadas con el frontend público.

## 6. Datos

- Prohibido crear datos ficticios de productos, precios, inventario, pedidos o clientes, incluso
  como marcador de posición visual.
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
