import { defineConfig } from 'vitest/config';

/**
 * Las pruebas de este repositorio son unitarias y puras: no arrancan Firebase, no abren red y no
 * usan credenciales. Por eso el entorno es `node` y no hace falta ningún fichero de arranque.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
