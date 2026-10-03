import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { resetGeographyCacheForTests } from '@/lib/api/shipping';

import {
  copyOperationIdOf,
  FakeShippingBackend,
  GEOGRAPHY_ETAG,
  seededBackend,
} from '../../../test/shipping/fake-backend';

/**
 * El BFF de envíos de punta a punta: ruta → validación → cliente tipado → `openapi-fetch` → backend
 * simulado en memoria que responde con los DTOs del contrato. Nada de esto toca la red.
 */

const zones = await import('@/app/api/admin/shipping/zones/route');
const zone = await import('@/app/api/admin/shipping/zones/[zoneId]/route');
const activate = await import('@/app/api/admin/shipping/zones/[zoneId]/activate/route');
const archive = await import('@/app/api/admin/shipping/zones/[zoneId]/archive/route');
const duplicate = await import('@/app/api/admin/shipping/zones/[zoneId]/duplicate/route');
const restore = await import('@/app/api/admin/shipping/zones/[zoneId]/restore/route');
const copyOperation =
  await import('@/app/api/admin/shipping/copy-operations/[copyOperationId]/route');
const copyResume =
  await import('@/app/api/admin/shipping/copy-operations/[copyOperationId]/resume/route');
const copyDiscard =
  await import('@/app/api/admin/shipping/copy-operations/[copyOperationId]/discard/route');
const relations = await import('@/app/api/admin/shipping/products/[productId]/relations/route');
const coverage = await import('@/app/api/admin/shipping/zones/[zoneId]/coverage/route');
const rules = await import('@/app/api/admin/shipping/zones/[zoneId]/rules/route');
const rule = await import('@/app/api/admin/shipping/rules/[ruleId]/route');
const targets = await import('@/app/api/admin/shipping/rules/[ruleId]/targets/route');
const preview = await import('@/app/api/admin/shipping/preview/route');
const analysis = await import('@/app/api/admin/shipping/analysis/route');
const departments = await import('@/app/api/admin/shipping/geography/departments/route');
const municipalities =
  await import('@/app/api/admin/shipping/geography/departments/[departmentCode]/municipalities/route');
const search = await import('@/app/api/admin/shipping/geography/search/route');
const products = await import('@/app/api/admin/shipping/products/route');
const assignable = await import('@/app/api/admin/shipping/assignable/route');

const ORIGIN = 'https://panel.example.invalid';
const KEY = 'c8a2b1f0-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OTHER_KEY = 'f0e1d2c3-b4a5-4968-8776-655443322110';

let backend: FakeShippingBackend;

function request(
  path: string,
  options: { method?: string; body?: unknown; origin?: string | null; cookie?: boolean } = {},
): NextRequest {
  const method = options.method ?? 'GET';
  const headers = new Headers();

  if (method !== 'GET') headers.set('content-type', 'application/json');
  if (options.origin !== null) headers.set('origin', options.origin ?? ORIGIN);

  const built = new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers,
    ...(method === 'GET' ? {} : { body: JSON.stringify(options.body ?? {}) }),
  });

  if (options.cookie !== false) built.cookies.set(SESSION_COOKIE_NAME, 'material-opaco');

  return built;
}

const zoneParams = (zoneId: string) => ({ params: Promise.resolve({ zoneId }) });
const ruleParams = (ruleId: string) => ({ params: Promise.resolve({ ruleId }) });
const operationParams = (copyOperationId: string) => ({
  params: Promise.resolve({ copyOperationId }),
});
const productParams = (productId: string) => ({ params: Promise.resolve({ productId }) });

type ZonePage = {
  items: { id: string; name: string; status: string; copy: { state: string } }[];
  nextPageToken: string | null;
};

async function zonePage(
  query: string,
): Promise<{ status: number; body: ZonePage & { code?: string } }> {
  const response = await zones.GET(request(`/api/admin/shipping/zones${query}`));

  return { status: response.status, body: (await response.json()) as ZonePage & { code?: string } };
}

/** Siembra zonas activas numeradas para recorrer varias páginas. */
function seedMany(count: number, overrides: { priority?: number } = {}) {
  for (let index = 0; index < count; index += 1) {
    backend.seedZone({
      name: `Ruta ${String(index + 1).padStart(2, '0')}`,
      status: 'active',
      priority: overrides.priority ?? 400 + index,
      coverage: [{ kind: 'municipality', code: '15001' }],
      rules: [
        {
          name: 'Fija',
          scope: 'all',
          rate: {
            type: 'flat_order',
            amountCop: 9000,
            unitCop: null,
            baseCop: null,
            additionalUnitCop: null,
          },
        },
      ],
    });
  }
}

