#!/usr/bin/env bash
#
# Harness de `deploy/staging.sh` con shims.
#
# No toca la nube: `gcloud`, `git` y `curl` se sustituyen por dobles que registran cada invocación
# y responden según el escenario. Eso permite comprobar las decisiones del script —qué bloquea,
# qué tag usa, qué banderas pasa— sin proyecto, sin credenciales y sin red.

set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
TARGET="${SCRIPT_DIR}/staging.sh"

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); printf '\033[1;32m  ok\033[0m %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf '\033[1;31m  FALLO\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '        %s\n' "$2"; }
group() { printf '\n\033[1;34m%s\033[0m\n' "$1"; }

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

SHIM_BIN="${WORK}/bin"
mkdir -p "${SHIM_BIN}"
CALL_LOG="${WORK}/calls.log"

# ------------------------------------------------------------------- shims

cat > "${SHIM_BIN}/gcloud" <<'GCLOUD_EOF'
#!/usr/bin/env bash
printf 'gcloud %s\n' "$*" >> "${CALL_LOG}"
ARGS="$*"

case "${ARGS}" in
  "auth list"*)
    [ -n "${SHIM_NO_ACCOUNT:-}" ] && exit 0
    echo "operador@example.invalid"; exit 0 ;;
  "projects describe"*)
    [ -n "${SHIM_NO_PROJECT:-}" ] && exit 1
    echo "modulartessweb-250f5"; exit 0 ;;
  "services list"*)
    if [ -n "${SHIM_APIS_MISSING:-}" ]; then
      echo "run.googleapis.com"; exit 0
    fi
    printf '%s\n' run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com iam.googleapis.com
    exit 0 ;;
  "artifacts repositories describe"*)
    [ -n "${SHIM_AR_MISSING:-}" ] && exit 1
    echo "modulartess"; exit 0 ;;
  "iam service-accounts describe"*)
    [ -n "${SHIM_SA_MISSING:-}" ] && exit 1
    echo "modulartess-admin-stg-run@modulartessweb-250f5.iam.gserviceaccount.com"; exit 0 ;;
  "artifacts docker images describe"*)
    [ -n "${SHIM_IMAGE_MISSING:-}" ] && exit 1
    echo "image"; exit 0 ;;
  "run services describe modulartess-backend-staging"*)
    [ -n "${SHIM_READY_GCLOUD_FAILS:-}" ] && exit 1
    [ -n "${SHIM_READY_UNREADABLE:-}" ] && { echo "basura sin comas"; exit 0; }
    [ -n "${SHIM_READY_ABSENT:-}" ] && { printf '%s\n' "ConfigurationsReady,True" "RoutesReady,True"; exit 0; }
    [ -n "${SHIM_READY_DUPLICATE:-}" ] && { printf '%s\n' "Ready,True" "Ready,False"; exit 0; }
    [ -n "${SHIM_READY_EMPTY:-}" ] && { printf '%s\n' "Ready," ; exit 0; }
    if [ -n "${SHIM_BACKEND_NOT_READY:-}" ]; then
      printf '%s\n' "ConfigurationsReady,True" "Ready,False" "RoutesReady,True"
    else
      # Ready deliberadamente en el medio: la comprobación no puede depender de la posición.
      printf '%s\n' "ConfigurationsReady,True" "Ready,True" "RoutesReady,True"
    fi
    exit 0 ;;
  "run services describe modulartess-admin-staging"*)
    [ -n "${SHIM_SERVICE_MISSING:-}" ] && exit 0
    echo "https://modulartess-admin-staging-651080070961.us-east1.run.app"; exit 0 ;;
  "run services get-iam-policy"*)
    case "${ARGS}" in
      *"bindings.role:roles/run.invoker AND"*)
        [ -n "${SHIM_BINDING_MISSING:-}" ] && exit 0
        if [ -n "${SHIM_BINDING_CONDITIONAL:-}" ]; then
          printf 'serviceAccount:modulartess-admin-stg-run@modulartessweb-250f5.iam.gserviceaccount.com\trequest.time < timestamp("2027-01-01T00:00:00Z")\n'
        else
          printf 'serviceAccount:modulartess-admin-stg-run@modulartessweb-250f5.iam.gserviceaccount.com\t\n'
        fi
        exit 0 ;;
      *)
        if [ -n "${SHIM_BACKEND_PUBLIC:-}" ]; then echo "allUsers"; else
          echo "serviceAccount:modulartess-web-stg-run@modulartessweb-250f5.iam.gserviceaccount.com"
        fi
        exit 0 ;;
    esac ;;
  "builds submit"*) exit 0 ;;
  "run deploy"*)    exit 0 ;;
