/**
 * Geometría del gráfico de ventas aprobadas.
 *
 * Es un módulo puro a propósito: la parte del gráfico que puede estar mal —una división por cero,
 * un punto fuera del lienzo, un eje que miente— se comprueba aquí sin renderizar nada. Lo que
 * dibuja el SVG no es más que una lista de coordenadas.
 *
 * Decisiones que el contrato impone y que aquí se respetan:
 *
 * - **Todos los puntos se conservan.** El backend manda un punto por día de calendario, «days with
 *   no activity are present with zeros and are never omitted». Agrupar o muestrear para que quepa
 *   cambiaría las cifras; lo que se reduce son las **etiquetas**, no los datos.
 * - **Las fechas van como vienen.** Ya llegan en orden ascendente y en día colombiano. Reordenarlas
 *   aquí solo podría estropearlas.
 * - **Nunca se divide por cero.** Una serie entera en cero, o un solo día, son estados normales de
 *   una tienda y tienen que dibujarse, no romperse.
 */

import type { DashboardSeriesPoint } from '@/lib/api/dashboard';

/** Lienzo en unidades del `viewBox`. El SVG se escala con `preserveAspectRatio`, no con píxeles. */
export const CHART_WIDTH = 720;
export const CHART_HEIGHT = 220;
/** Aire para que la línea no toque los bordes y el área tenga suelo visible. */
const PADDING_TOP = 12;
const PADDING_BOTTOM = 8;

export type ChartPoint = {
  readonly date: string;
  readonly amountCop: number;
  readonly approvedOrders: number;
  readonly x: number;
  readonly y: number;
};

export type ChartGeometry = {
  readonly points: readonly ChartPoint[];
  /** Polilínea de la serie. Vacía solo si no hay ni un punto. */
  readonly linePath: string;
  /** El área bajo la línea, cerrada contra el suelo. */
  readonly areaPath: string;
  /** El importe más alto de la serie. Cero cuando no hubo ninguna venta. */
  readonly maxAmountCop: number;
  /** `true` cuando no hubo ni un peso aprobado en todo el período. */
  readonly empty: boolean;
  readonly width: number;
  readonly height: number;
};

/** Coordenada X del punto `index` de `total`. Un único punto se dibuja centrado. */
function xFor(index: number, total: number): number {
  if (total <= 1) {
    return CHART_WIDTH / 2;
  }

  return (index * CHART_WIDTH) / (total - 1);
}

/**
 * Coordenada Y de un importe.
 *
 * Con la serie entera en cero, `max` es cero: se apoya todo en el suelo en lugar de dividir por
 * cero. Es el dibujo correcto —no hubo ventas— y además el único que no produce `NaN`.
 */
function yFor(amount: number, max: number): number {
  const floor = CHART_HEIGHT - PADDING_BOTTOM;

  if (max <= 0) {
    return floor;
  }

  const usable = floor - PADDING_TOP;

  return floor - (amount / max) * usable;
}

/** Redondea a dos decimales: suficiente para el lienzo y mantiene el marcado legible. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildChartGeometry(series: readonly DashboardSeriesPoint[]): ChartGeometry {
  const maxAmountCop = series.reduce((max, point) => Math.max(max, point.approvedAmountCop), 0);

  const points = series.map((point, index) => ({
    date: point.date,
    amountCop: point.approvedAmountCop,
    approvedOrders: point.approvedOrders,
    x: round(xFor(index, series.length)),
    y: round(yFor(point.approvedAmountCop, maxAmountCop)),
  }));

  const linePath = points.map((point) => `${point.x},${point.y}`).join(' ');

  const floor = CHART_HEIGHT - PADDING_BOTTOM;
  const first = points[0];
  const last = points[points.length - 1];

  const areaPath =
    first === undefined || last === undefined
      ? ''
      : `${first.x},${floor} ${linePath} ${last.x},${floor}`;

  return {
    points,
    linePath,
    areaPath,
    maxAmountCop,
    empty: maxAmountCop === 0,
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
  };
}

/**
 * Qué días llevan etiqueta bajo el eje.
 *
 * Con 92 días no caben 92 etiquetas: se solaparían hasta ser ilegibles, que es peor que no
 * ponerlas. Se eligen como mucho `max` repartidas por igual, **siempre incluyendo la primera y la
 * última**, que son las que delimitan el período. Los puntos no se tocan: esto solo decide qué se
 * escribe debajo.
 */
export function visibleTickIndexes(total: number, max = 6): readonly number[] {
  if (total <= 0) {
    return [];
  }

  if (total <= max) {
    return Array.from({ length: total }, (_unused, index) => index);
  }

  const step = (total - 1) / (max - 1);
  const chosen = new Set<number>();

  for (let slot = 0; slot < max; slot += 1) {
    chosen.add(Math.round(slot * step));
  }

  return [...chosen].sort((left, right) => left - right);
}

/** Total de pedidos aprobados de la serie. Es una suma de la propia serie, no una cifra nueva. */
export function seriesApprovedOrders(series: readonly DashboardSeriesPoint[]): number {
  return series.reduce((total, point) => total + point.approvedOrders, 0);
}

/** Total de pedidos creados de la serie, que el contrato publica por día. */
export function seriesCreatedOrders(series: readonly DashboardSeriesPoint[]): number {
  return series.reduce((total, point) => total + point.createdOrders, 0);
}
