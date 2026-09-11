# 0003 — Sesión administrativa a través de la frontera BFF

- Fecha: 2026-09-10
- Estado: Aceptada
- Relacionadas: [`0001`](./0001-admin-application-boundary.md) · [`0002`](./0002-firebase-auth-closed-sign-in.md)

## Contexto

La ADR 0002 dejó implementado el inicio de sesión con Firebase Authentication y la verificación del
correo, y cerró la sesión cliente sin conceder acceso a nada. El backend, por su parte, ya definió
e implementó su lado del contrato de sesión administrativa, publicado en OpenAPI:

- `POST /v1/admin/auth/session` — canjea un ID token de Firebase por una sesión administrativa.
  Devuelve `principal` y `expiresAt` en el cuerpo, y el material de sesión **solo** en el
  encabezado de respuesta `x-modulartess-admin-session`. Exige un inicio de sesión de menos de
  `300` segundos y el claim administrativo firmado. Limitado a 10 peticiones por minuto.
- `GET /v1/admin/auth/session` — devuelve el principal verificado, comprobando la revocación en
  cada llamada. No devuelve ni rota el material de sesión.
- `AdminPrincipalDto.role` publica hoy **un único valor**: `super_admin`.
- Seguridad declarada: `adminSession` (apiKey en el encabezado `x-modulartess-admin-session`).
- El contrato no publica ningún `DELETE` de esa ruta.

Faltaba decidir el lado del panel: dónde vive la sesión en el navegador, cómo se protege de CSRF y
qué se verifica en cada lectura. Esta ADR lo fija.

## Decisión

### 0. Orígenes: HTTPS salvo loopback, y audiencia idéntica a la URL

`MODULARTESS_BACKEND_URL`, `MODULARTESS_BACKEND_AUDIENCE` y `MODULARTESS_ADMIN_ORIGIN` deben ser
orígenes canónicos: sin ruta, sin consulta, sin fragmento y sin credenciales embebidas.

- `http` se admite **solo** para loopback (`localhost`, `127.0.0.1`, `::1`), que es el único sitio
  donde el tráfico en claro no sale de la máquina. Cualquier host remoto exige `https`: enviar la
  sesión administrativa sin cifrar no es aceptable ni en pruebas.
- En modo `google-oidc`, la URL del backend y la audiencia deben ser **orígenes HTTPS y, tras
  canonizarlos, exactamente iguales**. Una audiencia que no coincida con el servicio invocado
  produce un identity token que Cloud Run rechaza con un error genérico, y ese fallo es de los más
  caros de diagnosticar.

### 1. Nombre fijo de la cookie

La sesión administrativa vive en una sola cookie, con nombre fijo:

```
__Host-modulartess-admin-session
```

El prefijo `__Host-` no es decorativo. El navegador **rechaza** una cookie con ese prefijo si no
lleva `Secure`, si trae `Domain` o si su `Path` no es `/`. Convierte la política en algo que el
navegador hace cumplir, no en algo que el servidor promete y podría olvidar.

### 2. Atributos exactos

