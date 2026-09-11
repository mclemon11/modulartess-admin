#!/usr/bin/env bash
#
# Despliegue del panel administrativo de Modulartess en Cloud Run (staging).
#
# Fases explícitas:
#   config     Muestra la configuración resuelta y sale. No toca la nube.
#   preflight  Comprobaciones de SOLO LECTURA. Bloqueante: si algo falta, no se sigue.
#   build      Construye y publica la imagen con un tag inmutable.
#   deploy     Actualiza el servicio Cloud Run.
#   verify     Sondas de solo lectura contra el servicio ya desplegado.
#   all        preflight + build + deploy + verify, compartiendo un único tag.
#
# Qué NO hace este script, nunca:
#   - habilitar APIs;
#   - crear cuentas de servicio, repositorios de Artifact Registry o bindings de IAM;
#   - usar claves JSON de cuenta de servicio;
#   - escribir secretos en disco;
#   - imprimir los valores de la configuración de Firebase.
#
# Los recursos que faltan se señalan con el comando exacto para crearlos a mano. Crear
# infraestructura desde un script de despliegue esconde quién concedió qué permiso y cuándo.
#
# Compatible con bash 3.2 (el de macOS): sin arrays asociativos ni `mapfile`.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/staging.vars"

DRY_RUN=false
ASSUME_YES=false
COMMAND=""
IMAGE_TAG=""
FIREBASE_ENV_FILE=""

# Las cuatro claves públicas que el build necesita, y solo esas.
FIREBASE_KEYS="NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID NEXT_PUBLIC_FIREBASE_APP_ID"

# Claves server-only del panel. Aparecen en el mismo archivo local, se ignoran al leerlo y jamás
# se pasan al build: Next.js solo sustituye `NEXT_PUBLIC_*`, así que en el build solo serían una
# capa de imagen con datos de más.
RUNTIME_ONLY_KEYS="MODULARTESS_BACKEND_URL MODULARTESS_BACKEND_AUTH_MODE MODULARTESS_BACKEND_AUDIENCE MODULARTESS_ADMIN_ORIGIN"

# ---------------------------------------------------------------- utilidades

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*" >&2; }
ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# Ejecuta una mutación, o solo la imprime en vista previa. Es la única barrera del modo --dry-run:
# toda llamada que cambie algo pasa por aquí.
run() {
  if [ "${DRY_RUN}" = true ]; then
    printf '\033[2m[dry-run]\033[0m' >&2
    printf ' %q' "$@" >&2
    printf '\n' >&2
    return 0
  fi
  "$@"
}

confirm() {
  if [ "${ASSUME_YES}" = true ] || [ "${DRY_RUN}" = true ]; then
    return 0
  fi
  local reply
  printf '%s [y/N] ' "$1" >&2
  read -r reply
  case "${reply}" in
    y|Y) return 0 ;;
    *) die "Cancelado por el operador." ;;
  esac
}

contains_word() {
  case " $2 " in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

usage() {
  cat <<'USAGE'
Uso: deploy/staging.sh <comando> [opciones]

Comandos
  config      Muestra la configuración resuelta y sale.
  preflight   Comprobaciones de solo lectura. Bloqueante.
  build       Construye y publica la imagen con tag inmutable.
  deploy      Despliega o actualiza el servicio Cloud Run.
  verify      Sondas de solo lectura contra el servicio desplegado.
  all         preflight + build + deploy + verify con un único tag compartido.

Opciones
  --tag TAG            Tag de imagen. Por defecto se deriva del commit una sola vez.
  --firebase-env FILE  Archivo local ignorado con las cuatro NEXT_PUBLIC_FIREBASE_*.
                       Por defecto `.env` en la raíz. Nunca se hace `source` de él.
  --dry-run            Vista previa: ejecuta las lecturas e imprime las mutaciones sin lanzarlas.
  --yes                No pide confirmación interactiva.
  -h, --help           Esta ayuda.

Este script no habilita APIs, no crea cuentas ni repositorios ni bindings, no usa claves JSON y
no imprime los valores de Firebase.
USAGE
}

# ------------------------------------------------------- carga de parámetros

[ -f "${CONFIG_FILE}" ] || die "No se encuentra ${CONFIG_FILE}."
# `staging.vars` es un archivo versionado sin secretos y de formato conocido: aquí `source` es
# aceptable. Para la configuración de Firebase NO se usa (ver `load_firebase_config`).
# shellcheck disable=SC1090
. "${CONFIG_FILE}"

[ $# -gt 0 ] || { usage; exit 64; }
COMMAND="$1"; shift

while [ $# -gt 0 ]; do
  case "$1" in
    --tag)           IMAGE_TAG="${2:-}"; shift 2 ;;
    --firebase-env)  FIREBASE_ENV_FILE="${2:-}"; shift 2 ;;
    --dry-run)       DRY_RUN=true; shift ;;
    --yes)           ASSUME_YES=true; shift ;;
    -h|--help)       usage; exit 0 ;;
    *)               die "Opción desconocida: $1" ;;
  esac
