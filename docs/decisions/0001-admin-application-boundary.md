# 0001 — Límite de la aplicación administrativa

- Fecha: 2026-09-06
- Última revisión: 2026-09-08
- Estado: Aceptada

## Contexto

Modulartess necesita un panel administrativo interno para gestionar catálogo, pedidos, inventario y
clientes. Ya existen un frontend público (`modulartess-web`) y un backend NestJS
(`modulartess-backend`) que es propietario de los datos y está desplegado como **servicio de Cloud
Run protegido por IAM**: su endpoint tiene una URL canónica direccionable por internet, pero
rechaza la invocación anónima con `403`.

Había que decidir dónde vive el panel, qué puede tocar y de qué depende, antes de escribir
funcionalidad. Las decisiones tomadas tarde en este punto son caras: condicionan el modelo de
credenciales, la superficie de ataque y el lugar donde acaban las reglas de negocio.

## Decisión

### 1. Repositorio separado, con un único intercambio controlado

El panel vive en `modulartess-admin`, un repositorio independiente. No se convierte ninguno de los
tres repositorios en un monorepo, y no se crean workspaces, symlinks ni referencias por ruta entre
ellos.

Motivos: el panel es privado y el storefront es público; sus ciclos de despliegue, su audiencia y su
perfil de riesgo son distintos. Un repositorio separado impide que código administrativo llegue por
accidente a un bundle público.

Existe **un solo intercambio permitido** con `modulartess-backend`, y es el contrato OpenAPI. Está
permitido obtener una copia versionada de la especificación publicada por el backend, guardarla
dentro de `modulartess-admin`, generar tipos a partir de esa copia y actualizarla mediante un
procedimiento explícito y verificable cuyo resultado se revisa en el diff.

Sigue prohibido: importar código fuente del backend, usar dependencias `file:`, crear symlinks,
leer módulos internos del backend (DTOs, entidades, servicios) como si fueran el contrato, depender
en build o en runtime de rutas locales de otro repositorio, y crear un workspace compartido.

La distinción es la que importa: un **artefacto derivado, comiteado y revisable** es aceptable; un
**acoplamiento vivo entre árboles de código** no lo es.

Coste aceptado: la configuración de herramientas se duplica, las versiones de Next.js, React y
TypeScript deben alinearse a mano con el frontend público, y la copia del contrato puede quedar
desfasada hasta que se actualice a propósito.

### 2. Sin acceso a datos de Firebase; Firebase Auth como única excepción

El panel no accede a Firestore ni a Cloud Storage. No usa el SDK cliente de Firestore, ni el SDK
cliente de Cloud Storage, ni `firebase-admin`, ni credenciales de cuenta de servicio. Estas
prohibiciones son **permanentes**.

La **única excepción**, prevista para una fase posterior, es **Firebase Authentication**: el panel
podrá incorporar el SDK cliente de Firebase exclusivamente para autenticar al operador en el
navegador. Esa excepción no habilita ningún otro producto de Firebase ni ningún acceso a datos.

Motivos: el acceso a datos desde el cliente obligaría a mantener reglas de seguridad de Firestore
como segundo sistema de autorización, y el acceso con `firebase-admin` exigiría custodiar una
credencial de cuenta de servicio en el entorno del panel. Ambas opciones amplían la superficie de
ataque de una aplicación que solo necesita presentar datos. Firebase Auth es distinto: no da acceso
a datos, solo produce una identidad que el backend verifica.

En esta fase Firebase **no se instala**.

Consecuencia: toda lectura y escritura pasa por el backend, incluida la subida de medios.

### 3. El backend es la autoridad y está protegido por IAM; el servidor Next.js es la frontera BFF

El backend NestJS es la única autoridad sobre datos, validación y reglas de negocio. El panel no
contiene reglas comerciales. Cualquier validación en el cliente es ayuda de usabilidad y se repite
de forma autoritativa en el backend.

