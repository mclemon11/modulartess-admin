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
5. Si el correo **sí** está verificado, se cierra la sesión igualmente y se informa de que el
   acceso administrativo llega en la fase siguiente. **No se simula ninguna sesión** y no hay
   dashboard al que entrar.

La exclusión de operaciones no se apoya en el estado de React: hay dos candados síncronos que se
toman antes del primer `await`, de modo que dos submits —o dos envíos de correo— disparados antes
del siguiente render no pasan los dos. Una vez que Firebase confirma el envío del correo, el
candado queda **sellado**: ningún fallo posterior habilita un segundo envío.

Nada de lo anterior se guarda: ni el correo, ni la contraseña, ni el UID, ni ningún token llegan a
`localStorage`, `sessionStorage`, cookies accesibles desde JavaScript, logs o URLs.

El detalle está en
[`docs/decisions/0002-firebase-auth-closed-sign-in.md`](./docs/decisions/0002-firebase-auth-closed-sign-in.md).

## Todavía pendiente en este repositorio

Estos elementos **no** están implementados, y la documentación no debe darlos por hechos:

- Frontera BFF en el servidor Next.js y cualquier llamada al backend.
- Obtención de ID tokens y su intercambio por una sesión.
- Cookie de sesión HttpOnly.
- ADR del mecanismo de transporte de la identidad Firebase entre el BFF y el backend.
- Consumo del contrato OpenAPI.
- Autorización administrativa del backend e IAM.
- **Bootstrap de `super_admin`: no se ejecutó.** Una cuenta creada en Firebase no tiene garantizado
  ese claim, y este repositorio no puede concedérselo.
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

### Lo que el backend ya implementó

El contrato de sesión administrativa **ya está definido e implementado en el backend**:

| Aspecto         | Estado                                                               |
| --------------- | -------------------------------------------------------------------- |
| Endpoints       | `POST` y `GET /v1/admin/auth/session`                                |
| Sesión interna  | Encabezado `x-modulartess-admin-session`                             |
| `Authorization` | Reservado para el IAM de Cloud Run; no transporta la sesión personal |
| Claim exigido   | `modulartess_admin_role=super_admin`, firmado                        |
| Duración        | `28800` segundos, verificada comprobando la revocación               |
| Disponibilidad  | **Desactivada en staging**                                           |

### Lo que sigue pendiente en este repositorio

- Copia versionada del contrato OpenAPI y los tipos generados desde ella.
- **ADR local del BFF** en `docs/decisions/`.
- La cookie `__Host-` concreta: nombre y atributos.
- Defensas de CSRF y comprobación de `Origin`.
- La implementación de la frontera BFF.

Mientras esa ADR local no exista, este repositorio no fija el nombre de la cookie, sus atributos ni
el esquema de CSRF, y no llama al backend.

## Contrato OpenAPI

- El backend publica la especificación OpenAPI; el panel guardará dentro de este repositorio una
  **copia versionada** de esa especificación.
- Los tipos del cliente HTTP se generarán a partir de esa copia local.
- La copia se actualiza mediante un procedimiento explícito y verificable, cuyo resultado se revisa
  en el diff.
- No se importa código fuente del backend, ni se usan dependencias `file:`, symlinks, workspaces
  compartidos ni rutas locales de otro repositorio en build o en runtime. Los módulos internos del
  backend no son un contrato.

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

- ADR del mecanismo de identidad entre el BFF y el backend.
- Intercambio del ID token por una sesión HttpOnly del panel.
- Frontera BFF en el servidor Next.js hacia el backend protegido por IAM.
- Autorización por roles administrativos, verificada en el backend.
- Bootstrap del claim `super_admin`, que se resuelve fuera de este repositorio.
- Copia versionada del contrato OpenAPI y cliente HTTP tipado generado desde ella.
- Layout de aplicación autenticada (navegación, cabecera, estados de carga y error).
- Gestión de catálogo y de inventario.
- Gestión de pedidos.
- Gestión de clientes.
- Subida de medios delegada al backend (el panel nunca escribe en Cloud Storage).
- Pruebas automatizadas y pipeline de integración continua.
- Estrategia de despliegue del panel privado.
