# Arquitectura — Visión general

## Componentes

### 1. Navegador (operador administrativo)

Un miembro autorizado del equipo de Modulartess accede al panel desde su navegador. Es el único
punto de entrada humano al sistema administrativo. No recibe credenciales de infraestructura ni
claves de servicio.

El navegador habla con dos destinos, y solo con dos:

- **Firebase Auth**, para obtener su identidad (implementado).
- **El servidor Next.js del panel**, para todo lo demás.

El navegador del panel **no** recibe la URL del backend ni la consume directamente: esa URL no
llega por ninguna variable `NEXT_PUBLIC_*`, ni por configuración de cliente, ni en el bundle. No es
una medida de secreto —la URL no lo es—, sino la consecuencia de que todas las llamadas
administrativas pasen por el servidor Next.js. Tampoco accede a Firestore ni a Cloud Storage.

### 2. Panel Next.js (este repositorio)

Aplicación Next.js con App Router. Su servidor es la **frontera BFF** del sistema administrativo.
Responsabilidades:

- Renderizar vistas y formularios administrativos, con Server Components por defecto.
- Servir `/iniciar-sesion`, `/verificar-correo` y `/panel`. Todas son Server Components; los únicos
  componentes cliente son el formulario y el botón de cerrar sesión, porque necesitan interacción.
- Validar la forma de la entrada en el cliente **solo** como ayuda de usabilidad.
- Exponer las tres rutas de la frontera de sesión: `POST`, `GET` y `DELETE`
  `/api/admin/auth/session`. Son el **único** camino del navegador hacia la superficie
  administrativa.
- Ejecutar, **desde el servidor**, llamadas HTTP tipadas contra el backend NestJS con
  `openapi-fetch` y los tipos generados desde la copia comiteada del contrato, usando la identidad
  de ejecución del propio servicio.
- Guardar la sesión administrativa en la cookie `__Host-modulartess-admin-session`, que el
  JavaScript del navegador no puede leer.

La URL del backend vive en `MODULARTESS_BACKEND_URL`, una variable **exclusivamente server-side**.
El módulo del cliente empieza con `import 'server-only'`: si un Client Component lo importara, el
build fallaría.

Fuera de su responsabilidad, de forma permanente:

- Reglas comerciales de cualquier tipo.
- Acceso a bases de datos o almacenamiento.
- Custodia de secretos o credenciales de cuentas de servicio.
- Decidir por sí mismo si alguien está autorizado.

La validación y la autorización autoritativas siempre ocurren en el backend, con independencia de
lo que compruebe el panel.

### 3. Backend NestJS protegido por IAM

Servicio HTTP desplegado en **Cloud Run con protección IAM**. Tiene una URL canónica direccionable
por internet, pero no admite invocación anónima: esas solicitudes se rechazan con `403`. La URL no
es un secreto; la protección efectiva es IAM y la autorización administrativa, no la oscuridad de
la dirección.

Dentro del flujo administrativo, el único componente que lo invoca es el servidor Next.js del
panel, con su identidad de ejecución. Fuera de este panel, el backend también es consumido por el
frontend público mediante su propia identidad: el BFF administrativo no es su único consumidor.

Los dos canales de cada petición administrativa nunca se mezclan:

| Canal                         | Transporta                                  |
| ----------------------------- | ------------------------------------------- |
| `Authorization`               | **Solo** el identity token IAM de Cloud Run |
| `x-modulartess-admin-session` | **Solo** la sesión de la persona            |

En esta superficie no hay ningún service token.

El despliegue de staging corre con **`ADMIN_AUTH_MODE=firebase`** y la superficie administrativa
está **activa**. Lo que todavía no se ha verificado es el recorrido del **panel** en Cloud Run: el
servicio `modulartess-admin-staging` aún no está desplegado. Ver `../../deploy/README.md`.

Es la **autoridad** del sistema:

- Verifica la identidad administrativa de cada petición y aplica la autorización.
- Aplica las reglas de negocio (precios, impuestos, disponibilidad, transiciones de estado).
- Es el único componente que lee y escribe en Firestore y Cloud Storage.
- Publica su superficie mediante OpenAPI.

### 4. Firebase Auth (implementado, solo autenticación de identidad)

Firebase Authentication es el proveedor de identidad del operador y la **única integración de
Firebase permitida** dentro del navegador. El panel importa `firebase/app` y `firebase/auth`, y
nada más.

Queda prohibido de forma permanente:

- el SDK cliente de Firestore;
- el SDK cliente de Cloud Storage;
- Analytics y Messaging;
- `firebase-admin`;
- el acceso directo a Firestore o Cloud Storage;
- cualquier credencial de cuenta de servicio en el panel.

Lo que **sí** está implementado hoy:

- Inicio de sesión cerrado con correo y contraseña. No hay registro público ni recuperación de
  contraseña.
- Inicialización diferida, con una app Firebase de nombre explícito, que no rompe `next build`
  cuando falta configuración.
- `inMemoryPersistence` fijada antes de autenticar: la sesión de Firebase no se persiste en el
  navegador.
- Mensajes de error genéricos que no permiten enumerar cuentas.
- Verificación del correo bajo petición explícita, con `signOut` posterior.

