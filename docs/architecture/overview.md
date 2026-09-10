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
- Servir `/iniciar-sesion` y `/verificar-correo`. Ambas páginas son Server Components; el único
  componente cliente es el formulario, porque necesita estado e interacción.
- Validar la forma de la entrada en el cliente **solo** como ayuda de usabilidad.
- Ejecutar, **desde el servidor**, llamadas HTTP tipadas contra el backend NestJS, usando la
  identidad de ejecución del propio servicio. En una fase posterior, la URL del backend vivirá en
  una variable **exclusivamente server-side** del BFF.

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

Es la **autoridad** del sistema:

- Verifica la identidad administrativa de cada petición y aplica la autorización.
- Aplica las reglas de negocio (precios, impuestos, disponibilidad, transiciones de estado).
- Es el único componente que lee y escribe en Firestore y Cloud Storage.
- Publica su superficie mediante OpenAPI.

### 4. Firebase Auth (implementado, solo autenticación)

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

Lo que **no** está implementado, y este documento no debe dar por hecho:

- La obtención de ID tokens y su intercambio por una sesión.
- La cookie de sesión HttpOnly del panel.
- Cualquier llamada al backend desde el panel.
- El claim `super_admin`: **no se ejecutó ningún bootstrap**, y una cuenta autenticada no lo tiene
  garantizado. Ese aprovisionamiento se resuelve fuera de este repositorio.

Flujo previsto una vez exista la frontera BFF:

1. El navegador se autentica mediante Firebase Auth.
2. El navegador se comunica con el servidor Next.js del panel.
3. El servidor Next.js actúa como frontera BFF.
4. El servidor Next.js invoca el backend en Cloud Run con su identidad de ejecución.
5. El backend verifica la identidad administrativa y aplica autorización y reglas de negocio.

Hoy, en este repositorio, solo existe el paso 1.

El lado del backend **ya está definido e implementado**: `POST` y `GET
/v1/admin/auth/session`, sesión interna en el encabezado `x-modulartess-admin-session`,
`Authorization` reservado para el IAM de Cloud Run, claim firmado
`modulartess_admin_role=super_admin` exigido, duración de `28800` segundos verificada comprobando
la revocación, y la superficie **desactivada en staging**.

Lo que falta es del lado del panel: la copia versionada del contrato OpenAPI, los tipos generados
desde ella, la **ADR local del BFF**, la cookie `__Host-` concreta con sus atributos, las defensas
de CSRF y `Origin`, y la implementación. Mientras esa ADR local no exista, este documento no fija
el nombre de la cookie, sus atributos ni el esquema de CSRF: hacerlo sería adelantar un diseño que
todavía no se ha decidido aquí.

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
│ (este repositorio)         │  frontera hacia el backend
└─────────────┬──────────────┘
              ╎ HTTPS interno · identidad de ejecución · contrato OpenAPI
              ╎ (pendiente: todavía no existe esta llamada)
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

- El panel autentica personas reales, pero todavía no autoriza a nadie: no hay superficie
  administrativa que proteger ni sesión propia del panel.
- El panel puede desplegarse y auditarse sin acceso a la infraestructura de datos.
- Una vulnerabilidad en el panel no expone credenciales de base de datos ni de almacenamiento.
- El backend rechaza cualquier invocación anónima: su protección es IAM, no la oscuridad de su URL.
- El navegador del panel no necesita conocer ni alcanzar el backend; el BFF es su única vía.
- Las reglas de negocio tienen una sola implementación, en el backend.
- El coste es un salto de red adicional por operación, aceptado a cambio de esa separación.