esac
exit 0
GCLOUD_EOF

cat > "${SHIM_BIN}/git" <<'GIT_EOF'
#!/usr/bin/env bash
printf 'git %s\n' "$*" >> "${CALL_LOG}"
case "$*" in
  *"rev-parse --short=12 HEAD"*) echo "abcdef123456"; exit 0 ;;
  *"status --porcelain"*)
    [ -n "${SHIM_DIRTY_TREE:-}" ] && echo " M src/app/page.tsx"
    exit 0 ;;
esac
exit 0
GIT_EOF

cat > "${SHIM_BIN}/curl" <<'CURL_EOF'
#!/usr/bin/env bash
printf 'curl %s\n' "$*" >> "${CALL_LOG}"
ARGS="$*"
OUT=""
prev=""
for a in "$@"; do
  [ "${prev}" = "-o" ] && OUT="${a}"
  prev="${a}"
done
case "${ARGS}" in
  *"/iniciar-sesion"*) printf '%s' "${SHIM_LOGIN_STATUS:-200}"; exit 0 ;;
  *"/api/admin/auth/session"*)
    [ -n "${OUT}" ] && printf '{"code":"%s","message":"x"}' "${SHIM_PROBE_CODE:-session_required}" > "${OUT}"
    printf '%s' "${SHIM_PROBE_STATUS:-401}"; exit 0 ;;
  *"/v1/admin/auth/session"*) printf '%s' "${SHIM_BACKEND_STATUS:-403}"; exit 0 ;;
esac
printf '000'; exit 0
CURL_EOF

chmod +x "${SHIM_BIN}/gcloud" "${SHIM_BIN}/git" "${SHIM_BIN}/curl"

# --------------------------------------------------------- entorno Firebase

FB_GOOD="${WORK}/firebase-good.env"
cat > "${FB_GOOD}" <<'FB_EOF'
# Comentario que debe ignorarse
NEXT_PUBLIC_FIREBASE_API_KEY=clave-de-prueba-no-real
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="entre-comillas.example.invalid"
NEXT_PUBLIC_FIREBASE_PROJECT_ID='comillas-simples'
export NEXT_PUBLIC_FIREBASE_APP_ID=con-export

# Variables server-only del panel: se ignoran para el build.
MODULARTESS_BACKEND_URL=https://backend.example.invalid
MODULARTESS_BACKEND_AUTH_MODE=google-oidc
MODULARTESS_BACKEND_AUDIENCE=https://backend.example.invalid
MODULARTESS_ADMIN_ORIGIN=https://panel.example.invalid
FB_EOF

make_fb() { printf '%s\n' "$2" > "${WORK}/$1"; printf '%s' "${WORK}/$1"; }

# ------------------------------------------------------------------ runner

# Ejecuta el script bajo prueba con los shims delante del PATH.
sut() {
  : > "${CALL_LOG}"
  # Los argumentos van DESPUÉS del script: dentro de `env` se interpretarían como suyos.
  # Las cuatro NEXT_PUBLIC_* se vacían para que cada caso decida si vienen de archivo o del entorno.
  env PATH="${SHIM_BIN}:${PATH}" CALL_LOG="${CALL_LOG}" \
    NEXT_PUBLIC_FIREBASE_API_KEY= NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN= \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID= NEXT_PUBLIC_FIREBASE_APP_ID= \
    bash "${TARGET}" "$@" 2>&1
}