async function read(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function zoneNamed(name: string) {
  const found = [...backend.zones.values()].find((candidate) => candidate.name === name);

  if (found === undefined) throw new Error(`sin zona ${name}`);

  return found;
}

beforeEach(() => {
  process.env.MODULARTESS_BACKEND_URL = 'http://127.0.0.1:8787';
  process.env.MODULARTESS_BACKEND_AUTH_MODE = 'none';
  process.env.MODULARTESS_ADMIN_ORIGIN = ORIGIN;
  backend = seededBackend();
  resetGeographyCacheForTests();
  vi.stubGlobal('fetch', backend.handle);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MODULARTESS_BACKEND_URL;
  delete process.env.MODULARTESS_BACKEND_AUTH_MODE;
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

describe('frontera', () => {
  it('sin cookie no llama al backend', async () => {
    const response = await zones.GET(request('/api/admin/shipping/zones', { cookie: false }));

    expect(response.status).toBe(401);
    expect(backend.calls).toEqual([]);
  });

  it.each([
    ['un Origin ajeno', 'https://atacante.example.invalid'],
    ['sin Origin', null],
  ] as const)('rechaza una mutación con %s sin llamar al backend', async (_label, origin) => {
    const response = await zones.POST(
      request('/api/admin/shipping/zones', {
        method: 'POST',
        origin,
        body: { name: 'Nueva', priority: 10, unmatchedProductBehavior: 'unavailable' },
      }),
    );

    expect(response.status).toBe(403);
    expect(backend.calls).toEqual([]);
  });

  it('responde sin caché y sin el material de sesión', async () => {
    const response = await zones.GET(request('/api/admin/shipping/zones'));
    const text = await response.text();

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(text).not.toContain('material-opaco');
  });

  it('una vista desconocida es 400 sin llamar al backend', async () => {
    const response = await zones.GET(request('/api/admin/shipping/zones?view=todo'));

    expect(response.status).toBe(400);
    expect(backend.calls).toEqual([]);
  });
});

describe('listado: cursor y filtros del backend', () => {
  it('current trae borradores y activas; nunca copias sin terminar', async () => {
    backend.seedZone({ name: 'Copia a medias', copy: { state: 'failed', sourceZoneId: 'x' } });

    const { body } = await zonePage('?view=current');

    expect(body.items.map((item) => item.name)).not.toContain('Copia a medias');
    expect(body.items.every((item) => item.copy.state === 'ready')).toBe(true);
    expect(new Set(body.items.map((item) => item.status))).toEqual(new Set(['active', 'draft']));
  });

  it('copies solo trae las copias que no están listas', async () => {
    backend.seedZone({ name: 'Copia a medias', copy: { state: 'failed', sourceZoneId: 'x' } });

    const { body } = await zonePage('?view=copies');

    expect(body.items.map((item) => item.name)).toEqual(['Copia a medias']);
  });

  it('recorre las páginas con el cursor opaco, sin repetir ni perder zonas', async () => {
    seedMany(7);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const query = `?view=current&pageSize=3${cursor === null ? '' : `&pageToken=${encodeURIComponent(cursor)}`}`;
      const { body } = await zonePage(query);

      seen.push(...body.items.map((item) => item.id));
      cursor = body.nextPageToken;
      pages += 1;
    } while (cursor !== null);

    expect(pages).toBe(4);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(11);
  });

  it('cada filtro viaja al backend como cláusula de su consulta', async () => {
    const cases: [string, string[]][] = [
      ['?view=current&q=valle', ['Valle de Aburrá']],
      ['?view=current&q=ABURRA', ['Valle de Aburrá']],
      ['?view=current&status=draft', ['Costa Caribe (borrador)']],
      ['?view=current&rateType=per_unit', ['Bogotá urbano']],
      ['?view=current&validity=windowed', ['Costa Caribe (borrador)']],
      ['?view=current&municipalityCode=05001', ['Respaldo nacional', 'Valle de Aburrá']],
      // Rionegro está excluido del Valle: solo lo cubre el respaldo nacional.
      ['?view=current&municipalityCode=05615', ['Respaldo nacional']],
      ['?view=archived', ['Promoción 2025']],
    ];

    for (const [query, expected] of cases) {
      const { body } = await zonePage(query);

      expect(body.items.map((item) => item.name).sort(), query).toEqual([...expected].sort());
    }
  });

  it('un cursor de otros filtros es un cursor inválido, no otra página', async () => {
    seedMany(4);

    const first = await zonePage('?view=current&pageSize=2');
    const reused = await zonePage(
      `?view=current&pageSize=2&q=ruta&pageToken=${encodeURIComponent(first.body.nextPageToken ?? '')}`,
    );

    expect(reused.status).toBe(400);
    expect(reused.body.code).toBe('cursor_invalid');
  });

  it('un estado fuera de la vista lo rechaza el BFF o el backend, sin inventar resultados', async () => {
    const response = await zonePage('?view=current&status=archived');

    expect(response.status).toBe(400);
  });

  it('un parámetro que el contrato no publica no cruza la frontera', async () => {
    const response = await zonePage('?view=current&priority=200');

    expect(response.status).toBe(400);
    expect(backend.calls).toEqual([]);
  });

  it('una consulta filtrada sin índice disponible se dice como tal; sin filtros sigue funcionando', async () => {
    backend.indexUnavailable = true;

    const filtered = await zonePage('?view=current&q=valle');
    const plain = await zonePage('?view=current');

    expect(filtered.status).toBe(503);
    expect(filtered.body.code).toBe('query_unavailable');
    expect(plain.status).toBe(200);
  });

  it('cada lectura pide una sola página acotada, nunca la lista entera', async () => {
    seedMany(30);
    backend.calls = [];

    await zonePage('?view=current&pageSize=20');

    expect(backend.calls).toEqual(['GET /v1/admin/shipping/zones']);
  });
});

describe('crear y editar con versión optimista', () => {
  it('crea siempre en borrador y exige elegir qué recibe un producto sin regla', async () => {
    const missing = await zones.POST(
      request('/api/admin/shipping/zones', {
        method: 'POST',
        body: { name: 'Sin decidir', priority: 5 },
      }),
    );

    expect(missing.status).toBe(400);

    const created = await zones.POST(
      request('/api/admin/shipping/zones', {
        method: 'POST',
        body: { name: 'Eje Cafetero', priority: 90, unmatchedProductBehavior: 'manual_quote' },
      }),
    );
    const body = await read(created);

    expect(created.status).toBe(201);
    expect(body).toMatchObject({ status: 'draft', version: 1, name: 'Eje Cafetero' });
  });

  it('un 409 de versión no guarda nada y la recarga trae la versión actual', async () => {
    const target = zoneNamed('Costa Caribe (borrador)');
    const stale = target.version;

    const first = await zone.PATCH(
      request(`/api/admin/shipping/zones/${target.id}`, {
        method: 'PATCH',
        body: { expectedVersion: stale, name: 'Costa Caribe' },
      }),
      zoneParams(target.id),
    );

    expect(first.status).toBe(200);

    const conflict = await zone.PATCH(
      request(`/api/admin/shipping/zones/${target.id}`, {
        method: 'PATCH',
        body: { expectedVersion: stale, name: 'Otro nombre' },
      }),
      zoneParams(target.id),
    );

    expect(conflict.status).toBe(409);
    expect(await read(conflict)).toMatchObject({ code: 'version_conflict' });
    expect(zoneNamed('Costa Caribe').name).toBe('Costa Caribe');

    const reloaded = await read(
      await zone.GET(request(`/api/admin/shipping/zones/${target.id}`), zoneParams(target.id)),
    );

    expect(reloaded.version).toBe(stale + 1);
  });

  it('una zona archivada no se edita', async () => {
    const archived = zoneNamed('Promoción 2025');
    const response = await zone.PATCH(
      request(`/api/admin/shipping/zones/${archived.id}`, {
        method: 'PATCH',
        body: { expectedVersion: archived.version, name: 'Revivir' },
      }),
      zoneParams(archived.id),
    );

    expect(await read(response)).toMatchObject({ code: 'shipping_transition_invalid' });
  });

  it('una zona inexistente es shipping_zone_not_found', async () => {
    const response = await zone.GET(
      request('/api/admin/shipping/zones/shz_nope'),
      zoneParams('shz_nope'),
    );

    expect(response.status).toBe(404);
    expect(await read(response)).toMatchObject({ code: 'shipping_zone_not_found' });
  });

  it('moderator recibe permiso insuficiente al crear', async () => {
    backend.role = 'moderator';

    const response = await zones.POST(
      request('/api/admin/shipping/zones', {
        method: 'POST',
        body: { name: 'Nueva', priority: 1, unmatchedProductBehavior: 'unavailable' },
      }),
    );

    expect(response.status).toBe(403);
    expect(await read(response)).toMatchObject({ code: 'admin_role_required' });
  });
});

describe('cobertura', () => {
  it('añade departamentos, municipios y exclusiones por código', async () => {
    const draft = zoneNamed('Costa Caribe (borrador)');
    const response = await coverage.POST(
      request(`/api/admin/shipping/zones/${draft.id}/coverage`, {
        method: 'POST',
        body: {
          expectedVersion: draft.version,
          add: [
            { kind: 'department', code: '15' },
            { kind: 'exclusion', code: '15238' },
          ],
          remove: [{ kind: 'municipality', code: '76001' }],
        },
      }),
      zoneParams(draft.id),
    );
    const body = (await response.json()) as {
      added: number;
      removed: number;
      zone: { coverage: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.added).toBe(2);
    expect(body.removed).toBe(1);
    expect(body.zone.coverage).toMatchObject({
      departmentCodes: ['08', '15'],
      exclusionsByDepartment: { '15': 1 },
    });
  });

  it('un municipio dentro de un departamento incluido es cobertura inválida', async () => {
    const draft = zoneNamed('Costa Caribe (borrador)');
    const response = await coverage.POST(
      request(`/api/admin/shipping/zones/${draft.id}/coverage`, {
        method: 'POST',
        body: { expectedVersion: draft.version, add: [{ kind: 'municipality', code: '08001' }] },
      }),
      zoneParams(draft.id),
    );

    expect(await read(response)).toMatchObject({ code: 'shipping_invalid' });
  });

  it('un código con forma de nombre no cruza la frontera', async () => {
    const draft = zoneNamed('Costa Caribe (borrador)');
    const before = backend.calls.length;
    const response = await coverage.POST(
      request(`/api/admin/shipping/zones/${draft.id}/coverage`, {
        method: 'POST',
        body: { expectedVersion: draft.version, add: [{ kind: 'municipality', code: 'Medellín' }] },
      }),
      zoneParams(draft.id),
    );

    expect(response.status).toBe(400);
    expect(backend.calls.length).toBe(before);
  });

  it('lee todas las entradas de cobertura', async () => {
    const valle = zoneNamed('Valle de Aburrá');
    const listing = (await (
      await coverage.GET(
        request(`/api/admin/shipping/zones/${valle.id}/coverage`),
        zoneParams(valle.id),
      )
    ).json()) as { items: { kind: string; code: string }[]; truncated: boolean };

    expect(listing.truncated).toBe(false);
    expect(listing.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'department', code: '05' }),
        expect.objectContaining({ kind: 'exclusion', code: '05615' }),
      ]),
    );
  });
});

