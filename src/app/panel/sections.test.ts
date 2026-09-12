import { describe, expect, it } from 'vitest';

import { NAVIGATION } from '@/features/panel/navigation';

/**
 * Ninguna entrada de la barra lateral puede llevar a un 404.
 *
 * Envíos y Wallet todavía no tienen contrato, pero sí pantalla: se comprueba que el módulo de cada
 * ruta existe y exporta un componente. Es lo que distingue «anunciado» de «roto».
 */
describe('rutas de las secciones anunciadas', () => {
  it.each([
    ['/panel/envios', () => import('./envios/page')],
    ['/panel/wallet', () => import('./wallet/page')],
  ])('%s tiene página', async (_href, load) => {
    const page = await load();

    expect(typeof page.default).toBe('function');
  });

  it('las rutas con página son exactamente las que lista la navegación', () => {
    expect(NAVIGATION.map((item) => item.href)).toContain('/panel/envios');
    expect(NAVIGATION.map((item) => item.href)).toContain('/panel/wallet');
  });
});
