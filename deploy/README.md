# Runbook — despliegue del panel en Cloud Run (staging)

Procedimiento para desplegar `modulartess-admin` en el proyecto `modulartessweb-250f5`, región
`us-east1`.

Este runbook **no** crea infraestructura. Los recursos que faltan se crean a mano con los comandos
de la sección 2: quién concedió qué permiso y cuándo tiene que quedar en el historial de una
persona, no enterrado en un script de despliegue.

## 0. Estado del que se parte

| Elemento                              | Estado                                                  |
| ------------------------------------- | ------------------------------------------------------- |
| Backend `modulartess-backend-staging` | Desplegado, privado por IAM, `ADMIN_AUTH_MODE=firebase` |
| Superficie `/v1/admin/*`              | **Activa**                                              |
| Cuenta `super_admin`                  | Existe, correo verificado, bootstrap `completed`        |
| Invocador actual del backend          | `modulartess-web-stg-run` (único)                       |
| `modulartess-admin-stg-run`           | **No existe todavía**                                   |
| `roles/run.invoker` para el panel     | **No concedido todavía**                                |
| BFF y flujo de sesión                 | Implementados y commiteados; sin probar en Cloud Run    |

## 1. Configuración local de Firebase

Las cuatro variables públicas del cliente viven en el `.env` local, ignorado por Git. Son
identificadores **públicos**: viajan al navegador en el bundle por diseño, y Cloud Build los recibe
como substitutions para construir. Aun así el script **nunca los imprime**: en `--dry-run` muestra
`<REDACTADO>`, y en la ejecución real los pasa a gcloud sin registrarlos, para que una vista previa
pegada en un ticket no los arrastre.

El script los lee **sin ejecutar el archivo**: lo interpreta línea a línea, acepta valores con o sin comillas,
rechaza duplicados, líneas mal formadas y variables inesperadas, e **ignora** las `MODULARTESS_*`
server-only que conviven en el mismo archivo. Nunca imprime un valor.

```bash
# Por defecto lee .env en la raíz del repositorio.
deploy/staging.sh config

# O desde otro archivo ignorado:
deploy/staging.sh preflight --firebase-env /ruta/al/archivo.env

# O desde variables ya exportadas (las cuatro, o ninguna):
export NEXT_PUBLIC_FIREBASE_API_KEY=... # etc.
```

## 2. Recursos que hay que crear a mano, una sola vez

Ninguno lleva claves JSON. La identidad de Cloud Run se asume por el servicio; no se descarga nada.

**2.1 — Identidad de ejecución del panel**

```bash
gcloud iam service-accounts create modulartess-admin-stg-run \
  --display-name='Modulartess admin staging runtime' \
  --project=modulartessweb-250f5
```

**2.2 — Permiso para invocar el backend, y nada más**

El panel solo necesita llamar al backend. No recibe permisos de Firebase Authentication, Firestore,
Cloud Storage ni administración de cuentas: el BFF nunca los usa, y concederlos ampliaría la
superficie de ataque sin habilitar nada.

El binding es **sobre el servicio**, no sobre el proyecto, y **sin condición**: una condición IAM
puede caducar y dejar el panel roto sin que nadie toque nada.

```bash
gcloud run services add-iam-policy-binding modulartess-backend-staging \
  --region=us-east1 \
  --project=modulartessweb-250f5 \
  --member='serviceAccount:modulartess-admin-stg-run@modulartessweb-250f5.iam.gserviceaccount.com' \
  --role='roles/run.invoker' \
  --condition=None
```

**2.3 — Comprobar que quedó bien**

```bash
gcloud run services get-iam-policy modulartess-backend-staging \
  --region=us-east1 --project=modulartessweb-250f5 \
  --flatten='bindings[].members' \
  --filter='bindings.role:roles/run.invoker' \
  --format='table(bindings.role, bindings.members, bindings.condition.expression)'
```

Deben aparecer `modulartess-web-stg-run` y `modulartess-admin-stg-run`, ambos sin condición, y
**ni `allUsers` ni `allAuthenticatedUsers`**.

## 3. Despliegue

Secuencia completa, en orden:

1. Crear la identidad de ejecución (sección 2.1).
2. Concederle `roles/run.invoker` sobre el backend (sección 2.2).
3. Autorizar el dominio determinista en Firebase Authentication (sección 5).
4. `deploy/staging.sh preflight`
5. Commit con el árbol limpio (el `build` real lo exige).
6. `deploy/staging.sh all` — o `build` / `deploy` / `verify` por separado.

```bash
deploy/staging.sh preflight              # Solo lectura. Bloqueante.
deploy/staging.sh all --dry-run          # Vista previa completa, sin mutar nada.
deploy/staging.sh all                    # Pide confirmación antes de construir y desplegar.
```

`deploy` repite por su cuenta las comprobaciones esenciales —configuración, backend `Ready=True`,
backend privado, identidad de ejecución y binding incondicional— antes de pedir confirmación. No
depende de que alguien haya ejecutado `preflight`.

`all` deriva el tag **una sola vez** del commit (`git-<sha12>`) y lo comparte entre `build` y
`deploy`: la imagen que se despliega es exactamente la que se construyó.

Un `build` real está bloqueado con el árbol Git sucio. Una imagen que no se puede reproducir desde
un commit no es auditable.

## 4. Configuración del servicio