`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, **sin `Domain`**.

Son los mismos al crear y al borrar la cookie. Si difirieran, el navegador trataría el borrado como
una cookie distinta y la sesión sobreviviría al cierre.

`HttpOnly` es lo que hace que el material de sesión no exista para JavaScript. El navegador nunca lo
recibe en JSON, ni en encabezados legibles, ni en la URL, ni en logs.

### 3. Expiración: dos topes, RFC 3339 estricto y ninguna renovación

La expiración de la cookie **nunca** supera:

- el `expiresAt` que devolvió el backend, ni
- los `28800` segundos del contrato.

Se aplica el menor de los dos.

`expiresAt` se acepta **solo** como `date-time` de RFC 3339 con zona explícita (`Z` o un
desplazamiento). No se usa `Date.parse` como validador: acepta formatos informales
(`2026-09-10`, `Sep 10 2026`, `2026/09/10 12:00`), normaliza componentes imposibles —`2026-02-30`
se convierte en el 2 de marzo— e interpreta una fecha sin zona como hora **local del servidor**.
Cualquiera de esas tres cosas produciría una expiración distinta de la que el backend fijó.

Un `expiresAt` ausente, mal formado o ya pasado se trata como incumplimiento del contrato: la
petición falla y **no se crea ninguna cookie**. Una cookie cuya validez no se puede acotar es peor
que no tener sesión.

**No hay renovación silenciosa.** Cuando la sesión caduca, hace falta un nuevo inicio de sesión.
Renovar en segundo plano convertiría una sesión de 8 horas en una sesión indefinida, que es
exactamente lo que el contrato del backend evita al no ofrecer refresco.

### 4. Validación de `Origin` en las rutas mutantes

`POST` y `DELETE` validan el encabezado `Origin` comparándolo con
`MODULARTESS_ADMIN_ORIGIN`, una variable **server-only**.

La comparación es **exacta**, sobre la forma canónica del origen: sin comodines, sin coincidencia
por sufijo y sin subdominios implícitos. Una comparación por sufijo aceptaría
`https://panel.modulartess.com.atacante.tld`. Se conserva la equivalencia de los puertos por
defecto: `https://host:443` y `https://host` son el mismo origen.

Antes de comparar, el valor recibido debe ser **exactamente un origen**. Se rechazan de forma
explícita el `pathname` distinto de `/`, la consulta, el fragmento, las credenciales embebidas, los
esquemas que no sean `http`/`https` y el host vacío, además del `Origin` ausente y del literal
`null`.

Esa comprobación no es redundante: `URL#origin` **descarta en silencio** la ruta, la consulta y el
fragmento, así que `https://panel-autorizado/ruta` produce el mismo `origin` que el valor legítimo.
Comparar solo `url.origin` los aceptaría a todos.

`MODULARTESS_ADMIN_ORIGIN` se lee y valida **por separado** del resto de la configuración del
backend. El cierre de sesión no llama al backend, así que no puede quedar bloqueado porque falten
la URL, la audiencia o el modo de autenticación: si lo estuviera, una configuración incompleta
dejaría a la persona sin poder retirar su propia cookie.

### 5. Por qué `SameSite=Strict` más `Origin` exacto son la defensa CSRF

Las dos piezas cubren huecos distintas, y por eso hacen falta las dos:

- **`SameSite=Strict`** impide que el navegador adjunte la cookie a cualquier petición originada en
  otro sitio. Un formulario o un `fetch` desde `atacante.tld` sencillamente no lleva la cookie, así
  que la petición llega sin sesión y el BFF la rechaza con `401`. Esto ataja el CSRF clásico en el
  cliente, antes de que la petición salga.
- **La validación exacta de `Origin`** cubre lo que `SameSite` no garantiza: navegadores antiguos o
  configuraciones que no lo respeten, y cualquier petición que llegue a la ruta desde un contexto
  distinto del panel. Es una comprobación en el servidor, que no depende de que el cliente se porte
  bien.

`SameSite=Strict` es una defensa _del navegador_; `Origin` exacto es una defensa _del servidor_.
Confiar solo en la primera deja la ruta a merced del cliente; confiar solo en la segunda deja pasar
peticiones que el navegador podría haber frenado antes. No se añade un token CSRF sincronizado
porque estas rutas no tienen estado propio que anclarlo y las dos defensas anteriores ya cierran el
vector; si en el futuro apareciera una ruta mutante navegable, se revisará.

### 6. El navegador nunca llama al backend

El navegador solo habla con dos destinos: Firebase Auth, para obtener su identidad, y el servidor
Next.js del panel. No conoce la URL del backend, no la recibe por ninguna variable
`NEXT_PUBLIC_*`, no tiene identidad IAM y no puede leer la cookie de sesión.

El módulo del cliente del backend empieza con `import 'server-only'`. Si un Client Component lo
importara —directa o indirectamente— el build falla. La barrera es mecánica, no documental.

### 7. Dos canales separados hacia el backend