# Copia del repositorio cuyo `staging.vars` se puede reescribir. El versionado ya trae el origen
# determinista correcto; esta copia sirve para los casos NEGATIVOS de ADMIN_ORIGIN.
REPO_COPY="${WORK}/repo"
mkdir -p "${REPO_COPY}/deploy"
cp "${REPO_ROOT}/Dockerfile" "${REPO_ROOT}/.dockerignore" "${REPO_ROOT}/next.config.ts" "${REPO_COPY}/"
cp "${TARGET}" "${REPO_COPY}/deploy/staging.sh"

set_admin_origin() {
  sed "s|^ADMIN_ORIGIN=.*|ADMIN_ORIGIN=$1|" "${SCRIPT_DIR}/staging.vars" \
    > "${REPO_COPY}/deploy/staging.vars"
}
set_admin_origin "https://modulartess-admin-staging-zzzz111122-ue.a.run.app"

# Ejecuta la copia con el origen ya resuelto.
sut_fixed() {
  : > "${CALL_LOG}"
  env PATH="${SHIM_BIN}:${PATH}" CALL_LOG="${CALL_LOG}" \
    NEXT_PUBLIC_FIREBASE_API_KEY= NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN= \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID= NEXT_PUBLIC_FIREBASE_APP_ID= \
    bash "${REPO_COPY}/deploy/staging.sh" "$@" 2>&1
}

expect_ok()   { if [ "$1" -eq 0 ]; then pass "$2"; else fail "$2" "esperaba éxito, salió $1"; fi; }
expect_fail() { if [ "$1" -ne 0 ]; then pass "$2"; else fail "$2" "esperaba fallo, salió 0"; fi; }
expect_has()  { case "$1" in *"$2"*) pass "$3" ;; *) fail "$3" "no contiene: $2" ;; esac; }
expect_lacks(){ case "$1" in *"$2"*) fail "$3" "contiene lo que no debe: $2" ;; *) pass "$3" ;; esac; }

# ------------------------------------------------------------------- casos

group "Sintaxis"
if bash -n "${TARGET}"; then pass "staging.sh pasa bash -n"; else fail "staging.sh pasa bash -n"; fi
if bash -n "${BASH_SOURCE[0]}"; then pass "el propio harness pasa bash -n"; else fail "harness bash -n"; fi

group "config no toca la nube"
OUT="$(sut config)"; RC=$?
expect_ok "${RC}" "config termina bien"
expect_has "${OUT}" "modulartess-admin-staging" "config muestra el servicio"
if [ ! -s "${CALL_LOG}" ]; then pass "config no invoca gcloud"; else fail "config no invoca gcloud" "$(cat "${CALL_LOG}")"; fi

group "preflight: camino feliz"
OUT="$(sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_ok "${RC}" "preflight completo termina en 0"
expect_has "${OUT}" "Preflight completo" "informa de preflight completo"
expect_has "${OUT}" "binding exacto e incondicional" "valida el binding incondicional"
expect_has "${OUT}" "Backend privado" "valida que el backend sigue privado"

group "preflight: bloqueos"
OUT="$(SHIM_SA_MISSING=1 sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "SA ausente bloquea el preflight"
expect_has "${OUT}" "gcloud iam service-accounts create modulartess-admin-stg-run" "sugiere crear la SA sin claves"
expect_lacks "${OUT}" "--key-file" "no sugiere claves JSON"

OUT="$(SHIM_BINDING_MISSING=1 sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "binding ausente bloquea el preflight"
expect_has "${OUT}" "roles/run.invoker" "sugiere conceder run.invoker"
expect_has "${OUT}" "--condition=None" "la sugerencia es incondicional"

