import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Comprobaciones del material de despliegue.
 *
 * El harness de bash (`deploy/staging.test.sh`) se ejecuta desde aquí para que `pnpm test` cubra
 * también el script de despliegue: si se rompe, falla la suite normal y no un comando que alguien
 * tiene que acordarse de lanzar.
 */

const DOCKERFILE = readFileSync('Dockerfile', 'utf8');
const DOCKERIGNORE = readFileSync('.dockerignore', 'utf8');
const CLOUDBUILD = readFileSync('deploy/cloudbuild.yaml', 'utf8');

/** Sin líneas de comentario: la documentación sí nombra `:latest` para explicar por qué se prohíbe. */
const CLOUDBUILD_CODE = CLOUDBUILD.split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');
const STAGING_SH = readFileSync('deploy/staging.sh', 'utf8');

const SERVER_ONLY_VARS = [
  'MODULARTESS_BACKEND_URL',
  'MODULARTESS_BACKEND_AUTH_MODE',
  'MODULARTESS_BACKEND_AUDIENCE',
  'MODULARTESS_ADMIN_ORIGIN',
] as const;

const PUBLIC_VARS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const;

describe('harness de deploy/staging.sh', () => {
  it('pasa entero, con shims y sin tocar la nube', () => {
    const result = spawnSync('bash', ['deploy/staging.test.sh'], { encoding: 'utf8' });

    if (result.status !== 0) {
      throw new Error(`El harness falló:\n${result.stdout}\n${result.stderr}`);
    }

    expect(result.stdout).toMatch(/0 fallidas/);
  }, 120_000);

  it('los dos scripts pasan bash -n', () => {
    for (const script of ['deploy/staging.sh', 'deploy/staging.test.sh']) {
      expect(spawnSync('bash', ['-n', script]).status, script).toBe(0);
    }
  });
});

describe('Dockerfile', () => {
  it('separa dependencias, build y runtime', () => {
    expect(DOCKERFILE).toMatch(/AS deps/);
    expect(DOCKERFILE).toMatch(/AS builder/);
    expect(DOCKERFILE).toMatch(/AS runner/);
  });

  it('bloquea las dependencias con el lockfile', () => {
    expect(DOCKERFILE).toContain('pnpm install --frozen-lockfile');
  });

  it('corre sin privilegios, con tini como PID 1 y en el puerto 8080', () => {
    expect(DOCKERFILE).toMatch(/^USER node$/m);
    expect(DOCKERFILE).toContain('ENTRYPOINT ["/sbin/tini", "--"]');
    expect(DOCKERFILE).toMatch(/PORT=8080/);
    expect(DOCKERFILE).toMatch(/^EXPOSE 8080$/m);
  });

  it('copia solo los artefactos de la salida standalone', () => {
    expect(DOCKERFILE).toContain('/app/.next/standalone');
    expect(DOCKERFILE).toContain('/app/.next/static');
    // El código fuente no se copia a la imagen final.
    expect(DOCKERFILE).not.toMatch(/COPY --from=builder[^\n]*\/app\/src/);
  });

  it('recibe las cuatro variables públicas como build args', () => {
    for (const name of PUBLIC_VARS) {
      expect(DOCKERFILE, name).toContain(`ARG ${name}`);
    }
  });

  it('no declara ninguna variable server-only como ARG ni ENV', () => {
    for (const name of SERVER_ONLY_VARS) {
      expect(DOCKERFILE, name).not.toMatch(new RegExp(`(ARG|ENV)\\s+${name}`));
    }
  });

  it('next.config declara la salida standalone', () => {
    expect(readFileSync('next.config.ts', 'utf8')).toContain("output: 'standalone'");
  });
});

describe('.gcloudignore', () => {
  const GCLOUDIGNORE = readFileSync('.gcloudignore', 'utf8').split('\n');

  it('excluye del archivo que gcloud sube lo que nunca debe salir de la máquina', () => {
    for (const entry of ['.env', '.env.*', '.git', 'node_modules', '.next', 'coverage']) {
      expect(GCLOUDIGNORE, entry).toContain(entry);
    }
  });

  it('excluye claves, logs y temporales', () => {
    for (const entry of ['*.pem', '*.key', 'secrets', '*.log', 'tmp', 'firebase-adminsdk*.json']) {
      expect(GCLOUDIGNORE, entry).toContain(entry);
    }
  });

  it('conserva lo que el build necesita', () => {
    for (const keep of [
      'Dockerfile',
      '.dockerignore',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.npmrc',
      'next.config.ts',
      'tsconfig.json',
      'src',
    ]) {
      expect(GCLOUDIGNORE, keep).not.toContain(keep);
    }
  });
});