done

IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}/${IMAGE_NAME}"

# `gcloud` siempre con --project explícito: este script nunca depende de la configuración global
# ni la modifica.
gc() { gcloud "$@" --project="${PROJECT_ID}"; }

# ------------------------------------------------------------ tag inmutable

# Se deriva UNA sola vez y se reutiliza durante `all`: build y deploy tienen que referirse
# exactamente a la misma imagen. Derivarlo dos veces permitiría desplegar algo distinto de lo
# construido si entre medias cambiara el árbol.
resolve_tag() {
  if [ -n "${IMAGE_TAG}" ]; then
    return 0
  fi
  local sha
  sha="$(git -C "${REPO_ROOT}" rev-parse --short=12 HEAD 2>/dev/null || true)"
  [ -n "${sha}" ] || die "No se pudo derivar el tag: no hay commit HEAD. Usa --tag."
  IMAGE_TAG="git-${sha}"
}

git_tree_is_clean() {
  local status
  status="$(git -C "${REPO_ROOT}" status --porcelain 2>/dev/null || printf 'ERROR')"
  [ -z "${status}" ]
}

# ------------------------------------------- configuración de Firebase (build)

# Lee las cuatro claves públicas sin ejecutar el archivo.
#
# `source` está descartado a propósito: ejecutaría cualquier cosa que hubiera en el archivo, y un
# `.env` es un archivo de datos, no un script. Aquí se interpreta línea a línea, se rechaza lo que
# no encaje y **nunca se imprime un valor**.
load_firebase_config() {
  local from_env=true
  local key

  for key in ${FIREBASE_KEYS}; do
    eval "local current=\${${key}:-}"
    if [ -z "${current}" ]; then
      from_env=false
    fi
  done

  if [ "${from_env}" = true ] && [ -z "${FIREBASE_ENV_FILE}" ]; then
    for key in ${FIREBASE_KEYS}; do
      eval "printf -v FB_${key} '%s' \"\${${key}}\""
    done
    ok "Configuración de Firebase tomada de variables exportadas (4 claves)."
    return 0
  fi

  local file="${FIREBASE_ENV_FILE:-${REPO_ROOT}/.env}"
  [ -f "${file}" ] || die "No se encuentra el archivo de configuración de Firebase: ${file}
  Indica otro con --firebase-env, o exporta las cuatro NEXT_PUBLIC_FIREBASE_*."

  local seen=""
  local ignored=0
  local lineno=0
  local line name value

  while IFS= read -r line || [ -n "${line}" ]; do
    lineno=$((lineno + 1))

    # Blancos y comentarios.
    case "${line}" in
      ''|'#'*) continue ;;
    esac
    if printf '%s' "${line}" | grep -Eq '^[[:space:]]*$'; then
      continue
    fi
    if printf '%s' "${line}" | grep -Eq '^[[:space:]]*#'; then
      continue
    fi

    # `export KEY=...` también es válido en estos archivos.
    line="$(printf '%s' "${line}" | sed -E 's/^[[:space:]]*export[[:space:]]+//; s/^[[:space:]]+//')"

    if ! printf '%s' "${line}" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*='; then
      # Se cita el número de línea, nunca su contenido: podría llevar un valor.
      die "Línea ${lineno} de ${file} mal formada: no tiene la forma CLAVE=valor."
    fi

    name="${line%%=*}"
    value="${line#*=}"

    # Comillas envolventes emparejadas, opcionales.
    case "${value}" in
      \"*\") value="${value#\"}"; value="${value%\"}" ;;
      \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac

    if contains_word "${name}" "${RUNTIME_ONLY_KEYS}"; then
      # Variables server-only del propio panel: se ignoran para el build a propósito.
      ignored=$((ignored + 1))
      continue
    fi

    if ! contains_word "${name}" "${FIREBASE_KEYS}"; then
      die "Variable inesperada en ${file} (línea ${lineno}): ${name}.
  Solo se admiten las cuatro NEXT_PUBLIC_FIREBASE_* y las MODULARTESS_* server-only."
    fi

    if contains_word "${name}" "${seen}"; then
      die "Variable duplicada en ${file} (línea ${lineno}): ${name}."
    fi

    [ -n "${value}" ] || die "La variable ${name} está vacía en ${file} (línea ${lineno})."

    seen="${seen} ${name}"
    eval "printf -v FB_${name} '%s' \"\${value}\""
  done < "${file}"

  local missing=""
  for key in ${FIREBASE_KEYS}; do
    contains_word "${key}" "${seen}" || missing="${missing} ${key}"
  done
  [ -z "${missing}" ] || die "Faltan variables en ${file}:${missing}"

  # Se informa del recuento y de los NOMBRES, nunca de los valores.
  ok "Configuración de Firebase leída de ${file}: 4 claves presentes (${ignored} server-only ignoradas)."
}

