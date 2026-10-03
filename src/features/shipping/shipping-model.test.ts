import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BackendFailure, listingFailure, shippingFailure } from '@/lib/api/errors';
import type { ShippingPreview, ShippingZone } from '@/lib/api/shipping';

import {
  ariaChecked,
  batchCoverage,
  coverageFromEntries,
  departmentState,
  diffCoverage,
  EMPTY_COVERAGE,
  municipalityState,
  setNational,
  summariseCoverage,
  toggleDepartment,
  toggleMunicipality,
} from './coverage-model';
import {
  copyActions,
  describeCopyActionFailure,
  describeCopyFailure,
  describeProgress,
  isPublishedCopyAnswer,
} from './copy-operation-model';
import { describeChange, ORIGIN_LABELS, RELATION_LABELS } from './product-shipping-section';
import { buildPreviewRequest, describeTotal, previewWarnings } from './preview-model';
import {
  draftFromRate,
  EMPTY_RATE_DRAFT,
  illustrateRate,
  parseTransit,
  rateFromDraft,
} from './rate-draft';
import { describeShippingFailure, keepsKey, offersReload } from './shipping-errors';
import {
  parseCoverageUpdate,
  parseDuplicate,
  parsePreview,
  parseRate,
  parseTargets,
} from './shipping-input';
import {
  COPY_STATE_LABELS,
  describeRate,
  LEVEL_LABELS,
  OUTCOME_LABELS,
  RATE_TYPE_LABELS,
  REASON_LABELS,
  SCOPE_LABELS,
  validityState,
  ZONE_STATUS_LABELS,
} from './shipping-labels';
import type { PickerProduct } from './shipping-projections';
import {
  batchTargets,
  describeSummary,
  diffTargets,
  planAssignment,
  summariseResults,
} from './target-plan';
import {
  changedFields,
  isoToLocal,
  localToIso,
  parseZoneDraft,
  readOnlyReason,
} from './zone-form-model';
import {
  describeActor,
  firstPage,
  parseZoneFilters,
  toZoneQuery,
  usableForTab,
  zoneListHref,
  type ZoneFilters,
} from './zone-list';
import { canActivate, reviewZone } from './zone-review-model';

const CONTRACT = JSON.parse(readFileSync('openapi/backend-v1.json', 'utf8')) as {
  components: {
    schemas: Record<
      string,
      { properties: Record<string, { enum?: string[]; items?: { enum?: string[] } }> }
    >;
  };
};

/** `formatCop` usa espacio duro entre el símbolo y la cifra; aquí se compara el texto visible. */
function plain(text: string): string {
  return text.replaceAll('\u00a0', ' ');
}

function contractEnum(schema: string, property: string): string[] {
  const node = CONTRACT.components.schemas[schema]?.properties[property];

  return [...(node?.enum ?? node?.items?.enum ?? [])].filter((value) => value !== null).sort();
}

function zone(overrides: Partial<ShippingZone> = {}): ShippingZone {
  return {
    id: 'shz_1',
    name: 'Zona',
    description: null,
    priority: 100,
    status: 'draft',
    validFrom: null,
    validUntil: null,
    unmatchedProductBehavior: 'unavailable',
    copy: { state: 'ready', error: null, operationId: null, sourceZoneId: null },
    coverage: {
      national: false,
      departmentCodes: [],
      municipalitiesByDepartment: {},
      exclusionsByDepartment: {},
    },
    rules: { activeCount: 0, allRuleId: null, rateTypeCounts: {} },
    createdAt: '2026-10-01T00:00:00.000Z',
    createdBy: 'adm_a',
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedBy: 'adm_a',
    activatedAt: null,
    activatedBy: null,
    archivedAt: null,
    archivedBy: null,
    version: 1,
    ...overrides,
  };
}

describe('etiquetas contra el contrato', () => {
  it.each([
    ['ShippingZoneDto', 'status', ZONE_STATUS_LABELS],
    ['ShippingZoneCopyDto', 'state', COPY_STATE_LABELS],
    ['ShippingRateDto', 'type', RATE_TYPE_LABELS],
    ['ShippingRuleDto', 'scope', SCOPE_LABELS],
    ['ShippingChargeDto', 'level', LEVEL_LABELS],
    ['ShippingPreviewDto', 'outcome', OUTCOME_LABELS],
    ['ShippingPreviewDto', 'reason', REASON_LABELS],
  ] as const)('%s.%s tiene un texto por valor publicado', (schema, property, labels) => {
    expect(Object.keys(labels).sort()).toEqual(contractEnum(schema, property));
  });

  it('describe las cinco tarifas sin convertir un monto ausente en cero', () => {
    expect(
      plain(
        describeRate({
          type: 'free',
          amountCop: null,
          unitCop: null,
          baseCop: null,
          additionalUnitCop: null,
        }),
      ),
    ).toBe('Gratis · $ 0');
    expect(
      plain(
        describeRate({
          type: 'flat_order',
          amountCop: 12000,
          unitCop: null,
          baseCop: null,
          additionalUnitCop: null,
        }),
      ),
    ).toBe('$ 12.000 por pedido');
    expect(
      plain(
        describeRate({
          type: 'per_unit',
          amountCop: null,
          unitCop: null,
          baseCop: null,
          additionalUnitCop: null,
        }),
      ),
    ).toBe('— por unidad');
    expect(
      plain(
        describeRate({
          type: 'base_plus_additional',
          amountCop: null,
          unitCop: null,
          baseCop: 45000,
          additionalUnitCop: 15000,
        }),
      ),
    ).toBe('$ 45.000 la primera unidad + $ 15.000 cada adicional');
    expect(
      plain(
        describeRate({
          type: 'manual_quote',
          amountCop: null,
          unitCop: null,
          baseCop: null,
          additionalUnitCop: null,
        }),
      ),
    ).toBe('Cotización manual · sin monto');
  });
});

