/**
 * Cuerpos que el navegador manda al BFF de envíos, validados y estrechados.
 *
 * Cada parser acepta **exactamente** las claves que corresponden y devuelve `null` ante cualquier
 * otra cosa, sin llamar al backend. No es la validación de negocio —esa la hace el backend—, sino
 * la frontera: lo que cruza hacia el backend tiene la forma del contrato y nada más.
 *
 * Módulo puro.
 */

import type {
  ShippingCoverageChange,
  ShippingRelationChange,
  ZoneQuery,
  ShippingPreviewRequest,
  ShippingRate,
  ShippingRuleCreateRequest,
  ShippingRuleScope,
  ShippingRuleUpdateRequest,
  ShippingZoneCreateRequest,
  ShippingZoneUpdateRequest,
  UnmatchedProductBehavior,
} from '@/lib/api/shipping';

import { isDepartmentCode, isMunicipalityCode, NATIONAL_CODE } from './coverage-model';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/;
/** ISO 8601 con desfase explícito, como exige el contrato. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const LIMITS = {
  name: 80,
  description: 300,
  priorityMin: 0,
  priorityMax: 1000,
  changes: 400,
  draftZones: 20,
  quantityMax: 100,
  transitMax: 90,
  amountMax: 10_000_000,
} as const;

type Raw = Record<string, unknown>;

function record(raw: unknown): Raw | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Raw) : null;
}

function onlyKeys(raw: Raw, allowed: readonly string[]): boolean {
  return Object.keys(raw).every((key) => allowed.includes(key));
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= LIMITS.name;
}

function isPriority(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= LIMITS.priorityMin &&
    value <= LIMITS.priorityMax
  );
}

function isInstantOrNull(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' && INSTANT.test(value) && !Number.isNaN(Date.parse(value)))
  );
}

function isDescription(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= LIMITS.description);
}

function isUnmatched(value: unknown): value is UnmatchedProductBehavior {
  return value === 'manual_quote' || value === 'unavailable';
}

function isTransit(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= LIMITS.transitMax)
  );
}

export function isShippingId(value: string): boolean {
  return ID.test(value);
}

export function isIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && IDEMPOTENCY_KEY.test(value);
}

/** Ventana coherente: si están las dos, el inicio va antes del final. */
function windowOk(from: string | null | undefined, until: string | null | undefined): boolean {
  if (from === undefined || until === undefined || from === null || until === null) return true;

  return Date.parse(from) < Date.parse(until);
}

export function parseZoneCreate(raw: unknown): ShippingZoneCreateRequest | null {
  const body = record(raw);

  if (body === null) return null;
  if (
    !onlyKeys(body, [
      'name',
      'description',
      'priority',
      'validFrom',
      'validUntil',
      'unmatchedProductBehavior',
    ])
  ) {
    return null;
  }
  if (!isName(body.name) || !isPriority(body.priority)) return null;
  if (body.description !== undefined && !isDescription(body.description)) return null;
  if (body.validFrom !== undefined && !isInstantOrNull(body.validFrom)) return null;
  if (body.validUntil !== undefined && !isInstantOrNull(body.validUntil)) return null;
  // Obligatorio aquí aunque el contrato tenga un valor por defecto: qué recibe un producto sin
  // regla se elige de forma explícita, nunca por omisión.
  if (!isUnmatched(body.unmatchedProductBehavior)) return null;
  if (
    !windowOk(
      body.validFrom as string | null | undefined,
      body.validUntil as string | null | undefined,
    )
  ) {
    return null;
  }

  return {
    name: body.name.trim(),
    priority: body.priority,
    unmatchedProductBehavior: body.unmatchedProductBehavior,
    ...(body.description === undefined ? {} : { description: body.description as string | null }),
    ...(body.validFrom === undefined ? {} : { validFrom: body.validFrom as string | null }),
    ...(body.validUntil === undefined ? {} : { validUntil: body.validUntil as string | null }),
  };
}