describe('las cinco tarifas', () => {
  const RATES = {
    free: { type: 'free', amountCop: null, unitCop: null, baseCop: null, additionalUnitCop: null },
    flat_order: {
      type: 'flat_order',
      amountCop: 12000,
      unitCop: null,
      baseCop: null,
      additionalUnitCop: null,
    },
    per_unit: {
      type: 'per_unit',
      amountCop: null,
      unitCop: 5000,
      baseCop: null,
      additionalUnitCop: null,
    },
    base_plus_additional: {
      type: 'base_plus_additional',
      amountCop: null,
      unitCop: null,
      baseCop: 20000,
      additionalUnitCop: 4000,
    },
    manual_quote: {
      type: 'manual_quote',
      amountCop: null,
      unitCop: null,
      baseCop: null,
      additionalUnitCop: null,
    },
  } as const;

  it.each(Object.entries(RATES))('crea una regla %s', async (type, rate) => {
    const draft = zoneNamed('Costa Caribe (borrador)');
    const response = await rules.POST(
      request(`/api/admin/shipping/zones/${draft.id}/rules`, {
        method: 'POST',
        body: { name: `Regla ${type}`, scope: 'products', rate },
      }),
      zoneParams(draft.id),
    );

    expect(response.status).toBe(201);
    expect(await read(response)).toMatchObject({ rate });
  });

  it.each([
    ['un monto vacío en tarifa fija', { ...RATES.flat_order, amountCop: null }],
    ['un monto en una tarifa gratis', { ...RATES.free, amountCop: 0 }],
    ['decimales', { ...RATES.per_unit, unitCop: 1500.5 }],
    ['un negativo', { ...RATES.base_plus_additional, additionalUnitCop: -1 }],
    ['un monto en cotización manual', { ...RATES.manual_quote, amountCop: 1000 }],
  ])('rechaza %s sin llamar al backend', async (_label, rate) => {
    const draft = zoneNamed('Costa Caribe (borrador)');
    const before = backend.calls.length;
    const response = await rules.POST(
      request(`/api/admin/shipping/zones/${draft.id}/rules`, {
        method: 'POST',
        body: { name: 'Inválida', scope: 'all', rate },
      }),
      zoneParams(draft.id),
    );

    expect(response.status).toBe(400);
    expect(backend.calls.length).toBe(before);
  });

  it('el alcance no se edita', async () => {
    const valle = zoneNamed('Valle de Aburrá');
    const general = [...backend.rules.values()].find(
      (candidate) => candidate.zoneId === valle.id && candidate.scope === 'all',
    );

    if (general === undefined) throw new Error('sin regla');

    const response = await rule.PATCH(
      request(`/api/admin/shipping/rules/${general.id}`, {
        method: 'PATCH',
        body: { expectedVersion: general.version, scope: 'products' },
      }),
      ruleParams(general.id),
    );

    expect(response.status).toBe(400);
  });
});