describe('selector geográfico: tres estados y exclusiones', () => {
  it('ninguno, parcial por municipios sueltos y completo', () => {
    let draft = EMPTY_COVERAGE;

    expect(departmentState(draft, '05')).toBe('none');

    draft = toggleMunicipality(draft, '05001');
    expect(departmentState(draft, '05')).toBe('partial');
    expect(ariaChecked(departmentState(draft, '05'))).toBe('mixed');
    expect(municipalityState(draft, '05001')).toBe('individual');

    draft = toggleDepartment(draft, '05');
    expect(departmentState(draft, '05')).toBe('full');
    expect(ariaChecked('full')).toBe('true');
    // El departamento completo absorbe el municipio suelto: no conviven.
    expect(draft.municipalities.has('05001')).toBe(false);
    expect(municipalityState(draft, '05001')).toBe('department');
  });

  it('desmarcar un municipio de un departamento completo lo excluye, y volver a marcarlo lo devuelve', () => {
    let draft = toggleDepartment(EMPTY_COVERAGE, '05');

    draft = toggleMunicipality(draft, '05615');
    expect(municipalityState(draft, '05615')).toBe('excluded');
    expect(departmentState(draft, '05')).toBe('partial');

    draft = toggleMunicipality(draft, '05615');
    expect(municipalityState(draft, '05615')).toBe('department');
    expect(departmentState(draft, '05')).toBe('full');
  });

  it('pulsar un departamento parcial lo completa y limpia sus exclusiones; pulsar el completo lo quita', () => {
    let draft = toggleMunicipality(toggleDepartment(EMPTY_COVERAGE, '05'), '05615');

    draft = toggleDepartment(draft, '05');
    expect(departmentState(draft, '05')).toBe('full');
    expect(draft.exclusions.size).toBe(0);

    draft = toggleDepartment(draft, '05');
    expect(departmentState(draft, '05')).toBe('none');
  });

  it('el respaldo nacional sustituye departamentos y municipios y admite exclusiones', () => {
    let draft = toggleMunicipality(toggleDepartment(EMPTY_COVERAGE, '05'), '05615');

    draft = toggleMunicipality(draft, '11001');
    draft = setNational(draft, true);

    expect(draft.departments.size).toBe(0);
    expect(draft.municipalities.size).toBe(0);
    expect([...draft.exclusions]).toEqual(['05615']);
    expect(municipalityState(draft, '76001')).toBe('national');
    // Con respaldo nacional, la casilla del departamento no cambia nada.
    expect(toggleDepartment(draft, '76')).toBe(draft);

    expect(setNational(draft, false)).toEqual(EMPTY_COVERAGE);
  });

  it('las entradas del backend se leen por código y se ignoran las mal formadas', () => {
    const draft = coverageFromEntries([
      { kind: 'department', code: '05' },
      { kind: 'exclusion', code: '05615' },
      { kind: 'municipality', code: '11001' },
      { kind: 'municipality', code: 'Medellín' },
      { kind: 'national', code: 'XX' },
    ]);

    expect(draft).toEqual({
      national: false,
      departments: new Set(['05']),
      municipalities: new Set(['11001']),
      exclusions: new Set(['05615']),
    });
  });

  it('el cambio se expresa como altas y bajas por código', () => {
    const before = coverageFromEntries([{ kind: 'municipality', code: '05001' }]);
    const after = toggleDepartment(before, '05');

    expect(diffCoverage(before, after)).toEqual({
      add: [{ kind: 'department', code: '05' }],
      remove: [{ kind: 'municipality', code: '05001' }],
    });
  });

  it('un cambio que cabe viaja en una sola petición; uno grande, bajas primero y exclusiones antes que su departamento', () => {
    const small = { add: [{ kind: 'department' as const, code: '05' }], remove: [] };

    expect(batchCoverage(small, 400)).toEqual([small]);

    const big = {
      add: [
        { kind: 'exclusion' as const, code: '05615' },
        { kind: 'department' as const, code: '05' },
        { kind: 'municipality' as const, code: '11001' },
      ],
      remove: [
        { kind: 'department' as const, code: '15' },
        { kind: 'exclusion' as const, code: '15238' },
        { kind: 'municipality' as const, code: '76001' },
      ],
    };
    const batches = batchCoverage(big, 2);

    expect(
      batches.map((batch) => [batch.add.map((c) => c.kind), batch.remove.map((c) => c.kind)]),
    ).toEqual([
      [[], ['exclusion', 'municipality']],
      [[], ['department']],
      [['department', 'municipality'], []],
      [['exclusion'], []],
    ]);
  });

  it('el resumen por departamento nombra modo, sueltos y exclusiones', () => {
    const draft = coverageFromEntries([
      { kind: 'department', code: '05' },
      { kind: 'exclusion', code: '05615' },
      { kind: 'municipality', code: '76001' },
    ]);

    expect(summariseCoverage(draft)).toEqual([
      { departmentCode: '05', mode: 'whole', municipalities: [], exclusions: ['05615'] },
      { departmentCode: '76', mode: 'municipalities', municipalities: ['76001'], exclusions: [] },
    ]);
  });
});