export function parseZoneUpdate(raw: unknown): ShippingZoneUpdateRequest | null {
  const body = record(raw);

  if (body === null) return null;
  if (
    !onlyKeys(body, [
      'expectedVersion',
      'name',
      'description',
      'priority',
      'validFrom',
      'validUntil',
      'unmatchedProductBehavior',
    ])
  ) {
    return null;
  }
  if (!isVersion(body.expectedVersion)) return null;
  if (body.name !== undefined && !isName(body.name)) return null;
  if (body.priority !== undefined && !isPriority(body.priority)) return null;
  if (body.description !== undefined && !isDescription(body.description)) return null;
  if (body.validFrom !== undefined && !isInstantOrNull(body.validFrom)) return null;
  if (body.validUntil !== undefined && !isInstantOrNull(body.validUntil)) return null;
  if (body.unmatchedProductBehavior !== undefined && !isUnmatched(body.unmatchedProductBehavior)) {
    return null;
  }
  if (
    !windowOk(
      body.validFrom as string | null | undefined,
      body.validUntil as string | null | undefined,
    )
  ) {
    return null;
  }

  return {
    expectedVersion: body.expectedVersion,
    ...(body.name === undefined ? {} : { name: (body.name as string).trim() }),
    ...(body.priority === undefined ? {} : { priority: body.priority as number }),
    ...(body.description === undefined ? {} : { description: body.description as string | null }),
    ...(body.validFrom === undefined ? {} : { validFrom: body.validFrom as string | null }),
    ...(body.validUntil === undefined ? {} : { validUntil: body.validUntil as string | null }),
    ...(body.unmatchedProductBehavior === undefined
      ? {}
      : { unmatchedProductBehavior: body.unmatchedProductBehavior as UnmatchedProductBehavior }),
  };
}

export function parseVersioned(raw: unknown): { readonly expectedVersion: number } | null {
  const body = record(raw);

  if (body === null || !onlyKeys(body, ['expectedVersion']) || !isVersion(body.expectedVersion)) {
    return null;
  }

  return { expectedVersion: body.expectedVersion };
}

/** El descarte no lleva cuerpo en el contrato: el BFF solo admite `{}`. */
export function parseEmpty(raw: unknown): Record<string, never> | null {
  const body = record(raw);

  return body !== null && Object.keys(body).length === 0 ? {} : null;
}

export type DuplicateInput = {
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly name?: string;
};

export function parseDuplicate(raw: unknown): DuplicateInput | null {
  const body = record(raw);

  if (body === null || !onlyKeys(body, ['idempotencyKey', 'expectedVersion', 'name'])) return null;
  if (!isIdempotencyKey(body.idempotencyKey) || !isVersion(body.expectedVersion)) return null;
  if (body.name !== undefined && !isName(body.name)) return null;

  return {
    idempotencyKey: body.idempotencyKey,
    expectedVersion: body.expectedVersion,
    ...(body.name === undefined ? {} : { name: (body.name as string).trim() }),
  };
}

function isCoverageChange(value: unknown): value is ShippingCoverageChange {
  const change = record(value);

  if (change === null || !onlyKeys(change, ['kind', 'code'])) return false;
  if (typeof change.code !== 'string') return false;

  switch (change.kind) {
    case 'national':
      return change.code === NATIONAL_CODE;
    case 'department':
      return isDepartmentCode(change.code);
    case 'municipality':
    case 'exclusion':
      return isMunicipalityCode(change.code);
    default:
      return false;
  }
}

function changeList(value: unknown): ShippingCoverageChange[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > LIMITS.changes) return null;

  return value.every(isCoverageChange)
    ? value.map((change) => ({ kind: change.kind, code: change.code }))
    : null;
}

export function parseCoverageUpdate(raw: unknown): {
  readonly expectedVersion: number;
  readonly add: ShippingCoverageChange[];
  readonly remove: ShippingCoverageChange[];
} | null {
  const body = record(raw);

  if (body === null || !onlyKeys(body, ['expectedVersion', 'add', 'remove'])) return null;
  if (!isVersion(body.expectedVersion)) return null;

  const add = changeList(body.add);
  const remove = changeList(body.remove);

  if (add === null || remove === null || add.length + remove.length === 0) return null;

  return { expectedVersion: body.expectedVersion, add, remove };
}

function isAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= LIMITS.amountMax
  );
}

/**
 * Tarifa con **exactamente** sus montos: los del tipo, enteros; los demás, `null`.
 *
 * Un tipo de pago con un monto ausente se rechaza aquí: nunca se convierte en cero.
 */
export function parseRate(raw: unknown): ShippingRate | null {
  const rate = record(raw);

  if (
    rate === null ||
    !onlyKeys(rate, ['type', 'amountCop', 'unitCop', 'baseCop', 'additionalUnitCop'])
  ) {
    return null;
  }

  const fields = ['amountCop', 'unitCop', 'baseCop', 'additionalUnitCop'] as const;
  const required: Readonly<Record<string, readonly string[]>> = {
    free: [],
    flat_order: ['amountCop'],
    per_unit: ['unitCop'],
    base_plus_additional: ['baseCop', 'additionalUnitCop'],
    manual_quote: [],
  };
  const own = typeof rate.type === 'string' ? required[rate.type] : undefined;

  if (own === undefined) return null;

  for (const field of fields) {
    const value = rate[field];

    if (own.includes(field) ? !isAmount(value) : value !== null && value !== undefined) return null;
  }

  return {
    type: rate.type as ShippingRate['type'],
    amountCop: own.includes('amountCop') ? (rate.amountCop as number) : null,
    unitCop: own.includes('unitCop') ? (rate.unitCop as number) : null,
    baseCop: own.includes('baseCop') ? (rate.baseCop as number) : null,
    additionalUnitCop: own.includes('additionalUnitCop')
      ? (rate.additionalUnitCop as number)
      : null,
  };
}

