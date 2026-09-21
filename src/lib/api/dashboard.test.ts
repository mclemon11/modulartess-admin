import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BackendFailure, isBackendFailure } from './errors';
import { ADMIN_SESSION_HEADER } from './session-material';

/**
 * La frontera del resumen comercial.
 *
 * Lo que se fija aquí es qué sale del servidor de Next hacia el backend: la ruta exacta, el método,
 * el canal de la sesión y los parámetros de período. Un error en cualquiera de esos cuatro produce
 * cifras que parecen válidas y no lo son, que es la peor clase de fallo en un panel de ventas.
 *
 * El cliente del backend se sustituye por un doble: estas pruebas no abren red ni usan
 * credenciales.
 */

const GET = vi.fn();

vi.mock('./backend-client', () => ({
  backendClient: () => ({ GET }),
}));

const { getDashboardSummary } = await import('./dashboard');

const MATERIAL = 'material-de-sesion-opaco';

/** Respuesta correcta del doble. El contenido no importa: lo que se mira es la llamada. */
function ok(data: unknown = { truncated: false }): void {
  GET.mockResolvedValue({ data, error: undefined, response: { status: 200 } });
}

/** Respuesta fallida, con el código estable que publica el contrato en el cuerpo. */
function fails(status: number, code?: string): void {
  GET.mockResolvedValue({
    data: undefined,
    error: code === undefined ? {} : { code, message: 'texto del backend que no debe propagarse' },
    response: { status },
  });
}

function lastCall(): { readonly path: string; readonly options: Record<string, unknown> } {
  const [path, options] = GET.mock.calls.at(-1) as [string, Record<string, unknown>];

  return { path, options };
}

function query(): Record<string, unknown> {
  const { options } = lastCall();
  const params = options.params as { query: Record<string, unknown> };

  return params.query;
}

beforeEach(() => {
  GET.mockReset();
});

describe('la llamada que sale al backend', () => {
  it('usa exactamente la ruta del contrato, con GET', async () => {
    ok();

    await getDashboardSummary(MATERIAL, { period: '30d' });

    expect(GET).toHaveBeenCalledTimes(1);
    expect(lastCall().path).toBe('/v1/admin/dashboard/summary');
  });

  it('transporta la sesión en su propio encabezado', async () => {
    ok();

    await getDashboardSummary(MATERIAL, { period: '30d' });

    expect(lastCall().options.headers).toEqual({ [ADMIN_SESSION_HEADER]: MATERIAL });
  });

  /*
   * El `Authorization` con el identity token IAM lo pone el middleware compartido del cliente. Si
   * este módulo lo escribiera, la sesión de la persona y la identidad de la máquina acabarían
   * compartiendo canal, que es justo lo que la arquitectura separa.
   */
  it('no escribe Authorization: ese canal es del IAM', async () => {
    ok();

    await getDashboardSummary(MATERIAL, { period: '30d' });

    expect(JSON.stringify(lastCall().options.headers)).not.toContain('Authorization');
  });

  it('devuelve el resumen tal cual, sin tocar ninguna cifra', async () => {
    const summary = { truncated: true, commerce: { approvedSales: { currentAmountCop: 1450000 } } };

    ok(summary);

    await expect(getDashboardSummary(MATERIAL, { period: 'today' })).resolves.toBe(summary);
  });

  /* Una sola operación: el resumen no se compone pidiendo pedidos ni productos. */
  it('no hace más de una llamada', async () => {
    ok();

    await getDashboardSummary(MATERIAL, { period: '7d' });

    expect(GET).toHaveBeenCalledTimes(1);
  });
});

describe('parámetros de período', () => {
  it.each(['today', '7d', '30d'] as const)('%s viaja solo, sin fechas', async (period) => {
    ok();

    await getDashboardSummary(MATERIAL, { period });

    expect(query()).toEqual({ period });
  });

  /*
   * El contrato responde `400` si `from`/`to` llegan con un período que no es `custom`. Se omiten
   * aquí aunque quien llama los pase por error: una llamada mal formada no sale de este módulo.
   */
  it.each(['today', '7d', '30d'] as const)(
    'descarta from/to cuando el período es %s',
    async (period) => {
      ok();

      await getDashboardSummary(MATERIAL, {
        period,
        from: '2026-09-01',
        to: '2026-09-19',
      });

      expect(query()).toEqual({ period });
    },
  );

  it('custom lleva from y to', async () => {
    ok();

    await getDashboardSummary(MATERIAL, {
      period: 'custom',
      from: '2026-09-01',
      to: '2026-09-19',
    });

    expect(query()).toEqual({ period: 'custom', from: '2026-09-01', to: '2026-09-19' });
  });

  /* Una cadena vacía viaja como parámetro presente y el backend la rechazaría. */
  it('custom omite las fechas vacías o ausentes', async () => {
    ok();

    await getDashboardSummary(MATERIAL, { period: 'custom', from: '', to: undefined });

    expect(query()).toEqual({ period: 'custom' });
  });

  /* El panel no calcula rangos: no hay fechas por defecto que inventar. */
  it('no añade ningún parámetro que el contrato no publique', async () => {
    ok();

    await getDashboardSummary(MATERIAL, { period: '30d' });

    expect(Object.keys(query()).sort()).toEqual(['period']);
  });
});

describe('traducción de los errores del contrato', () => {
  it.each([
    [400, 'dashboard_query_invalid', 'backend_dashboard_query_invalid'],
    [503, 'dashboard_unavailable', 'backend_dashboard_unavailable'],
  ])('%i %s se convierte en %s', async (status, code, expected) => {
    fails(status, code);

    await expect(getDashboardSummary(MATERIAL, { period: '30d' })).rejects.toMatchObject({
      code: expected,
    });
  });

  it.each([
    [401, 'admin_session_required', 'backend_unauthorized'],
    [403, 'admin_forbidden', 'backend_forbidden'],
  ])('%i %s se convierte en %s', async (status, code, expected) => {
    fails(status, code);

    await expect(getDashboardSummary(MATERIAL, { period: '30d' })).rejects.toMatchObject({
      code: expected,
    });
  });

  /* Un `404` aquí no es «ese resumen no existe»: un resumen no es un recurso direccionable. */
  it('un 404 se lee como superficie administrativa ausente', async () => {
    fails(404);

    await expect(getDashboardSummary(MATERIAL, { period: '30d' })).rejects.toMatchObject({
      code: 'backend_surface_disabled',
    });
  });

  it('un fallo de red se convierte en un código estable', async () => {
    GET.mockRejectedValue(new Error('getaddrinfo ENOTFOUND backend.interno.invalid'));

    const failure = await getDashboardSummary(MATERIAL, { period: '30d' }).catch(
      (error: unknown) => error,
    );

    expect(isBackendFailure(failure)).toBe(true);
    expect((failure as BackendFailure).code).toBe('backend_unavailable');
  });

  it('nunca propaga el texto del backend', async () => {
    fails(503, 'dashboard_unavailable');

    const failure = await getDashboardSummary(MATERIAL, { period: '30d' }).catch(
      (error: unknown) => error,
    );

    expect(String((failure as Error).message)).not.toContain('texto del backend');
  });

  /* Un `BackendFailure` que venga de dentro del cliente se conserva con su código. */
  it('conserva un fallo ya clasificado del cliente', async () => {
    GET.mockRejectedValue(new BackendFailure('backend_misconfigured'));

    await expect(getDashboardSummary(MATERIAL, { period: '30d' })).rejects.toMatchObject({
      code: 'backend_misconfigured',
    });
  });
});
