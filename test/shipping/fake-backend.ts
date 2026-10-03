/**
 * Backend simulado de envíos, **en memoria** y **solo para pruebas y capturas locales**.
 *
 * No forma parte del build: vive fuera de `src/`, ninguna ruta ni módulo de producción lo importa,
 * y `src/lib/api/server-boundary.test.ts` lo comprueba. Habla HTTP como el backend —`Request` en
 * la entrada, `Response` en la salida— para que las pruebas recorran el BFF de verdad: ruta,
 * cliente tipado, `openapi-fetch` y traducción de errores.
 *
 * Todo lo que responde está tipado con los DTOs **generados** del contrato
 * (`src/lib/api/generated/schema.d.ts`): un campo que el contrato no publica no compila. Las
 * reglas que aplica son las que publica OpenAPI —versión optimista, idempotencia, copia por lotes
 * con estados, coherencia de la cobertura, empates por prioridad y nivel, resolución de la vista
 * previa—. No pretende ser el backend: es lo justo para ejercitar el panel contra el contrato.
 *
 * Los datos de ejemplo (geografía reducida, productos, categorías) son fixtures de prueba.
 */

import { createHash } from 'node:crypto';

import type { components } from '../../src/lib/api/generated/schema';

type S = components['schemas'];
type Zone = S['ShippingZoneDto'];
type Rule = S['ShippingRuleDto'];
type Entry = S['ShippingCoverageEntryDto'];
type Rate = S['ShippingRateDto'];
type Product = S['AdminProductDto'];
type Category = S['ProductCategoryDto'];
type Municipality = S['GeographyMunicipalityDto'];
type Department = S['GeographyDepartmentDto'];
type Level = S['ShippingChargeDto']['level'];
type Kind = Entry['kind'];

const NOW = '2026-10-01T15:00:00.000Z';
export const FAKE_ADMIN_UID = 'adm_fake_super';
export const FAKE_OTHER_UID = 'adm_fake_master';

// ------------------------------------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------------------------------------

export const FIXTURE_DEPARTMENTS: Department[] = [
  { code: '05', name: 'Antioquia' },
  { code: '08', name: 'Atlántico' },
  { code: '11', name: 'Bogotá, D.C.' },
  { code: '15', name: 'Boyacá' },
  { code: '76', name: 'Valle del Cauca' },
  { code: '91', name: 'Amazonas' },
];

const m = (
  code: string,
  name: string,
  type: Municipality['type'] = 'municipality',
): Municipality => ({
  code,
  departmentCode: code.slice(0, 2),
  name,
  type,
});

export const FIXTURE_MUNICIPALITIES: Municipality[] = [
  m('05001', 'Medellín'),
  m('05088', 'Bello'),
  m('05129', 'Caldas'),
  m('05212', 'Copacabana'),
  m('05266', 'Envigado'),
  m('05308', 'Girardota'),
  m('05360', 'Itagüí'),
  m('05380', 'La Estrella'),
  m('05615', 'Rionegro'),
  m('05631', 'Sabaneta'),
  m('08001', 'Barranquilla'),
  m('08758', 'Soledad'),
  m('11001', 'Bogotá, D.C.'),
  m('15001', 'Tunja'),
  m('15238', 'Duitama'),
  m('15759', 'Sogamoso'),
  m('76001', 'Cali'),
  m('76520', 'Palmira'),
  m('91001', 'Leticia'),
  m('91263', 'El Encanto', 'non_municipalized_area'),
];

function category(slug: string, name: string, status: Category['status'] = 'active'): Category {
  return {
    id: `cat_${slug}`,
    name,
    slug,
    status,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    assignedProducts: 0,
    activeProducts: 0,
  };
}

export const FIXTURE_CATEGORIES: Category[] = [
  category('sillas', 'Sillas'),
  category('mesas', 'Mesas'),
  category('sofas', 'Sofás'),
  category('iluminacion', 'Iluminación'),
  category('exterior', 'Exterior', 'archived'),
];

function inventory(): S['InventoryControlDto'] {
  return {
    mode: 'tracked',
    quantity: 8,
    lowStockThreshold: 2,
    availability: 'in_stock',
    manualAvailability: null,
  };
}

function product(
  id: string,
  name: string,
  categorySlug: string | null,
  status: Product['status'],
  variants: { id: string; label: string }[] = [],
): Product {
  const cat = FIXTURE_CATEGORIES.find((candidate) => candidate.slug === categorySlug) ?? null;

  return {
    id,
    sku: id.toUpperCase().replace('PRD_', 'MT-'),
    slug: id.replace('prd_', '').replaceAll('_', '-'),
    name,
    shortDescription: '',
    description: '',
    priceCop: 450000,
    inventory: inventory(),
    status,
    version: 3,
    createdAt: NOW,
    updatedAt: NOW,
    publishedAt: status === 'active' ? NOW : null,
    archivedAt: status === 'archived' ? NOW : null,
    images: [],
    category: cat === null ? null : { slug: cat.slug, name: cat.name },
    productType: null,
    attributes: [],
    features: [],
    specifications: { materials: '', measurements: '', warranty: '', care: '' },
    featured: false,
    compareAtPriceCop: null,
    newUntil: null,
    newLabel: null,
    promotionLabel: null,
    promotionBadgeEnabled: false,
    preparationDaysMin: null,
    preparationDaysMax: null,
    variants: variants.map((variant) => ({
      id: variant.id,
      productId: id,
      sku: `${id.toUpperCase()}-${variant.id.slice(-2).toUpperCase()}`,
      attributes: [{ key: 'size', value: variant.label.toLowerCase(), label: variant.label }],
      combinationKey: variant.label.toLowerCase(),
      priceCop: 450000,
      compareAtPriceCop: null,
      inventory: inventory(),
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      version: 1,
    })),
    publicationReadiness: { ready: status !== 'draft', missing: [] },
  };
}

export function fixtureProducts(): Product[] {
  return [
    product('prd_silla_nordica', 'Silla Nórdica', 'sillas', 'active'),
    product('prd_mesa_roble', 'Mesa de comedor Roble', 'mesas', 'active', [
      { id: 'var_mesa_160', label: '160 cm' },
      { id: 'var_mesa_200', label: '200 cm' },
    ]),
    product('prd_sofa_modular', 'Sofá modular tres puestos', 'sofas', 'active'),
    product('prd_lampara_arco', 'Lámpara de pie Arco', 'iluminacion', 'archived'),
    product('prd_estanteria', 'Estantería industrial', null, 'draft'),
  ];
}

// ------------------------------------------------------------------------------------------------
// Estado
// ------------------------------------------------------------------------------------------------

export type FakeOptions = {
  readonly role?: 'super_admin' | 'master_admin' | 'moderator';
  readonly uid?: string;
};

type IdempotentRecord = {
  readonly fingerprint: string;
  readonly response: unknown;
  readonly status: number;
};

type CopyOperation = {
  readonly fingerprint: string;
  readonly copyOperationId: string;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly zoneId: string;
  readonly createdAt: string;
  updatedAt: string;
  phase: S['ShippingCopyOperationDto']['phase'];
  copied: S['ShippingCopyProgressDto'];
};

/** Lo que el contrato llama `copyOperationId`: un hash de la clave, que nunca se guarda. */
export function copyOperationIdOf(idempotencyKey: string): string {
  return createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 40);
}

/** Texto comparable: sin tildes, sin mayúsculas, sin puntuación. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Prefijo de alguna palabra o del texto entero, como describe el contrato. */
function matchesPrefix(text: string, query: string): boolean {
  const haystack = fold(text);
  const needle = fold(query);

  if (needle === '') return true;
  if (haystack.startsWith(needle)) return true;

  return haystack.split(' ').some((word) => word.startsWith(needle));
}

/** Cursor opaco atado a los filtros, con una suma de comprobación. */
function encodeCursor(offset: number, filters: string): string {
  const sum = createHash('sha256').update(`${offset}|${filters}`).digest('hex').slice(0, 12);

  return Buffer.from(JSON.stringify({ o: offset, f: filters, s: sum })).toString('base64url');
}