firebase_value() {
  eval "printf '%s' \"\${FB_$1}\""
}

# ------------------------------------------------------------------- config

cmd_config() {
  cat <<CONFIG
Proyecto              ${PROJECT_ID}
Región                ${REGION}
Servicio              ${SERVICE_NAME}
Imagen                ${IMAGE_BASE}
Tag                   ${IMAGE_TAG:-<derivado del commit>}
Runtime SA            ${RUNTIME_SERVICE_ACCOUNT}
Backend               ${BACKEND_SERVICE_NAME}
Backend URL           ${BACKEND_URL}
Backend audience      ${BACKEND_AUDIENCE}
Modo de autenticación ${BACKEND_AUTH_MODE}
Origen administrativo ${ADMIN_ORIGIN}
Puerto                ${SERVICE_PORT}
CPU / memoria         ${SERVICE_CPU} / ${SERVICE_MEMORY}
Concurrencia          ${SERVICE_CONCURRENCY}
Timeout               ${SERVICE_TIMEOUT}
Instancias            min ${SERVICE_MIN_INSTANCES}, max ${SERVICE_MAX_INSTANCES}
Entorno de ejecución  ${SERVICE_EXECUTION_ENVIRONMENT} (con startup CPU boost)
Ingress               ${SERVICE_INGRESS} (sin autenticación de Cloud Run; ver runbook)
CONFIG
}

# ---------------------------------------------------------------- preflight

check_apis() {
  local enabled missing="" api
  enabled="$(gc services list --enabled --format='value(config.name)' 2>/dev/null || true)"
  for api in ${REQUIRED_APIS}; do
    printf '%s\n' "${enabled}" | grep -qx "${api}" || missing="${missing} ${api}"
  done
  if [ -n "${missing}" ]; then
    warn "APIs sin habilitar:${missing}"
    warn "Este script no habilita nada. Ejecuta tú:"
    printf '    gcloud services enable%s --project=%s\n' "${missing}" "${PROJECT_ID}" >&2
    return 1
  fi
  ok "APIs requeridas habilitadas."
}

