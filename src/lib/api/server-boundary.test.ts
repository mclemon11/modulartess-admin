import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * La frontera servidor/cliente se comprueba de forma **estática**, leyendo el código fuente.
 *
 * Es más fuerte que una prueba en tiempo de ejecución: no depende de cómo resuelve módulos el
 * ejecutor, y detecta una importación prohibida aunque nunca se ejecute esa rama.
 */

const SRC = 'src';

function sourceFiles(): readonly string[] {
  const found: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        found.push(full);
      }
    }
  }

  walk(SRC);

  return found;
}

const FILES = sourceFiles();

function isTest(path: string): boolean {
  return path.endsWith('.test.ts') || path.endsWith('.test.tsx');
}

/**
 * Solo el código de producción. Las pruebas quedan fuera a propósito: nombran lo prohibido para
 * poder comprobarlo, y si se incluyeran se detectarían a sí mismas.
 */
const PRODUCTION_FILES = FILES.filter((path) => !isTest(path));

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

const SERVER_ONLY_MODULES = [
  'src/lib/api/backend-client.ts',
  'src/lib/api/identity-token.ts',
  'src/app/api/admin/auth/session/route.ts',
];

describe('módulos server-only', () => {
  it.each(SERVER_ONLY_MODULES)("%s empieza con import 'server-only'", (path) => {
    const first = read(path)
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('import'));

    expect(first).toBe("import 'server-only';");
  });
});

describe('los Client Components no pueden alcanzar el backend', () => {
  const clientFiles = PRODUCTION_FILES.filter((path) => read(path).startsWith("'use client'"));

  it('hay Client Components que analizar', () => {
    expect(clientFiles.length).toBeGreaterThan(0);
  });

  it.each(['@/lib/api/backend-client', 'google-auth-library', 'openapi-fetch', 'server-only'])(
    'ningún Client Component importa %s',
    (specifier) => {
      for (const path of clientFiles) {
        expect(read(path), path).not.toContain(`from '${specifier}'`);
      }
    },
  );
});

describe('dependencias restringidas', () => {
  it('google-auth-library solo se importa desde el módulo de identity tokens', () => {
    const importers = PRODUCTION_FILES.filter((path) =>
      read(path).includes("from 'google-auth-library'"),
    );

    expect(importers).toEqual(['src/lib/api/identity-token.ts']);
  });

  it('openapi-fetch solo se importa desde el cliente server-only del backend', () => {
    const importers = PRODUCTION_FILES.filter((path) =>
      read(path).includes("from 'openapi-fetch'"),
    );

    expect(importers).toEqual(['src/lib/api/backend-client.ts']);
  });

  it('no hay firebase-admin, Firestore, Storage, Analytics ni Messaging en el código', () => {
    const forbidden = [
      'firebase-admin',
      'firebase/firestore',
      'firebase/storage',
      'firebase/analytics',
      'firebase/messaging',
      'getFirestore',
      'getStorage',
      'getAnalytics',
      'getMessaging',
    ];

    for (const path of PRODUCTION_FILES) {
      const source = read(path);

      for (const needle of forbidden) {
        expect(source, `${path} menciona ${needle}`).not.toContain(needle);
      }
    }
  });

  it('el SDK de Firebase solo se usa para app y auth', () => {
    const firebaseImports = new Set<string>();

    for (const path of PRODUCTION_FILES) {
      for (const match of read(path).matchAll(/from '(firebase\/[a-z-]+)'/g)) {
        const specifier = match[1];

        if (specifier !== undefined) {
          firebaseImports.add(specifier);
        }
      }
    }

    expect([...firebaseImports].sort()).toEqual(['firebase/app', 'firebase/auth']);
  });
});

describe('variables de entorno del backend', () => {
  it('ninguna usa el prefijo NEXT_PUBLIC_', () => {
    for (const path of PRODUCTION_FILES) {
      const source = read(path);

      expect(source, path).not.toMatch(/NEXT_PUBLIC_MODULARTESS/);
      expect(source, path).not.toMatch(/NEXT_PUBLIC_[A-Z_]*BACKEND/);
      expect(source, path).not.toMatch(/NEXT_PUBLIC_[A-Z_]*ADMIN_ORIGIN/);
    }
  });

  it('.env.example declara las cuatro server-only sin prefijo público y sin valores', () => {
    const example = readFileSync('.env.example', 'utf8');

    for (const name of [
      'MODULARTESS_BACKEND_URL',
      'MODULARTESS_BACKEND_AUTH_MODE',
      'MODULARTESS_BACKEND_AUDIENCE',
      'MODULARTESS_ADMIN_ORIGIN',
    ]) {
      expect(example).toContain(`\n${name}=\n`);
      expect(example).not.toContain(`NEXT_PUBLIC_${name}`);
    }
  });
});