function decodeCursor(token: string | null, filters: string): number {
  if (token === null || token === '') return 0;

  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      o: number;
      f: string;
      s: string;
    };
    const sum = createHash('sha256').update(`${parsed.o}|${parsed.f}`).digest('hex').slice(0, 12);

    if (parsed.f !== filters || parsed.s !== sum || !Number.isInteger(parsed.o)) throw new Error();

    return parsed.o;
  } catch {
    throw new HttpError(400, 'shipping_invalid');
  }
}

export class FakeShippingBackend {
  role: 'super_admin' | 'master_admin' | 'moderator';
  uid: string;
  zones = new Map<string, Zone>();
  coverage = new Map<string, Entry[]>();
  rules = new Map<string, Rule>();
  targets = new Map<string, Set<string>>();
  products: Product[] = fixtureProducts();
  categories: Category[] = [...FIXTURE_CATEGORIES];
  idempotency = new Map<string, IdempotentRecord>();
  copies = new Map<string, CopyOperation>();
  revision = 1;
  /** La próxima copia se detiene a medias, como un lote fallido. */
  failNextCopy = false;
  /** La próxima copia se queda en `copying`: el backend no consiguió marcar el fallo. */
  stallNextCopy = false;
  /** La próxima reanudación vuelve a fallar en un lote. */
  failNextResume = false;
  /** Prefijo arbitrario de `message`: el panel no debe decidir nada con él. */
  messagePrefix = '';
  /** Simula que la consulta filtrada aún no tiene su índice: 503 con filtros o búsqueda. */
  indexUnavailable = false;
  /** Productos guardados antes de `adminSearchTokens`: no se encuentran por texto. */
  unindexedProductIds = new Set<string>(['prd_estanteria']);
  /** Peticiones de geografía que llegaron, y cuántas se respondieron con 304. */
  geographyRequests = 0;
  geographyNotModified = 0;
  /** Registro de las llamadas recibidas: método y ruta, sin cuerpos. */
  calls: string[] = [];
  private sequence = 0;

  constructor(options: FakeOptions = {}) {
    this.role = options.role ?? 'super_admin';
    this.uid = options.uid ?? FAKE_ADMIN_UID;
  }

  private nextId(prefix: string): string {
    this.sequence += 1;

    return `${prefix}_${String(this.sequence).padStart(16, '0')}`;
  }

  private stamp(): string {
    this.sequence += 1;

    return new Date(Date.parse(NOW) + this.sequence * 60_000).toISOString();
  }

  // --- Lecturas derivadas ---------------------------------------------------------------------

  summary(zoneId: string): Zone['coverage'] {
    const entries = this.coverage.get(zoneId) ?? [];
    const count = (kind: Kind) => {
      const out: Record<string, number> = {};

      for (const entry of entries) {
        if (entry.kind === kind)
          out[entry.code.slice(0, 2)] = (out[entry.code.slice(0, 2)] ?? 0) + 1;
      }

      return out;
    };

    return {
      national: entries.some((entry) => entry.kind === 'national'),
      departmentCodes: entries
        .filter((entry) => entry.kind === 'department')
        .map((entry) => entry.code)
        .sort(),
      municipalitiesByDepartment: count('municipality'),
      exclusionsByDepartment: count('exclusion'),
    };
  }

  private refreshRuleSummary(zoneId: string): void {
    const zone = this.zones.get(zoneId);

    if (zone === undefined) return;

    const active = [...this.rules.values()].filter(
      (rule) => rule.zoneId === zoneId && rule.status === 'active',
    );

    const rateTypeCounts: Record<string, number> = {};

    for (const rule of active) {
      rateTypeCounts[rule.rate.type] = (rateTypeCounts[rule.rate.type] ?? 0) + 1;
    }

    zone.rules = {
      activeCount: active.length,
      allRuleId: active.find((rule) => rule.scope === 'all')?.id ?? null,
      rateTypeCounts,
    };
  }

  /** Cualquier cambio en la zona, su cobertura, sus reglas o sus asignaciones sube su versión. */
  private touch(zoneId: string): Zone {
    const zone = this.zones.get(zoneId) as Zone;

    zone.version += 1;
    zone.updatedAt = this.stamp();
    zone.updatedBy = this.uid;
    zone.coverage = this.summary(zoneId);
    this.refreshRuleSummary(zoneId);
    this.revision += 1;

    return zone;
  }

  /** Nivel con el que una zona cubre un municipio, o `null`. Una exclusión anula la zona. */
  levelOf(zoneId: string, municipalityCode: string): Level | null {
    const entries = this.coverage.get(zoneId) ?? [];
    const has = (kind: Kind, code: string) =>
      entries.some((entry) => entry.kind === kind && entry.code === code);

    if (has('municipality', municipalityCode)) return 'municipality';
    if (has('exclusion', municipalityCode)) return null;
    if (has('department', municipalityCode.slice(0, 2))) return 'department';
    if (has('national', 'CO')) return 'national';

    return null;
  }

  private activeZones(exceptId?: string): Zone[] {
    return [...this.zones.values()].filter(
      (zone) => zone.status === 'active' && zone.copy.state === 'ready' && zone.id !== exceptId,
    );
  }

  /** Primer empate de `zoneId` con otra zona activa: misma prioridad, mismo municipio, mismo nivel. */
  private tieWith(zoneId: string, priority: number): boolean {
    for (const other of this.activeZones(zoneId)) {
      if (other.priority !== priority) continue;

      for (const municipality of FIXTURE_MUNICIPALITIES) {
        const mine = this.levelOf(zoneId, municipality.code);

        if (mine !== null && mine === this.levelOf(other.id, municipality.code)) return true;
      }
    }

    return false;
  }

  // --- Semilla ---------------------------------------------------------------------------------

  seedZone(
    fields: Partial<
      Pick<
        Zone,
        | 'name'
        | 'description'
        | 'priority'
        | 'status'
        | 'validFrom'
        | 'validUntil'
        | 'unmatchedProductBehavior'
      >
    > & {
      readonly coverage?: { kind: Kind; code: string }[];
      readonly rules?: { name: string; scope: Rule['scope']; rate: Rate; targets?: string[] }[];
      readonly updatedBy?: string;
      readonly copy?: Partial<Zone['copy']>;
    },
  ): Zone {
    const id = this.nextId('shz');
    const zone: Zone = {
      id,
      name: fields.name ?? 'Zona',
      description: fields.description ?? null,
      priority: fields.priority ?? 100,
      status: fields.status ?? 'draft',
      validFrom: fields.validFrom ?? null,
      validUntil: fields.validUntil ?? null,
      unmatchedProductBehavior: fields.unmatchedProductBehavior ?? 'unavailable',
      copy: { state: 'ready', error: null, operationId: null, sourceZoneId: null, ...fields.copy },
      coverage: {
        national: false,
        departmentCodes: [],
        municipalitiesByDepartment: {},
        exclusionsByDepartment: {},
      },
      rules: { activeCount: 0, allRuleId: null, rateTypeCounts: {} },
      createdAt: NOW,
      createdBy: fields.updatedBy ?? this.uid,
      updatedAt: this.stamp(),
      updatedBy: fields.updatedBy ?? this.uid,
      activatedAt: fields.status === 'active' ? NOW : null,
      activatedBy: fields.status === 'active' ? (fields.updatedBy ?? this.uid) : null,
      archivedAt: fields.status === 'archived' ? NOW : null,
      archivedBy: fields.status === 'archived' ? (fields.updatedBy ?? this.uid) : null,
      version: 1,
    };

    this.zones.set(id, zone);
    this.coverage.set(
      id,
      (fields.coverage ?? []).map((entry) => ({ zoneId: id, kind: entry.kind, code: entry.code })),
    );

    for (const seed of fields.rules ?? []) {
      const rule = this.makeRule(id, { name: seed.name, scope: seed.scope, rate: seed.rate });

      for (const value of seed.targets ?? []) this.targets.get(rule.id)?.add(value);
      rule.targetCount = this.targets.get(rule.id)?.size ?? 0;
    }

    zone.coverage = this.summary(id);
    this.refreshRuleSummary(id);

    return zone;
  }