check_artifact_registry() {
  if gc artifacts repositories describe "${AR_REPOSITORY}" \
       --location="${REGION}" --format='value(name)' >/dev/null 2>&1; then
    ok "Artifact Registry ${AR_REPOSITORY} presente en ${REGION}."
    return 0
  fi
  warn "Falta el repositorio Artifact Registry ${AR_REPOSITORY}. Créalo tú:"
  printf '    gcloud artifacts repositories create %s --repository-format=docker --location=%s --project=%s\n' \
    "${AR_REPOSITORY}" "${REGION}" "${PROJECT_ID}" >&2
  return 1
}

check_runtime_sa() {
  if gc iam service-accounts describe "${RUNTIME_SERVICE_ACCOUNT}" \
       --format='value(email)' >/dev/null 2>&1; then
    ok "Identidad de ejecución ${RUNTIME_SERVICE_ACCOUNT} presente."
    return 0
  fi
  warn "Falta la identidad de ejecución del panel. Créala tú, SIN claves JSON:"
  printf "    gcloud iam service-accounts create modulartess-admin-stg-run --display-name='Modulartess admin staging runtime' --project=%s\n" \
    "${PROJECT_ID}" >&2
  return 1
}

# Se piden todas las condiciones y se localiza `Ready` por su tipo, analizando la respuesta aquí.
#
# El filtro de gcloud no vale: `|| true` convertía un fallo de gcloud en una cadena vacía
# indistinguible de «no hay condición», y extraer por posición rompe si el orden cambia.
check_backend_ready() {
  local rows
  if ! rows="$(gc run services describe "${BACKEND_SERVICE_NAME}" --region="${REGION}" \
       --flatten='status.conditions[]' \
       --format='csv[no-heading](status.conditions.type,status.conditions.status)' 2>/dev/null)"; then
    warn "No se pudieron leer las condiciones de ${BACKEND_SERVICE_NAME}: gcloud falló."
    return 1
  fi

  local ready_rows count
  ready_rows="$(printf '%s\n' "${rows}" | grep '^Ready,' || true)"
  count="$(printf '%s' "${ready_rows}" | grep -c . || true)"

  if [ "${count}" -eq 0 ]; then
    warn "El backend ${BACKEND_SERVICE_NAME} no publica una condición Ready."
    return 1
  fi

  if [ "${count}" -gt 1 ]; then
    warn "El backend ${BACKEND_SERVICE_NAME} publica ${count} condiciones Ready: respuesta ambigua."
    return 1
  fi

  local status
  status="${ready_rows#Ready,}"

  if [ "${status}" != "True" ]; then
    warn "El backend ${BACKEND_SERVICE_NAME} tiene Ready=${status:-<vacío>}, se exige True."
    return 1
  fi

  ok "Backend ${BACKEND_SERVICE_NAME} Ready=True."
}

# El backend debe seguir siendo privado: `allUsers` o `allAuthenticatedUsers` como invocador
# significaría que cualquiera puede llamarlo sin identidad, y el panel dejaría de ser la única vía.
check_backend_private() {
  local members
  members="$(gc run services get-iam-policy "${BACKEND_SERVICE_NAME}" --region="${REGION}" \
    --flatten='bindings[].members' \
    --filter='bindings.role:roles/run.invoker' \
    --format='value(bindings.members)' 2>/dev/null || true)"
  if printf '%s\n' "${members}" | grep -qx 'allUsers'; then
    warn "El backend acepta allUsers como invocador: ya no es privado."
    return 1
  fi
  if printf '%s\n' "${members}" | grep -qx 'allAuthenticatedUsers'; then
    warn "El backend acepta allAuthenticatedUsers como invocador: ya no es privado."
    return 1
  fi
  ok "Backend privado: sin invocadores anónimos."
}