describe('tarifas: los cinco tipos y validación COP', () => {
  it('gratis declara $ 0 sin pedir montos', () => {
    expect(rateFromDraft({ ...EMPTY_RATE_DRAFT, type: 'free' })).toEqual({
      ok: true,
      rate: {
        type: 'free',
        amountCop: null,
        unitCop: null,
        baseCop: null,
        additionalUnitCop: null,
      },
    });
  });

  it('cada tipo produce solo sus montos', () => {
    const full = {
      amountCop: '12.000',
      unitCop: '5.000',
      baseCop: '20.000',
      additionalUnitCop: '4.000',
    };

    expect(rateFromDraft({ type: 'flat_order', ...full })).toMatchObject({
      rate: { amountCop: 12000, unitCop: null, baseCop: null, additionalUnitCop: null },
    });
    expect(rateFromDraft({ type: 'per_unit', ...full })).toMatchObject({
      rate: { amountCop: null, unitCop: 5000, baseCop: null, additionalUnitCop: null },
    });
    expect(rateFromDraft({ type: 'base_plus_additional', ...full })).toMatchObject({
      rate: { amountCop: null, unitCop: null, baseCop: 20000, additionalUnitCop: 4000 },
    });
    expect(rateFromDraft({ type: 'manual_quote', ...full })).toMatchObject({
      rate: { amountCop: null, unitCop: null, baseCop: null, additionalUnitCop: null },
    });
  });

  it('un campo vacío nunca es envío gratis', () => {
    const result = rateFromDraft({ ...EMPTY_RATE_DRAFT, type: 'flat_order' });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.amountCop).toContain('no significa envío gratis');
  });

  it.each([
    ['-1000', 'negativo'],
    ['1.500,50', 'decimales'],
    ['12,5', 'decimales'],
    ['1.45', 'Agrupa'],
    ['abc', 'Solo dígitos'],
    ['10.000.001', 'superar'],
    ['0', 'Gratis'],
  ])('rechaza «%s»', (raw, expected) => {
    const result = rateFromDraft({ ...EMPTY_RATE_DRAFT, type: 'flat_order', amountCop: raw });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.amountCop).toContain(expected);
  });

  it('el valor adicional admite cero; la base no', () => {
    expect(
      rateFromDraft({
        ...EMPTY_RATE_DRAFT,
        type: 'base_plus_additional',
        baseCop: '20000',
        additionalUnitCop: '0',
      }).ok,
    ).toBe(true);
    expect(
      rateFromDraft({
        ...EMPTY_RATE_DRAFT,
        type: 'base_plus_additional',
        baseCop: '0',
        additionalUnitCop: '0',
      }).ok,
    ).toBe(false);
  });

  it('sin tipo elegido no hay tarifa', () => {
    expect(rateFromDraft(EMPTY_RATE_DRAFT)).toEqual({
      ok: false,
      errors: { type: 'Elige el tipo de tarifa.' },
    });
  });

  it('el ejemplo usa formato colombiano y la fórmula de cada tipo', () => {
    expect(
      plain(
        illustrateRate(
          {
            type: 'base_plus_additional',
            amountCop: null,
            unitCop: null,
            baseCop: 45000,
            additionalUnitCop: 15000,
          },
          3,
        ),
      ),
    ).toBe('3 unidades: $ 45.000 + 2 × $ 15.000 = $ 75.000');
    expect(
      plain(
        illustrateRate(
          {
            type: 'per_unit',
            amountCop: null,
            unitCop: 9000,
            baseCop: null,
            additionalUnitCop: null,
          },
          3,
        ),
      ),
    ).toBe('3 unidades: 3 × $ 9.000 = $ 27.000');
    expect(
      plain(
        illustrateRate(
          {
            type: 'flat_order',
            amountCop: 1450000,
            unitCop: null,
            baseCop: null,
            additionalUnitCop: null,
          },
          1,
        ),
      ),
    ).toBe('1 unidad: $ 1.450.000 (una vez por pedido)');
  });

  it('editar recupera el borrador con separadores', () => {
    expect(
      draftFromRate({
        type: 'flat_order',
        amountCop: 18000,
        unitCop: null,
        baseCop: null,
        additionalUnitCop: null,
      }),
    ).toEqual({
      type: 'flat_order',
      amountCop: '18.000',
      unitCop: '',
      baseCop: '',
      additionalUnitCop: '',
    });
  });

  it('días de tránsito: enteros de 0 a 90 y mínimo no mayor que máximo', () => {
    expect(parseTransit('', '')).toEqual({ ok: true, min: null, max: null });
    expect(parseTransit('2', '5')).toEqual({ ok: true, min: 2, max: 5 });
    expect(parseTransit('6', '5').ok).toBe(false);
    expect(parseTransit('91', '').ok).toBe(false);
    expect(parseTransit('1.5', '').ok).toBe(false);
  });
});