describe('asignaciones con idempotencia', () => {
  function productRule() {
    const bogota = zoneNamed('Bogotá urbano');
    const found = [...backend.rules.values()].find(
      (candidate) => candidate.zoneId === bogota.id && candidate.scope === 'products',
    );

    if (found === undefined) throw new Error('sin regla');

    return found;
  }

  it('asigna, informa cada elemento y repite con la misma clave sin aplicar dos veces', async () => {
    const target = productRule();
    const body = {
      idempotencyKey: KEY,
      expectedVersion: target.version,
      add: ['prd_mesa_roble', 'prd_silla_nordica', 'prd_no_existe'],
    };
    const first = (await (
      await targets.POST(
        request(`/api/admin/shipping/rules/${target.id}/targets`, { method: 'POST', body }),
        ruleParams(target.id),
      )
    ).json()) as {
      replayed: boolean;
      results: { value: string; outcome: string; code?: string }[];
    };

    expect(first.replayed).toBe(false);
    expect(first.results).toEqual([
      { value: 'prd_mesa_roble', outcome: 'added' },
      { value: 'prd_silla_nordica', outcome: 'unchanged' },
      { value: 'prd_no_existe', outcome: 'failed', code: 'product_not_found' },
    ]);

    const replay = (await (
      await targets.POST(
        request(`/api/admin/shipping/rules/${target.id}/targets`, { method: 'POST', body }),
        ruleParams(target.id),
      )
    ).json()) as { replayed: boolean };

    expect(replay.replayed).toBe(true);
    expect(backend.targets.get(target.id)?.size).toBe(2);
  });

  it('la misma clave con otro cuerpo es un conflicto de idempotencia', async () => {
    const target = productRule();

    await targets.POST(
      request(`/api/admin/shipping/rules/${target.id}/targets`, {
        method: 'POST',
        body: { idempotencyKey: KEY, expectedVersion: target.version, add: ['prd_mesa_roble'] },
      }),
      ruleParams(target.id),
    );

    const response = await targets.POST(
      request(`/api/admin/shipping/rules/${target.id}/targets`, {
        method: 'POST',
        body: { idempotencyKey: KEY, expectedVersion: target.version, add: ['prd_sofa_modular'] },
      }),
      ruleParams(target.id),
    );

    expect(response.status).toBe(409);
    expect(await read(response)).toMatchObject({ code: 'idempotency_conflict' });
  });

  it('sin clave válida no llama al backend', async () => {
    const target = productRule();
    const before = backend.calls.length;
    const response = await targets.POST(
      request(`/api/admin/shipping/rules/${target.id}/targets`, {
        method: 'POST',
        body: { idempotencyKey: 'corta', expectedVersion: target.version, add: ['prd_mesa_roble'] },
      }),
      ruleParams(target.id),
    );

    expect(response.status).toBe(400);
    expect(backend.calls.length).toBe(before);
  });
});