El backend está desplegado en Cloud Run **protegido por IAM**. Su URL es direccionable por internet
y no es un secreto, pero el servicio no permite la invocación anónima. La protección efectiva es
IAM y la autorización administrativa del backend, no ocultar la dirección.

Aun así, esa URL no se entrega al navegador del panel: no viaja en ninguna variable `NEXT_PUBLIC_*`,
ni en la configuración de cliente, ni en el bundle. El navegador no llama
directamente al backend; dentro del flujo administrativo, todas las llamadas pasan por el servidor
Next.js del panel, que actúa como **frontera BFF** e invoca el backend con su identidad de
ejecución. En una fase posterior el BFF tendrá una variable **exclusivamente server-side** con la
URL del backend.

El backend también es consumido por el frontend público mediante su propia identidad: el BFF
administrativo es la única vía de este panel, no el único consumidor del backend.

**OpenAPI es el único contrato** entre panel y backend. Los tipos del panel se derivan de la
especificación; no se asumen endpoints ni campos fuera de ella.

Coste aceptado: un salto de red adicional por operación, la dependencia de que el contrato se
mantenga al día y la imposibilidad de llamar al backend desde el navegador del panel.

### 4. WooCommerce descartado como dependencia objetivo

El panel no se construye contra WooCommerce ni contra su API REST, y no se considera una fuente de
datos de destino.

Motivos: introducir WooCommerce supondría un segundo modelo de datos y un segundo lugar donde viven
las reglas comerciales, en contradicción directa con la decisión 3. Si existieran datos históricos
en WooCommerce, se tratarían como una migración puntual hacia el backend, nunca como una integración
permanente del panel.

### 5. Autenticación y autorización: flujo acordado

En esta fase no se implementa autenticación ni autorización, y **no se implementa ningún login
simulado**.

El flujo acordado es:

1. El navegador se autentica mediante Firebase Auth.
2. El navegador se comunica con el servidor Next.js del panel.
3. El servidor Next.js actúa como frontera BFF.
4. El servidor Next.js invoca el backend en Cloud Run con su identidad de ejecución.
5. El backend verifica la identidad administrativa y aplica autorización y reglas de negocio.

Cuando se escribió esta decisión, el mecanismo de transporte de la identidad entre el BFF y el
backend estaba sin decidir. **Ya no lo está**: el backend definió e implementó los endpoints `POST`
y `GET /v1/admin/auth/session`, con la sesión interna en el encabezado
`x-modulartess-admin-session`, `Authorization` reservado para el IAM de Cloud Run, el claim firmado
`modulartess_admin_role=super_admin` como requisito, y una duración de `28800` segundos verificada
comprobando la revocación. Esa superficie está **desactivada en staging**.

El fondo de esta ADR no cambia: el panel no fija por sí mismo ese contrato. Lo que resta del lado
del panel —la ADR local del BFF, la cookie `__Host-` concreta, CSRF y `Origin`, la copia OpenAPI y
la implementación— se registrará en su propia ADR. Ver `../architecture/current-status.md` para el
estado vigente.

Motivos para no implementar nada todavía: un login falso genera confianza infundada en una pantalla
que no protege nada, y suele sobrevivir más de lo previsto. Es preferible que el panel declare de
forma explícita que está en configuración.

## Consecuencias

- El panel puede auditarse y desplegarse sin acceso a la infraestructura de datos.
- Un compromiso del panel no expone credenciales de base de datos ni de almacenamiento.
- El backend rechaza la invocación anónima: la protección es IAM y la autorización administrativa,
  no la oscuridad de su URL.
- El navegador del panel nunca alcanza el backend por sí mismo; el BFF es su única vía.
- Las reglas de negocio tienen una sola implementación.
- El panel queda bloqueado por dos entregables externos: el contrato OpenAPI publicado y la ADR del
  mecanismo de identidad. Sin ellos no puede mostrar datos reales. Es una consecuencia asumida, no
  un obstáculo imprevisto.