OUT="$(SHIM_BINDING_CONDITIONAL=1 sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "binding CONDICIONADO bloquea el preflight"
expect_has "${OUT}" "CONDICIONADO" "explica que la condición no vale"

OUT="$(SHIM_BACKEND_PUBLIC=1 sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "backend con allUsers bloquea el preflight"

OUT="$(SHIM_BACKEND_NOT_READY=1 sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "backend no Ready bloquea el preflight"

OUT="$(SHIM_AR_MISSING=1 sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "Artifact Registry ausente bloquea el preflight"
expect_has "${OUT}" "gcloud artifacts repositories create" "sugiere crear el repositorio"

OUT="$(SHIM_APIS_MISSING=1 sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "APIs sin habilitar bloquean el preflight"
expect_has "${OUT}" "gcloud services enable" "sugiere habilitarlas a mano"
expect_lacks "${OUT}" "[ok] APIs requeridas" "no las habilita por su cuenta"

group "preflight: nunca habilita ni crea nada"
OUT="$(SHIM_APIS_MISSING=1 SHIM_SA_MISSING=1 SHIM_AR_MISSING=1 sut preflight --firebase-env "${FB_GOOD}")" || true
MUTATIONS="$(grep -E 'gcloud (services enable|iam service-accounts create|artifacts repositories create|run deploy|builds submit|.*add-iam-policy-binding)' "${CALL_LOG}" || true)"
if [ -z "${MUTATIONS}" ]; then pass "preflight no ejecuta ninguna mutación"; else fail "preflight no muta" "${MUTATIONS}"; fi

group "Configuración de Firebase"
OUT="$(sut preflight --firebase-env "${FB_GOOD}")" || true
expect_has "${OUT}" "4 claves presentes" "acepta valores con y sin comillas y con export"
expect_lacks "${OUT}" "clave-de-prueba-no-real" "no imprime el valor de la API key"
expect_lacks "${OUT}" "entre-comillas.example.invalid" "no imprime el authDomain"
expect_lacks "${OUT}" "comillas-simples" "no imprime el projectId"
expect_lacks "${OUT}" "con-export" "no imprime el appId"
expect_has "${OUT}" "4 server-only ignoradas" "ignora las MODULARTESS_* del mismo archivo"

FB_MISSING="$(make_fb missing.env 'NEXT_PUBLIC_FIREBASE_API_KEY=x')"
OUT="$(sut preflight --firebase-env "${FB_MISSING}")"; RC=$?
expect_fail "${RC}" "rechaza claves faltantes"
expect_has "${OUT}" "Faltan variables" "nombra las que faltan"

FB_DUP="$(printf 'NEXT_PUBLIC_FIREBASE_API_KEY=a\nNEXT_PUBLIC_FIREBASE_API_KEY=b\n' > "${WORK}/dup.env"; printf '%s' "${WORK}/dup.env")"
OUT="$(sut preflight --firebase-env "${FB_DUP}")"; RC=$?
expect_fail "${RC}" "rechaza duplicados"
expect_has "${OUT}" "duplicada" "explica el duplicado"

FB_BAD="$(make_fb bad.env 'esto no es una asignacion')"
OUT="$(sut preflight --firebase-env "${FB_BAD}")"; RC=$?
expect_fail "${RC}" "rechaza líneas mal formadas"
expect_lacks "${OUT}" "esto no es una asignacion" "no imprime el contenido de la línea"

FB_EXTRA="$(make_fb extra.env 'ALGO_INESPERADO=1')"
OUT="$(sut preflight --firebase-env "${FB_EXTRA}")"; RC=$?
expect_fail "${RC}" "rechaza variables inesperadas"
expect_has "${OUT}" "ALGO_INESPERADO" "nombra la variable inesperada"

OUT="$(sut preflight --firebase-env "${WORK}/no-existe.env")"; RC=$?
expect_fail "${RC}" "rechaza un archivo inexistente"