describe('copias: recurso tipado de la operación', () => {
  type Operation = {
    copyOperationId: string;
    state: string;
    phase: string;
    copied: { coverage: number; rules: number; targets: number };
    zone: { id: string; copy: { state: string } } | null;
    targetZoneId: string | null;
    failureCode: string | null;
    message: string;
  };

  async function duplicateOf(name: string, key = KEY, extra: Record<string, unknown> = {}) {
    const source = zoneNamed(name);
    const response = await duplicate.POST(
      request(`/api/admin/shipping/zones/${source.id}/duplicate`, {
        method: 'POST',
        body: { idempotencyKey: key, expectedVersion: source.version, ...extra },
      }),
      zoneParams(source.id),
    );

    return {
      status: response.status,
      body: (await response.json()) as Operation & { code?: string },
    };
  }

  async function operation(id: string) {
    const response = await copyOperation.GET(
      request(`/api/admin/shipping/copy-operations/${id}`),
      operationParams(id),
    );

    return {
      status: response.status,
      body: (await response.json()) as Operation & { code?: string },
    };
  }

  async function act(id: string, action: 'resume' | 'discard') {
    const route = action === 'resume' ? copyResume : copyDiscard;
    const response = await route.POST(
      request(`/api/admin/shipping/copy-operations/${id}/${action}`, { method: 'POST', body: {} }),
      operationParams(id),
    );

    return {
      status: response.status,
      body: (await response.json()) as Operation & { code?: string },
    };
  }

  it('duplicar responde 201 con la operación lista y su zona', async () => {
    const { status, body } = await duplicateOf('Valle de Aburrá');

    expect(status).toBe(201);
    expect(body).toMatchObject({ state: 'ready', copyOperationId: copyOperationIdOf(KEY) });
    expect(body.zone?.copy.state).toBe('ready');
  });

  it('duplicar responde 202 copiando cuando el backend no consiguió marcar el fallo', async () => {
    backend.stallNextCopy = true;

    const { status, body } = await duplicateOf('Valle de Aburrá');

    expect(status).toBe(202);
    expect(body).toMatchObject({ state: 'copying', zone: null, failureCode: null, phase: 'rules' });
    expect(body.copied.coverage).toBeGreaterThan(0);
  });

  it('duplicar responde 202 fallida con su código estable y su progreso', async () => {
    backend.failNextCopy = true;

    const { status, body } = await duplicateOf('Valle de Aburrá');

    expect(status).toBe(202);
    expect(body).toMatchObject({ state: 'failed', failureCode: 'copy_step_failed', zone: null });
    expect(body.targetZoneId).not.toBeNull();
  });

  it('un fallo antes de crear la operación es el error normal, sin identificador', async () => {
    const stale = await duplicateOf('Valle de Aburrá', KEY, { expectedVersion: 99 });

    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({ code: 'version_conflict', message: expect.any(String) });
    expect(JSON.stringify(stale.body)).not.toMatch(/copyOperationId|operationId/);
  });

  it('la respuesta nunca trae la clave, la huella, el mapa de reglas ni el actor', async () => {
    backend.failNextCopy = true;

    const { body } = await duplicateOf('Valle de Aburrá');
    const text = JSON.stringify(body);

    expect(text).not.toContain(KEY);
    expect(Object.keys(body).sort()).toEqual(
      [
        'copied',
        'copyOperationId',
        'createdAt',
        'failureCode',
        'message',
        'phase',
        'sourceVersion',
        'sourceZoneId',
        'state',
        'targetZoneId',
        'updatedAt',
        'zone',
      ].sort(),
    );
  });

  it('reanudar responde 202 si vuelve a fallar y 200 cuando termina', async () => {
    backend.failNextCopy = true;

    const { body: failed } = await duplicateOf('Valle de Aburrá');

    backend.failNextResume = true;

    const again = await act(failed.copyOperationId, 'resume');

    expect(again.status).toBe(202);
    expect(again.body).toMatchObject({ state: 'failed', failureCode: 'copy_step_failed' });

    const finished = await act(failed.copyOperationId, 'resume');

    expect(finished.status).toBe(200);
    expect(finished.body).toMatchObject({ state: 'ready' });
    expect(finished.body.zone?.copy.state).toBe('ready');
  });

  it('una copia en «copying» sin marcar se puede reanudar y descartar', async () => {
    backend.stallNextCopy = true;

    const { body } = await duplicateOf('Valle de Aburrá');
    const resumed = await act(body.copyOperationId, 'resume');

    expect(resumed).toMatchObject({ status: 200, body: { state: 'ready' } });

    backend.stallNextCopy = true;

    const { body: other } = await duplicateOf('Bogotá urbano', OTHER_KEY);
    const discarded = await act(other.copyOperationId, 'discard');

    expect(discarded).toMatchObject({ status: 200, body: { state: 'discarded' } });
  });

  it('descartar es idempotente: repetirlo responde 200 descartada', async () => {
    backend.failNextCopy = true;

    const { body } = await duplicateOf('Valle de Aburrá');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const discarded = await act(body.copyOperationId, 'discard');

      expect(discarded).toMatchObject({ status: 200, body: { state: 'discarded', zone: null } });
    }

    // Reanudar una descartada devuelve su recurso, con 200 y sin copiar nada.
    expect(await act(body.copyOperationId, 'resume')).toMatchObject({
      status: 200,
      body: { state: 'discarded' },
    });
    // Repetir la clave de una descartada también responde 200 descartada.
    expect((await duplicateOf('Valle de Aburrá')).status).toBe(200);
  });

  it('descartar una operación ya terminada es un conflicto', async () => {
    const { body } = await duplicateOf('Valle de Aburrá');
    const discard = await act(body.copyOperationId, 'discard');

    expect(discard.status).toBe(409);
    expect(discard.body).toMatchObject({ code: 'shipping_transition_invalid' });
  });

  it('se reconstruye entera después de cerrar la pantalla, solo con el copyOperationId', async () => {
    backend.failNextCopy = true;

    const { body } = await duplicateOf('Valle de Aburrá');
    // Lo único que sobrevive a cerrar la pantalla es la URL con el id de la operación.
    const id = body.copyOperationId;
    const rebuilt = await operation(id);

    expect(rebuilt.status).toBe(200);
    expect(rebuilt.body).toMatchObject({
      state: 'failed',
      phase: 'rules',
      failureCode: 'copy_step_failed',
    });

    const resumed = await act(id, 'resume');
    const after = await operation(id);

    expect(resumed.status).toBe(200);
    expect(after.body).toMatchObject({ state: 'ready', phase: 'finish' });
    expect(after.body.copied.rules).toBeGreaterThan(0);
  });

  it('cambiar el texto de message no altera ninguna decisión', async () => {
    const decide = async (prefix: string, key: string) => {
      backend.messagePrefix = prefix;
      backend.failNextCopy = true;

      const created = await duplicateOf('Valle de Aburrá', key);
      const read = await operation(created.body.copyOperationId);
      const resumed = await act(created.body.copyOperationId, 'resume');

      return [
        created.status,
        created.body.state,
        read.body.state,
        resumed.status,
        resumed.body.state,
      ];
    };

    const plain = await decide('', KEY);
    const noisy = await decide(
      'copyOperationId=deadbeef ready discarded 201 shipping_copy_failed — ',
      OTHER_KEY,
    );

    expect(noisy).toEqual(plain);
  });

  it('un código y un estado que no se corresponden se tratan como respuesta fuera de contrato', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            copyOperationId: 'op',
            state: 'failed',
            sourceZoneId: 'z',
            sourceVersion: 1,
            targetZoneId: null,
            zone: null,
            phase: 'coverage',
            copied: { coverage: 0, rules: 0, targets: 0 },
            failureCode: 'copy_step_failed',
            message: 'x',
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
    );

    const { status, body } = await duplicateOf('Valle de Aburrá');

    expect(status).toBe(500);
    expect(body).toMatchObject({ code: 'internal_error' });
  });

  it('una operación que no existe es copy_operation_not_found', async () => {
    const { status, body } = await operation('op_inexistente');

    expect(status).toBe(404);
    expect(body).toMatchObject({ code: 'copy_operation_not_found' });
  });

  it('la misma clave con otro nombre es un conflicto de idempotencia', async () => {
    await duplicateOf('Valle de Aburrá', OTHER_KEY);

    const conflict = await duplicateOf('Valle de Aburrá', OTHER_KEY, { name: 'Otra' });

    expect(conflict.body).toMatchObject({ code: 'idempotency_conflict' });
  });

  it('descartar o reanudar no admite cuerpo', async () => {
    const response = await copyDiscard.POST(
      request('/api/admin/shipping/copy-operations/op_x/discard', {
        method: 'POST',
        body: { idempotencyKey: KEY },
      }),
      operationParams('op_x'),
    );

    expect(response.status).toBe(400);
    expect(backend.calls).toEqual([]);
  });
});

