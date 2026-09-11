# 0002 — Inicio de sesión cerrado con Firebase Authentication

- Fecha: 2026-09-10
- Estado: Aceptada · **parcialmente superada**, ver la nota de estado

## Nota de estado (2026-09-10)

El contexto histórico de esta ADR se conserva íntegro, pero dos afirmaciones suyas ya no describen
el estado actual:

- **El bootstrap sí se ejecutó.** La primera cuenta administrativa existe, tiene el correo
  verificado y **su claim `super_admin` ya fue asignado**. El bootstrap del backend quedó en
  `completed` y no puede repetirse. La decisión 9 («una cuenta verificada tampoco entra al panel»)
  reflejaba el estado de aquel momento, no una restricción permanente.
- **El intercambio de sesión está implementado.** La sección «Lo que esta decisión NO hace» sigue
  siendo cierta _sobre esta ADR_, pero lo que enumeraba ya existe: lo decide e implementa
  [`0003-admin-session-bff.md`](./0003-admin-session-bff.md). Tras un inicio de sesión verificado,
  el panel obtiene un ID token reciente, lo canjea en su BFF y navega a `/panel`; la pantalla que
  decía «llega en la fase siguiente» se retiró.
- **El cierre de la sesión cliente se intenta siempre, pero no se da por garantizado.** Un
  `signOut` fallido no es inocuo: `inMemoryPersistence` sobrevive mientras viva el documento. La
  garantía real, y su respaldo por navegación completa, están en la decisión 11 de la ADR 0003.

Sigue vigente todo lo demás: acceso cerrado, `inMemoryPersistence`, idioma fijado a español,
mensajes que no permiten enumerar cuentas, verificación del correo solo a petición y candados
síncronos.

- Relacionada con: [`0001-admin-application-boundary.md`](./0001-admin-application-boundary.md)

## Contexto

La decisión 0001 dejó Firebase Authentication como la **única excepción futura** al uso de Firebase
dentro del navegador, y aplazó su instalación. Esta decisión ejecuta esa excepción: implementa la
primera vertical real de autenticación del panel.

El alcance es deliberadamente estrecho. Se implementa el inicio de sesión y la verificación del
correo. **No** se implementan el intercambio de sesión con el backend, la frontera BFF, el
dashboard ni el aprovisionamiento del rol `super_admin`.

## Decisión

### 1. Correo y contraseña, sin registro público

Firebase Authentication con correo y contraseña. El acceso es **cerrado**: las cuentas se crean
fuera del panel y este repositorio no ofrece ninguna vía para crearlas.

Quedan fuera, por decisión y no por fase pendiente: registro público, enlaces de «Crear cuenta»,
Google Sign-In y otros proveedores federados, autenticación anónima, cambio de contraseña y
restablecimiento de contraseña.

Motivo: el panel administra la operación de la tienda. Cualquier vía de alta desde la propia
pantalla de acceso amplía la superficie de ataque sin aportar nada a un equipo interno cuyas
cuentas se aprovisionan a mano.

### 2. El SDK de Firebase se usa solo para Authentication

Se instala el SDK modular `firebase` y se importan **únicamente** `firebase/app` y `firebase/auth`.

Siguen prohibidos de forma permanente: Firestore, Cloud Storage, Analytics, Messaging,
`firebase-admin` y cualquier credencial de cuenta de servicio. El panel no crea colecciones ni
documentos, y no lee ni escribe datos en ningún producto de Firebase.

### 3. Inicialización diferida, con nombre explícito

La app de Firebase se crea con el nombre `modulartess-admin` en lugar de la app por defecto, y solo
en el momento en que alguien usa el formulario. Consecuencias buscadas:

- Un Fast Refresh o dos importes no provocan una inicialización duplicada.
- `next build` no depende de que exista `.env` ni `.env.local`: nada se ejecuta al importar el
  módulo.
- Si falta configuración, la pantalla lo dice en español y enumera los **nombres** de las
  variables ausentes, nunca sus valores.

### 4. Idioma del SDK fijado a español

El `languageCode` de la instancia de `Auth` se fija **explícitamente a `es`** al crearla, y se
reafirma inmediatamente antes de enviar el correo de verificación. Nunca se llama a
`useDeviceLanguage()`.

Motivo: si no se fija, Firebase deduce el idioma del navegador. Esa es una fuente variable —la
misma cuenta recibiría el correo en un idioma distinto según el equipo desde el que se accede—, y
el panel es una herramienta interna en español.

La lógica vive en un módulo puro (`src/lib/firebase/auth-language.ts`) que solo describe la
propiedad que toca, de modo que el comportamiento se comprueba sin abrir ninguna conexión con
Firebase.

### 5. `inMemoryPersistence` antes de autenticar

La persistencia se fija a `inMemoryPersistence` **antes** de cualquier llamada de autenticación. La
sesión de Firebase no se escribe en `localStorage`, `sessionStorage`, IndexedDB ni cookies, y no
sobrevive a un recargado de la pestaña.

Motivo: en esta fase el panel no tiene todavía una sesión administrativa propia. Dejar que el SDK
persista una sesión de Firebase crearía un estado duradero que no protege nada y que habría que
desmontar al introducir la sesión HttpOnly del BFF.

Tampoco se guardan el correo, la contraseña, el UID ni ningún token: viven en el estado de React
mientras dura la interacción y desaparecen con ella. Nada de esto se registra en consola ni viaja
en la URL.

### 6. Exclusión de operaciones con un candado síncrono

El estado de React **no** sirve para excluir operaciones: `busy` solo cambia en el siguiente
render, así que dos disparos en el mismo tick lo leen igual a `false` y pasan los dos. `busy` se
conserva únicamente para la representación visual (texto del botón, `disabled`, `aria-busy`).