| Canal                         | Transporta                                  |
| ----------------------------- | ------------------------------------------- |
| `Authorization`               | **Solo** el identity token IAM de Cloud Run |
| `x-modulartess-admin-session` | **Solo** la sesión de la persona            |

`Authorization` queda reservado a IAM y no se usa nunca para la sesión personal. La separación
permite al backend distinguir «qué servicio invoca» de «en nombre de quién», y es la que declara el
contrato: `adminSession` es un `apiKey` en su propio encabezado, no un `bearer`.

En esta superficie **no hay ningún service token**. El contrato declara un `x-service-token`, pero
esta frontera no lo usa.

### 8. `GET` verifica contra el backend en cada lectura protegida

Cada lectura protegida llama a `GET /v1/admin/auth/session`. No se cachea el principal, no se
confía en la mera presencia de la cookie y no se deduce el rol en el panel.

Motivo: el backend comprueba la **revocación** en cada llamada. Cachear el resultado en el panel
convertiría una revocación inmediata en una revocación diferida, y el panel no es autoridad para
decidir cuánto puede durar ese desfase.

### 9. Un `401` o `403` limpia la cookie, pero nunca desde un `GET`

Si el backend responde `401` (sesión ausente, inválida, caducada o revocada) o `403` (sesión válida
sin el rol administrativo), la cookie local debe desaparecer: conservarla solo produce reintentos
inútiles y un estado engañoso en el navegador.

Pero el borrado es una **mutación**, y una mutación no sale de un `GET` ni de un Server Component.
La ruta `GET` es de **solo lectura**: no emite `Set-Cookie` en ninguna rama, tampoco ante `401` o
`403`. `/panel` tampoco redirige en ese caso —redirigir dejaría la cookie muerta en el navegador—:
renderiza una **frontera cliente** que llama al `DELETE` del BFF y navega al login **solo** tras el
`204` confirmado.

Esa frontera intenta la limpieza **una sola vez** de forma automática. Si falla, muestra un estado
controlado con un botón de reintento explícito; no hay reintento automático ni bucle de
redirecciones. Los demás fallos —`404` con la superficie desactivada, `429`, `503`, red— no limpian
nada: no dicen nada sobre la validez de la cookie, y expulsar a la persona por una caída temporal
del backend sería un error.

### 10. `DELETE` cierra la sesión local, y solo la local

`DELETE /api/admin/auth/session` valida `Origin` —y **solo** `Origin`—, borra la cookie con el
mismo nombre y los mismos atributos, y responde `204`.

El éxito se decide por el estado **exacto**, no por `response.ok`: `201` para el canje y `204` para
el cierre. Ese rango incluye `200`, `202` y `205`, que en estas rutas significarían que algo se
comportó de forma distinta a la esperada; tratarlos como éxito llevaría al panel a navegar sin
cookie, o a dar por cerrada una sesión que sigue viva. El cliente del navegador devuelve un
resultado cerrado que distingue el fallo de red del estado inesperado, y **nunca ignora el error**.

**No llama a ningún endpoint del backend.** El contrato no publica un `DELETE` de esa ruta, y
inventarlo aquí sería exactamente lo que AGENTS.md §3 prohíbe. La consecuencia se asume y se
declara: cerrar sesión en el panel retira el material del navegador, pero no revoca la sesión en el
proveedor. Esa revocación, cuando exista, será una operación del backend con su propio contrato.

### 11. El cierre de la sesión cliente se intenta siempre; si falla, se destruye el documento

El panel **intenta siempre** cerrar la sesión cliente de Firebase después del canje, salga bien o
mal. Lo que no puede hacer es dar ese cierre por hecho.

`inMemoryPersistence` guarda la sesión en memoria del **documento**, no de la pestaña ni del
origen. Una navegación del enrutador de Next.js conserva el documento, así que un `signOut` fallido
seguido de un `router.push` deja a Firebase autenticado en la misma página, después de que la
persona crea que salió. Tratar ese fallo como inocuo era un error, y capturarlo en silencio lo
ocultaba.

La garantía es esta:

