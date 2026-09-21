import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { isQuiet, readAttention } from './dashboard-attention';
import { readOperations, sharePercent, totalOf } from './dashboard-operations';

import type { DashboardAttention, DashboardOperations } from '@/lib/api/dashboard';

/**
 * La fotografía operativa y lo que requiere atención.
 *
 * Las dos son de **ahora mismo** y no del período. Lo que se comprueba aquí es que estén las ocho
 * y las cinco entradas que publica el contrato, que ninguna se sume ni se recalcule, y que
 * `failedNotifications` no acabe enlazando a una pantalla que no existe.
 */

type Contract = {
  readonly components: {
    readonly schemas: Record<
      string,
      { readonly properties?: Record<string, unknown>; readonly required?: readonly string[] }
    >;
  };
};

const CONTRACT = JSON.parse(readFileSync('openapi/backend-v1.json', 'utf8')) as Contract;

const OPERATIONS: DashboardOperations = {
  pendingPayment: 4,
  paymentProcessing: 1,
  paid: 2,
  preparing: 7,
  readyToShip: 3,
  shipped: 9,
  delivered: 21,
  cancelled: 5,
};

const ATTENTION: DashboardAttention = {
  pendingPayments: 2,
  staleProcessingPayments: 1,
  readyToShipOrders: 3,
  failedNotifications: 4,
  lowStockProducts: 5,
  paymentIncidents: 2,
};

describe('operación actual', () => {
  it('trae las ocho entradas que publica el contrato', () => {
    const published = Object.keys(
      CONTRACT.components.schemas.DashboardOperationsDto?.properties ?? {},
    );
    const shown = readOperations(OPERATIONS).map((entry) => entry.key);

    expect(shown).toHaveLength(8);
    expect([...shown].sort()).toEqual([...published].sort());
  });

  /* El orden es el del recorrido, con los pagos en curso donde ocurren: entre entrar y pagar. */
  it('las presenta en el orden operativo', () => {
    expect(readOperations(OPERATIONS).map((entry) => entry.key)).toEqual([
      'pendingPayment',
      'paymentProcessing',
      'paid',
      'preparing',
      'readyToShip',
      'shipped',
      'delivered',
      'cancelled',
    ]);
  });

  it('pinta el valor que mandó el backend, sin sumarlo ni recalcularlo', () => {
    for (const entry of readOperations(OPERATIONS)) {
      expect(entry.count, entry.key).toBe(OPERATIONS[entry.key]);
    }
  });

  /*
   * `paymentProcessing` es un estado del **pago**, no del pedido: el contrato avisa de que «a
   * payment in flight leaves the order in pending_payment». Compartir la escala del pedido lo haría
   * leer como un octavo estado del pedido, que no existe.
   */
  it('distingue el estado de pago del estado del pedido', () => {
    const entries = readOperations(OPERATIONS);
    const processing = entries.find((entry) => entry.key === 'paymentProcessing');

    expect(processing?.tone.kind).toBe('payment');
    expect(entries.filter((entry) => entry.tone.kind === 'order')).toHaveLength(7);
  });

  it('ninguna entrada queda sin nombre', () => {
    for (const entry of readOperations(OPERATIONS)) {
      expect(entry.label.length, entry.key).toBeGreaterThan(0);
      expect(entry.label, entry.key).not.toBe(entry.key);
    }
  });

  /* Un cero es información: la fila se muestra igual. */
  it('con todo en cero sigue mostrando las ocho', () => {
    const empty = Object.fromEntries(
      Object.keys(OPERATIONS).map((key) => [key, 0]),
    ) as unknown as DashboardOperations;

    expect(readOperations(empty)).toHaveLength(8);
  });
});

describe('proporciones de las barras', () => {
  it('reparte sobre el total recibido', () => {
    expect(sharePercent(1, 4)).toBe(25);
    expect(sharePercent(4, 4)).toBe(100);
  });

  /*
   * Con el total en cero no hay porcentaje que dibujar. Un «0 %» y una barra llena serían dos
   * formas distintas de afirmar algo que no se sabe.
   */
  it('con el total en cero no inventa ninguna', () => {
    expect(sharePercent(0, 0)).toBeNull();
    expect(sharePercent(3, 0)).toBeNull();
  });

  it('el total es la suma de lo recibido', () => {
    expect(totalOf([{ count: 2 }, { count: 3 }])).toBe(5);
    expect(totalOf([])).toBe(0);
  });
});

describe('requieren atención', () => {
  it('trae las seis entradas que publica el contrato', () => {
    const published = Object.keys(
      CONTRACT.components.schemas.DashboardAttentionDto?.properties ?? {},
    );
    const shown = readAttention(ATTENTION).map((entry) => entry.key);

    expect(shown).toHaveLength(6);
    expect([...shown].sort()).toEqual([...published].sort());
  });

  it('pinta el valor recibido en cada una', () => {
    for (const entry of readAttention(ATTENTION)) {
      expect(entry.count, entry.key).toBe(ATTENTION[entry.key]);
    }
  });

  /* Solo hay dos pantallas a las que llevar: el listado de pedidos y el de productos. */
  it('los enlaces apuntan únicamente a rutas que existen', () => {
    for (const entry of readAttention(ATTENTION)) {
      if (entry.href !== null) {
        expect(
          ['/panel/pedidos', '/panel/productos', '/panel/configuracion/integraciones/incidencias'],
          entry.key,
        ).toContain(entry.href);
      }
    }
  });

  it.each([
    ['pendingPayments', '/panel/pedidos'],
    ['staleProcessingPayments', '/panel/pedidos'],
    ['readyToShipOrders', '/panel/pedidos'],
    ['lowStockProducts', '/panel/productos'],
  ] as const)('%s lleva a %s', (key, href) => {
    expect(readAttention(ATTENTION).find((entry) => entry.key === key)?.href).toBe(href);
  });

  /*
   * La outbox no tiene superficie administrativa. Enlazar a una ruta inventada prometería una
   * pantalla que no existe, y un `href` a `/panel` sería peor: parecería un enlace roto.
   */
  it('las notificaciones fallidas no enlazan a ninguna parte, y se explica', () => {
    const entry = readAttention(ATTENTION).find((item) => item.key === 'failedNotifications');

    expect(entry?.href).toBeNull();
    expect(entry?.detail).toContain('outbox');
  });

  it('el inventario bajo aclara que las variantes no se cuentan', () => {
    const entry = readAttention(ATTENTION).find((item) => item.key === 'lowStockProducts');

    expect(entry?.detail).toContain('variante');
  });
});

describe('sin novedades', () => {
  const quiet: DashboardAttention = {
    pendingPayments: 0,
    staleProcessingPayments: 0,
    readyToShipOrders: 0,
    failedNotifications: 0,
    lowStockProducts: 0,
    paymentIncidents: 0,
  };

  it('todo en cero se declara como tal', () => {
    expect(isQuiet(quiet)).toBe(true);
  });

  it('una sola novedad ya no es silencio', () => {
    expect(isQuiet({ ...quiet, failedNotifications: 1 })).toBe(false);
    expect(isQuiet(ATTENTION)).toBe(false);
  });
});