function isScope(value: unknown): value is ShippingRuleScope {
  return value === 'all' || value === 'categories' || value === 'products';
}

export function parseRuleCreate(raw: unknown): ShippingRuleCreateRequest | null {
  const body = record(raw);

  if (
    body === null ||
    !onlyKeys(body, ['name', 'scope', 'rate', 'transitDaysMin', 'transitDaysMax'])
  ) {
    return null;
  }
  if (!isName(body.name) || !isScope(body.scope)) return null;

  const rate = parseRate(body.rate);

  if (rate === null) return null;
  if (body.transitDaysMin !== undefined && !isTransit(body.transitDaysMin)) return null;
  if (body.transitDaysMax !== undefined && !isTransit(body.transitDaysMax)) return null;

  return {
    name: body.name.trim(),
    scope: body.scope,
    rate,
    ...(body.transitDaysMin === undefined
      ? {}
      : { transitDaysMin: body.transitDaysMin as number | null }),
    ...(body.transitDaysMax === undefined
      ? {}
      : { transitDaysMax: body.transitDaysMax as number | null }),
  };
}

export function parseRuleUpdate(raw: unknown): ShippingRuleUpdateRequest | null {
  const body = record(raw);

  if (
    body === null ||
    !onlyKeys(body, ['expectedVersion', 'name', 'rate', 'transitDaysMin', 'transitDaysMax'])
  ) {
    return null;
  }
  if (!isVersion(body.expectedVersion)) return null;
  if (body.name !== undefined && !isName(body.name)) return null;

  const rate = body.rate === undefined ? undefined : parseRate(body.rate);

  if (rate === null) return null;
  if (body.transitDaysMin !== undefined && !isTransit(body.transitDaysMin)) return null;
  if (body.transitDaysMax !== undefined && !isTransit(body.transitDaysMax)) return null;

  return {
    expectedVersion: body.expectedVersion,
    ...(body.name === undefined ? {} : { name: (body.name as string).trim() }),
    ...(rate === undefined ? {} : { rate }),
    ...(body.transitDaysMin === undefined
      ? {}
      : { transitDaysMin: body.transitDaysMin as number | null }),
    ...(body.transitDaysMax === undefined
      ? {}
      : { transitDaysMax: body.transitDaysMax as number | null }),
  };
}

export type TargetsInput = {
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly add: string[];
  readonly remove: string[];
};

/** Un valor de asignación: el slug de una categoría o el id de un producto. */
function isTargetValue(value: unknown): value is string {
  return typeof value === 'string' && (SLUG.test(value) || ID.test(value)) && value.length <= 128;
}

function targetList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > LIMITS.changes) return null;

  return value.every(isTargetValue) ? [...new Set(value)] : null;
}

export function parseTargets(raw: unknown): TargetsInput | null {
  const body = record(raw);

  if (body === null || !onlyKeys(body, ['idempotencyKey', 'expectedVersion', 'add', 'remove'])) {
    return null;
  }
  if (!isIdempotencyKey(body.idempotencyKey) || !isVersion(body.expectedVersion)) return null;

  const add = targetList(body.add);
  const remove = targetList(body.remove);

  if (add === null || remove === null || add.length + remove.length === 0) return null;

  return {
    idempotencyKey: body.idempotencyKey,
    expectedVersion: body.expectedVersion,
    add,
    remove,
  };
}