# El binding tiene que ser exacto e INCONDICIONAL. Una condición IAM puede caducar o depender del
# recurso, y entonces el panel funcionaría hasta que dejara de hacerlo sin que nadie tocara nada.
check_invoker_binding() {
  local rows
  rows="$(gc run services get-iam-policy "${BACKEND_SERVICE_NAME}" --region="${REGION}" \
    --flatten='bindings[].members' \
    --filter="bindings.role:roles/run.invoker AND bindings.members:serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
    --format='value(bindings.members,bindings.condition.expression)' 2>/dev/null || true)"

  if [ -z "${rows}" ]; then
    warn "La identidad del panel no tiene roles/run.invoker sobre ${BACKEND_SERVICE_NAME}. Concédelo tú:"
    printf '    gcloud run services add-iam-policy-binding %s --region=%s --project=%s \\\n' \
      "${BACKEND_SERVICE_NAME}" "${REGION}" "${PROJECT_ID}" >&2
    printf "      --member='serviceAccount:%s' --role='roles/run.invoker' --condition=None\n" \
      "${RUNTIME_SERVICE_ACCOUNT}" >&2
    return 1
  fi

  local condition
  condition="$(printf '%s' "${rows}" | awk '{print $2}')"
  if [ -n "${condition}" ]; then
    warn "El binding roles/run.invoker del panel está CONDICIONADO. Debe ser incondicional."
    return 1
  fi

  ok "IAM: binding exacto e incondicional roles/run.invoker sobre ${BACKEND_SERVICE_NAME}."
}

# La URL y la audiencia tienen que ser el mismo origen: el propio panel lo exige en
# `readBackendConfig`, y una audiencia distinta produce un token que Cloud Run rechaza.
check_backend_origin_pair() {
  case "${BACKEND_URL}" in
    https://*) ;;
    *) warn "BACKEND_URL debe ser https."; return 1 ;;
  esac
  if [ "${BACKEND_URL}" != "${BACKEND_AUDIENCE}" ]; then
    warn "BACKEND_URL y BACKEND_AUDIENCE deben ser idénticos."
    return 1
  fi
  case "${BACKEND_URL}" in
    */|*\?*|*\#*) warn "BACKEND_URL debe ser un origen sin barra final, consulta ni fragmento."; return 1 ;;
  esac
  ok "URL y audiencia del backend idénticas y canónicas."
}

check_admin_origin() {
  case "${ADMIN_ORIGIN}" in
    https://*) ;;
    *) warn "ADMIN_ORIGIN debe ser https."; return 1 ;;
  esac
  case "${ADMIN_ORIGIN}" in
    */|*\?*|*\#*|*@*) warn "ADMIN_ORIGIN debe ser un origen exacto, sin ruta, consulta, fragmento, credenciales ni barra final."; return 1 ;;
  esac

  # Cloud Run publica una URL determinista: <servicio>-<numero-de-proyecto>.<region>.run.app.
  # Se puede calcular antes del primer despliegue, así que ADMIN_ORIGIN tiene que coincidir con
  # ella exactamente. Si no coincidiera, el BFF rechazaría sus propias peticiones: valida `Origin`
  # de forma exacta.
  local expected="https://${SERVICE_NAME}-${PROJECT_NUMBER}.${REGION}.run.app"

  if [ "${ADMIN_ORIGIN}" != "${expected}" ]; then
    warn "ADMIN_ORIGIN no es la URL determinista de Cloud Run."
    warn "  esperado: ${expected}"
    warn "  recibido: ${ADMIN_ORIGIN}"
    return 1
  fi

  ok "Origen administrativo HTTPS y determinista."
}

check_build_context() {
  [ -f "${REPO_ROOT}/Dockerfile" ] || { warn "Falta el Dockerfile."; return 1; }
  [ -f "${REPO_ROOT}/.dockerignore" ] || { warn "Falta el .dockerignore."; return 1; }
  grep -q "output: 'standalone'" "${REPO_ROOT}/next.config.ts" \
    || { warn "next.config.ts no declara output: 'standalone'."; return 1; }
  grep -qx '\.env' "${REPO_ROOT}/.dockerignore" \
    || { warn ".dockerignore no excluye .env."; return 1; }
  ok "Dockerfile, .dockerignore y salida standalone en su sitio."
}