describe('restaurar una zona archivada', () => {
  it('vuelve como borrador, nunca activa, con versión nueva', async () => {
    const archived = zoneNamed('Promoción 2025');
    const response = await restore.POST(
      request(`/api/admin/shipping/zones/${archived.id}/restore`, {
        method: 'POST',
        body: { expectedVersion: archived.version },
      }),
      zoneParams(archived.id),
    );

    expect(response.status).toBe(200);
    expect(await read(response)).toMatchObject({ status: 'draft', version: 2 });

    const current = await zonePage('?view=current&status=draft');

    expect(current.body.items.map((item) => item.name)).toContain('Promoción 2025');
  });

  it('con una versión vieja es un 409 de versión y no restaura', async () => {
    const archived = zoneNamed('Promoción 2025');
    const response = await restore.POST(
      request(`/api/admin/shipping/zones/${archived.id}/restore`, {
        method: 'POST',
        body: { expectedVersion: archived.version + 3 },
      }),
      zoneParams(archived.id),
    );

    expect(response.status).toBe(409);
    expect(await read(response)).toMatchObject({ code: 'version_conflict' });
    expect(zoneNamed('Promoción 2025').status).toBe('archived');
  });

  it('una zona que no está archivada no se restaura', async () => {
    const active = zoneNamed('Bogotá urbano');
    const response = await restore.POST(
      request(`/api/admin/shipping/zones/${active.id}/restore`, {
        method: 'POST',
        body: { expectedVersion: active.version },
      }),
      zoneParams(active.id),
    );

    expect(await read(response)).toMatchObject({ code: 'shipping_transition_invalid' });
  });
});

describe('relaciones de un producto', () => {
  function productRule(zoneName: string) {
    const zone = zoneNamed(zoneName);
    const found = [...backend.rules.values()].find(
      (candidate) => candidate.zoneId === zone.id && candidate.scope === 'products',
    );

    if (found === undefined) throw new Error('sin regla');

    return found;
  }

  async function relationsOf(productId: string, pageToken?: string) {
    const response = await relations.GET(
      request(
        `/api/admin/shipping/products/${productId}/relations${pageToken === undefined ? '' : `?pageToken=${encodeURIComponent(pageToken)}`}`,
      ),
      productParams(productId),
    );

    return (await response.json()) as {
      items: {
        origin: string;
        relation: string;
        rule: { id: string; scope: string };
        zone: { name: string };
      }[];
      nextPageToken: string | null;
    };
  }

  it('separa directas de heredadas por categoría y por «todos»', async () => {
    const page = await relationsOf('prd_silla_nordica');
    const summary = page.items.map((item) => `${item.zone.name}:${item.origin}:${item.relation}`);

    expect(summary).toContain('Bogotá urbano:product:direct');
    expect(summary).toContain('Valle de Aburrá:all:inherited');
    expect(summary).toContain('Respaldo nacional:all:inherited');

    const table = await relationsOf('prd_mesa_roble');

    expect(
      table.items.map((item) => `${item.zone.name}:${item.origin}:${item.relation}`),
    ).toContain('Valle de Aburrá:category:inherited');
  });

  it('asigna y retira solo relaciones directas, sin tocar las heredadas', async () => {
    const rule = productRule('Bogotá urbano');
    const before = await relationsOf('prd_mesa_roble');
    const inheritedBefore = before.items.filter((item) => item.relation === 'inherited');
    const assign = (await (
      await relations.POST(
        request('/api/admin/shipping/products/prd_mesa_roble/relations', {
          method: 'POST',
          body: {
            idempotencyKey: KEY,
            changes: [{ action: 'assign', ruleId: rule.id, expectedVersion: rule.version }],
          },
        }),
        productParams('prd_mesa_roble'),
      )
    ).json()) as { results: { outcome: string; ruleVersion: number }[] };

    expect(assign.results[0]?.outcome).toBe('added');

    const after = await relationsOf('prd_mesa_roble');

    expect(
      after.items.filter((item) => item.relation === 'direct').map((item) => item.rule.id),
    ).toEqual([rule.id]);
    expect(after.items.filter((item) => item.relation === 'inherited')).toEqual(
      expect.arrayContaining(
        inheritedBefore.map((item) => expect.objectContaining({ origin: item.origin })),
      ),
    );

    const remove = (await (
      await relations.POST(
        request('/api/admin/shipping/products/prd_mesa_roble/relations', {
          method: 'POST',
          body: {
            idempotencyKey: OTHER_KEY,
            changes: [
              {
                action: 'unassign',
                ruleId: rule.id,
                expectedVersion: assign.results[0]?.ruleVersion,
              },
            ],
          },
        }),
        productParams('prd_mesa_roble'),
      )
    ).json()) as { results: { outcome: string }[] };

    expect(remove.results[0]?.outcome).toBe('removed');
  });

  it('una relación heredada no se elimina: el backend la rechaza por elemento', async () => {
    const valle = zoneNamed('Valle de Aburrá');
    const categories = [...backend.rules.values()].find(
      (candidate) => candidate.zoneId === valle.id && candidate.scope === 'categories',
    );

    if (categories === undefined) throw new Error('sin regla');

    const result = (await (
      await relations.POST(
        request('/api/admin/shipping/products/prd_mesa_roble/relations', {
          method: 'POST',
          body: {
            idempotencyKey: KEY,
            changes: [
              { action: 'unassign', ruleId: categories.id, expectedVersion: categories.version },
            ],
          },
        }),
        productParams('prd_mesa_roble'),
      )
    ).json()) as { results: { outcome: string; code: string }[] };

    expect(result.results[0]).toMatchObject({ outcome: 'failed', code: 'rule_not_product_scope' });
    expect(backend.targets.get(categories.id)?.has('mesas')).toBe(true);
  });

  it('pagina con el cursor del backend', async () => {
    const first = await relations.GET(
      request('/api/admin/shipping/products/prd_silla_nordica/relations'),
      productParams('prd_silla_nordica'),
    );

    expect(first.status).toBe(200);

    const bad = await relations.GET(
      request('/api/admin/shipping/products/prd_silla_nordica/relations?pageToken=alterado'),
      productParams('prd_silla_nordica'),
    );

    expect(await read(bad)).toMatchObject({ code: 'cursor_invalid' });
  });

  it('más de 20 cambios no cruzan la frontera', async () => {
    const changes = Array.from({ length: 21 }, (_, index) => ({
      action: 'assign',
      ruleId: `shr_${index}`,
      expectedVersion: 1,
    }));
    const response = await relations.POST(
      request('/api/admin/shipping/products/prd_mesa_roble/relations', {
        method: 'POST',
        body: { idempotencyKey: KEY, changes },
      }),
      productParams('prd_mesa_roble'),
    );

    expect(response.status).toBe(400);
    expect(backend.calls).toEqual([]);
  });

  it('un producto inexistente es shipping_product_not_found', async () => {
    const response = await relations.GET(
      request('/api/admin/shipping/products/prd_nope/relations'),
      productParams('prd_nope'),
    );

    expect(await read(response)).toMatchObject({ code: 'shipping_product_not_found' });
  });
});