La exclusión real la dan dos candados síncronos en `useRef` (`src/features/auth/operation-lock.ts`),
uno por operación. Se toman **antes del primer `await`**, así que el segundo intento se rechaza sin
haber llegado a ningún render. El candado se libera en todas las salidas que admiten reintento.

El envío del correo de verificación añade un estado más: en cuanto Firebase confirma el envío, el
candado se **sella** y la referencia al usuario se descarta. Un fallo posterior —cerrar sesión,
navegar— no reabre el envío ni permite un segundo correo. `release` no tiene efecto sobre un
candado sellado, así que ninguna ruta de error puede deshacerlo por descuido.

Motivo: un doble envío no es solo un defecto de interfaz. Duplicaría un efecto externo (un correo)
y, en el caso del inicio de sesión, un intento adicional contra Firebase que cuenta para el
bloqueo por intentos.

### 7. Mensajes de error que no permiten enumerar cuentas

Todos los fallos de credenciales y de estado de la cuenta producen **exactamente el mismo texto en
español**. Comparten mensaje, entre otros: `auth/user-not-found`, `auth/wrong-password`,
`auth/invalid-credential`, `auth/invalid-email` y `auth/user-disabled`.

Quien prueba credenciales no puede distinguir «esa cuenta no existe» de «esa contraseña no es la
correcta». Los códigos de Firebase nunca se muestran.

Se conservan dos mensajes distintos, ninguno de los cuales revela nada sobre una cuenta concreta:

- `auth/too-many-requests` y `auth/quota-exceeded`, redactados en términos del **dispositivo**
  bloqueado, no de la cuenta.
- `auth/network-request-failed`, que solo habla de la conexión.

Coste aceptado: una persona con la contraseña caducada o la cuenta deshabilitada no sabrá cuál de
las dos cosas ocurre y tendrá que preguntar a quien administra las cuentas. Es el precio de no
ofrecer un oráculo de enumeración en una pantalla pública.

### 8. Verificación del correo, solo a petición

Si `emailVerified` es `false`, el usuario se conserva **solo en memoria** y la pantalla explica que
falta verificar el correo. **No se envía nada automáticamente.**

El correo sale únicamente cuando la persona pulsa «Enviar correo de verificación», y sale en
español (decisión 4). Se usa `sendEmailVerification` **sin `actionCodeSettings`**: el enlace lo
genera Firebase con la URL de acción del proyecto, de modo que este repositorio no construye
ninguna URL que lleve el correo, el UID o un token.

Tras un envío correcto se ejecuta `signOut` y se navega a `/verificar-correo`. Si el envío falla,
el botón vuelve a quedar disponible para un reintento **explícito**: no hay reintentos automáticos
ni bucles.

Motivo para no enviar el correo automáticamente: un envío implícito en cada intento fallido
convierte el formulario en un amplificador de correo contra cualquier dirección conocida.

### 9. Una cuenta verificada tampoco entra al panel

Si `emailVerified` es `true`, el flujo ejecuta `signOut` y muestra un estado informativo: la cuenta
está verificada y el acceso administrativo se habilitará en la fase siguiente.

**No se simula una sesión** y no hay dashboard al que entrar. Es coherente con AGENTS.md §6, que
prohíbe los login simulados: una pantalla que aparente sesión sin protegerla genera confianza
infundada.

### 10. La ruta `/verificar-correo` es estática

No recibe el correo, el UID ni ningún token por query string, y no consulta el estado de la cuenta.
Por eso **no afirma que la verificación se haya completado**: explica qué hacer con el enlace y
enlaza de vuelta a `/iniciar-sesion`.

## Lo que esta decisión NO hace

- No implementa la frontera BFF ni ninguna llamada al backend.
- No obtiene ID tokens ni los intercambia por una sesión.
- No crea la cookie de sesión HttpOnly.
- No define el lado del panel de la frontera BFF. El contrato del backend ya existe (`POST` y `GET
/v1/admin/auth/session`, sesión en `x-modulartess-admin-session`, `Authorization` reservado para
  el IAM de Cloud Run, claim firmado `modulartess_admin_role=super_admin`, `28800` segundos con
  verificación de revocación, superficie activa en staging). Lo que falta aquí —cookie
  `__Host-` concreta, CSRF y `Origin`, copia OpenAPI, tipos e implementación— se registrará en la
  **ADR local del BFF**.
- No consume el contrato OpenAPI.
- No ejecuta ningún bootstrap: **la cuenta creada en Firebase no tiene garantizado el claim
  `super_admin`**, y este repositorio no puede concedérselo.
- No toca IAM ni la autorización del backend.
- No accede a Firestore ni a Cloud Storage, en ninguna forma.

## Consecuencias

- El panel ya autentica personas reales, pero todavía no autoriza a nadie: no hay superficie
  administrativa que proteger.
- La configuración de Firebase viaja al navegador. Son identificadores públicos del cliente, no
  secretos; lo que protege el proyecto es la autorización del backend, no ocultarlos. Aun así, sus
  valores concretos viven en `.env` o `.env.local` y nunca se comitean.
- Al no persistir la sesión, cada recarga vuelve al formulario. Es intencional mientras no exista
  la sesión HttpOnly del BFF.
- La lógica sensible —validación de configuración, traducción de errores, decisión del flujo,
  candado de operaciones e idioma del SDK— vive en módulos puros, comprobados con Vitest sin red y
  sin credenciales.
- El correo de verificación puede enviarse **una sola vez por sesión temporal**. Para pedir otro
  hay que volver a iniciar sesión.
