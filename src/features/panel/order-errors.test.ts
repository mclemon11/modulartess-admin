import { describe, expect, it } from 'vitest';

import { describeOrderBackendFailure, ORDER_MESSAGES } from './order-errors';
import { describeBackendFailure } from './catalog-errors';

/**
 * Pedidos y catálogo hablan de cosas distintas.
 *
 * En el despliegue, un `404` de pedidos se tradujo con el mapa del catálogo y la pantalla dijo «Ese
 * producto ya no existe». Estas comprobaciones fijan la separación y el matiz del `404` según dónde
 * ocurra.
 */
describe('mensajes de pedidos', () => {
  it('un 404 del detalle dice que el pedido no existe', () => {
    expect(describeOrderBackendFailure('backend_not_found', 'detail')).toBe(
      'Ese pedido ya no existe.',
    );
  });

  it('un 404 del listado se lee como superficie no disponible', () => {
    // Un listado no representa un pedido concreto: que no esté no significa que falte un pedido.
    expect(describeOrderBackendFailure('backend_not_found', 'list')).toBe(
      ORDER_MESSAGES.admin_surface_disabled,
    );
  });

  it('nunca devuelve un mensaje del catálogo', () => {
    const codes = [
      'backend_not_found',
      'backend_conflict',
      'backend_unauthorized',
      'backend_unavailable',
    ] as const;

    for (const code of codes) {
      for (const scope of ['list', 'detail'] as const) {
        const message = describeOrderBackendFailure(code, scope);

        expect(message).not.toContain('producto');
        expect(message).not.toBe(describeBackendFailure('backend_not_found'));
      }
    }
  });
});
