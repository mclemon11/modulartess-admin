# Imagen de producción del panel administrativo de Modulartess.
#
# Multi-stage con tres etapas separadas a propósito:
#
#   deps     Solo instala dependencias. Es la capa que más se reutiliza entre builds.
#   builder  Compila Next.js. Aquí —y solo aquí— entran las cuatro NEXT_PUBLIC_FIREBASE_*.
#   runner   Imagen final: la salida `standalone`, un usuario sin privilegios y nada más.
#
# Lo que NO entra en la imagen final: el código fuente, las dependencias de desarrollo, el
# historial de Git, la documentación ni ningún archivo `.env`.
#
# Las variables server-only (MODULARTESS_*) **no** se declaran como build args. Se inyectan en
# Cloud Run en tiempo de ejecución: si llegaran al build no cambiarían el bundle del cliente
# —Next.js solo sustituye las `NEXT_PUBLIC_*`—, pero quedarían escritas en una capa de la imagen.

# ------------------------------------------------------------------ deps
FROM node:22-alpine AS deps

WORKDIR /app

# Corepack fija la versión de pnpm que declara `packageManager`, sin instalarla a mano.
RUN corepack enable

# Solo los manifiestos: cambiar el código fuente no invalida esta capa.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# `--frozen-lockfile` falla si el lockfile no concuerda con `package.json`. Un build reproducible
# nunca debe resolver versiones nuevas por su cuenta.
RUN pnpm install --frozen-lockfile

# --------------------------------------------------------------- builder
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

# Identificadores públicos del cliente Firebase. Son públicos por diseño —viajan al navegador en
# el bundle—, pero sus valores no están versionados: los aporta quien construye.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID

ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

# ---------------------------------------------------------------- runner
FROM node:22-alpine AS runner

WORKDIR /app

# `tini` como PID 1: reenvía SIGTERM al proceso de Node y recoge los procesos huérfanos. Sin él,
# Node arranca como PID 1 y en esa posición ignora las señales por defecto, así que Cloud Run
# tendría que matar el contenedor por tiempo en cada revisión que retira.
RUN apk add --no-cache tini

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0

# Usuario sin privilegios. La imagen `node` ya trae `node` (uid 1000); se reutiliza en lugar de
# crear otro.
USER node

# Solo los artefactos que el runtime necesita. `standalone` ya incluye el `server.js` y las
# dependencias de producción que el grafo alcanza de verdad; `static` va aparte porque Next.js lo
# deja fuera de esa carpeta.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
