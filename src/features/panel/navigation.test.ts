import { describe, expect, it } from 'vitest';

import { isActive, NAVIGATION, navigationFor } from './navigation';

/**
 * La navegación es un acuerdo, no una lista que crece sola: ocho entradas, en este orden. Si
 * alguien añade una novena —o quita una— esta prueba lo dice antes de que llegue a la barra
 * lateral. «Usuarios» solo la ve quien tiene `admin_users.read`, y «Bandeja», quien tiene
 * `communications.read`.
 */
describe('navegación del panel', () => {
  it('tiene exactamente las ocho entradas acordadas, en orden', () => {
    expect(NAVIGATION.map((item) => [item.label, item.href])).toEqual([
      ['Dashboard', '/panel'],
      ['Pedidos', '/panel/pedidos'],
      ['Bandeja', '/panel/bandeja'],
      ['Productos', '/panel/productos'],
      ['Envíos', '/panel/envios'],
      ['Wallet', '/panel/wallet'],
      ['Usuarios', '/panel/usuarios'],
      ['Configuración', '/panel/configuracion'],
    ]);
  });

  it('«Usuarios» solo aparece con admin_users.read', () => {
    const hrefs = (role: string) => navigationFor(role).map((item) => item.href);

    expect(hrefs('super_admin')).toContain('/panel/usuarios');
    expect(hrefs('master_admin')).toContain('/panel/usuarios');
    expect(hrefs('moderator')).not.toContain('/panel/usuarios');
    expect(hrefs('rol_desconocido')).not.toContain('/panel/usuarios');
    // Tampoco ve la bandeja; el resto de entradas no depende del rol.
    expect(hrefs('moderator')).toHaveLength(NAVIGATION.length - 2);
  });

  it('«Bandeja» solo aparece con communications.read', () => {
    const hrefs = (role: string) => navigationFor(role).map((item) => item.href);

    expect(hrefs('super_admin')).toContain('/panel/bandeja');
    expect(hrefs('master_admin')).toContain('/panel/bandeja');
    expect(hrefs('moderator')).not.toContain('/panel/bandeja');
    expect(hrefs('rol_desconocido')).not.toContain('/panel/bandeja');
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
    expect(isActive('/panel/configuracion', '/panel/configuracion/integraciones/wompi')).toBe(true);
  });
});