cmd_preflight() {
  log "Preflight de solo lectura. No habilita APIs ni crea recursos."
  local failures=0

  gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q . \
    || die "No hay cuenta gcloud activa. Ejecuta 'gcloud auth login'."
  ok "Cuenta activa: $(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)"

  gc projects describe "${PROJECT_ID}" --format='value(projectId)' >/dev/null 2>&1 \
    || die "El proyecto ${PROJECT_ID} no existe o no es accesible."
  ok "Proyecto accesible: ${PROJECT_ID}"

  check_apis                || failures=$((failures + 1))
  check_artifact_registry   || failures=$((failures + 1))
  check_runtime_sa          || failures=$((failures + 1))
  check_backend_ready       || failures=$((failures + 1))
  check_backend_private     || failures=$((failures + 1))
  check_invoker_binding     || failures=$((failures + 1))
  check_backend_origin_pair || failures=$((failures + 1))
  check_admin_origin        || failures=$((failures + 1))
  check_build_context       || failures=$((failures + 1))
  load_firebase_config      || failures=$((failures + 1))

  if git_tree_is_clean; then
    ok "Árbol Git limpio."
  else
    warn "Árbol Git sucio: 'build' real quedará bloqueado (una imagen debe ser reproducible desde un commit)."
  fi

  if [ "${failures}" -gt 0 ]; then
    die "Preflight con ${failures} comprobación(es) fallida(s). No se sigue."
  fi
  ok "Preflight completo."
}

# -------------------------------------------------------------------- build

cmd_build() {
  resolve_tag
  load_firebase_config

  if [ "${DRY_RUN}" != true ] && ! git_tree_is_clean; then
    die "Árbol Git sucio: no se construye una imagen que no se puede reproducir desde un commit.
  Confirma o descarta los cambios, o usa --dry-run para ver el comando."
  fi

  local image="${IMAGE_BASE}:${IMAGE_TAG}"
  log "Construyendo ${image}"
  confirm "Se va a construir y PUBLICAR la imagen ${image}. ¿Continuar?"

  # Las sustituciones se parten en dos: las que se pueden mostrar y las que no.
  #
  # Los cuatro valores de Firebase son identificadores PÚBLICOS del cliente —viajan al navegador en
  # el bundle— y Cloud Build tiene que recibirlos para construir. Pero este script no los imprime
  # nunca: en vista previa muestra marcadores, y en la ejecución real los pasa a gcloud sin
  # registrarlos. Así una vista previa compartida en un ticket o un log de terminal no los arrastra.
  local public_subs="_REGION=${REGION},_REPOSITORY=${AR_REPOSITORY},_IMAGE=${IMAGE_NAME},_TAG=${IMAGE_TAG}"
  local redacted="_NEXT_PUBLIC_FIREBASE_API_KEY=<REDACTADO>,_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<REDACTADO>,_NEXT_PUBLIC_FIREBASE_PROJECT_ID=<REDACTADO>,_NEXT_PUBLIC_FIREBASE_APP_ID=<REDACTADO>"

  if [ "${DRY_RUN}" = true ]; then
    # Se imprime en claro, no con %q: una vista previa es para leerla, y aquí no hay ningún valor
    # que proteger porque los cuatro de Firebase ya van redactados.
    printf '\033[2m[dry-run]\033[0m gcloud builds submit %s \\\n' "${REPO_ROOT}" >&2
    printf '  --project=%s --region=%s \\\n' "${PROJECT_ID}" "${REGION}" >&2
    printf '  --config=%s \\\n' "${SCRIPT_DIR}/cloudbuild.yaml" >&2
    printf '  --substitutions=%s,%s\n' "${public_subs}" "${redacted}" >&2
    ok "Vista previa del build con tag ${IMAGE_TAG}."
    return 0
  fi

  gcloud builds submit "${REPO_ROOT}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --config="${SCRIPT_DIR}/cloudbuild.yaml" \
    --substitutions="${public_subs},_NEXT_PUBLIC_FIREBASE_API_KEY=$(firebase_value NEXT_PUBLIC_FIREBASE_API_KEY),_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$(firebase_value NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),_NEXT_PUBLIC_FIREBASE_PROJECT_ID=$(firebase_value NEXT_PUBLIC_FIREBASE_PROJECT_ID),_NEXT_PUBLIC_FIREBASE_APP_ID=$(firebase_value NEXT_PUBLIC_FIREBASE_APP_ID)"

  ok "Imagen construida con tag ${IMAGE_TAG}."
}