describe('.dockerignore', () => {
  it('excluye el historial, las dependencias y los artefactos', () => {
    for (const entry of ['.git', 'node_modules', '.next', 'coverage', 'docs', 'deploy']) {
      expect(DOCKERIGNORE.split('\n'), entry).toContain(entry);
    }
  });

  it('excluye cualquier .env pero conserva la plantilla', () => {
    const lines = DOCKERIGNORE.split('\n');

    expect(lines).toContain('.env');
    expect(lines).toContain('.env.*');
    expect(lines).toContain('!.env.example');
  });

  it('excluye claves y credenciales', () => {
    for (const entry of ['*.pem', '*.key', 'secrets', 'firebase-adminsdk*.json']) {
      expect(DOCKERIGNORE.split('\n'), entry).toContain(entry);
    }
  });
});

describe('cloudbuild.yaml', () => {
  it('toda referencia de imagen usa el tag inmutable, nunca latest', () => {
    const references = CLOUDBUILD_CODE.match(/[\w.-]+docker\.pkg\.dev\/\S+/g) ?? [];

    expect(references.length).toBeGreaterThan(0);

    for (const reference of references) {
      expect(reference, reference).toMatch(/:\$\{_TAG\}$/);
      expect(reference, reference).not.toMatch(/:latest/);
    }
  });

  it('rechaza un tag vacío o el literal latest', () => {
    expect(CLOUDBUILD).toContain('El tag es obligatorio');
    expect(CLOUDBUILD).toMatch(/latest\)\s*echo/);
  });

  it('fija la región y pasa las cuatro variables públicas como build args', () => {
    expect(CLOUDBUILD).toContain('_REGION: us-east1');

    for (const name of PUBLIC_VARS) {
      expect(CLOUDBUILD, name).toContain(`--build-arg=${name}=`);
    }
  });

  it('no contiene secretos ni variables server-only', () => {
    expect(CLOUDBUILD).not.toMatch(/secretEnv|availableSecrets|SERVICE_TOKEN/);

    for (const name of SERVER_ONLY_VARS) {
      expect(CLOUDBUILD, name).not.toContain(name);
    }
  });

  it('documenta la deuda de cuenta de build dedicada y BuildKit', () => {
    expect(CLOUDBUILD).toMatch(/DEUDA TÉCNICA/);
    expect(CLOUDBUILD).toMatch(/BuildKit/);
    expect(CLOUDBUILD).toMatch(/cuenta de build dedicada|Cuenta de build dedicada/);
  });
});

describe('staging.sh', () => {
  it('usa --update-env-vars y nunca --set-env-vars', () => {
    expect(STAGING_SH).toContain('--update-env-vars=');
    expect(STAGING_SH).not.toContain('--set-env-vars');
  });

  it('no pasa NEXT_PUBLIC_* como variable de runtime de Cloud Run', () => {
    const deployBlock = STAGING_SH.slice(
      STAGING_SH.indexOf('run gcloud run deploy'),
      STAGING_SH.indexOf('ok "Despliegue solicitado'),
    );

    expect(deployBlock).not.toMatch(/NEXT_PUBLIC_/);

    for (const name of SERVER_ONLY_VARS) {
      expect(deployBlock, name).toContain(name);
    }
  });

  it('nunca hace source del archivo de configuración de Firebase', () => {
    // `source` ejecutaría el archivo. Se interpreta línea a línea.
    expect(STAGING_SH).not.toMatch(/source\s+"?\$\{?(file|FIREBASE_ENV_FILE)/);
    expect(STAGING_SH).toContain('load_firebase_config');
  });

  it('no usa claves JSON ni credenciales de cuenta de servicio', () => {
    expect(STAGING_SH).not.toMatch(/key-file|keys create|GOOGLE_APPLICATION_CREDENTIALS/);
  });
});

/**
 * El bundle del cliente no puede contener ninguna variable server-only.
 *
 * Requiere una compilación previa: `pnpm build` deja `.next/static`. Se omite si no existe, en
 * lugar de fallar, porque `pnpm test` debe poder correr en un árbol recién clonado; la garantía
 * estática equivalente sobre el código fuente vive en `src/lib/api/server-boundary.test.ts`.
 */
const STATIC_DIR = '.next/static';
const hasBuild = existsSync(STATIC_DIR);

function readAllFiles(dir: string): string {
  let joined = '';

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    joined += statSync(full).isDirectory() ? readAllFiles(full) : readFileSync(full, 'latin1');
  }

  return joined;
}

describe.skipIf(!hasBuild)('bundle del cliente (requiere pnpm build previo)', () => {
  const bundle = hasBuild ? readAllFiles(STATIC_DIR) : '';

  it.each(SERVER_ONLY_VARS)('no contiene %s', (name) => {
    expect(bundle).not.toContain(name);
  });

  it('no contiene la URL del backend ni el nombre del encabezado interno', () => {
    expect(bundle).not.toContain('modulartess-backend-staging');
    expect(bundle).not.toContain('x-modulartess-admin-session');
  });

  it('no contiene rastros de credenciales de servicio', () => {
    expect(bundle).not.toMatch(/private_key|client_email|BEGIN [A-Z ]*PRIVATE KEY/);
  });
});