describe('listado: filtros, cursor y URL', () => {
  const NOW = new Date('2026-10-02T12:00:00.000Z');
  const base: ZoneFilters = {
    tab: 'current',
    q: '',
    status: '',
    copyState: '',
    rate: '',
    validity: '',
    municipality: '',
    cursor: '',
    page: 1,
  };

  it('lee la URL e ignora valores que no son del contrato', () => {
    expect(
      parseZoneFilters({
        vista: 'copias',
        q: '  Costa ',
        estado: 'active',
        copia: 'failed',
        tarifa: 'gratis',
        vigencia: 'windowed',
        municipio: ' Medellín ',
        pagina: '3',
      }),
    ).toEqual({
      ...base,
      tab: 'copies',
      q: 'Costa',
      copyState: 'failed',
      validity: 'windowed',
      municipality: 'Medellín',
    });
    // Sin cursor no hay página 3: el número de página solo acompaña a un cursor.
    expect(parseZoneFilters({ pagina: '3' }).page).toBe(1);
    expect(parseZoneFilters({ vigencia: 'expired' }).validity).toBe('');
  });

  it('el cursor solo viaja con los filtros que lo produjeron y cambiar un filtro vuelve a la primera página', () => {
    const paged = { ...base, q: 'ruta', cursor: 'abc', page: 3 };

    expect(zoneListHref(paged)).toBe('/panel/envios?q=ruta&cursor=abc&pagina=3');
    expect(zoneListHref(firstPage(paged))).toBe('/panel/envios?q=ruta');
    // Un formulario de filtros no lleva cursor: lo que llega de él empieza siempre en la página 1.
    expect(parseZoneFilters({ q: 'otra', estado: 'draft' })).toMatchObject({ cursor: '', page: 1 });
    expect(zoneListHref({ tab: 'current' })).toBe('/panel/envios');
  });

  it('traduce los filtros a la consulta del contrato; el municipio viaja como código', () => {
    expect(
      toZoneQuery(
        { ...base, q: 'va', status: 'active', rate: 'per_unit', validity: 'always', cursor: 'c1' },
        '05001',
      ),
    ).toEqual({
      view: 'current',
      pageSize: 20,
      q: 'va',
      status: 'active',
      rateType: 'per_unit',
      validity: 'always',
      municipalityCode: '05001',
      pageToken: 'c1',
    });
    // Una búsqueda de una letra no se manda: el contrato pide 2 o más.
    expect(toZoneQuery({ ...base, q: 'v' }, null)).toEqual({ view: 'current', pageSize: 20 });
    expect(toZoneQuery({ ...base, tab: 'copies', copyState: 'failed' }, null)).toMatchObject({
      view: 'copies',
      copyState: 'failed',
    });
  });

  it('ninguna copia incompleta se pinta como zona utilizable fuera de «Copias»', () => {
    const zones = [
      zone({ id: 'a', status: 'active' }),
      zone({ id: 'd', copy: { state: 'failed', error: 'x', operationId: 'o', sourceZoneId: 'a' } }),
    ];

    expect(usableForTab(zones, 'current').map((item) => item.id)).toEqual(['a']);
    expect(usableForTab(zones, 'copies').map((item) => item.id)).toEqual(['a', 'd']);
  });

  it('nunca pinta el identificador de quien hizo el cambio', () => {
    const names = new Map([['adm_b', 'Laura']]);

    expect(describeActor('adm_a', 'adm_a', names)).toBe('Tú');
    expect(describeActor('adm_b', 'adm_a', names)).toBe('Laura');
    expect(describeActor('adm_c', 'adm_a', names)).toBe('Otra cuenta del panel');
  });

  it('la vigencia se lee de las fechas, sin decidir si cotiza', () => {
    expect(validityState(zone(), NOW)).toBe('none');
    expect(
      validityState(
        zone({ validFrom: '2026-01-01T00:00:00Z', validUntil: '2027-01-01T00:00:00Z' }),
        NOW,
      ),
    ).toBe('current');
  });
});

