import { describe, expect, it } from 'vitest';

import { isActive, NAVIGATION } from './navigation';

/**
 * La navegación es un acuerdo, no una lista que crece sola: cinco entradas, en este orden. Si
 * alguien añade una sexta —o quita una— esta prueba lo dice antes de que llegue a la barra lateral.
 */
describe('navegación del panel', () => {
  it('tiene exactamente las cinco entradas acordadas, en orden', () => {
    expect(NAVIGATION.map((item) => [item.label, item.href])).toEqual([
      ['Dashboard', '/panel'],
      ['Pedidos', '/panel/pedidos'],
      ['Productos', '/panel/productos'],
      ['Envíos', '/panel/envios'],
      ['Wallet', '/panel/wallet'],
    ]);
  });

  it('cada entrada declara su icono', () => {
    for (const item of NAVIGATION) {
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });

  it('resalta la sección de una subruta, y «Dashboard» solo en su ruta exacta', () => {
    expect(isActive('/panel/productos', '/panel/productos/prd_1')).toBe(true);
    expect(isActive('/panel/pedidos', '/panel/pedidos/ord_1')).toBe(true);
    expect(isActive('/panel', '/panel')).toBe(true);
    expect(isActive('/panel', '/panel/envios')).toBe(false);
  });
});