export function parsePreview(raw: unknown): ShippingPreviewRequest | null {
  const body = record(raw);

  if (body === null || !onlyKeys(body, ['destination', 'items', 'includeDraftZoneIds']))
    return null;

  const destination = record(body.destination);

  if (
    destination === null ||
    !onlyKeys(destination, ['country', 'departmentCode', 'municipalityCode'])
  ) {
    return null;
  }
  if (destination.country !== undefined && destination.country !== 'CO') return null;
  if (
    typeof destination.departmentCode !== 'string' ||
    !isDepartmentCode(destination.departmentCode)
  ) {
    return null;
  }
  if (
    typeof destination.municipalityCode !== 'string' ||
    !isMunicipalityCode(destination.municipalityCode) ||
    !destination.municipalityCode.startsWith(destination.departmentCode)
  ) {
    return null;
  }

  if (!Array.isArray(body.items) || body.items.length < 1) {
    return null;
  }

  const items: ShippingPreviewRequest['items'] = [];

  for (const value of body.items) {
    const item = record(value);

    if (item === null || !onlyKeys(item, ['productId', 'variantId', 'quantity'])) return null;
    if (typeof item.productId !== 'string' || !ID.test(item.productId)) return null;
    if (
      item.variantId !== undefined &&
      (typeof item.variantId !== 'string' || !ID.test(item.variantId))
    ) {
      return null;
    }
    if (
      typeof item.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > LIMITS.quantityMax
    ) {
      return null;
    }

    items.push({
      productId: item.productId,
      quantity: item.quantity,
      ...(item.variantId === undefined ? {} : { variantId: item.variantId as string }),
    });
  }

  let includeDraftZoneIds: string[] | undefined;

  if (body.includeDraftZoneIds !== undefined) {
    if (
      !Array.isArray(body.includeDraftZoneIds) ||
      body.includeDraftZoneIds.length > LIMITS.draftZones ||
      !body.includeDraftZoneIds.every((id) => typeof id === 'string' && ID.test(id))
    ) {
      return null;
    }

    includeDraftZoneIds = [...new Set(body.includeDraftZoneIds as string[])];
  }

  return {
    destination: {
      country: 'CO',
      departmentCode: destination.departmentCode,
      municipalityCode: destination.municipalityCode,
    },
    items,
    ...(includeDraftZoneIds === undefined || includeDraftZoneIds.length === 0
      ? {}
      : { includeDraftZoneIds }),
  };
}

export type RelationChangesInput = {
  readonly idempotencyKey: string;
  readonly changes: ShippingRelationChange[];
};

/** Hasta 20 cambios de relación directa: asignar o retirar, con la versión de cada regla. */
export function parseRelationChanges(raw: unknown): RelationChangesInput | null {
  const body = record(raw);

  if (body === null || !onlyKeys(body, ['idempotencyKey', 'changes'])) return null;
  if (!isIdempotencyKey(body.idempotencyKey)) return null;
  if (!Array.isArray(body.changes) || body.changes.length < 1 || body.changes.length > 20) {
    return null;
  }

  const changes: ShippingRelationChange[] = [];

  for (const value of body.changes) {
    const change = record(value);

    if (change === null || !onlyKeys(change, ['action', 'ruleId', 'expectedVersion'])) return null;
    if (change.action !== 'assign' && change.action !== 'unassign') return null;
    if (typeof change.ruleId !== 'string' || !ID.test(change.ruleId)) return null;
    if (!isVersion(change.expectedVersion)) return null;

    changes.push({
      action: change.action,
      ruleId: change.ruleId,
      expectedVersion: change.expectedVersion,
    });
  }

  return { idempotencyKey: body.idempotencyKey, changes };
}

const ZONE_QUERY_ENUMS = {
  view: ['current', 'archived', 'all', 'copies'],
  status: ['draft', 'active', 'archived'],
  copyState: ['copying', 'ready', 'failed', 'discarded'],
  rateType: ['free', 'flat_order', 'per_unit', 'base_plus_additional', 'manual_quote'],
  validity: ['always', 'windowed'],
} as const;

/** Parámetros del listado de zonas: solo los del contrato, con sus valores. */
export function parseZoneQuery(params: URLSearchParams): ZoneQuery | null {
  const allowed = new Set([
    ...Object.keys(ZONE_QUERY_ENUMS),
    'q',
    'municipalityCode',
    'pageToken',
    'pageSize',
  ]);
  const query: Record<string, string | number> = {};

  for (const [key, value] of params) {
    if (!allowed.has(key)) return null;

    const options = (ZONE_QUERY_ENUMS as Readonly<Record<string, readonly string[]>>)[key];

    if (options !== undefined) {
      if (!options.includes(value)) return null;
      query[key] = value;
    } else if (key === 'q') {
      if (value.trim().length < 2 || value.length > 80) return null;
      query.q = value.trim();
    } else if (key === 'municipalityCode') {
      if (!isMunicipalityCode(value)) return null;
      query.municipalityCode = value;
    } else if (key === 'pageToken') {
      if (value.length < 1 || value.length > 512) return null;
      query.pageToken = value;
    } else {
      const size = Number(value);

      if (!Number.isInteger(size) || size < 1 || size > 100) return null;
      query.pageSize = size;
    }
  }

  return query as ZoneQuery;
}