| Parámetro         | Valor                         |
| ----------------- | ----------------------------- |
| Servicio          | `modulartess-admin-staging`   |
| Puerto            | `8080`                        |
| CPU / memoria     | `1` / `512Mi`                 |
| Concurrencia      | `40`                          |
| Timeout           | `60s`                         |
| Instancias        | min `0`, max `1`              |
| Entorno           | `gen1`, con startup CPU boost |
| Ingress           | `all`                         |
| Autenticación GCP | `--allow-unauthenticated`     |

### Por qué el servicio acepta tráfico sin autenticar

El navegador tiene que poder **cargar el formulario de acceso**. Si Cloud Run exigiera un identity
token para servir la página, nadie podría llegar a iniciar sesión.

Eso no abre el panel. La autorización funcional sigue cerrada por tres capas independientes:

1. **Firebase Authentication** — sin credenciales válidas no hay ID token.
2. **La sesión administrativa** — el ID token se canjea en el BFF contra el backend, que exige el
   claim firmado `modulartess_admin_role=super_admin`. La sesión vive en una cookie `__Host-`
   `HttpOnly`, ilegible desde JavaScript.
3. **El backend** — verifica la sesión con comprobación de revocación en **cada** lectura
   protegida, y sigue siendo privado por IAM.

Lo que queda expuesto sin sesión es el formulario, `/verificar-correo` y un `404`. `/panel`
redirige a `/iniciar-sesion` en cuanto la cookie falta o el backend la rechaza.

### Variables de runtime

Se inyectan con `--update-env-vars`, nunca con `--set-env-vars`: este último **borra** las
variables que no se mencionen, así que una omisión dejaría el servicio sin configuración.

```
MODULARTESS_BACKEND_URL=https://modulartess-backend-staging-eiccfp227q-ue.a.run.app
MODULARTESS_BACKEND_AUTH_MODE=google-oidc
MODULARTESS_BACKEND_AUDIENCE=https://modulartess-backend-staging-eiccfp227q-ue.a.run.app
MODULARTESS_ADMIN_ORIGIN=https://modulartess-admin-staging-651080070961.us-east1.run.app
```

Las `NEXT_PUBLIC_FIREBASE_*` **no** se pasan como variables de runtime. Next.js las sustituye en el
bundle durante el build; ponerlas aquí no cambiaría nada del cliente y sugeriría que sí.

## 5. Dominio: el de Cloud Run es temporal

### Antes de la primera prueba real

El dominio del panel —el temporal de Cloud Run ahora, el definitivo después— **tiene que estar
autorizado en Firebase Authentication** antes de que nadie intente iniciar sesión. Sin eso el SDK
rechaza la operación en el navegador y el fallo se parece a un problema de credenciales.

## 6. Verificación

```bash
deploy/staging.sh verify
```

Comprueba tres cosas, todas de solo lectura:

1. La página de acceso responde `200`.
2. El backend sigue rechazando la invocación anónima (`401`/`403`).
3. Una sonda con **credencial ficticia** a través del BFF devuelve `401 session_required`, el
   resultado controlado esperado. Eso demuestra que el BFF alcanza el backend, que el backend
   verifica de verdad y que el error que llega al navegador es el estable, no un detalle interno.

**`verify` no sustituye la primera prueba manual con el `super_admin` real.** Solo comprueba que la
frontera responde y rechaza lo que debe rechazar. Que una cuenta administrativa real complete el
flujo y alcance `/panel` hay que probarlo a mano, y antes hay que autorizar el dominio (sección 5).

## 7. Rollback

```bash
gcloud run services update-traffic modulartess-admin-staging \
  --region=us-east1 --project=modulartessweb-250f5 \
  --to-revisions=<REVISION_ANTERIOR>=100
```

Como el tag es inmutable y deriva del commit, la revisión anterior siempre apunta a una imagen
concreta y reproducible.

## 8. Dos filtros distintos: `.dockerignore` y `.gcloudignore`

Hacen falta los dos y no son intercambiables:

- **`.gcloudignore`** filtra lo que `gcloud builds submit` empaqueta y **sube** a Cloud Build. Lo
  excluido aquí nunca sale de la máquina.
- **`.dockerignore`** filtra el contexto que ve el demonio de Docker, una vez el archivo **ya está
  arriba**. Llega tarde para evitar la subida.

Un `.env` excluido solo en `.dockerignore` viajaría igualmente a Cloud Build. Ojo: en cuanto existe
`.gcloudignore`, gcloud deja de aplicar `.gitignore`, así que todo lo que deba quedarse fuera tiene
que estar listado ahí.

## 9. Limitaciones conocidas

- **`--allow-unauthenticated` depende de la política de organización.** Si el proyecto tiene
  `constraints/iam.allowedPolicyMemberDomains` restringiendo `allUsers`, el despliegue no podrá
  abrir el servicio al navegador y habrá que ajustar la política. No es un fallo esperado del
  despliegue; es una condición del entorno que conviene comprobar antes.

## 10. Deuda conocida

- **Cuenta de build dedicada.** El build usa la cuenta por defecto de Cloud Build, con más permisos
  de los necesarios. Ver la nota en `deploy/cloudbuild.yaml`.
- **BuildKit.** El constructor clásico no cachea capas entre builds. Migrar antes de automatizar CI.
- **`max-instances=1`.** Suficiente para staging; hay que revisarlo antes de producción.