  private makeRule(
    zoneId: string,
    body: {
      name: string;
      scope: Rule['scope'];
      rate: Rate;
      transitDaysMin?: number | null;
      transitDaysMax?: number | null;
    },
  ): Rule {
    const id = this.nextId('shr');
    const rule: Rule = {
      id,
      zoneId,
      name: body.name,
      scope: body.scope,
      rate: body.rate,
      status: 'active',
      targetCount: 0,
      transitDaysMin: body.transitDaysMin ?? null,
      transitDaysMax: body.transitDaysMax ?? null,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      version: 1,
    };

    this.rules.set(id, rule);
    this.targets.set(id, new Set());

    return rule;
  }

  // --- HTTP ------------------------------------------------------------------------------------

  handle = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    this.calls.push(`${method} ${url.pathname}`);

    const raw = method === 'GET' || method === 'HEAD' ? '' : await request.text();
    let body: unknown = undefined;

    if (raw !== '') {
      try {
        body = JSON.parse(raw);
      } catch {
        return error(400, 'shipping_invalid');
      }
    }

    const path = url.pathname;
    const isAdmin = path.startsWith('/v1/admin/');

    if (
      isAdmin &&
      path !== '/v1/admin/auth/session' &&
      request.headers.get('x-modulartess-admin-session') === null
    ) {
      return error(401, 'admin_session_required');
    }