describe('información de la zona', () => {
  it('la vigencia viaja con desfase explícito de Bogotá y vuelve a la hora local', () => {
    expect(localToIso('2026-11-01T00:00')).toBe('2026-11-01T00:00:00-05:00');
    expect(isoToLocal('2026-11-01T05:00:00.000Z')).toBe('2026-11-01T00:00');
    expect(localToIso('mañana')).toBeNull();
  });

  it('valida nombre, prioridad, ventana y comportamiento sin regla', () => {
    const result = parseZoneDraft({
      name: ' ',
      description: '',
      priority: '1001',
      validFrom: '2026-12-01T00:00',
      validUntil: '2026-11-01T00:00',
      unmatchedProductBehavior: '',
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(
      ['name', 'priority', 'unmatchedProductBehavior', 'validUntil'].sort(),
    );
  });

  it('solo manda lo que cambió', () => {
    const saved = zone({ name: 'A', priority: 10, validFrom: '2026-11-01T05:00:00.000Z' });

    expect(
      changedFields(saved, {
        name: 'A',
        description: null,
        priority: 20,
        validFrom: '2026-11-01T00:00:00-05:00',
        validUntil: null,
        unmatchedProductBehavior: 'unavailable',
      }),
    ).toEqual({ priority: 20 });
  });

  it('sin shipping.manage, archivada o copia sin terminar: solo lectura', () => {
    expect(readOnlyReason(zone(), false)).toContain('solo lectura');
    expect(readOnlyReason(zone({ status: 'archived' }), true)).toContain('archivada');
    expect(
      readOnlyReason(
        zone({ copy: { state: 'copying', error: null, operationId: 'o', sourceZoneId: 's' } }),
        true,
      ),
    ).toContain('copia');
    expect(readOnlyReason(zone(), true)).toBeNull();
  });
});

describe('revisión y activación bloqueada', () => {
  const covered = {
    national: false,
    departmentCodes: ['05'],
    municipalitiesByDepartment: {},
    exclusionsByDepartment: {},
  };
  const rule = {
    status: 'active' as const,
    scope: 'all' as const,
    targetCount: 0,
    rate: {
      type: 'free' as const,
      amountCop: null,
      unitCop: null,
      baseCop: null,
      additionalUnitCop: null,
    },
  };
  const input = (overrides: Partial<Parameters<typeof reviewZone>[0]> = {}) => ({
    zone: zone({ coverage: covered }),
    rules: [rule],
    now: new Date('2026-10-02T12:00:00Z'),
    analysis: null,
    ...overrides,
  });

  it('un borrador con cobertura y una regla se puede activar', () => {
    const items = reviewZone(input());

    expect(canActivate(items, zone())).toBe(true);
  });

  it.each([
    ['sin cobertura', { zone: zone() }],
    ['sin reglas', { rules: [] }],
    [
      'copiando',
      {
        zone: zone({
          coverage: covered,
          copy: { state: 'copying', error: null, operationId: 'o', sourceZoneId: 's' },
        }),
      },
    ],
    [
      'copia fallida',
      {
        zone: zone({
          coverage: covered,
          copy: { state: 'failed', error: 'x', operationId: 'o', sourceZoneId: 's' },
        }),
      },
    ],
    ['archivada', { zone: zone({ coverage: covered, status: 'archived' }) }],
  ])('%s bloquea la activación', (_label, overrides) => {
    const value = input(overrides);
    const items = reviewZone(value);

    expect(items.some((item) => item.severity === 'blocking')).toBe(true);
    expect(canActivate(items, value.zone)).toBe(false);
  });

  it('avisa de la falta de cobertura y de la vigencia, sin hablar nunca de cero', () => {
    const items = reviewZone(
      input({
        zone: zone({ coverage: covered, priority: 200, validUntil: '2026-01-01T00:00:00Z' }),
        rules: [{ ...rule, scope: 'products' }],
        analysis: {
          conflicts: [],
          uncoveredMunicipalityCodes: ['91263'],
          totalMunicipalityCount: 1122,
        },
      }),
    );
    const text = items.map((item) => item.text).join(' ');

    expect(text).toContain('1 de 1122 municipios');
    expect(text).toContain('vigencia ya terminó');
    expect(text).toContain('nunca gratis');
    expect(text).toContain('no alcanza a ningún producto');
    expect(text).not.toMatch(/\$ ?0|costo cero(?! nunca)/);
  });

  it('una zona activa no ofrece activarse otra vez', () => {
    const active = zone({ coverage: covered, status: 'active' });

    expect(canActivate(reviewZone(input({ zone: active })), active)).toBe(false);
  });
});

describe('asignación masiva', () => {
  it('compara antes de confirmar', () => {
    const existing = new Set(['p1', 'p2']);

    expect(planAssignment(['p1', 'p3', 'p3'], existing, 'add')).toEqual({
      change: ['p3'],
      unchanged: ['p1'],
    });
    expect(planAssignment(['p1', 'p3'], existing, 'remove')).toEqual({
      change: ['p1'],
      unchanged: ['p3'],
    });
    expect(diffTargets(new Set(['a', 'b']), new Set(['b', 'c']))).toEqual({
      add: ['c'],
      remove: ['a'],
    });
  });

  it('parte en lotes de 400', () => {
    const add = Array.from({ length: 401 }, (_, index) => `p${index}`);
    const batches = batchTargets(add, ['x']);

    expect(batches.map((batch) => [batch.add.length, batch.remove.length])).toEqual([
      [400, 1],
      [1, 0],
    ]);
  });

  it('resume el desenlace por elemento', () => {
    const summary = summariseResults([
      { value: 'a', outcome: 'added' },
      { value: 'b', outcome: 'unchanged' },
      { value: 'c', outcome: 'failed', code: 'target_taken' },
    ]);

    expect(summary).toEqual({
      added: 1,
      removed: 0,
      unchanged: 1,
      failed: [{ value: 'c', code: 'target_taken' }],
    });
    expect(describeSummary(summary)).toBe('1 asignado, 1 sin cambios, 1 no aplicado.');
  });
});

describe('vista previa', () => {
  const chair: PickerProduct = {
    id: 'prd_silla',
    name: 'Silla',
    sku: 'S-1',
    status: 'active',
    categorySlug: 'sillas',
    categoryName: 'Sillas',
    variants: [],
  };
  const table: PickerProduct = {
    ...chair,
    id: 'prd_mesa',
    name: 'Mesa',
    variants: [{ id: 'v1', sku: 'M-1', label: '160 cm' }],
  };

  it('exige destino coherente, productos, variante y cantidad entera', () => {
    const result = buildPreviewRequest({
      departmentCode: '05',
      municipalityCode: '11001',
      lines: [
        { key: 'a', product: table, variantId: '', quantity: '1' },
        { key: 'b', product: chair, variantId: '', quantity: '0' },
      ],
      draftZoneIds: [],
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems).toMatchObject({
      destination: 'El municipio no pertenece al departamento elegido.',
      byLine: {
        a: 'Este producto tiene variantes: elige cuál.',
        b: 'La cantidad es un entero de 1 a 100.',
      },
    });
  });

  it('manda productos, variantes y cantidades; nunca precios', () => {
    const result = buildPreviewRequest({
      departmentCode: '05',
      municipalityCode: '05001',
      lines: [
        { key: 'a', product: table, variantId: 'v1', quantity: '2' },
        { key: 'b', product: chair, variantId: '', quantity: '1' },
      ],
      draftZoneIds: ['shz_draft'],
    });

    expect(result).toEqual({
      ok: true,
      request: {
        destination: { country: 'CO', departmentCode: '05', municipalityCode: '05001' },
        items: [
          { productId: 'prd_mesa', quantity: 2, variantId: 'v1' },
          { productId: 'prd_silla', quantity: 1 },
        ],
        includeDraftZoneIds: ['shz_draft'],
      },
    });
  });

  it('el total nunca convierte la falta de envío en cero', () => {
    expect(describeTotal({ outcome: 'manual_quote', totalCop: null })).toEqual({
      label: 'Cotización manual: sin monto',
      amount: null,
    });
    expect(describeTotal({ outcome: 'unavailable', totalCop: null }).amount).toBeNull();
    expect(plain(describeTotal({ outcome: 'free', totalCop: 0 }).amount ?? '')).toBe('$ 0');
    expect(plain(describeTotal({ outcome: 'charged', totalCop: 63000 }).amount ?? '')).toBe(
      '$ 63.000',
    );
  });

  it('advierte empates, productos sin cobertura y zonas en borrador', () => {
    const preview: ShippingPreview = {
      quoteId: 'q',
      rulesetRevision: 4,
      geographyVersion: 'g',
      location: null,
      outcome: 'unavailable',
      reason: 'ambiguous_configuration',
      totalCop: null,
      charges: [],
      blockingProductIds: ['prd_silla'],
      lines: [
        {
          lineIndex: 0,
          productId: 'prd_silla',
          variantId: null,
          outcome: 'unavailable',
          reason: 'ambiguous_configuration',
          level: 'department',
          zoneId: null,
          ruleId: null,
        },
        {
          lineIndex: 1,
          productId: 'prd_mesa',
          variantId: 'v1',
          outcome: 'manual_quote',
          reason: 'product_not_covered',
          level: 'municipality',
          zoneId: 'shz_draft',
          ruleId: null,
        },
      ],
    };
    const text = previewWarnings(preview, {
      draftZoneIds: new Set(['shz_draft']),
      productName: (id) => (id === 'prd_silla' ? 'Silla' : 'Mesa'),
    })
      .map((warning) => warning.text)
      .join(' ');

    expect(text).toContain('Empate');
    expect(text).toContain('Producto sin cobertura: Mesa');
    expect(text).toContain('Bloquean el carrito: Silla');
    expect(text).toContain('Zona inactiva');
  });
});

describe('cuerpos del BFF', () => {
  it('la tarifa lleva exactamente sus montos', () => {
    expect(
      parseRate({
        type: 'free',
        amountCop: null,
        unitCop: null,
        baseCop: null,
        additionalUnitCop: null,
      }),
    ).not.toBeNull();
    expect(parseRate({ type: 'free' })).not.toBeNull();
    expect(parseRate({ type: 'flat_order' })).toBeNull();
    expect(parseRate({ type: 'flat_order', amountCop: 10_000_001 })).toBeNull();
    expect(parseRate({ type: 'flat_order', amountCop: 1000, unitCop: 1 })).toBeNull();
    expect(parseRate({ type: 'gratis' })).toBeNull();
  });

  it('la cobertura solo admite códigos DIVIPOLA y como mucho 400 por lado', () => {
    expect(
      parseCoverageUpdate({ expectedVersion: 1, add: [{ kind: 'national', code: 'CO' }] }),
    ).not.toBeNull();
    expect(
      parseCoverageUpdate({ expectedVersion: 1, add: [{ kind: 'department', code: '5' }] }),
    ).toBeNull();
    expect(parseCoverageUpdate({ expectedVersion: 1 })).toBeNull();
    expect(
      parseCoverageUpdate({
        expectedVersion: 1,
        add: Array.from({ length: 401 }, (_, index) => ({
          kind: 'municipality',
          code: String(10000 + index),
        })),
      }),
    ).toBeNull();
  });

  it('las operaciones idempotentes exigen una clave de 16 a 128 caracteres', () => {
    expect(parseDuplicate({ idempotencyKey: 'x'.repeat(15), expectedVersion: 1 })).toBeNull();
    expect(parseDuplicate({ idempotencyKey: 'x'.repeat(16), expectedVersion: 1 })).not.toBeNull();
    expect(
      parseTargets({ idempotencyKey: 'x'.repeat(16), expectedVersion: 1, add: [] }),
    ).toBeNull();
  });

  it('la vista previa rechaza un municipio de otro departamento y campos de más', () => {
    const destination = { departmentCode: '05', municipalityCode: '05001' };

    expect(parsePreview({ destination, items: [{ productId: 'p', quantity: 1 }] })).not.toBeNull();
    expect(
      parsePreview({
        destination: { ...destination, municipalityCode: '11001' },
        items: [{ productId: 'p', quantity: 1 }],
      }),
    ).toBeNull();
    expect(parsePreview({ destination, items: [{ productId: 'p', quantity: 101 }] })).toBeNull();
    expect(parsePreview({ destination, items: [] })).toBeNull();
  });
});

describe('errores', () => {
  it.each([
    ['shipping_zone_version_conflict', 409, 'backend_conflict'],
    ['shipping_rule_version_conflict', 409, 'backend_conflict'],
    ['shipping_zone_not_found', 404, 'backend_shipping_zone_not_found'],
    ['shipping_rule_not_found', 404, 'backend_shipping_rule_not_found'],
    ['shipping_zone_ambiguous', 409, 'backend_shipping_zone_ambiguous'],
    ['shipping_invalid', 400, 'backend_shipping_invalid'],
    ['shipping_transition_invalid', 409, 'backend_shipping_transition_invalid'],
    ['shipping_idempotency_conflict', 409, 'backend_idempotency_conflict'],
    ['shipping_ruleset_changed', 409, 'backend_shipping_ruleset_changed'],
    ['geography_department_not_found', 404, 'backend_geography_department_not_found'],
    ['admin_forbidden', 403, 'backend_forbidden'],
    ['shipping_copy_operation_not_found', 404, 'backend_shipping_copy_operation_not_found'],
    ['shipping_product_not_found', 404, 'backend_shipping_product_not_found'],
  ])('%s se traduce a %s', (code, status, expected) => {
    expect(shippingFailure(status, { code, message: 'x' }).code).toBe(expected);
  });

  it('un error nunca lleva un identificador de copia: ni siquiera si el backend mandara uno', () => {
    const failure = shippingFailure(409, {
      code: 'shipping_zone_version_conflict',
      message: 'copyOperationId=abc123',
      copyOperationId: 'abc123',
    });

    expect(failure.code).toBe('backend_conflict');
    expect(Object.keys(failure)).not.toContain('operationId');
    expect(JSON.stringify(failure)).not.toContain('abc123');
  });

  it('un 400 con cursor es un cursor inválido; un 503 con filtros, una consulta no disponible', () => {
    const invalid = shippingFailure(400, { code: 'shipping_invalid' });
    const down = shippingFailure(503, { code: 'shipping_unavailable' });

    expect(listingFailure(invalid, { cursor: true, filtered: false }).code).toBe(
      'backend_cursor_invalid',
    );
    expect(listingFailure(invalid, { cursor: false, filtered: true }).code).toBe(
      'backend_shipping_invalid',
    );
    expect(listingFailure(down, { cursor: false, filtered: true }).code).toBe(
      'backend_query_unavailable',
    );
    expect(listingFailure(down, { cursor: false, filtered: false }).code).toBe(
      'backend_unavailable',
    );
  });

  it('un 409 desconocido no se convierte en conflicto de versión', () => {
    const failure = shippingFailure(409, { code: 'algo_nuevo', message: 'x' });

    expect(failure).toBeInstanceOf(BackendFailure);
    expect(failure.code).toBe('backend_conflict_unrecognized');
    expect(failure.reference).toBe('algo_nuevo');
  });

  it('un mensaje con forma de frase no viaja como referencia', () => {
    expect(shippingFailure(409, { code: 'Error at /srv/app.js:12' }).reference).toBeNull();
  });

  it('cada código tiene un mensaje en español sin trazas ni rutas', () => {
    for (const code of [
      'version_conflict',
      'shipping_zone_not_found',
      'shipping_zone_ambiguous',
      'shipping_invalid',
      'shipping_transition_invalid',
      'idempotency_conflict',
      'admin_role_required',
      'copy_operation_not_found',
      'cursor_invalid',
      'query_unavailable',
      'preview_variant_required',
    ]) {
      const message = describeShippingFailure(code);

      expect(message).not.toMatch(/\/|Error|stack|at /);
      expect(message.length).toBeGreaterThan(20);
    }
  });

  it('el conflicto de versión no dice «guardado» y ofrece recargar', () => {
    expect(describeShippingFailure('version_conflict')).toContain('No se guardó nada');
    expect(offersReload('version_conflict')).toBe(true);
    expect(offersReload('shipping_zone_ambiguous')).toBe(false);
    expect(keepsKey('service_unavailable')).toBe(true);
    expect(keepsKey('idempotency_conflict')).toBe(false);
  });
});

describe('operaciones de copia', () => {
  it('ofrece reanudar y descartar solo mientras la copia no terminó', () => {
    expect(copyActions('copying')).toEqual(['resume', 'discard']);
    expect(copyActions('failed')).toEqual(['resume', 'discard']);
    expect(copyActions('ready')).toEqual([]);
    expect(copyActions('discarded')).toEqual([]);
  });

  it('descartar una terminada es el único 409 de la operación', () => {
    expect(describeCopyActionFailure('discard', 'shipping_transition_invalid')).toContain(
      'ya terminó',
    );
    expect(describeCopyActionFailure('resume', 'shipping_transition_invalid')).toBeNull();
    expect(describeCopyActionFailure('resume', 'service_unavailable')).toBeNull();
  });

  it('cada código de éxito admite exactamente los estados que publica el contrato', () => {
    expect(isPublishedCopyAnswer(201, 'ready')).toBe(true);
    expect(isPublishedCopyAnswer(201, 'failed')).toBe(false);
    expect(isPublishedCopyAnswer(202, 'copying')).toBe(true);
    expect(isPublishedCopyAnswer(202, 'failed')).toBe(true);
    expect(isPublishedCopyAnswer(202, 'ready')).toBe(false);
    expect(isPublishedCopyAnswer(200, 'ready')).toBe(true);
    expect(isPublishedCopyAnswer(200, 'discarded')).toBe(true);
    expect(isPublishedCopyAnswer(200, 'copying')).toBe(false);
    expect(isPublishedCopyAnswer(204, 'ready')).toBe(false);
  });

  it('el motivo de un fallo sale de failureCode, nunca de message', () => {
    expect(describeCopyFailure('copy_step_failed')).toContain('lote');
    expect(describeCopyFailure('copy_source_changed')).toContain('zona original cambió');
    expect(describeCopyFailure('copy_abandoned')).toContain('abandonada');
    expect(describeCopyFailure('shipping_zone_version_conflict')).toBe(
      'La copia no pudo continuar en su estado actual.',
    );
    expect(describeCopyFailure(null)).toBeNull();
  });

  it('el progreso dice la fase siguiente y los contadores, con plurales', () => {
    expect(
      plain(
        describeProgress({
          state: 'copying',
          phase: 'targets',
          copied: { coverage: 12, rules: 1, targets: 0 },
        }),
      ),
    ).toBe(
      '12 entradas de cobertura, 1 regla y 0 asignaciones copiadas · siguiente fase: asignaciones.',
    );
    expect(
      describeProgress({
        state: 'ready',
        phase: 'finish',
        copied: { coverage: 1, rules: 2, targets: 3 },
      }),
    ).toBe('1 entrada de cobertura, 2 reglas y 3 asignaciones copiadas.');
  });
});

describe('relaciones de un producto', () => {
  it('cada motivo de rechazo publicado tiene su texto', () => {
    for (const code of [
      'rule_not_product_scope',
      'rule_version_conflict',
      'rule_not_found',
      'target_taken',
      'rule_archived',
      'zone_archived',
      'zone_copy_incomplete',
      'idempotency_conflict',
    ]) {
      expect(
        describeChange({
          ruleId: 'r',
          action: 'unassign',
          outcome: 'failed',
          code,
          ruleVersion: 1,
        }),
        code,
      ).not.toBe('No se aplicó.');
    }

    expect(
      describeChange({
        ruleId: 'r',
        action: 'unassign',
        outcome: 'failed',
        code: 'rule_not_product_scope',
        ruleVersion: 1,
      }),
    ).toContain('heredada');
  });

  it('origen y relación tienen un texto por valor del contrato', () => {
    expect(Object.keys(ORIGIN_LABELS).sort()).toEqual(
      contractEnum('ShippingProductRelationDto', 'origin'),
    );
    expect(Object.keys(RELATION_LABELS).sort()).toEqual(
      contractEnum('ShippingProductRelationDto', 'relation'),
    );
  });
});