group "build: árbol sucio y tag"
OUT="$(SHIM_DIRTY_TREE=1 sut build --firebase-env "${FB_GOOD}" --yes)"; RC=$?
expect_fail "${RC}" "árbol sucio bloquea el build real"
expect_has "${OUT}" "no se construye" "explica por qué"

OUT="$(SHIM_DIRTY_TREE=1 sut build --firebase-env "${FB_GOOD}" --dry-run)"; RC=$?
expect_ok "${RC}" "--dry-run sí permite previsualizar con árbol sucio"
SUBMITS="$(grep -c 'gcloud builds submit' "${CALL_LOG}" || true)"
if [ "${SUBMITS}" = "0" ]; then pass "--dry-run no ejecuta builds submit"; else fail "--dry-run no muta" "${SUBMITS} llamadas"; fi

OUT="$(sut build --firebase-env "${FB_GOOD}" --yes --dry-run)"; RC=$?
expect_has "${OUT}" "_TAG=git-abcdef123456" "el tag se deriva del commit"
expect_lacks "${OUT}" ":latest" "nunca usa :latest"

OUT="$(sut build --firebase-env "${FB_GOOD}" --yes --dry-run --tag manual-123)"; RC=$?
expect_has "${OUT}" "_TAG=manual-123" "--tag manda sobre el commit"

group "deploy: imagen y garantías"
OUT="$(SHIM_IMAGE_MISSING=1 sut deploy --yes)"; RC=$?
expect_fail "${RC}" "imagen ausente bloquea el deploy"
expect_has "${OUT}" "no existe en Artifact Registry" "explica que falta la imagen"

OUT="$(SHIM_SA_MISSING=1 sut deploy --yes)"; RC=$?
expect_fail "${RC}" "SA ausente bloquea el deploy"

OUT="$(SHIM_BINDING_MISSING=1 sut deploy --yes)"; RC=$?
expect_fail "${RC}" "binding ausente bloquea el deploy"

OUT="$(sut deploy --yes --dry-run)"; RC=$?
expect_ok "${RC}" "deploy en vista previa termina bien"
for flag in "--port=8080" "--cpu=1" "--memory=512Mi" "--concurrency=40" "--timeout=60s" \
            "--min-instances=0" "--max-instances=1" "--execution-environment=gen1" \
            "--cpu-boost" "--ingress=all" "--allow-unauthenticated" \
            "--service-account=modulartess-admin-stg-run@modulartessweb-250f5.iam.gserviceaccount.com"; do
  expect_has "${OUT}" "${flag}" "deploy pasa ${flag}"
done
expect_has "${OUT}" "--update-env-vars=" "usa --update-env-vars"
expect_lacks "${OUT}" "--set-env-vars" "nunca usa --set-env-vars"
expect_has "${OUT}" "MODULARTESS_BACKEND_AUTH_MODE=google-oidc" "fija el modo google-oidc"
expect_lacks "${OUT}" "NEXT_PUBLIC_FIREBASE" "no pasa NEXT_PUBLIC_* como variable de runtime"
expect_lacks "${OUT}" "--set-secrets" "no monta secretos"
expect_lacks "${OUT}" "SERVICE_TOKEN" "no usa service token"

group "all: un único tag compartido"
OUT="$(sut all --firebase-env "${FB_GOOD}" --yes --dry-run)"; RC=$?
expect_ok "${RC}" "all en vista previa termina bien"
BUILD_TAG="$(printf '%s' "${OUT}" | sed -n 's/.*_TAG=\([a-z0-9-]*\).*/\1/p' | head -1)"
DEPLOY_TAG="$(printf '%s' "${OUT}" | sed -n 's|.*modulartess-admin:\([a-z0-9-]*\).*|\1|p' | head -1)"
if [ -n "${BUILD_TAG}" ] && [ "${BUILD_TAG}" = "${DEPLOY_TAG}" ]; then
  pass "build y deploy comparten el tag (${BUILD_TAG})"
else
  fail "build y deploy comparten el tag" "build='${BUILD_TAG}' deploy='${DEPLOY_TAG}'"