describe('activación', () => {
  it('sin reglas activas no se activa', async () => {
    const draft = zoneNamed('Costa Caribe (borrador)');
    const response = await activate.POST(
      request(`/api/admin/shipping/zones/${draft.id}/activate`, {
        method: 'POST',
        body: { expectedVersion: draft.version },
      }),
      zoneParams(draft.id),
    );

    expect(response.status).toBe(409);
    expect(backend.zones.get(draft.id)?.status).toBe('draft');
  });

  it('un empate con otra zona activa es cobertura ambigua', async () => {
    const tie = backend.seedZone({
      name: 'Medellín duplicada',
      priority: 200,
      coverage: [{ kind: 'department', code: '05' }],
      rules: [
        {
          name: 'Fija',
          scope: 'all',
          rate: {
            type: 'flat_order',
            amountCop: 1000,
            unitCop: null,
            baseCop: null,
            additionalUnitCop: null,
          },
        },
      ],
    });
    const response = await activate.POST(
      request(`/api/admin/shipping/zones/${tie.id}/activate`, {
        method: 'POST',
        body: { expectedVersion: tie.version },
      }),
      zoneParams(tie.id),
    );

    expect(await read(response)).toMatchObject({ code: 'shipping_zone_ambiguous' });
  });

  it('una copia que no está lista no se activa', async () => {
    const copying = backend.seedZone({
      name: 'Copiando',
      copy: { state: 'copying', sourceZoneId: 'x' },
    });
    const response = await activate.POST(
      request(`/api/admin/shipping/zones/${copying.id}/activate`, {
        method: 'POST',
        body: { expectedVersion: copying.version },
      }),
      zoneParams(copying.id),
    );

    expect(await read(response)).toMatchObject({ code: 'shipping_transition_invalid' });
  });

  it('una archivada no se vuelve a archivar ni se activa: primero se restaura', async () => {
    const archived = zoneNamed('Promoción 2025');

    for (const route of [activate, archive]) {
      const response = await route.POST(
        request(`/api/admin/shipping/zones/${archived.id}/x`, {
          method: 'POST',
          body: { expectedVersion: archived.version },
        }),
        zoneParams(archived.id),
      );

      expect(await read(response)).toMatchObject({ code: 'shipping_transition_invalid' });
    }
  });
});