    try {
      return this.route(method, path, url.searchParams, request.headers, body);
    } catch (thrown) {
      if (thrown instanceof HttpError) return error(thrown.status, thrown.code);

      throw thrown;
    }
  };

  private requireManage(): void {
    if (this.role === 'moderator') throw new HttpError(403, 'admin_forbidden');
  }

  private route(
    method: string,
    path: string,
    query: URLSearchParams,
    headers: Headers,
    body: unknown,
  ): Response {
    let match: RegExpExecArray | null;

    if (path === '/v1/admin/auth/session' && method === 'GET') {
      return json(200, { principal: { uid: this.uid, role: this.role } });
    }

    // Geografía pública -------------------------------------------------------------------------
    if (path.startsWith('/v1/geography/')) {
      this.geographyRequests += 1;

      if (headers.get('if-none-match') === GEOGRAPHY_ETAG) {
        this.geographyNotModified += 1;

        return new Response(null, { status: 304, headers: { etag: GEOGRAPHY_ETAG } });
      }
    }

    if (path === '/v1/geography/departments' && method === 'GET') {
      return withEtag(
        json(200, {
          items: FIXTURE_DEPARTMENTS,
          version: 'fixture-2026',
          source: {
            dataset: 'DIVIPOLA (fixture)',
            edition: 'fixture',
            publisher: 'DANE',
            retrievedAt: NOW,
          },
        } satisfies S['GeographyDepartmentListDto']),
      );
    }

    if (
      (match = /^\/v1\/geography\/departments\/([^/]+)\/municipalities$/.exec(path)) &&
      method === 'GET'
    ) {
      const department = FIXTURE_DEPARTMENTS.find((candidate) => candidate.code === match?.[1]);

      if (department === undefined) return error(404, 'geography_department_not_found');

      return withEtag(
        json(200, {
          department,
          items: FIXTURE_MUNICIPALITIES.filter((item) => item.departmentCode === department.code),
          version: 'fixture-2026',
        } satisfies S['GeographyMunicipalityListDto']),
      );
    }

    // Catálogo y cuentas, lo justo para los selectores ------------------------------------------
    if (path === '/v1/admin/products' && method === 'GET') {
      const view = query.get('view') ?? 'current';
      const q = (query.get('q') ?? '').trim();

      if (q !== '' && fold(q).length < 2) throw new HttpError(400, 'product_invalid');
      if (q !== '' && this.indexUnavailable) throw new HttpError(503, 'catalog_unavailable');

      const items = this.products.filter(
        (item) =>
          (view === 'all'
            ? true
            : view === 'archived'
              ? item.status === 'archived'
              : item.status !== 'archived') &&
          // Sin `adminSearchTokens`, un producto anterior no aparece por texto, como en Firestore.
          (q === '' ||
            (!this.unindexedProductIds.has(item.id) &&
              [item.name, item.sku, item.slug].some((text) => matchesPrefix(text, q)))),
      );
      const size = Math.min(Number(query.get('pageSize') ?? '20'), 50);
      const filters = JSON.stringify({ view, q });
      const offset = decodeProductCursor(query.get('pageToken'), filters);
      const page = items.slice(offset, offset + size);

      return json(200, {
        items: page,
        nextPageToken: offset + size < items.length ? encodeCursor(offset + size, filters) : null,
      } satisfies S['AdminProductPageDto']);
    }

    if ((match = /^\/v1\/admin\/products\/([^/]+)$/.exec(path)) && method === 'GET') {
      const found = this.products.find((item) => item.id === match?.[1]);

      return found === undefined ? error(404, 'product_not_found') : json(200, found);
    }

    if (path === '/v1/admin/product-categories' && method === 'GET') {
      return json(200, {
        items: this.categories,
        nextPageToken: null,
      } satisfies S['ProductCategoryPageDto']);
    }

    if (path === '/v1/admin/users' && method === 'GET') {
      if (this.role === 'moderator') return error(403, 'admin_forbidden');

      return json(200, {
        items: [
          {
            id: FAKE_OTHER_UID,
            email: 'gerencia@example.invalid',
            displayName: 'Laura Gerencia',
            role: 'master_admin',
            status: 'active',
            version: 1,
            createdAt: NOW,
            activatedAt: NOW,
            lastSessionAt: NOW,
            invitation: { state: 'sent', sendCount: 1, lastAttemptAt: NOW },
            identitySync: 'synced',
          },
        ],
        nextPageToken: null,
      } as S['AdminUserPageDto']);
    }

    // Zonas ---------------------------------------------------------------------------------------
    if (path === '/v1/admin/shipping/zones') {
      if (method === 'GET') {
        return json(200, this.listZones(query));
      }

      if (method === 'POST') {
        this.requireManage();

        const input = body as S['ShippingZoneCreateDto'];

        if (typeof input?.name !== 'string' || input.name.trim() === '' || input.name.length > 80) {
          throw new HttpError(400, 'shipping_invalid');
        }
        if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 1000) {
          throw new HttpError(400, 'shipping_invalid');
        }

        const zone = this.seedZone({
          name: input.name,
          description: input.description ?? null,
          priority: input.priority,
          validFrom: input.validFrom ?? null,
          validUntil: input.validUntil ?? null,
          unmatchedProductBehavior: input.unmatchedProductBehavior ?? 'unavailable',
        });

        this.revision += 1;

        return json(201, zone);
      }
    }

    if ((match = /^\/v1\/admin\/shipping\/zones\/([^/]+)(\/.*)?$/.exec(path))) {
      const zoneId = match[1] as string;
      const rest = match[2] ?? '';
      const zone = this.zones.get(zoneId);

      if (zone === undefined) throw new HttpError(404, 'shipping_zone_not_found');

      return this.zoneRoute(method, rest, zone, query, headers, body);
    }

    // Reglas ---------------------------------------------------------------------------------------
    if ((match = /^\/v1\/admin\/shipping\/rules\/([^/]+)(\/.*)?$/.exec(path))) {
      const rule = this.rules.get(match[1] as string);

      if (rule === undefined) throw new HttpError(404, 'shipping_rule_not_found');

      return this.ruleRoute(method, match[2] ?? '', rule, query, headers, body);
    }

    if (
      (match = /^\/v1\/admin\/shipping\/copy-operations\/([^/]+)(\/resume|\/discard)?$/.exec(path))
    ) {
      const operation = this.copies.get(match[1] as string);

      if (operation === undefined) throw new HttpError(404, 'shipping_copy_operation_not_found');

      return this.copyOperationRoute(method, match[2] ?? '', operation);
    }

    if ((match = /^\/v1\/admin\/shipping\/products\/([^/]+)\/relations$/.exec(path))) {
      const product = this.products.find((item) => item.id === match?.[1]);

      if (product === undefined) throw new HttpError(404, 'shipping_product_not_found');

      return method === 'GET'
        ? json(200, this.relations(product, query))
        : this.changeRelations(product, headers, body);
    }

    if (path === '/v1/admin/shipping/analysis' && method === 'GET')
      return json(200, this.analysis());

    if (path === '/v1/admin/shipping/preview' && method === 'POST') {
      return json(200, this.preview(body as S['ShippingPreviewRequestDto']));
    }

    return error(404, 'not_found');
  }

  private expect(zone: Zone, expectedVersion: unknown): void {
    if (!Number.isInteger(expectedVersion) || (expectedVersion as number) < 1)
      throw new HttpError(400, 'shipping_invalid');
    if (expectedVersion !== zone.version)
      throw new HttpError(409, 'shipping_zone_version_conflict');
  }

  private editable(zone: Zone): void {
    if (zone.copy.state !== 'ready' || zone.status === 'archived') {
      throw new HttpError(409, 'shipping_transition_invalid');
    }
  }

  private zoneRoute(
    method: string,
    rest: string,
    zone: Zone,
    query: URLSearchParams,
    headers: Headers,
    body: unknown,
  ): Response {
    const input = (body ?? {}) as Record<string, unknown>;

    if (rest === '' && method === 'GET') return json(200, zone);

    if (rest === '' && method === 'PATCH') {
      this.requireManage();
      this.expect(zone, input.expectedVersion);
      this.editable(zone);

      const priority = (input.priority as number | undefined) ?? zone.priority;

      if (
        zone.status === 'active' &&
        priority !== zone.priority &&
        this.tieWith(zone.id, priority)
      ) {
        throw new HttpError(409, 'shipping_zone_ambiguous');
      }

      for (const key of [
        'name',
        'description',
        'priority',
        'validFrom',
        'validUntil',
        'unmatchedProductBehavior',
      ] as const) {
        if (input[key] !== undefined) (zone as Record<string, unknown>)[key] = input[key];
      }

      return json(200, this.touch(zone.id));
    }

    if (rest === '/activate' && method === 'POST') {
      this.requireManage();
      this.expect(zone, input.expectedVersion);

      if (zone.status !== 'draft' || zone.copy.state !== 'ready')
        throw new HttpError(409, 'shipping_transition_invalid');
      if ((this.coverage.get(zone.id) ?? []).length === 0 || zone.rules.activeCount === 0) {
        throw new HttpError(409, 'shipping_transition_invalid');
      }
      if (this.tieWith(zone.id, zone.priority)) throw new HttpError(409, 'shipping_zone_ambiguous');

      zone.status = 'active';
      zone.activatedAt = NOW;
      zone.activatedBy = this.uid;

      return json(200, this.touch(zone.id));
    }

    if (rest === '/archive' && method === 'POST') {
      this.requireManage();
      this.expect(zone, input.expectedVersion);

      if (zone.status === 'archived' || zone.copy.state !== 'ready')
        throw new HttpError(409, 'shipping_transition_invalid');

      zone.status = 'archived';
      zone.archivedAt = NOW;
      zone.archivedBy = this.uid;

      return json(200, this.touch(zone.id));
    }

    if (rest === '/duplicate' && method === 'POST') {
      this.requireManage();

      const key = headers.get('idempotency-key') ?? '';

      if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new HttpError(400, 'shipping_invalid');

      const fingerprint = JSON.stringify({ zone: zone.id, body: input });
      const copyOperationId = copyOperationIdOf(key);
      const existing = this.copies.get(copyOperationId);

      if (existing !== undefined) {
        if (existing.fingerprint !== fingerprint) {
          throw new HttpError(409, 'shipping_idempotency_conflict');
        }

        const copy = this.zones.get(existing.zoneId) as Zone;

        // Repetir la clave reanuda; una descartada responde 200 sin copiar nada.
        if (copy.copy.state === 'discarded') return json(200, this.copyOperation(existing));
        if (copy.copy.state === 'failed' || copy.copy.state === 'copying') {
          this.completeCopy(zone, copy, existing);
        }

        return json(201, this.copyOperation(existing));
      }

      this.expect(zone, input.expectedVersion);
      this.editable(zone);

      const copy = this.seedZone({
        name: typeof input.name === 'string' ? input.name : `${zone.name} (copia)`,
        description: zone.description,
        priority: zone.priority,
        validFrom: zone.validFrom,
        validUntil: zone.validUntil,
        unmatchedProductBehavior: zone.unmatchedProductBehavior,
        copy: {
          state: 'copying',
          sourceZoneId: zone.id,
          operationId: copyOperationId,
          error: null,
        },
      });
      const operation: CopyOperation = {
        fingerprint,
        copyOperationId,
        sourceId: zone.id,
        sourceVersion: zone.version,
        zoneId: copy.id,
        createdAt: this.stamp(),
        updatedAt: this.stamp(),
        phase: 'coverage',
        copied: { coverage: 0, rules: 0, targets: 0 },
      };

      this.copies.set(copyOperationId, operation);

      if (this.failNextCopy || this.stallNextCopy) {
        const stalled = this.stallNextCopy;

        this.failNextCopy = false;
        this.stallNextCopy = false;
        // El primer lote —la cobertura— se copió; el siguiente falla o queda sin marcar.
        this.copyCoverageOnly(zone, copy, operation);
        copy.copy = stalled
          ? { ...copy.copy, state: 'copying', error: null }
          : { ...copy.copy, state: 'failed', error: 'copy_step_failed' };

        return json(202, this.copyOperation(operation));
      }

      this.completeCopy(zone, copy, operation);

      return json(201, this.copyOperation(operation));
    }

    if (rest === '/restore' && method === 'POST') {
      this.requireManage();
      this.expect(zone, input.expectedVersion);

      if (zone.status !== 'archived' || zone.copy.state !== 'ready') {
        throw new HttpError(409, 'shipping_transition_invalid');
      }

      zone.status = 'draft';
      zone.archivedAt = null;
      zone.archivedBy = null;
      zone.activatedAt = null;
      zone.activatedBy = null;

      return json(200, this.touch(zone.id));
    }

    if (rest === '/coverage' && method === 'GET') {
      const entries = this.coverage.get(zone.id) ?? [];
      const size = Number(query.get('pageSize') ?? '100');
      const offset = Number(query.get('pageToken') ?? '0');

      return json(200, {
        items: entries.slice(offset, offset + size),
        nextPageToken: offset + size < entries.length ? String(offset + size) : null,
      } satisfies S['ShippingCoveragePageDto']);
    }

    if (rest === '/coverage' && method === 'POST') {
      this.requireManage();
      this.expect(zone, input.expectedVersion);
      this.editable(zone);

      return json(
        200,
        this.applyCoverage(zone, input as unknown as S['ShippingCoverageUpdateDto']),
      );
    }

    if (rest === '/rules' && method === 'GET') {
      return json(200, {
        items: [...this.rules.values()].filter((rule) => rule.zoneId === zone.id),
      } satisfies S['ShippingRuleListDto']);
    }

    if (rest === '/rules' && method === 'POST') {
      this.requireManage();
      this.editable(zone);

      const create = input as unknown as S['ShippingRuleCreateDto'];

      validateRate(create.rate);
      if (typeof create.name !== 'string' || create.name.trim() === '')
        throw new HttpError(400, 'shipping_invalid');
      if (create.scope === 'all' && zone.rules.allRuleId !== null)
        throw new HttpError(400, 'shipping_invalid');

      const rule = this.makeRule(zone.id, create);

      this.touch(zone.id);

      return json(201, rule);
    }

    return error(404, 'not_found');
  }

  private completeCopy(source: Zone, copy: Zone, operation?: CopyOperation): void {
    this.coverage.set(
      copy.id,
      (this.coverage.get(source.id) ?? []).map((entry) => ({ ...entry, zoneId: copy.id })),
    );

    for (const rule of [...this.rules.values()].filter(
      (candidate) => candidate.zoneId === source.id && candidate.status === 'active',
    )) {
      const clone = this.makeRule(copy.id, rule);

      for (const value of this.targets.get(rule.id) ?? []) this.targets.get(clone.id)?.add(value);
      clone.targetCount = this.targets.get(clone.id)?.size ?? 0;
    }

    if (operation !== undefined) {
      const copied = [...this.rules.values()].filter((rule) => rule.zoneId === copy.id);

      operation.copied = {
        coverage: (this.coverage.get(copy.id) ?? []).length,
        rules: copied.length,
        targets: copied.reduce((total, rule) => total + (this.targets.get(rule.id)?.size ?? 0), 0),
      };
      operation.phase = 'finish';
      operation.updatedAt = this.stamp();
    }

    copy.copy = { ...copy.copy, state: 'ready', error: null };
    copy.coverage = this.summary(copy.id);
    this.refreshRuleSummary(copy.id);
  }

  private applyCoverage(
    zone: Zone,
    input: S['ShippingCoverageUpdateDto'],
  ): S['ShippingCoverageResultDto'] {
    const add = input.add ?? [];
    const remove = input.remove ?? [];

    if (add.length > 400 || remove.length > 400) throw new HttpError(400, 'shipping_invalid');

    const current = new Map(
      (this.coverage.get(zone.id) ?? []).map((entry) => [`${entry.kind}:${entry.code}`, entry]),
    );
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    for (const change of remove) {
      if (current.delete(`${change.kind}:${change.code}`)) removed += 1;
      else unchanged += 1;
    }

    for (const change of add) {
      const valid =
        (change.kind === 'national' && change.code === 'CO') ||
        (change.kind === 'department' &&
          FIXTURE_DEPARTMENTS.some((department) => department.code === change.code)) ||
        ((change.kind === 'municipality' || change.kind === 'exclusion') &&
          FIXTURE_MUNICIPALITIES.some((municipality) => municipality.code === change.code));

      if (!valid) throw new HttpError(400, 'shipping_invalid');

      const id = `${change.kind}:${change.code}`;

      if (current.has(id)) unchanged += 1;
      else {
        current.set(id, { zoneId: zone.id, kind: change.kind, code: change.code });
        added += 1;
      }
    }

    const entries = [...current.values()];
    const departments = new Set(
      entries.filter((entry) => entry.kind === 'department').map((entry) => entry.code),
    );
    const national = entries.some((entry) => entry.kind === 'national');
    const municipalities = entries.filter((entry) => entry.kind === 'municipality');
    const exclusions = entries.filter((entry) => entry.kind === 'exclusion');

    if (national && (departments.size > 0 || municipalities.length > 0))
      throw new HttpError(400, 'shipping_invalid');
    if (municipalities.some((entry) => departments.has(entry.code.slice(0, 2))))
      throw new HttpError(400, 'shipping_invalid');
    if (!national && exclusions.some((entry) => !departments.has(entry.code.slice(0, 2)))) {
      throw new HttpError(400, 'shipping_invalid');
    }

    this.coverage.set(zone.id, entries);

    if (zone.status === 'active' && this.tieWith(zone.id, zone.priority)) {
      throw new HttpError(409, 'shipping_zone_ambiguous');
    }

    return { added, removed, unchanged, zone: this.touch(zone.id) };
  }

  private ruleRoute(
    method: string,
    rest: string,
    rule: Rule,
    query: URLSearchParams,
    headers: Headers,
    body: unknown,
  ): Response {
    const input = (body ?? {}) as Record<string, unknown>;
    const zone = this.zones.get(rule.zoneId) as Zone;

    if (rest === '' && method === 'GET') return json(200, rule);

    const expectRule = () => {
      if (!Number.isInteger(input.expectedVersion)) throw new HttpError(400, 'shipping_invalid');
      if (input.expectedVersion !== rule.version)
        throw new HttpError(409, 'shipping_rule_version_conflict');
      if (rule.status !== 'active') throw new HttpError(409, 'shipping_transition_invalid');
      this.editable(zone);
    };

    if (rest === '' && method === 'PATCH') {
      this.requireManage();
      expectRule();

      if (input.scope !== undefined) throw new HttpError(400, 'shipping_invalid');
      if (input.rate !== undefined) validateRate(input.rate as Rate);

      for (const key of ['name', 'rate', 'transitDaysMin', 'transitDaysMax'] as const) {
        if (input[key] !== undefined) (rule as Record<string, unknown>)[key] = input[key];
      }

      rule.version += 1;
      rule.updatedAt = this.stamp();
      this.touch(zone.id);

      return json(200, rule);
    }

    if (rest === '/archive' && method === 'POST') {
      this.requireManage();
      expectRule();
      rule.status = 'archived';
      rule.archivedAt = NOW;
      rule.version += 1;
      this.touch(zone.id);

      return json(200, rule);
    }

    if (rest === '/targets' && method === 'GET') {
      const values = [...(this.targets.get(rule.id) ?? [])];
      const size = Number(query.get('pageSize') ?? '100');
      const offset = Number(query.get('pageToken') ?? '0');

      return json(200, {
        items: values.slice(offset, offset + size).map((value) => ({
          zoneId: rule.zoneId,
          ruleId: rule.id,
          kind: rule.scope === 'categories' ? 'category' : 'product',
          value,
        })),
        nextPageToken: offset + size < values.length ? String(offset + size) : null,
      } satisfies S['ShippingRuleTargetPageDto']);
    }

    if (rest === '/targets' && method === 'POST') {
      this.requireManage();

      const key = headers.get('idempotency-key') ?? '';

      if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new HttpError(400, 'shipping_invalid');

      const fingerprint = JSON.stringify({ rule: rule.id, body: input });
      const stored = this.idempotency.get(key);

      if (stored !== undefined) {
        if (stored.fingerprint !== fingerprint)
          throw new HttpError(409, 'shipping_idempotency_conflict');

        return json(stored.status, { ...(stored.response as object), replayed: true });
      }

      expectRule();

      if (rule.scope === 'all') throw new HttpError(400, 'shipping_invalid');

      const values = this.targets.get(rule.id) as Set<string>;
      const results: S['ShippingTargetItemResultDto'][] = [];
      const siblings = [...this.rules.values()].filter(
        (candidate) =>
          candidate.zoneId === rule.zoneId &&
          candidate.id !== rule.id &&
          candidate.status === 'active' &&
          candidate.scope === rule.scope,
      );

      for (const value of (input.remove as string[] | undefined) ?? []) {
        results.push({ value, outcome: values.delete(value) ? 'removed' : 'unchanged' });
      }

      for (const value of (input.add as string[] | undefined) ?? []) {
        const exists =
          rule.scope === 'products'
            ? this.products.some((item) => item.id === value)
            : this.categories.some((item) => item.slug === value);

        if (!exists) {
          results.push({
            value,
            outcome: 'failed',
            code: rule.scope === 'products' ? 'product_not_found' : 'category_not_found',
          });
        } else if (siblings.some((sibling) => this.targets.get(sibling.id)?.has(value))) {
          results.push({ value, outcome: 'failed', code: 'target_taken' });
        } else if (values.has(value)) {
          results.push({ value, outcome: 'unchanged' });
        } else {
          values.add(value);
          results.push({ value, outcome: 'added' });
        }
      }

      rule.targetCount = values.size;
      rule.version += 1;
      this.touch(zone.id);

      const response: S['ShippingRuleTargetsResultDto'] = {
        replayed: false,
        results,
        rule: { ...rule },
      };

      this.idempotency.set(key, { fingerprint, response, status: 200 });

      return json(200, response);
    }

    return error(404, 'not_found');
  }

  private listZones(query: URLSearchParams): S['ShippingZoneListDto'] {
    const view = query.get('view') ?? 'current';
    const status = query.get('status');
    const copyState = query.get('copyState');
    const rateType = query.get('rateType');
    const validity = query.get('validity');
    const q = (query.get('q') ?? '').trim();
    const municipalityCode = query.get('municipalityCode');
    const sizeRaw = query.get('pageSize');
    const size = sizeRaw === null ? 50 : Number(sizeRaw);

    if (!['current', 'archived', 'all', 'copies'].includes(view)) {
      throw new HttpError(400, 'shipping_invalid');
    }
    if (!Number.isInteger(size) || size < 1 || size > 100) {
      throw new HttpError(400, 'shipping_invalid');
    }
    if (q !== '' && fold(q).length < 2) throw new HttpError(400, 'shipping_invalid');
    if (municipalityCode !== null && !/^\d{5}$/.test(municipalityCode)) {
      throw new HttpError(400, 'shipping_invalid');
    }

    const allowed: Record<string, readonly string[]> = {
      current: ['draft', 'active'],
      archived: ['archived'],
      all: ['draft', 'active', 'archived'],
      copies: ['draft', 'archived'],
    };

    if (status !== null && !(allowed[view] ?? []).includes(status)) {
      throw new HttpError(400, 'shipping_invalid');
    }

    const filtered =
      status !== null ||
      copyState !== null ||
      rateType !== null ||
      validity !== null ||
      q !== '' ||
      municipalityCode !== null;

    if (filtered && this.indexUnavailable) throw new HttpError(503, 'shipping_unavailable');

    const filters = JSON.stringify({
      view,
      status,
      copyState,
      rateType,
      validity,
      q,
      municipalityCode,
      size,
    });
    const offset = decodeCursor(query.get('pageToken'), filters);
    const items = [...this.zones.values()]
      .filter((zone) => {
        if (view === 'copies' ? zone.copy.state === 'ready' : zone.copy.state !== 'ready') {
          return false;
        }
        if (view === 'archived' && zone.status !== 'archived') return false;
        if (view === 'current' && zone.status === 'archived') return false;
        if (status !== null && zone.status !== status) return false;
        if (copyState !== null && zone.copy.state !== copyState) return false;
        if (rateType !== null && !((zone.rules.rateTypeCounts[rateType] ?? 0) > 0)) return false;
        if (validity === 'always' && (zone.validFrom !== null || zone.validUntil !== null)) {
          return false;
        }
        if (validity === 'windowed' && zone.validFrom === null && zone.validUntil === null) {
          return false;
        }
        if (q !== '' && !matchesPrefix(zone.name, q)) return false;
        if (municipalityCode !== null && this.levelOf(zone.id, municipalityCode) === null) {
          return false;
        }

        return true;
      })
      // Orden estable: cambio más reciente primero, desempate por id descendente.
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));

    return {
      items: items.slice(offset, offset + size),
      nextPageToken: offset + size < items.length ? encodeCursor(offset + size, filters) : null,
    };
  }

  private copyCoverageOnly(source: Zone, copy: Zone, operation: CopyOperation): void {
    this.coverage.set(
      copy.id,
      (this.coverage.get(source.id) ?? []).map((entry) => ({ ...entry, zoneId: copy.id })),
    );
    operation.copied = {
      coverage: (this.coverage.get(copy.id) ?? []).length,
      rules: 0,
      targets: 0,
    };
    operation.phase = 'rules';
    operation.updatedAt = this.stamp();
  }

  copyOperation(operation: CopyOperation): S['ShippingCopyOperationDto'] {
    const zone = this.zones.get(operation.zoneId) as Zone;
    const state = zone.copy.state;
    const messages: Record<typeof state, string> = {
      copying: 'The copy is in progress.',
      ready: 'The copy finished.',
      failed: 'A batch failed; resume or discard the copy.',
      discarded: 'The copy was discarded.',
    };

    return {
      copyOperationId: operation.copyOperationId,
      state,
      sourceZoneId: operation.sourceId,
      sourceVersion: operation.sourceVersion,
      targetZoneId: operation.zoneId,
      zone: state === 'ready' ? { ...zone } : null,
      phase: operation.phase,
      copied: { ...operation.copied },
      failureCode: state === 'failed' ? zone.copy.error : null,
      message: `${this.messagePrefix}${messages[state]}`,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    };
  }

  private copyOperationRoute(method: string, rest: string, operation: CopyOperation): Response {
    const zone = this.zones.get(operation.zoneId) as Zone;

    if (rest === '' && method === 'GET') return json(200, this.copyOperation(operation));

    this.requireManage();

    if (rest === '/resume' && method === 'POST') {
      if (zone.copy.state === 'discarded' || zone.copy.state === 'ready') {
        return json(200, this.copyOperation(operation));
      }
      if (this.failNextResume) {
        this.failNextResume = false;
        zone.copy = { ...zone.copy, state: 'failed', error: 'copy_step_failed' };
        operation.updatedAt = this.stamp();

        return json(202, this.copyOperation(operation));
      }

      this.completeCopy(this.zones.get(operation.sourceId) as Zone, zone, operation);

      return json(200, this.copyOperation(operation));
    }

    if (rest === '/discard' && method === 'POST') {
      if (zone.copy.state === 'ready') throw new HttpError(409, 'shipping_transition_invalid');
      if (zone.copy.state === 'discarded') return json(200, this.copyOperation(operation));

      this.coverage.set(zone.id, []);
      for (const rule of [...this.rules.values()].filter(
        (candidate) => candidate.zoneId === zone.id,
      )) {
        this.rules.delete(rule.id);
        this.targets.delete(rule.id);
      }
      zone.copy = { ...zone.copy, state: 'discarded', error: null };
      zone.status = 'archived';
      zone.archivedAt = NOW;
      zone.archivedBy = this.uid;
      operation.updatedAt = this.stamp();
      this.touch(zone.id);

      return json(200, this.copyOperation(operation));
    }

    return error(404, 'not_found');
  }

  private relations(product: Product, query: URLSearchParams): S['ShippingProductRelationPageDto'] {
    const size = Math.min(Number(query.get('pageSize') ?? '50'), 100);
    const filters = JSON.stringify({ product: product.id, size });
    const offset = decodeCursor(query.get('pageToken'), filters);
    const all: S['ShippingProductRelationDto'][] = [];
    const describe = (
      rule: Rule,
      origin: S['ShippingProductRelationDto']['origin'],
    ): S['ShippingProductRelationDto'] => {
      const zone = this.zones.get(rule.zoneId) as Zone;

      return {
        zone: {
          id: zone.id,
          name: zone.name,
          status: zone.status,
          copyState: zone.copy.state,
          version: zone.version,
        },
        rule: {
          id: rule.id,
          name: rule.name,
          rateType: rule.rate.type,
          scope: rule.scope,
          status: rule.status,
          version: rule.version,
        },
        origin,
        relation: origin === 'product' ? 'direct' : 'inherited',
        categorySlug: origin === 'category' ? (product.category?.slug ?? null) : null,
        active: zone.status === 'active' && zone.copy.state === 'ready' && rule.status === 'active',
      };
    };
    const rules = [...this.rules.values()];

    // Primero las directas; después las heredadas por categoría y por «todos».
    for (const rule of rules) {
      if (rule.scope === 'products' && this.targets.get(rule.id)?.has(product.id)) {
        all.push(describe(rule, 'product'));
      }
    }
    for (const rule of rules) {
      if (
        rule.scope === 'categories' &&
        product.category !== null &&
        this.targets.get(rule.id)?.has(product.category.slug)
      ) {
        all.push(describe(rule, 'category'));
      }
    }
    for (const rule of rules) {
      if (rule.scope === 'all' && rule.status === 'active') all.push(describe(rule, 'all'));
    }

    return {
      items: all.slice(offset, offset + size),
      nextPageToken: offset + size < all.length ? encodeCursor(offset + size, filters) : null,
    };
  }

  private changeRelations(product: Product, headers: Headers, body: unknown): Response {
    this.requireManage();

    const key = headers.get('idempotency-key') ?? '';

    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new HttpError(400, 'shipping_invalid');

    const input = body as S['ShippingProductRelationsUpdateDto'];

    if (!Array.isArray(input?.changes) || input.changes.length < 1 || input.changes.length > 20) {
      throw new HttpError(400, 'shipping_invalid');
    }

    const fingerprint = JSON.stringify({ product: product.id, body: input });
    const stored = this.idempotency.get(`relations:${key}`);

    if (stored !== undefined) {
      if (stored.fingerprint !== fingerprint) {
        throw new HttpError(409, 'shipping_idempotency_conflict');
      }

      return json(stored.status, stored.response);
    }

    const results = input.changes.map((change): S['ShippingRelationChangeResultDto'] => {
      const rule = this.rules.get(change.ruleId);
      const fail = (code: string): S['ShippingRelationChangeResultDto'] => ({
        ruleId: change.ruleId,
        action: change.action,
        outcome: 'failed',
        code,
        ruleVersion: rule?.version ?? null,
      });

      if (rule === undefined) return fail('rule_not_found');

      const zone = this.zones.get(rule.zoneId) as Zone;

      // Solo las relaciones directas se cambian: una regla de categorías o de todos es herencia.
      if (rule.scope !== 'products') return fail('rule_not_product_scope');
      if (rule.status !== 'active') return fail('rule_archived');
      if (zone.status === 'archived') return fail('zone_archived');
      if (zone.copy.state !== 'ready') return fail('zone_copy_incomplete');
      if (rule.version !== change.expectedVersion) return fail('rule_version_conflict');

      const values = this.targets.get(rule.id) as Set<string>;
      const unchanged: S['ShippingRelationChangeResultDto'] = {
        ruleId: rule.id,
        action: change.action,
        outcome: 'unchanged',
        code: null,
        ruleVersion: rule.version,
      };

      if (change.action === 'assign') {
        const taken = [...this.rules.values()].some(
          (other) =>
            other.zoneId === rule.zoneId &&
            other.id !== rule.id &&
            other.scope === 'products' &&
            other.status === 'active' &&
            this.targets.get(other.id)?.has(product.id),
        );

        if (taken) return fail('target_taken');
        if (values.has(product.id)) return unchanged;

        values.add(product.id);
      } else if (!values.delete(product.id)) {
        return unchanged;
      }

      rule.targetCount = values.size;
      rule.version += 1;
      this.touch(zone.id);

      return {
        ruleId: rule.id,
        action: change.action,
        outcome: change.action === 'assign' ? 'added' : 'removed',
        code: null,
        ruleVersion: rule.version,
      };
    });
    const response: S['ShippingProductRelationsResultDto'] = { results };

    this.idempotency.set(`relations:${key}`, { fingerprint, response, status: 200 });

    return json(200, response);
  }

  analysis(): S['ShippingAnalysisDto'] {
    const active = this.activeZones();
    const conflicts: S['ShippingConflictDto'][] = [];
    const uncovered: string[] = [];
    const departments = new Map<string, { covered: number; total: number }>();

    for (const municipality of FIXTURE_MUNICIPALITIES) {
      const stats = departments.get(municipality.departmentCode) ?? { covered: 0, total: 0 };
      const levels = active
        .map((zone) => ({ zone, level: this.levelOf(zone.id, municipality.code) }))
        .filter((item): item is { zone: Zone; level: Level } => item.level !== null);

      stats.total += 1;
      if (levels.length > 0) stats.covered += 1;
      else uncovered.push(municipality.code);
      departments.set(municipality.departmentCode, stats);

      for (const [index, first] of levels.entries()) {
        for (const second of levels.slice(index + 1)) {
          if (first.level === second.level && first.zone.priority === second.zone.priority) {
            conflicts.push({
              zoneId: first.zone.id,
              otherZoneId: second.zone.id,
              level: first.level,
              priority: first.zone.priority,
              municipalityCode: municipality.code,
              count: 1,
            });
          }
        }
      }
    }

    return {
      revision: this.revision,
      conflicts,
      uncoveredMunicipalityCodes: uncovered,
      coveredMunicipalityCount: FIXTURE_MUNICIPALITIES.length - uncovered.length,
      totalMunicipalityCount: FIXTURE_MUNICIPALITIES.length,
      departments: [...departments].map(([departmentCode, stats]) => ({
        departmentCode,
        ...stats,
      })),
    };
  }

  /**
   * Resolución con las reglas que publica el contrato: por línea, el nivel más específico gana;
   * dentro del nivel, la prioridad más alta; dentro de la zona, producto antes que categoría antes
   * que «todos»; un empate es `unavailable` con `ambiguous_configuration`, nunca gratis.
   */
  preview(input: S['ShippingPreviewRequestDto']): S['ShippingPreviewDto'] {
    const municipality = FIXTURE_MUNICIPALITIES.find(
      (item) => item.code === input.destination.municipalityCode,
    );
    const department = FIXTURE_DEPARTMENTS.find(
      (item) => item.code === input.destination.departmentCode,
    );

    for (const item of input.items) {
      const found = this.products.find((candidate) => candidate.id === item.productId);

      if (found === undefined || found.status !== 'active')
        throw new HttpError(400, 'order_product_unavailable');

      const variants = found.variants.filter((variant) => variant.status === 'active');

      if (variants.length > 0 && item.variantId === undefined)
        throw new HttpError(400, 'order_variant_required');
      if (
        item.variantId !== undefined &&
        !variants.some((variant) => variant.id === item.variantId)
      ) {
        throw new HttpError(400, 'order_variant_unavailable');
      }
    }

    const base = {
      quoteId: 'shq_preview',
      rulesetRevision: this.revision,
      geographyVersion: 'fixture-2026',
      blockingProductIds: [] as string[],
    };

    if (
      municipality === undefined ||
      department === undefined ||
      municipality.departmentCode !== department.code
    ) {
      return {
        ...base,
        location: null,
        outcome: 'unavailable',
        reason: 'destination_invalid',
        totalCop: null,
        charges: [],
        lines: input.items.map((item, lineIndex) => ({
          lineIndex,
          productId: item.productId,
          variantId: item.variantId ?? null,
          outcome: 'unavailable',
          reason: 'destination_invalid',
          level: null,
          zoneId: null,
          ruleId: null,
        })),
      };
    }

    const drafts = new Set(input.includeDraftZoneIds ?? []);
    const zones = [...this.zones.values()].filter(
      (zone) =>
        zone.copy.state === 'ready' &&
        (zone.status === 'active' || (zone.status === 'draft' && drafts.has(zone.id))),
    );
    const RANK: Record<Level, number> = { municipality: 3, department: 2, national: 1 };
    const SCOPE: Record<Rule['scope'], number> = { products: 3, categories: 2, all: 1 };
    const covering = zones
      .map((zone) => ({ zone, level: this.levelOf(zone.id, municipality.code) }))
      .filter((item): item is { zone: Zone; level: Level } => item.level !== null);

    const lines: S['ShippingPreviewLineDto'][] = input.items.map((item, lineIndex) => {
      const found = this.products.find((candidate) => candidate.id === item.productId) as Product;
      const candidates = covering
        .map(({ zone, level }) => {
          const rules = [...this.rules.values()].filter((rule) => {
            if (rule.zoneId !== zone.id || rule.status !== 'active') return false;
            if (rule.scope === 'all') return true;
            if (rule.scope === 'products') return this.targets.get(rule.id)?.has(found.id) ?? false;

            return (
              found.category !== null &&
              (this.targets.get(rule.id)?.has(found.category.slug) ?? false)
            );
          });
          const top = Math.max(0, ...rules.map((rule) => SCOPE[rule.scope]));
          const best = rules.filter((rule) => SCOPE[rule.scope] === top);

          return { zone, level, best };
        })
        .filter((candidate) => candidate.best.length > 0)
        .sort((a, b) => RANK[b.level] - RANK[a.level] || b.zone.priority - a.zone.priority);
      const line = { lineIndex, productId: item.productId, variantId: item.variantId ?? null };

      if (covering.length === 0) {
        return {
          ...line,
          outcome: 'unavailable',
          reason: 'destination_not_covered',
          level: null,
          zoneId: null,
          ruleId: null,
        };
      }

      const first = candidates[0];

      if (first === undefined) {
        const specific = [...covering].sort(
          (a, b) => RANK[b.level] - RANK[a.level] || b.zone.priority - a.zone.priority,
        )[0] as {
          zone: Zone;
          level: Level;
        };

        return {
          ...line,
          outcome:
            specific.zone.unmatchedProductBehavior === 'manual_quote'
              ? 'manual_quote'
              : 'unavailable',
          reason: 'product_not_covered',
          level: specific.level,
          zoneId: specific.zone.id,
          ruleId: null,
        };
      }

      const tied = candidates.filter(
        (candidate) =>
          RANK[candidate.level] === RANK[first.level] &&
          candidate.zone.priority === first.zone.priority,
      );

      if (tied.length > 1 || first.best.length > 1) {
        return {
          ...line,
          outcome: 'unavailable',
          reason: 'ambiguous_configuration',
          level: first.level,
          zoneId: null,
          ruleId: null,
        };
      }

      const rule = first.best[0] as Rule;

      return {
        ...line,
        outcome:
          rule.rate.type === 'free'
            ? 'free'
            : rule.rate.type === 'manual_quote'
              ? 'manual_quote'
              : 'charged',
        reason: rule.rate.type === 'manual_quote' ? 'manual_quote_rule' : null,
        level: first.level,
        zoneId: first.zone.id,
        ruleId: rule.id,
      };
    });

    const location = {
      country: 'CO' as const,
      departmentCode: department.code,
      departmentName: department.name,
      municipalityCode: municipality.code,
      municipalityName: municipality.name,
    };
    const unavailable = lines.find((line) => line.outcome === 'unavailable');
    const manual = lines.find((line) => line.outcome === 'manual_quote');

    if (unavailable !== undefined || manual !== undefined) {
      const reason = (unavailable ?? manual)?.reason ?? null;

      return {
        ...base,
        location,
        lines,
        charges: [],
        outcome: unavailable !== undefined ? 'unavailable' : 'manual_quote',
        reason,
        totalCop: null,
        blockingProductIds: lines
          .filter((line) => line.outcome === 'unavailable')
          .map((line) => line.productId),
      };
    }

    const groups = new Map<string, number[]>();

    for (const line of lines) {
      if (line.ruleId !== null)
        groups.set(line.ruleId, [...(groups.get(line.ruleId) ?? []), line.lineIndex]);
    }

    const charges: S['ShippingChargeDto'][] = [...groups].map(([ruleId, lineIndexes]) => {
      const rule = this.rules.get(ruleId) as Rule;
      const zone = this.zones.get(rule.zoneId) as Zone;
      const units = lineIndexes.reduce(
        (total, index) => total + (input.items[index]?.quantity ?? 0),
        0,
      );
      const costCop =
        rule.rate.type === 'flat_order'
          ? (rule.rate.amountCop ?? 0)
          : rule.rate.type === 'per_unit'
            ? units * (rule.rate.unitCop ?? 0)
            : rule.rate.type === 'base_plus_additional'
              ? (rule.rate.baseCop ?? 0) + (units - 1) * (rule.rate.additionalUnitCop ?? 0)
              : 0;
      const level = lines.find((line) => line.ruleId === ruleId)?.level as Level;

      return {
        ruleId,
        ruleName: rule.name,
        ruleVersion: rule.version,
        zoneId: zone.id,
        zoneName: zone.name,
        zoneVersion: zone.version,
        zonePriority: zone.priority,
        level,
        rate: rule.rate,
        units,
        lineIndexes,
        costCop,
      };
    });
    const total = charges.reduce((sum, charge) => sum + charge.costCop, 0);
    const allFree = lines.every((line) => line.outcome === 'free');

    return {
      ...base,
      location,
      lines,
      charges,
      outcome: allFree ? 'free' : 'charged',
      reason: null,
      totalCop: total,
    };
  }
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function validateRate(rate: Rate | undefined): void {
  if (rate === undefined || rate === null) throw new HttpError(400, 'shipping_invalid');

  const own: Record<Rate['type'], (keyof Rate)[]> = {
    free: [],
    flat_order: ['amountCop'],
    per_unit: ['unitCop'],
    base_plus_additional: ['baseCop', 'additionalUnitCop'],
    manual_quote: [],
  };
  const fields = own[rate.type];

  if (fields === undefined) throw new HttpError(400, 'shipping_invalid');

  for (const field of ['amountCop', 'unitCop', 'baseCop', 'additionalUnitCop'] as const) {
    const value = rate[field];

    if (fields.includes(field)) {
      const min = field === 'additionalUnitCop' ? 0 : 1;

      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < min ||
        value > 10_000_000
      ) {
        throw new HttpError(400, 'shipping_invalid');
      }
    } else if (value !== null && value !== undefined) {
      throw new HttpError(400, 'shipping_invalid');
    }
  }
}

