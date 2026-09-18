import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';

/**
 * La raíz del panel.
 *
 * `/` fue durante dos fases una portada técnica que enumeraba como «pendiente» lo que ya estaba
 * implementado. Estas pruebas cubren las dos mitades del cambio: que la redirección existe y
 * apunta a `/panel`, y que la portada no puede volver por descuido.
 *
 * La comprobación es estática —se lee la configuración y el código fuente— por el mismo motivo que
 * en `server-boundary.test.ts`: no depende de arrancar un servidor, y una regresión se detecta
 * aunque nadie visite la ruta.
 */

type Redirect = {
  readonly source: string;
  readonly destination: string;
  readonly permanent: boolean;
};

async function redirects(): Promise<readonly Redirect[]> {
  const { redirects: declared } = nextConfig;

  if (typeof declared !== 'function') {
    throw new Error('next.config.ts no declara redirects().');
  }

  return (await declared()) as readonly Redirect[];
}

describe('destino de la raíz', () => {
  it('redirige `/` a `/panel`', async () => {
    const root = (await redirects()).filter((entry) => entry.source === '/');

    expect(root).toHaveLength(1);
    expect(root[0]?.destination).toBe('/panel');
  });

  /**
   * Temporal, no permanente: un `308` lo cachea el navegador de forma indefinida y dejaría `/`
   * secuestrado si algún día tuviera contenido propio.
   */
  it('usa una redirección temporal', async () => {
    const root = (await redirects()).find((entry) => entry.source === '/');

    expect(root?.permanent).toBe(false);
  });

  /**
   * La autorización no se duplica aquí. `/panel` ya resuelve la sesión con `resolvePanelSession`,
   * y su layout decide entre el login, la limpieza de cookie y `PanelUnavailable`. Una condición
   * de sesión en esta redirección sería una segunda frontera que podría contradecir a la primera.
   */
  it('no condiciona la redirección a la sesión', async () => {
    const root = (await redirects()).find((entry) => entry.source === '/');

    expect(root).not.toHaveProperty('has');
    expect(root).not.toHaveProperty('missing');
  });
});

describe('la portada obsoleta no vuelve', () => {
  it('no hay página ni estilos en la raíz de `app`', () => {
    expect(existsSync('src/app/page.tsx')).toBe(false);
    expect(existsSync('src/app/page.module.css')).toBe(false);
  });

  it('su copy técnico no queda en ningún archivo del repositorio', () => {
    const offenders = sourceFiles().filter(
      (path) =>
        path !== 'src/app/root-redirect.test.ts' &&
        OBSOLETE.some((copy) => readFileSync(path, 'utf8').includes(copy)),
    );

    expect(offenders).toEqual([]);
  });
});

/** Frases de la portada retirada. Afirmaban como pendiente lo que ya está implementado. */
const OBSOLETE = [
  'Panel administrativo en configuración',
  'todavía no expone funcionalidad',
  'Catálogo, pedidos e inventario',
] as const;

function sourceFiles(): readonly string[] {
  const found: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
        found.push(full);
      }
    }
  }

  walk('src');

  return found;
}