describe('vista previa y análisis', () => {
  const MEDELLIN = { departmentCode: '05', municipalityCode: '05001' };

  it('elige la regla más específica y la zona del nivel más específico', async () => {
    const result = (await (
      await preview.POST(
        request('/api/admin/shipping/preview', {
          method: 'POST',
          body: {
            destination: MEDELLIN,
            items: [
              { productId: 'prd_silla_nordica', quantity: 2 },
              { productId: 'prd_mesa_roble', variantId: 'var_mesa_160', quantity: 1 },
            ],
          },
        }),
      )
    ).json()) as {
      outcome: string;
      totalCop: number;
      lines: { level: string; outcome: string }[];
      charges: { ruleName: string; costCop: number }[];
    };

    expect(result.outcome).toBe('charged');
    expect(result.lines.map((line) => line.level)).toEqual(['department', 'department']);
    expect(result.charges.map((charge) => [charge.ruleName, charge.costCop])).toEqual([
      ['Tarifa general', 18000],
      ['Muebles grandes', 45000],
    ]);
    expect(result.totalCop).toBe(63000);
  });

  it('un municipio excluido cae al respaldo nacional: cotización manual, nunca cero', async () => {
    const result = (await (
      await preview.POST(
        request('/api/admin/shipping/preview', {
          method: 'POST',
          body: {
            destination: { departmentCode: '05', municipalityCode: '05615' },
            items: [{ productId: 'prd_silla_nordica', quantity: 1 }],
          },
        }),
      )
    ).json()) as { outcome: string; totalCop: number | null; lines: { level: string }[] };

    expect(result.outcome).toBe('manual_quote');
    expect(result.totalCop).toBeNull();
    expect(result.lines[0]?.level).toBe('national');
  });

  it.each([
    [
      'un producto con variantes sin variante',
      { productId: 'prd_mesa_roble', quantity: 1 },
      'preview_variant_required',
    ],
    [
      'un producto archivado',
      { productId: 'prd_lampara_arco', quantity: 1 },
      'preview_product_unavailable',
    ],
    [
      'una variante que no existe',
      { productId: 'prd_silla_nordica', variantId: 'var_x', quantity: 1 },
      'preview_variant_unavailable',
    ],
  ])('rechaza %s con su código', async (_label, item, code) => {
    const response = await preview.POST(
      request('/api/admin/shipping/preview', {
        method: 'POST',
        body: { destination: MEDELLIN, items: [item] },
      }),
    );

    expect(await read(response)).toMatchObject({ code });
  });

  it('no manda precios: un importe en la línea no cruza la frontera', async () => {
    const before = backend.calls.length;
    const response = await preview.POST(
      request('/api/admin/shipping/preview', {
        method: 'POST',
        body: {
          destination: MEDELLIN,
          items: [{ productId: 'prd_silla_nordica', quantity: 1, priceCop: 1 }],
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(backend.calls.length).toBe(before);
  });

  it('la vista previa no crea ni modifica nada', async () => {
    const snapshot = JSON.stringify([...backend.zones.values()]);
    const revision = backend.revision;

    await preview.POST(
      request('/api/admin/shipping/preview', {
        method: 'POST',
        body: { destination: MEDELLIN, items: [{ productId: 'prd_silla_nordica', quantity: 1 }] },
      }),
    );

    expect(JSON.stringify([...backend.zones.values()])).toBe(snapshot);
    expect(backend.revision).toBe(revision);
  });

  it('el análisis devuelve empates y municipios sin cobertura', async () => {
    const result = (await (await analysis.GET(request('/api/admin/shipping/analysis'))).json()) as {
      conflicts: unknown[];
      uncoveredMunicipalityCodes: string[];
    };

    expect(result.conflicts).toEqual([]);
    expect(result.uncoveredMunicipalityCodes).toEqual(['91263']);
  });
});

describe('geografía y selectores', () => {
  it('lista departamentos y los municipios de uno solo', async () => {
    const list = (await (
      await departments.GET(request('/api/admin/shipping/geography/departments'))
    ).json()) as {
      items: { code: string }[];
    };

    expect(list.items.map((item) => item.code)).toContain('05');

    const one = (await (
      await municipalities.GET(
        request('/api/admin/shipping/geography/departments/91/municipalities'),
        { params: Promise.resolve({ departmentCode: '91' }) },
      )
    ).json()) as { items: { code: string; type: string }[] };

    expect(one.items).toEqual([
      expect.objectContaining({ code: '91001' }),
      expect.objectContaining({ code: '91263', type: 'non_municipalized_area' }),
    ]);
  });

  it('busca municipios sin tildes y devuelve sus códigos', async () => {
    const result = (await (
      await search.GET(request('/api/admin/shipping/geography/search?q=itagui'))
    ).json()) as { items: { code: string; name: string }[] };

    expect(result.items).toEqual([expect.objectContaining({ code: '05360', name: 'Itagüí' })]);
  });

  it('una búsqueda de una letra no llama al backend', async () => {
    const response = await search.GET(request('/api/admin/shipping/geography/search?q=a'));

    expect(response.status).toBe(400);
    expect(backend.calls).toEqual([]);
  });

  it('consulta la geografía sin ningún token de servicio, con la identidad normal del BFF', async () => {
    const seen: Headers[] = [];

    vi.stubGlobal('fetch', async (input: Request) => {
      seen.push(new Headers(input.headers));

      return backend.handle(input);
    });

    const response = await departments.GET(request('/api/admin/shipping/geography/departments'));

    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.has('x-service-token')).toBe(false);
    // Tampoco viaja la sesión de la persona: la geografía no la necesita.
    expect(seen[0]?.has('x-modulartess-admin-session')).toBe(false);
  });

  it('cachea un día y después revalida con ETag: un 304 reutiliza lo que había', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });

    try {
      await departments.GET(request('/api/admin/shipping/geography/departments'));
      await departments.GET(request('/api/admin/shipping/geography/departments'));

      expect(backend.geographyRequests).toBe(1);

      vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);

      const revalidated = (await (
        await departments.GET(request('/api/admin/shipping/geography/departments'))
      ).json()) as { items: unknown[] };

      expect(backend.geographyRequests).toBe(2);
      expect(backend.geographyNotModified).toBe(1);
      expect(revalidated.items.length).toBeGreaterThan(0);
      expect(GEOGRAPHY_ETAG).toMatch(/^"/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un fallo de la geografía usa los mensajes normales, sin hablar de tokens', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ code: 'x', message: 'down' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const response = await departments.GET(request('/api/admin/shipping/geography/departments'));
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({ code: 'service_unavailable' });
    expect(text.toLowerCase()).not.toContain('token');
  });

  it('el selector de productos recorta el DTO y marca los archivados', async () => {
    const page = (await (await products.GET(request('/api/admin/shipping/products'))).json()) as {
      items: Record<string, unknown>[];
    };
    const lamp = page.items.find((item) => item.id === 'prd_lampara_arco');

    expect(lamp).toMatchObject({ status: 'archived' });
    expect(Object.keys(lamp ?? {}).sort()).toEqual(
      ['categoryName', 'categorySlug', 'id', 'name', 'sku', 'status', 'variants'].sort(),
    );
  });

  it('las zonas asignables llegan en páginas, sin archivadas y con solo reglas activas', async () => {
    seedMany(25);

    const first = (await (
      await assignable.GET(request('/api/admin/shipping/assignable'))
    ).json()) as {
      items: { zone: { name: string }; rules: { status: string }[] }[];
      nextPageToken: string | null;
    };

    expect(first.items).toHaveLength(20);
    expect(first.nextPageToken).not.toBeNull();
    expect(first.items.map((item) => item.zone.name)).not.toContain('Promoción 2025');
    expect(
      first.items.flatMap((item) => item.rules).every((item) => item.status === 'active'),
    ).toBe(true);

    const searched = (await (
      await assignable.GET(request('/api/admin/shipping/assignable?q=bogota'))
    ).json()) as { items: { zone: { name: string } }[] };

    expect(searched.items.map((item) => item.zone.name)).toEqual(['Bogotá urbano']);
  });

  it('busca productos en el servidor por nombre, SKU y slug, con cursor', async () => {
    const byName = (await (
      await products.GET(request('/api/admin/shipping/products?q=nordica'))
    ).json()) as {
      items: { id: string }[];
    };
    const bySku = (await (
      await products.GET(request('/api/admin/shipping/products?q=MT-MESA'))
    ).json()) as {
      items: { id: string }[];
    };
    const bySlug = (await (
      await products.GET(request('/api/admin/shipping/products?q=sofa-modular'))
    ).json()) as {
      items: { id: string }[];
    };

    expect(byName.items.map((item) => item.id)).toEqual(['prd_silla_nordica']);
    expect(bySku.items.map((item) => item.id)).toEqual(['prd_mesa_roble']);
    expect(bySlug.items.map((item) => item.id)).toEqual(['prd_sofa_modular']);
    expect(backend.calls.filter((call) => call === 'GET /v1/admin/products')).toHaveLength(3);
  });

  it('un producto sin índice de búsqueda no se inventa: no aparece por texto, sí sin texto', async () => {
    const searched = (await (
      await products.GET(request('/api/admin/shipping/products?q=estanteria'))
    ).json()) as { items: unknown[] };
    const listed = (await (await products.GET(request('/api/admin/shipping/products'))).json()) as {
      items: { id: string }[];
    };

    expect(searched.items).toEqual([]);
    expect(listed.items.map((item) => item.id)).toContain('prd_estanteria');
  });

  it('la búsqueda sin índice disponible responde query_unavailable', async () => {
    backend.indexUnavailable = true;

    const response = await products.GET(request('/api/admin/shipping/products?q=silla'));

    expect(await read(response)).toMatchObject({ code: 'query_unavailable' });
  });

  it('una búsqueda de un carácter no llama al backend', async () => {
    const response = await products.GET(request('/api/admin/shipping/products?q=s'));

    expect(response.status).toBe(400);
    expect(backend.calls).toEqual([]);
  });
});