| `signOut`         | Navegación                                                     |
| ----------------- | -------------------------------------------------------------- |
| Confirmado        | SPA (`router.push`), que conserva el documento                 |
| **Sin confirmar** | **`location.replace`**, que descarta el documento y su memoria |

El fallback es `location.replace`, **nunca** `location.assign`. `assign` deja la página anterior en
el historial, y al pulsar Atrás el navegador puede restaurarla desde la BFCache **con su memoria
intacta**, incluida la sesión de Firebase que no se pudo cerrar: la recarga habría sido inútil.
`replace` sustituye la entrada, así que no queda a dónde volver. `router.push` tampoco sirve como
fallback: no destruye el documento en absoluto.

Se aplica en los tres puntos donde el panel navega tras tocar la sesión: al entrar en `/panel` tras
un canje correcto, al ir a `/verificar-correo` tras enviar el correo, y al volver al formulario
cuando el canje fue rechazado y además falló `signOut`. En ese último caso la recarga es lo único
que retira la sesión, así que no es opcional.

Una navegación completa pierde el estado de la página, incluido cualquier mensaje en pantalla. Para
explicar lo ocurrido se admite **un único código fijo** en la URL, tomado de una lista cerrada del
código: `estado=sesion-cliente-reiniciada`. Nunca viajan ahí el correo, el UID, un token ni la
contraseña, y un valor fuera de la lista se descarta al leerlo. No se añade `localStorage`,
`sessionStorage` ni ninguna cookie adicional.

La decisión vive en un módulo puro (`post-auth-navigation.ts`) que devuelve un plan en lugar de
navegar, de modo que la garantía se comprueba sin renderizar ni tocar `window.location`.

### 12. Nada sensible se registra

En ninguna rama —éxito, error de validación, fallo del backend, fallo de red— se registra el ID
token, el material de sesión, la cookie, el UID, el correo, la audiencia IAM, el cuerpo de la
petición ni la respuesta cruda del backend.

Los errores internos se traducen a un conjunto **cerrado** de códigos estables antes de salir. No se
propaga nunca `error.message`, ni el cuerpo del backend, ni un detalle de Firebase o de Google:
esos textos pueden llevar datos personales y su forma cambia sin aviso.

### 13. `/panel` es una prueba de la frontera, no un dashboard

`/panel` es un Server Component que lee la cookie en el servidor, verifica la sesión contra el
backend y muestra únicamente una confirmación sobria y el rol.

No muestra el UID ni el correo. No contiene datos comerciales, ni reales ni ficticios. Su función es
demostrar que la frontera funciona de extremo a extremo; el dashboard es una fase posterior.

## Consecuencias

- El material de sesión no existe para el JavaScript del navegador en ningún momento.
- Un cierre de sesión fallido deja a la persona en `/panel` con un aviso accesible y un reintento
  disponible, en lugar de llevarla al login con la sesión todavía abierta.
- Un `signOut` de Firebase que falle cuesta una recarga completa de la página. Es un coste real y
  visible, y se prefiere a dejar el SDK autenticado en un documento vivo.
- Una vulnerabilidad de XSS en el panel no permite exfiltrar la sesión administrativa, aunque sí
  actuar en nombre de la persona mientras la pestaña esté abierta.
- Cada lectura protegida cuesta una llamada al backend. Es el precio de que la revocación sea
  inmediata, y se acepta.
- Cerrar sesión no revoca la sesión en el proveedor (decisión 10).
- La sesión dura como máximo 8 horas y no se prolonga sola.
- `openapi-fetch` queda permitido **solo** en módulos `server-only` del BFF, y prohibido en Client
  Components. AGENTS.md §5 se actualiza en consecuencia.
- La vertical queda implementada y comprobada con dobles locales. **No** se puede afirmar todavía
  que el recorrido en Cloud Run funciona: el backend ya tiene su superficie administrativa activa
  (`ADMIN_AUTH_MODE=firebase`), pero **este panel aún no está desplegado**. Confirmarlo exige
  desplegarlo y probarlo con el `super_admin` real; el procedimiento está en `../../deploy/README.md`.
