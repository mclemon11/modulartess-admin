import { describe, expect, it } from 'vitest';

import {
  buildChartGeometry,
  CHART_HEIGHT,
  CHART_WIDTH,
  seriesApprovedOrders,
  seriesCreatedOrders,
  visibleTickIndexes,
} from './dashboard-chart';

import type { DashboardSeriesPoint } from '@/lib/api/dashboard';

/**
 * La geometría del gráfico.
 *
 * Aquí vive lo que puede romper un gráfico sin que nada parezca roto: una división por cero, un
 * punto fuera del lienzo o una serie que se recorta para «que quepa». Las tres se comprueban sin
 * renderizar nada.
 */

function point(date: string, amountCop: number, approved = 0, created = 0): DashboardSeriesPoint {
  return {
    date,
    approvedAmountCop: amountCop,
    approvedOrders: approved,
    createdOrders: created,
  } as DashboardSeriesPoint;
}

/** Una serie de `days` días consecutivos, con el importe que decida `amountFor`. */
function series(days: number, amountFor: (index: number) => number): DashboardSeriesPoint[] {
  return Array.from({ length: days }, (_unused, index) => {
    const day = String(index + 1).padStart(2, '0');

    return point(`2026-09-${day}`, amountFor(index), index, index);
  });
}

describe('serie normal', () => {
  const geometry = buildChartGeometry([
    point('2026-09-01', 0),
    point('2026-09-02', 500000),
    point('2026-09-03', 1000000),
  ]);

  it('conserva un punto por día', () => {
    expect(geometry.points).toHaveLength(3);
    expect(geometry.points.map((item) => item.date)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
  });

  it('reparte el eje horizontal de borde a borde', () => {
    expect(geometry.points[0]?.x).toBe(0);
    expect(geometry.points[2]?.x).toBe(CHART_WIDTH);
  });

  it('el importe mayor queda arriba y el cero en el suelo', () => {
    const [first, , last] = geometry.points;

    expect(last?.y).toBeLessThan(first?.y ?? 0);
    expect(geometry.maxAmountCop).toBe(1000000);
    expect(geometry.empty).toBe(false);
  });

  it('el área se cierra contra el suelo', () => {
    expect(geometry.areaPath.startsWith('0,')).toBe(true);
    expect(geometry.areaPath.endsWith(`${CHART_WIDTH},${CHART_HEIGHT - 8}`)).toBe(true);
  });
});

describe('todos los valores en cero', () => {
  /* Una tienda sin ventas en el período es un estado normal, no un error de carga. */
  const geometry = buildChartGeometry(series(7, () => 0));

  it('no divide por cero: no produce NaN en ninguna coordenada', () => {
    for (const item of geometry.points) {
      expect(Number.isFinite(item.x), item.date).toBe(true);
      expect(Number.isFinite(item.y), item.date).toBe(true);
    }
  });

  it('apoya toda la línea en el suelo', () => {
    const floors = new Set(geometry.points.map((item) => item.y));

    expect(floors.size).toBe(1);
    expect([...floors][0]).toBe(CHART_HEIGHT - 8);
  });

  it('lo declara para que la pantalla pueda decirlo', () => {
    expect(geometry.empty).toBe(true);
    expect(geometry.maxAmountCop).toBe(0);
  });
});

describe('un solo día', () => {
  /* `period=today` produce exactamente un punto. Dividir entre `total - 1` daría `Infinity`. */
  const geometry = buildChartGeometry([point('2026-09-19', 450000)]);

  it('lo dibuja centrado, sin dividir por cero', () => {
    expect(geometry.points).toHaveLength(1);
    expect(geometry.points[0]?.x).toBe(CHART_WIDTH / 2);
    expect(Number.isFinite(geometry.points[0]?.y ?? Number.NaN)).toBe(true);
  });

  it('el área sigue cerrando contra el suelo', () => {
    expect(geometry.areaPath.length).toBeGreaterThan(0);
  });
});

describe('serie vacía', () => {
  it('no produce trazos que dibujar', () => {
    const geometry = buildChartGeometry([]);

    expect(geometry.points).toEqual([]);
    expect(geometry.linePath).toBe('');
    expect(geometry.areaPath).toBe('');
    expect(geometry.empty).toBe(true);
  });
});

describe('serie larga', () => {
  /* El máximo del contrato para un rango personalizado son 92 días. */
  const geometry = buildChartGeometry(series(92, (index) => index * 10000));

  it('conserva los 92 puntos: no se agrupa ni se muestrea', () => {
    expect(geometry.points).toHaveLength(92);
  });

  it('ningún punto se sale del lienzo', () => {
    for (const item of geometry.points) {
      expect(item.x, item.date).toBeGreaterThanOrEqual(0);
      expect(item.x, item.date).toBeLessThanOrEqual(CHART_WIDTH);
      expect(item.y, item.date).toBeGreaterThanOrEqual(0);
      expect(item.y, item.date).toBeLessThanOrEqual(CHART_HEIGHT);
    }
  });

  /* Lo que se reduce son las **etiquetas**, no los datos. */
  it('escribe como mucho seis fechas bajo el eje', () => {
    const ticks = visibleTickIndexes(92);

    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(91);
  });
});

describe('etiquetas del eje', () => {
  it('con pocos días las escribe todas', () => {
    expect(visibleTickIndexes(4)).toEqual([0, 1, 2, 3]);
  });

  it('siempre incluye la primera y la última: son las que delimitan el período', () => {
    for (const total of [7, 30, 31, 45, 92]) {
      const ticks = visibleTickIndexes(total);

      expect(ticks[0], String(total)).toBe(0);
      expect(ticks[ticks.length - 1], String(total)).toBe(total - 1);
    }
  });

  it('van en orden y sin repetirse', () => {
    const ticks = visibleTickIndexes(30);

    expect([...ticks].sort((left, right) => left - right)).toEqual([...ticks]);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it('una serie vacía no produce etiquetas', () => {
    expect(visibleTickIndexes(0)).toEqual([]);
  });
});

describe('el orden de las fechas', () => {
  /* Llegan ascendentes del backend. Reordenarlas aquí solo podría estropearlas. */
  it('se conserva tal como viene', () => {
    const given = [point('2026-09-03', 1), point('2026-09-01', 2), point('2026-09-02', 3)];

    expect(buildChartGeometry(given).points.map((item) => item.date)).toEqual([
      '2026-09-03',
      '2026-09-01',
      '2026-09-02',
    ]);
  });
});

describe('totales de contexto', () => {
  const given = [point('2026-09-01', 0, 2, 5), point('2026-09-02', 100, 3, 1)];

  it('suman lo que trae la propia serie', () => {
    expect(seriesApprovedOrders(given)).toBe(5);
    expect(seriesCreatedOrders(given)).toBe(6);
  });

  it('una serie vacía suma cero, no NaN', () => {
    expect(seriesApprovedOrders([])).toBe(0);
    expect(seriesCreatedOrders([])).toBe(0);
  });
});