# ------------------------------------------------------------------- deploy

image_exists() {
  gc artifacts docker images describe "${IMAGE_BASE}:${IMAGE_TAG}" \
    --format='value(name)' >/dev/null 2>&1
}

cmd_deploy() {
  resolve_tag

  local image="${IMAGE_BASE}:${IMAGE_TAG}"

  # Desplegar una etiqueta que no existe deja el servicio en un estado confuso: se comprueba antes.
  if ! image_exists; then
    die "La imagen ${image} no existe en Artifact Registry. Ejecuta 'build' primero."
  fi
  ok "Imagen ${IMAGE_TAG} presente en Artifact Registry."

  # `deploy` no da por hecho que alguien haya ejecutado `preflight`. Repite aquí las
  # comprobaciones esenciales, todas de solo lectura y **antes** de pedir confirmación: desplegar
  # con la configuración o el IAM mal es más caro de deshacer que detectarlo ahora.
  local failures=0
  check_backend_origin_pair || failures=$((failures + 1))
  check_admin_origin        || failures=$((failures + 1))
  check_backend_ready       || failures=$((failures + 1))
  check_backend_private     || failures=$((failures + 1))
  check_runtime_sa          || failures=$((failures + 1))
  check_invoker_binding     || failures=$((failures + 1))

  if [ "${failures}" -gt 0 ]; then
    die "${failures} comprobación(es) fallida(s) antes del despliegue. No se muta nada."
  fi

  log "Desplegando ${SERVICE_NAME} con ${image}"
  warn "El servicio quedará accesible sin autenticación de Cloud Run: el navegador tiene que poder"
  warn "cargar el formulario de acceso. La autorización funcional sigue cerrada por Firebase"
  warn "Authentication, la sesión administrativa y el rol que verifica el backend."
  confirm "Se va a DESPLEGAR ${SERVICE_NAME} en ${PROJECT_ID}/${REGION}. ¿Continuar?"

  run gcloud run deploy "${SERVICE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --image="${image}" \
    --service-account="${RUNTIME_SERVICE_ACCOUNT}" \
    --port="${SERVICE_PORT}" \
    --cpu="${SERVICE_CPU}" \
    --memory="${SERVICE_MEMORY}" \
    --concurrency="${SERVICE_CONCURRENCY}" \
    --timeout="${SERVICE_TIMEOUT}" \
    --min-instances="${SERVICE_MIN_INSTANCES}" \
    --max-instances="${SERVICE_MAX_INSTANCES}" \
    --execution-environment="${SERVICE_EXECUTION_ENVIRONMENT}" \
    --cpu-boost \
    --ingress="${SERVICE_INGRESS}" \
    --allow-unauthenticated \
    --update-env-vars="MODULARTESS_BACKEND_URL=${BACKEND_URL},MODULARTESS_BACKEND_AUTH_MODE=${BACKEND_AUTH_MODE},MODULARTESS_BACKEND_AUDIENCE=${BACKEND_AUDIENCE},MODULARTESS_ADMIN_ORIGIN=${ADMIN_ORIGIN}"

  ok "Despliegue solicitado con la imagen ${IMAGE_TAG}."
}

# ------------------------------------------------------------------- verify

service_url() {
  gc run services describe "${SERVICE_NAME}" --region="${REGION}" \
    --format='value(status.url)' 2>/dev/null || true
}