export const GEOGRAPHY_ETAG = '"divipola-fixture-2026"';

function withEtag(response: Response): Response {
  response.headers.set('etag', GEOGRAPHY_ETAG);

  return response;
}

function decodeProductCursor(token: string | null, filters: string): number {
  try {
    return decodeCursor(token, filters);
  } catch {
    throw new HttpError(400, 'product_invalid');
  }
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function error(status: number, code: string): Response {
  return json(status, { code, message: 'Fake backend rejection' } satisfies S['ErrorResponseDto']);
}

/** Escenario de pruebas y capturas: unas zonas en distintos estados, con reglas y asignaciones. */
export function seededBackend(options: FakeOptions = {}): FakeShippingBackend {
  const backend = new FakeShippingBackend(options);

  backend.seedZone({
    name: 'Valle de Aburrá',
    description: 'Área metropolitana de Medellín con entrega propia.',
    priority: 200,
    status: 'active',
    coverage: [
      { kind: 'department', code: '05' },
      { kind: 'exclusion', code: '05615' },
    ],
    rules: [
      {
        name: 'Tarifa general',
        scope: 'all',
        rate: {
          type: 'flat_order',
          amountCop: 18000,
          unitCop: null,
          baseCop: null,
          additionalUnitCop: null,
        },
      },
      {
        name: 'Muebles grandes',
        scope: 'categories',
        rate: {
          type: 'base_plus_additional',
          amountCop: null,
          unitCop: null,
          baseCop: 45000,
          additionalUnitCop: 15000,
        },
        targets: ['sofas', 'mesas'],
      },
    ],
    updatedBy: FAKE_OTHER_UID,
  });
  backend.seedZone({
    name: 'Bogotá urbano',
    priority: 150,
    status: 'active',
    coverage: [{ kind: 'municipality', code: '11001' }],
    rules: [
      {
        name: 'Por unidad',
        scope: 'all',
        rate: {
          type: 'per_unit',
          amountCop: null,
          unitCop: 9000,
          baseCop: null,
          additionalUnitCop: null,
        },
      },
      {
        name: 'Sillas gratis',
        scope: 'products',
        rate: {
          type: 'free',
          amountCop: null,
          unitCop: null,
          baseCop: null,
          additionalUnitCop: null,
        },
        targets: ['prd_silla_nordica'],
      },
    ],
  });
  backend.seedZone({
    name: 'Respaldo nacional',
    description: 'Todo el país, cotizado a mano.',
    priority: 10,
    status: 'active',
    coverage: [
      { kind: 'national', code: 'CO' },
      { kind: 'exclusion', code: '91263' },
    ],
    rules: [
      {
        name: 'Cotización',
        scope: 'all',
        rate: {
          type: 'manual_quote',
          amountCop: null,
          unitCop: null,
          baseCop: null,
          additionalUnitCop: null,
        },
      },
    ],
  });
  backend.seedZone({
    name: 'Costa Caribe (borrador)',
    priority: 120,
    status: 'draft',
    validFrom: '2026-11-01T05:00:00.000Z',
    validUntil: '2027-01-31T05:00:00.000Z',
    coverage: [
      { kind: 'department', code: '08' },
      { kind: 'municipality', code: '76001' },
    ],
    rules: [],
    unmatchedProductBehavior: 'manual_quote',
  });
  backend.seedZone({
    name: 'Promoción 2025',
    priority: 300,
    status: 'archived',
    validFrom: '2025-11-01T05:00:00.000Z',
    validUntil: '2025-12-31T05:00:00.000Z',
    coverage: [{ kind: 'department', code: '15' }],
    rules: [
      {
        name: 'Gratis',
        scope: 'all',
        rate: {
          type: 'free',
          amountCop: null,
          unitCop: null,
          baseCop: null,
          additionalUnitCop: null,
        },
      },
    ],
  });

  return backend;
}
