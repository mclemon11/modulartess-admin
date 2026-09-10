import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Las pruebas de este repositorio son unitarias: no arrancan Firebase, no abren red y no usan
 * credenciales. Por eso el entorno es `node`.
 *
 * `server-only` se sustituye por un módulo vacío. En un ejecutor de pruebas no existe la condición
 * `react-server`, así que el paquete real lanzaría al importarse desde cualquier módulo del BFF.
 * La barrera de servidor **no** se comprueba en tiempo de ejecución sino de forma estática, en
 * `src/lib/api/server-boundary.test.ts`, que es una garantía más fuerte: verifica el código fuente
 * en lugar de depender de cómo resuelve módulos el ejecutor.
 */
export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
