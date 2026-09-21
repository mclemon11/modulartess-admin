import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PERIOD,
  DEFAULT_PERIOD_HREF,
  describePeriod,
  firstValue,
  isActivePeriod,
  periodHref,
  PERIOD_KINDS,
  QUICK_PERIODS,
  readDashboardRequest,
} from './dashboard-period';

/**
 * El período del dashboard vive en la URL.
 *
 * Lo que se comprueba aquí es que un enlace escrito a mano no pueda romper la pantalla ni mandar al
 * backend una consulta que el contrato rechaza. En particular: nada de fechas calculadas en el
 * panel, y `from`/`to` solo con `custom`.
 */

type Contract = {
  readonly components: {
    readonly schemas: Record<
      string,
      { readonly properties?: Record<string, { readonly enum?: readonly string[] }> }
    >;
  };
};

const CONTRACT = JSON.parse(readFileSync('openapi/backend-v1.json', 'utf8')) as Contract;

const PUBLISHED: readonly string[] =
  CONTRACT.components.schemas.DashboardPeriodDto?.properties?.kind?.enum ?? [];

describe('los períodos del contrato', () => {
  it('el panel ofrece exactamente los que OpenAPI publica', () => {
    expect(PUBLISHED).toEqual(['today', '7d', '30d', 'custom']);
    expect([...PERIOD_KINDS]).toEqual([...PUBLISHED]);
  });

  it('cada uno tiene su nombre en español', () => {
    for (const kind of PERIOD_KINDS) {
      expect(describePeriod(kind), kind).not.toBe(kind);
    }
  });

  /* `custom` no es un botón: tiene su propio formulario con dos fechas. */
  it('los botones rápidos son los tres sin fechas', () => {
    expect([...QUICK_PERIODS]).toEqual(['today', '7d', '30d']);
  });
});

describe('valor por defecto', () => {
  it('es 30 días', () => {
    expect(DEFAULT_PERIOD).toBe('30d');
    expect(readDashboardRequest({}).period).toBe('30d');
    expect(DEFAULT_PERIOD_HREF).toBe('/panel?period=30d');
  });

  /* Una URL escrita a mano no debe romper la pantalla ni gastar un `400` del backend. */
  it.each(['mensual', '', 'TODAY', '90d', 'custom '])(
    'un period %o desconocido cae en el valor por defecto',
    (period) => {
      expect(readDashboardRequest({ period }).period).toBe('30d');
    },
  );
});

describe('períodos predefinidos', () => {
  it.each(['today', '7d', '30d'] as const)('%s se lee tal cual', (period) => {
    expect(readDashboardRequest({ period })).toEqual({ period, rawFrom: '', rawTo: '' });
  });

  /*
   * El contrato responde `400` si `from`/`to` llegan con un período que no es `custom`. Se
   * descartan aquí para que una URL con restos de un rango anterior no rompa la consulta.
   */
  it.each(['today', '7d', '30d'] as const)('%s descarta las fechas que le lleguen', (period) => {
    const request = readDashboardRequest({ period, from: '2026-09-01', to: '2026-09-19' });

    expect(request.from).toBeUndefined();
    expect(request.to).toBeUndefined();
  });
});

describe('rango personalizado', () => {
  it('conserva from y to con la forma de un día de calendario', () => {
    expect(
      readDashboardRequest({ period: 'custom', from: '2026-09-01', to: '2026-09-19' }),
    ).toEqual({
      period: 'custom',
      from: '2026-09-01',
      to: '2026-09-19',
      rawFrom: '2026-09-01',
      rawTo: '2026-09-19',
    });
  });

  /*
   * Solo se comprueba la **forma**. Que el día exista, que el rango no esté invertido y que no
   * supere el máximo lo decide el backend: una segunda implementación acabaría discrepando.
   */
  it.each(['ayer', '2026-9-1', '20260901', '2026-09-01T00:00:00Z', ''])(
    'descarta %o, que ni siquiera parece una fecha',
    (from) => {
      expect(
        readDashboardRequest({ period: 'custom', from, to: '2026-09-19' }).from,
      ).toBeUndefined();
    },
  );

  it('no inventa el día que falta', () => {
    const request = readDashboardRequest({ period: 'custom', from: '2026-09-01' });

    expect(request.to).toBeUndefined();
  });

  /* Lo escrito se conserva para poder volver a pintarlo aunque el backend rechace la consulta. */
  it('recuerda lo que se pidió aunque no sea válido', () => {
    const request = readDashboardRequest({ period: 'custom', from: 'ayer', to: 'hoy' });

    expect(request.rawFrom).toBe('ayer');
    expect(request.rawTo).toBe('hoy');
  });

  /* Un rango invertido viaja tal cual: quien lo rechaza es el backend, con su mensaje. */
  it('no corrige un rango invertido', () => {
    const request = readDashboardRequest({
      period: 'custom',
      from: '2026-09-19',
      to: '2026-09-01',
    });

    expect(request.from).toBe('2026-09-19');
    expect(request.to).toBe('2026-09-01');
  });
});

describe('parámetros repetidos', () => {
  /*
   * `?period=7d&period=today` conserva el primero. Quedarse con el último dejaría que la cola de
   * un enlace manipulado ganara sobre lo que se escribió delante.
   */
  it('conserva el primer valor', () => {
    expect(firstValue(['7d', 'today'])).toBe('7d');
    expect(readDashboardRequest({ period: ['7d', 'today'] }).period).toBe('7d');
  });

  it('también en las fechas', () => {
    const request = readDashboardRequest({
      period: 'custom',
      from: ['2026-09-01', '2026-01-01'],
      to: ['2026-09-19'],
    });

    expect(request.from).toBe('2026-09-01');
    expect(request.to).toBe('2026-09-19');
  });

  it('un parámetro ausente no es un array vacío mal leído', () => {
    expect(firstValue(undefined)).toBeUndefined();
    expect(firstValue([])).toBeUndefined();
  });
});

describe('enlaces del selector', () => {
  it('llevan al propio panel con su período', () => {
    expect(periodHref('today')).toBe('/panel?period=today');
    expect(periodHref('7d')).toBe('/panel?period=7d');
  });

  it('marca como activo solo el período pedido', () => {
    const request = readDashboardRequest({ period: '7d' });

    expect(isActivePeriod(request, '7d')).toBe(true);
    expect(isActivePeriod(request, '30d')).toBe(false);
  });
});

describe('lo que este módulo no hace', () => {
  /*
   * Las fechas son días de calendario colombianos y las resuelve el backend. Calcularlas aquí daría
   * un día distinto según el reloj de quien mire, que es cómo un resumen «de hoy» acaba siendo el
   * de ayer.
   */
  it('no calcula ninguna fecha', () => {
    const source = readFileSync('src/features/panel/dashboard-period.ts', 'utf8');

    for (const forbidden of ['new Date(', 'Date.now(', 'setDate(', 'getTime(']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});