fi

group "verify"
OUT="$(sut verify)"; RC=$?
expect_ok "${RC}" "verify con todo correcto termina en 0"
expect_has "${OUT}" "La página de acceso responde 200" "comprueba la página de acceso"
expect_has "${OUT}" "sigue privado" "comprueba que el backend sigue privado"
expect_has "${OUT}" "401 session_required" "la sonda ficticia obtiene el resultado controlado"
expect_has "${OUT}" "NO sustituye la primera prueba manual" "advierte que no sustituye la prueba real"

OUT="$(SHIM_BACKEND_STATUS=200 sut verify)"; RC=$?
expect_fail "${RC}" "verify falla si el backend deja de ser privado"

OUT="$(SHIM_PROBE_STATUS=201 SHIM_PROBE_CODE= sut verify)"; RC=$?
expect_fail "${RC}" "verify falla si la credencial ficticia fuera aceptada"

OUT="$(SHIM_LOGIN_STATUS=500 sut verify)"; RC=$?
expect_fail "${RC}" "verify falla si la página de acceso no responde"

group "ADMIN_ORIGIN determinista"
OUT="$(sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_ok "${RC}" "el origen determinista versionado pasa el preflight"
expect_has "${OUT}" "Origen administrativo HTTPS y determinista" "lo valida como determinista"
expect_lacks "${OUT}" "skip-origin-check" "ya no existe el despliegue provisional"

set_admin_origin "https://modulartess-admin-staging-otrohash-ue.a.run.app"
OUT="$(sut_fixed preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "un origen que no es el determinista bloquea el preflight"
expect_has "${OUT}" "no es la URL determinista" "explica cuál se esperaba"

set_admin_origin "http://modulartess-admin-staging-651080070961.us-east1.run.app"
OUT="$(sut_fixed preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "un origen en http bloquea el preflight"

set_admin_origin "https://modulartess-admin-staging-651080070961.us-east1.run.app/panel"
OUT="$(sut_fixed preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "un origen con ruta bloquea el preflight"

set_admin_origin "https://modulartess-admin-staging-651080070961.us-east1.run.app/"
OUT="$(sut_fixed preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "un origen con barra final bloquea el preflight"

set_admin_origin "https://modulartess-admin-staging-651080070961.us-east1.run.app"

group "Ready: por tipo, no por posición"
OUT="$(sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_ok "${RC}" "acepta Ready=True aunque no sea la primera condición"

OUT="$(SHIM_READY_GCLOUD_FAILS=1 sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "un fallo de gcloud bloquea en lugar de pasar por vacío"
expect_has "${OUT}" "gcloud falló" "lo dice explícitamente"

OUT="$(SHIM_READY_ABSENT=1 sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "bloquea si no hay condición Ready"

OUT="$(SHIM_READY_DUPLICATE=1 sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "bloquea si hay dos condiciones Ready"
expect_has "${OUT}" "ambigua" "lo llama respuesta ambigua"

OUT="$(SHIM_READY_EMPTY=1 sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "bloquea si Ready viene vacío"

OUT="$(SHIM_READY_UNREADABLE=1 sut preflight --firebase-env "${FB_GOOD}")"; RC=$?
expect_fail "${RC}" "bloquea si la respuesta es ilegible"

group "deploy comprueba por su cuenta, sin depender de preflight"
OUT="$(SHIM_BACKEND_NOT_READY=1 sut deploy --yes)"; RC=$?
expect_fail "${RC}" "deploy bloquea si el backend no está Ready"
expect_lacks "${OUT}" "gcloud run deploy" "no llega a la mutación"

OUT="$(SHIM_BACKEND_PUBLIC=1 sut deploy --yes)"; RC=$?
expect_fail "${RC}" "deploy bloquea si el backend deja de ser privado"

OUT="$(SHIM_BINDING_CONDITIONAL=1 sut deploy --yes)"; RC=$?
expect_fail "${RC}" "deploy bloquea con un binding condicionado"