Además, el ID token que Firebase emite tras un inicio de sesión verificado se envía **solo** al
BFF del panel, y el cierre de la sesión cliente de Firebase se **intenta** inmediatamente después,
salga bien o mal el intercambio. Ese ID token no se guarda en ningún sitio.

El cierre no se da por hecho. `inMemoryPersistence` guarda la sesión en memoria del **documento**,
no de la pestaña, así que una navegación del enrutador no la descarta: si `signOut` fallara y el
panel navegase por SPA, Firebase seguiría autenticado en la misma página. Por eso un `signOut` sin
confirmar fuerza una **navegación completa con `location.replace`**, que destruye el documento y
con él ese estado. Es la única defensa que no depende de que el SDK coopere. Se usa `replace` y no
`assign` porque `assign` dejaría la página anterior en el historial, desde donde la BFCache podría
restaurarla con su memoria intacta al pulsar Atrás.

Lo que Firebase **no** hace: no concede autorización. El rol administrativo lo verifica el backend
en cada lectura protegida.

Recorrido completo, implementado de extremo a extremo en este repositorio:

1. El navegador se autentica mediante Firebase Auth y obtiene un ID token reciente.
2. El navegador envía ese ID token **solo** al BFF del panel (`POST /api/admin/auth/session`).
3. El BFF invoca `POST /v1/admin/auth/session` con el identity token IAM en `Authorization`.
4. El backend devuelve la sesión únicamente en `x-modulartess-admin-session`.
5. El BFF la guarda en la cookie `__Host-modulartess-admin-session` y devuelve al navegador solo
   `principal` y `expiresAt`.
6. La sesión cliente de Firebase se cierra.
7. Cada lectura protegida verifica la sesión con `GET /v1/admin/auth/session`, que comprueba la
   revocación. Un `401` o `403` borra la cookie.

Las decisiones del lado del panel están en `../decisions/0003-admin-session-bff.md`.

### 5. Firestore y Cloud Storage

Accesibles **exclusivamente** por el backend, con credenciales que viven solo en el backend. Ni el
navegador ni el panel los alcanzan, en ninguna fase. Las subidas de medios se delegan al backend,
que es quien decide destino, nombre y permisos.

## Contrato

**OpenAPI es el único contrato** entre el panel y el backend.

- El backend publica la especificación; el panel la consume.
- El panel guarda dentro de este repositorio una **copia versionada** de esa especificación, y
  genera los tipos del cliente HTTP a partir de esa copia.
- La copia se actualiza mediante un procedimiento explícito y verificable, cuyo resultado se revisa
  en el diff. No se sincroniza de forma implícita ni en tiempo de build.
- No se importa código fuente del backend, ni se usan dependencias `file:`, symlinks, workspaces
  compartidos ni rutas locales de otro repositorio. Los módulos internos del backend (DTOs,
  entidades, servicios) no son un contrato.
- No se asumen endpoints, campos ni formas de respuesta que no estén especificados.
- Un cambio incompatible se resuelve versionando el contrato en el backend, nunca parcheando el
  panel.

## Flujo de datos

```
┌────────────────────────────┐        ┌──────────────────────────┐
│ Navegador (administrador)  │───────▶│ Firebase Auth            │
│                            │◀───────│ Identidad del operador   │
└─────────────┬──────────────┘        │ (implementado)           │
              │ HTTPS                 └──────────────────────────┘
              ▼
┌────────────────────────────┐
│ Servidor Next.js — BFF     │  Presentación, formularios,
│ (este repositorio)         │  cookie __Host- de sesión
└─────────────┬──────────────┘
              │ Authorization: identity token IAM
              │ x-modulartess-admin-session: sesión de la persona
              │ contrato OpenAPI (copia comiteada)
              ▼
┌────────────────────────────┐
│ Backend NestJS             │  Autoridad de negocio,
│ (Cloud Run con IAM)        │  autorización administrativa
└─────────────┬──────────────┘
              │ credenciales solo del backend
              ▼
┌──────────────────────────────────────┐
│ Firestore        ·   Cloud Storage   │
└──────────────────────────────────────┘
```

Aristas que **no** existen dentro del flujo administrativo, por restricción arquitectónica
deliberada y no por fase pendiente:

- Navegador del panel → backend.
- Navegador → Firestore o Cloud Storage.
- Panel Next.js → Firestore o Cloud Storage.

## Consecuencias

- El panel autentica personas reales y mantiene una sesión administrativa real, verificada por el
  backend en cada lectura protegida.
- El material de sesión no existe para el JavaScript del navegador en ningún momento.
- Cada lectura protegida cuesta una llamada al backend. Es el precio de que la revocación sea
  inmediata.
- El recorrido está comprobado con dobles locales, pero **no verificado en Cloud Run**: el panel
  aún no está desplegado, aunque el backend ya tiene su superficie administrativa activa.
- El panel puede desplegarse y auditarse sin acceso a la infraestructura de datos.
- Una vulnerabilidad en el panel no expone credenciales de base de datos ni de almacenamiento.
- El backend rechaza cualquier invocación anónima: su protección es IAM, no la oscuridad de su URL.
- El navegador del panel no necesita conocer ni alcanzar el backend; el BFF es su única vía.
- Las reglas de negocio tienen una sola implementación, en el backend.
- El coste es un salto de red adicional por operación, aceptado a cambio de esa separación.