cmd_verify() {
  local url
  url="$(service_url)"
  [ -n "${url}" ] || die "No se pudo leer la URL de ${SERVICE_NAME}. ¿Está desplegado?"
  ok "Servicio en ${url}"

  local failures=0

  # 1. La página de acceso responde. Es lo único que el navegador debe poder cargar sin sesión.
  local login_status
  login_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${url}/iniciar-sesion" || printf '000')"
  if [ "${login_status}" = "200" ]; then
    ok "La página de acceso responde 200."
  else
    warn "La página de acceso respondió ${login_status} (se esperaba 200)."
    failures=$((failures + 1))
  fi

  # 2. El backend sigue rechazando el tráfico anónimo.
  local backend_status
  backend_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${BACKEND_URL}/v1/admin/auth/session" || printf '000')"
  if [ "${backend_status}" = "403" ] || [ "${backend_status}" = "401" ]; then
    ok "El backend rechaza la invocación anónima (${backend_status}): sigue privado."
  else
    warn "El backend respondió ${backend_status} sin identidad; se esperaba 401 o 403."
    failures=$((failures + 1))
  fi

  # 3. Sonda con credencial ficticia a través del BFF.
  #
  # Credencial ficticia con la FORMA de una serialización JWS compacta: tres segmentos base64url
  # no vacíos separados por puntos, y una longitud dentro del rango del contrato. No es un token
  # real ni deriva de ninguno; los tres segmentos decodifican a texto en claro que dice que es una
  # sonda.
  #
  # La forma importa: un valor cualquiera de longitud suficiente pasaría el mínimo de caracteres
  # pero fallaría la comprobación estructural, y el backend devolvería `400 invalid_request` en
  # lugar de llegar a verificar nada. Con esta forma la petición supera la validación local, llega
  # a Firebase, la firma no verifica y el resultado es el controlado: `401 session_required`.
  #
  # Eso demuestra las tres cosas que interesan: el BFF alcanza el backend, el backend verifica de
  # verdad, y el error que vuelve al navegador es el código estable y no un detalle interno.
  # Se compone aquí y no se imprime en ninguna rama.
  local PROBE_ID_TOKEN
  PROBE_ID_TOKEN="c29uZGEtcGFuZWwtY2FiZWNlcmEtZmljdGljaWE.c29uZGEtcGFuZWwtY2FyZ2EtZmljdGljaWE.c29uZGEtcGFuZWwtZmlybWEtZmljdGljaWE"

  local probe_body probe_status probe_code
  probe_body="$(curl -s --max-time 30 \
    -o /tmp/modulartess-admin-probe.$$ -w '%{http_code}' \
    -X POST "${url}/api/admin/auth/session" \
    -H 'content-type: application/json' \
    -H "origin: ${ADMIN_ORIGIN}" \
    --data "{\"idToken\":\"${PROBE_ID_TOKEN}\"}" || printf '000')"
  probe_status="${probe_body}"
  probe_code="$(sed -n 's/.*"code":"\([a-z_]*\)".*/\1/p' "/tmp/modulartess-admin-probe.$$" 2>/dev/null || true)"
  rm -f "/tmp/modulartess-admin-probe.$$"

  if [ "${probe_status}" = "401" ] && [ "${probe_code}" = "session_required" ]; then
    ok "Sonda con credencial ficticia: 401 session_required, el resultado controlado esperado."
  else
    warn "Sonda con credencial ficticia: ${probe_status} ${probe_code:-sin código}; se esperaba 401 session_required."
    failures=$((failures + 1))
  fi

  printf '\n' >&2
  warn "Esto NO sustituye la primera prueba manual con el super_admin real."
  warn "Verify solo comprueba que la frontera responde y rechaza lo que debe rechazar. Que una"
  warn "cuenta administrativa real complete el flujo y alcance /panel hay que probarlo a mano,"
  warn "y antes hay que autorizar el dominio del panel en Firebase Authentication."

  [ "${failures}" -eq 0 ] || die "Verify con ${failures} comprobación(es) fallida(s)."
  ok "Verify completo."
}

# ---------------------------------------------------------------------- all

cmd_all() {
  # El tag se deriva UNA vez aquí y se comparte: build y deploy apuntan a la misma imagen.
  resolve_tag
  log "Tag compartido para esta ejecución: ${IMAGE_TAG}"
  cmd_preflight
  cmd_build
  cmd_deploy
  cmd_verify
}

# ------------------------------------------------------------------ despacho

case "${COMMAND}" in
  config)    cmd_config ;;
  preflight) cmd_preflight ;;
  build)     cmd_build ;;
  deploy)    cmd_deploy ;;
  verify)    cmd_verify ;;
  all)       cmd_all ;;
  *)         usage; die "Comando desconocido: ${COMMAND}" ;;
esac