OUT="$(SHIM_READY_GCLOUD_FAILS=1 sut deploy --yes)"; RC=$?
expect_fail "${RC}" "deploy bloquea si gcloud falla al leer Ready"

set_admin_origin "https://otro.example.invalid"
OUT="$(sut_fixed deploy --yes --dry-run)"; RC=$?
expect_fail "${RC}" "deploy bloquea con un ADMIN_ORIGIN que no es el determinista"
set_admin_origin "https://modulartess-admin-staging-651080070961.us-east1.run.app"

group "los valores de Firebase nunca se imprimen"
FB_SENTINEL="${WORK}/sentinel.env"
cat > "${FB_SENTINEL}" <<'SENTINEL_EOF'
NEXT_PUBLIC_FIREBASE_API_KEY=CENTINELA-APIKEY-1a2b3c
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=CENTINELA-AUTHDOMAIN-4d5e6f
NEXT_PUBLIC_FIREBASE_PROJECT_ID=CENTINELA-PROJECTID-7g8h9i
NEXT_PUBLIC_FIREBASE_APP_ID=CENTINELA-APPID-0j1k2l
SENTINEL_EOF

for sub_cmd in "config" "preflight" "build --yes --dry-run" "deploy --yes --dry-run" "all --yes --dry-run"; do
  OUT="$(sut ${sub_cmd} --firebase-env "${FB_SENTINEL}")" || true
  LEAKED=""
  for centinela in CENTINELA-APIKEY-1a2b3c CENTINELA-AUTHDOMAIN-4d5e6f CENTINELA-PROJECTID-7g8h9i CENTINELA-APPID-0j1k2l; do
    case "${OUT}" in *"${centinela}"*) LEAKED="${LEAKED} ${centinela}" ;; esac
  done
  if [ -z "${LEAKED}" ]; then
    pass "${sub_cmd} no imprime ningún valor de Firebase"
  else
    fail "${sub_cmd} no imprime valores de Firebase" "filtrados:${LEAKED}"
  fi
done

OUT="$(sut build --yes --dry-run --firebase-env "${FB_SENTINEL}")"
expect_has "${OUT}" "_NEXT_PUBLIC_FIREBASE_API_KEY=<REDACTADO>" "la vista previa muestra marcadores redactados"
expect_has "${OUT}" "_TAG=git-abcdef123456" "y sí muestra las sustituciones públicas"

group ".gcloudignore"
GI="${REPO_ROOT}/.gcloudignore"
if [ -f "${GI}" ]; then pass ".gcloudignore existe"; else fail ".gcloudignore existe"; fi
for entry in ".env" ".env.*" ".git" "node_modules" ".next" "coverage" "*.pem" "*.key" "secrets" "*.log" "tmp"; do
  if grep -qxF "${entry}" "${GI}"; then pass ".gcloudignore excluye ${entry}"; else fail ".gcloudignore excluye ${entry}"; fi
done
for keep in "Dockerfile" "package.json" "pnpm-lock.yaml" "pnpm-workspace.yaml" ".npmrc" "next.config.ts" "tsconfig.json"; do
  if grep -qxF "${keep}" "${GI}"; then fail ".gcloudignore conserva ${keep}" "aparece como exclusión"; else pass ".gcloudignore conserva ${keep}"; fi
done

group "nunca claves JSON"
if grep -nE 'key-file|keys create|GOOGLE_APPLICATION_CREDENTIALS|\.json' "${TARGET}" >/dev/null; then
  fail "el script no menciona claves JSON" "$(grep -nE 'key-file|keys create|GOOGLE_APPLICATION_CREDENTIALS' "${TARGET}")"
else
  pass "el script no menciona claves JSON en ninguna forma"
fi

printf '\n\033[1m%s pruebas correctas, %s fallidas\033[0m\n' "${PASS}" "${FAIL}"
[ "${FAIL}" -eq 0 ]
