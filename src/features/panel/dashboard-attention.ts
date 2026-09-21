/**
 * Lo que requiere atención ahora mismo.
 *
 * Cinco contadores que el contrato publica y **ninguno** más. Cada uno dice qué mirar, y solo tres
 * de ellos pueden llevar a algún sitio: el listado de pedidos y el de productos. Para
 * `failedNotifications` no hay pantalla porque no hay superficie contractual de la outbox, y en vez
 * de inventarla se dice.
 *
 * Tampoco hay botones «Resolver», «Reintentar» ni «Ver notificaciones»: esos endpoints no existen,
 * y un botón que no llama a nada es peor que el hueco que deja.
 *
 * Módulo puro.
 */

import type { DashboardAttention } from '@/lib/api/dashboard';

export type AttentionEntry = {
  readonly key: keyof DashboardAttention;
  readonly label: string;
  /** Por qué esto pide una mirada. Una línea, sin cifras inventadas. */
  readonly detail: string;
  readonly count: number;
  /** A dónde lleva, o `null` cuando el contrato no publica ninguna pantalla para ello. */
  readonly href: string | null;
  readonly tone: 'warning' | 'danger' | 'brand';
};

const ENTRIES: readonly {
  readonly key: keyof DashboardAttention;
  readonly label: string;
  readonly detail: string;
  readonly href: string | null;
  readonly tone: AttentionEntry['tone'];
}[] = [
  {
    key: 'pendingPayments',
    label: 'Pagos pendientes',
    detail: 'Pedidos que llevan más de 24 horas esperando el pago.',
    href: '/panel/pedidos',
    tone: 'warning',
  },
  {
    key: 'staleProcessingPayments',
    label: 'Pagos procesándose',
    detail:
      'Llevan más de 30 minutos en curso: el desenlace no llegó y alguien espera sin saber si pagó.',
    href: '/panel/pedidos',
    tone: 'danger',
  },
  {
    key: 'readyToShipOrders',
    label: 'Listos para envío',
    detail: 'Terminados y esperando al transportador.',
    href: '/panel/pedidos',
    tone: 'brand',
  },
  {
    key: 'failedNotifications',
    label: 'Notificaciones por revisar',
    detail:
      'Avisos que agotaron sus intentos. El detalle estará disponible cuando el contrato publique una superficie para la outbox.',
    // Sin pantalla: la outbox no tiene endpoint administrativo, y enlazar a una ruta inventada
    // sería prometer algo que no existe.
    href: null,
    tone: 'danger',
  },
  {
    key: 'paymentIncidents',
    label: 'Incidencias de pago',
    detail:
      'Eventos con firma válida cuyos datos comerciales no cuadran: monto, moneda o referencia. Es una inconsistencia real entre lo que se cobró y lo que creemos haber cobrado.',
    href: '/panel/configuracion/integraciones/incidencias',
    tone: 'danger',
  },
  {
    key: 'lowStockProducts',
    label: 'Inventario bajo',
    detail:
      'Productos activos en su umbral o por debajo. Los que venden por variante no se cuentan: el modelo no guarda un umbral por variante.',
    href: '/panel/productos',
    tone: 'warning',
  },
];

export function readAttention(attention: DashboardAttention): readonly AttentionEntry[] {
  return ENTRIES.map((entry) => ({
    key: entry.key,
    label: entry.label,
    detail: entry.detail,
    count: attention[entry.key],
    href: entry.href,
    tone: entry.tone,
  }));
}

/** ¿Está todo en cero? Entonces la tarjeta dice «Sin novedades» en lugar de cinco ceros. */
export function isQuiet(attention: DashboardAttention): boolean {
  return readAttention(attention).every((entry) => entry.count === 0);
}
