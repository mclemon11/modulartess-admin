# Estado actual

Última actualización: 2026-09-10.

## Fase

Fase 1 — primera vertical de autenticación. Sobre la base técnica de la fase 0, el objetivo era
implementar el inicio de sesión cerrado con Firebase Authentication y la verificación del correo,
sin tocar todavía el backend ni la sesión administrativa.

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

## Previsto, todavía no implementado

Elementos que forman parte del diseño acordado, pero que aún no existen en el repositorio.

| Área                           | Estado    | Detalle                                                        |
| ------------------------------ | --------- | -------------------------------------------------------------- |
| ID token e intercambio         | Pendiente | El panel no obtiene tokens ni los envía a ningún sitio.        |
| Sesión HttpOnly del panel      | Pendiente | Falta definir la cookie `__Host-` concreta y sus atributos.    |
| CSRF y comprobación de Origin  | Pendiente | Sin definir en este repositorio.                               |
| Frontera BFF (servidor Next)   | Pendiente | El servidor invocará el backend en Cloud Run. Sin implementar. |
| Integración OpenAPI            | Pendiente | Copia versionada del contrato y tipos generados desde ella.    |
| ADR local del BFF              | Pendiente | Falta registrarla en `../decisions/`.                          |
| IAM y autorización del backend | Pendiente | Fuera de este repositorio; el panel no la ejerce.              |
| Autorización por roles         | Pendiente | Se resuelve en el backend, no en el panel.                     |
| Claim `super_admin`            | Pendiente | **No se ejecutó ningún bootstrap** (ver más abajo).            |
| Dashboard administrativo       | Pendiente | No existe pantalla operativa tras autenticarse.                |
| CI                             | Pendiente | Hay pruebas unitarias, pero no pipeline.                       |
| Despliegue                     | Pendiente | Sin estrategia definida para el panel privado.                 |

Sobre el claim `super_admin`: **el bootstrap no se ejecutó**. Una cuenta que se autentique
correctamente en el panel y tenga el correo verificado **no tiene garantizado** ese claim. El
aprovisionamiento de roles administrativos se resuelve fuera de este repositorio, y el panel no
puede concederlo ni comprobarlo por sí mismo.

Sobre lo que ocurre tras autenticarse: nada. Con el correo verificado o sin verificar, el flujo
termina en `signOut` y en un estado informativo. No hay sesión administrativa, no se simula
ninguna y no existe dashboard al que entrar.

Sobre el mecanismo de identidad: el flujo acordado es navegador → Firebase Auth para la identidad,
navegador → servidor Next.js, servidor Next.js (BFF) → backend de Cloud Run con su identidad de
ejecución, y verificación de la identidad administrativa en el backend.

### Contrato de sesión: el backend ya lo implementó

Esto **ya está decidido e implementado en el backend**, y es la referencia que el panel deberá
respetar. No se reinventa desde aquí.

| Aspecto         | Estado                                                               |
| --------------- | -------------------------------------------------------------------- |
| Endpoints       | `POST` y `GET /v1/admin/auth/session`                                |
| Sesión interna  | Encabezado `x-modulartess-admin-session`                             |
| `Authorization` | Reservado para el IAM de Cloud Run; no transporta la sesión personal |
| Claim exigido   | `modulartess_admin_role=super_admin`, firmado                        |
| Duración        | `28800` segundos, verificada comprobando la revocación               |
| Disponibilidad  | **Desactivada en staging**                                           |

Lo que sigue pendiente es del lado del panel: la copia versionada del contrato OpenAPI, los tipos
generados desde ella, la **ADR local del BFF**, la cookie `__Host-` concreta con sus atributos, las
defensas de CSRF y `Origin`, y la implementación de la frontera. Mientras esa ADR local no exista,
este repositorio no fija el nombre de la cookie, sus atributos ni el esquema de CSRF.

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
- Credenciales de cuentas de servicio en el repositorio o en el entorno del panel.
- Cualquier variable `NEXT_PUBLIC_*` con la URL del backend, y cualquier otra vía que la entregue
  al navegador (configuración de cliente o bundle). El backend es un servicio de Cloud Run
  protegido por IAM: su URL es direccionable por internet y no es un secreto, pero rechaza la
  invocación anónima. La futura variable con esa URL será exclusivamente server-side, en el BFF.
- Llamadas directas del navegador del panel al backend: pasan siempre por el servidor Next.js.
- Reglas comerciales en el panel.
- Secretos o credenciales en el repositorio.
- Importar código fuente del backend, dependencias `file:`, symlinks, workspaces compartidos o
  dependencias de rutas locales de otro repositorio en build o en runtime.

## Descartado

- **WooCommerce**: descartado como dependencia objetivo. El panel no se construye contra
  WooCommerce ni contra su API REST, y no se considera una fuente de datos de destino. Ver
  `../decisions/0001-admin-application-boundary.md`.

## Estado de los datos

No existen datos de ejemplo de productos, precios, inventario, pedidos ni clientes, ni acciones de
interfaz que no hagan nada. El panel no lee ni escribe en Firestore ni en Cloud Storage.

La autenticación es **real**, no simulada: Firebase Authentication verifica credenciales de verdad.
Lo que no existe es la **sesión administrativa**, que llega en la fase siguiente.

## Decisiones registradas

- `../decisions/0001-admin-application-boundary.md` — límite de la aplicación administrativa.
- `../decisions/0002-firebase-auth-closed-sign-in.md` — inicio de sesión cerrado con Firebase
  Authentication.

## Siguiente fase propuesta

1. Registrar la **ADR local del BFF**: cookie `__Host-` concreta con sus atributos, defensas de
   CSRF y comprobación de `Origin`, alineadas con el contrato que el backend ya implementó.
2. Intercambiar el ID token de Firebase por una sesión HttpOnly del panel, según esa ADR y contra
   `POST /v1/admin/auth/session`.
3. Fijar el procedimiento explícito para obtener y actualizar la copia versionada del contrato
   OpenAPI dentro de este repositorio.
4. Introducir la frontera BFF y el cliente HTTP tipado con su manejo de errores, una vez exista el
   contrato.
5. Construir el layout de la aplicación autenticada.
