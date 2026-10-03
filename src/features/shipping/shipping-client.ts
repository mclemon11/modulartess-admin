/**
 * Llamadas del navegador al BFF de envíos. Nunca al backend.
 *
 * Solo conoce rutas locales bajo `/api/admin/shipping`. No sabe la URL del backend, no tiene
 * identidad IAM y no puede leer la cookie de sesión. Cada respuesta se reduce a un resultado
 * cerrado con el código estable del BFF; no se propaga ningún texto del backend.
 *
 * Las claves de idempotencia las genera el componente que inicia la petición y solo las usa para
 * repetir **esa misma** petición si el desenlace fue incierto. No se guardan en ningún almacenamiento
 * ni se muestran; una copia de zona se sigue después por su `copyOperationId`, no por su clave.
 */

import {
  readFailurePayload,
  send,
  type MutationFailure,
  type MutationResult,
} from '@/features/panel/catalog-client';
import type {
  CopyAction,
  ShippingCopyOperation,
  GeographyMunicipality,
  GeographyMunicipalityList,
  ShippingCoverageChange,
  ShippingCoverageResult,
  ShippingPreview,
  ShippingPreviewRequest,
  ShippingRate,
  ShippingRule,
  ShippingRuleScope,
  ShippingRuleTargetPage,
  ShippingRuleTargetsResult,
  ShippingProductRelationPage,
  ShippingProductRelationsResult,
  ShippingRelationChange,
  ShippingZone,
  UnmatchedProductBehavior,
  ZoneTransition,
} from '@/lib/api/shipping';

import { isPublishedCopyAnswer } from './copy-operation-model';
import type { AssignableZonePage, PickerProductPage } from './shipping-projections';

const BASE = '/api/admin/shipping';

const segment = (value: string) => encodeURIComponent(value);

/** Lectura por el BFF. Mismo contrato de resultado que las mutaciones. */
export async function query<T>(url: string): Promise<MutationResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return { ok: false, code: 'service_unavailable' };
  }

  if (response.ok) {
    try {
      return { ok: true, data: (await response.json()) as T };
    } catch {
      return { ok: false, code: 'internal_error' };
    }
  }

  try {
    const failure: MutationFailure | null = readFailurePayload(await response.json());

    if (failure !== null) return failure;
  } catch {
    // Cuerpo ilegible.
  }

  return { ok: false, code: 'internal_error' };
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

// Zonas ------------------------------------------------------------------------------------------

export type ZoneFields = {
  readonly name: string;
  readonly description: string | null;
  readonly priority: number;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly unmatchedProductBehavior: UnmatchedProductBehavior;
};

export function createZone(body: ZoneFields): Promise<MutationResult<ShippingZone>> {
  return send<ShippingZone>(`${BASE}/zones`, 'POST', body, 201);
}

export function getZone(zoneId: string): Promise<MutationResult<ShippingZone>> {
  return query<ShippingZone>(`${BASE}/zones/${segment(zoneId)}`);
}

/** Una página de zonas asignables —vigentes y listas— con sus reglas activas. */
export function listAssignableZones(options: {
  readonly q?: string;
  readonly pageToken?: string | null;
}): Promise<MutationResult<AssignableZonePage>> {
  const params = new URLSearchParams();

  if (options.q !== undefined && options.q.trim().length >= 2) params.set('q', options.q.trim());
  if (options.pageToken) params.set('pageToken', options.pageToken);

  const text = params.toString();

  return query<AssignableZonePage>(`${BASE}/assignable${text === '' ? '' : `?${text}`}`);
}

export function updateZone(
  zoneId: string,
  body: Partial<ZoneFields> & { readonly expectedVersion: number },
): Promise<MutationResult<ShippingZone>> {
  return send<ShippingZone>(`${BASE}/zones/${segment(zoneId)}`, 'PATCH', body, 200);
}

export function transitionZone(
  zoneId: string,
  transition: ZoneTransition,
  expectedVersion: number,
): Promise<MutationResult<ShippingZone>> {
  return send<ShippingZone>(
    `${BASE}/zones/${segment(zoneId)}/${transition}`,
    'POST',
    { expectedVersion },
    200,
  );
}

export type CopyAnswer = { readonly status: number; readonly operation: ShippingCopyOperation };

/**
 * Llamada que responde el recurso de una operación de copia: `200`, `201` o `202` son éxitos, y el
 * estado tiene que corresponder al código que publica el contrato. Un fallo es el error normal.
 */
async function sendCopy(url: string, body: unknown): Promise<MutationResult<CopyAnswer>> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'service_unavailable' };
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return { ok: false, code: 'internal_error' };
  }

  if (response.status === 200 || response.status === 201 || response.status === 202) {
    const operation = payload as ShippingCopyOperation;

    return isPublishedCopyAnswer(response.status, operation.state)
      ? { ok: true, data: { status: response.status, operation } }
      : { ok: false, code: 'internal_error' };
  }

  return readFailurePayload(payload) ?? { ok: false, code: 'internal_error' };
}

export function duplicateZone(
  zoneId: string,
  body: {
    readonly idempotencyKey: string;
    readonly expectedVersion: number;
    readonly name?: string;
  },
): Promise<MutationResult<CopyAnswer>> {
  return sendCopy(`${BASE}/zones/${segment(zoneId)}/duplicate`, body);
}

/**
 * Reanudar o descartar una copia por su `copyOperationId`. No hace falta la clave original, que ni
 * se guarda ni se muestra.
 */
export function actOnCopyOperation(
  copyOperationId: string,
  action: CopyAction,
): Promise<MutationResult<CopyAnswer>> {
  return sendCopy(`${BASE}/copy-operations/${segment(copyOperationId)}/${action}`, {});
}

export function getCopyOperation(
  copyOperationId: string,
): Promise<MutationResult<ShippingCopyOperation>> {
  return query<ShippingCopyOperation>(`${BASE}/copy-operations/${segment(copyOperationId)}`);
}

export function changeCoverage(
  zoneId: string,
  body: {
    readonly expectedVersion: number;
    readonly add: readonly ShippingCoverageChange[];
    readonly remove: readonly ShippingCoverageChange[];
  },
): Promise<MutationResult<ShippingCoverageResult>> {
  return send<ShippingCoverageResult>(
    `${BASE}/zones/${segment(zoneId)}/coverage`,
    'POST',
    body,
    200,
  );
}

// Reglas -----------------------------------------------------------------------------------------

export type RuleFields = {
  readonly name: string;
  readonly rate: ShippingRate;
  readonly transitDaysMin: number | null;
  readonly transitDaysMax: number | null;
};

export function listRules(zoneId: string): Promise<MutationResult<ShippingRule[]>> {
  return query<ShippingRule[]>(`${BASE}/zones/${segment(zoneId)}/rules`);
}

export function createRule(
  zoneId: string,
  body: RuleFields & { readonly scope: ShippingRuleScope },
): Promise<MutationResult<ShippingRule>> {
  return send<ShippingRule>(`${BASE}/zones/${segment(zoneId)}/rules`, 'POST', body, 201);
}

export function updateRule(
  ruleId: string,
  body: Partial<RuleFields> & { readonly expectedVersion: number },
): Promise<MutationResult<ShippingRule>> {
  return send<ShippingRule>(`${BASE}/rules/${segment(ruleId)}`, 'PATCH', body, 200);
}

export function archiveRule(
  ruleId: string,
  expectedVersion: number,
): Promise<MutationResult<ShippingRule>> {
  return send<ShippingRule>(
    `${BASE}/rules/${segment(ruleId)}/archive`,
    'POST',
    { expectedVersion },
    200,
  );
}

export function listTargets(
  ruleId: string,
  pageToken: string | null,
): Promise<MutationResult<ShippingRuleTargetPage>> {
  return query<ShippingRuleTargetPage>(
    `${BASE}/rules/${segment(ruleId)}/targets${
      pageToken === null ? '' : `?pageToken=${encodeURIComponent(pageToken)}`
    }`,
  );
}

export function changeTargets(
  ruleId: string,
  body: {
    readonly idempotencyKey: string;
    readonly expectedVersion: number;
    readonly add: readonly string[];
    readonly remove: readonly string[];
  },
): Promise<MutationResult<ShippingRuleTargetsResult>> {
  return send<ShippingRuleTargetsResult>(
    `${BASE}/rules/${segment(ruleId)}/targets`,
    'POST',
    body,
    200,
  );
}

// Geografía, productos y vista previa ------------------------------------------------------------

export function listMunicipalities(
  departmentCode: string,
): Promise<MutationResult<GeographyMunicipalityList>> {
  return query<GeographyMunicipalityList>(
    `${BASE}/geography/departments/${segment(departmentCode)}/municipalities`,
  );
}

export function searchMunicipalities(
  text: string,
): Promise<MutationResult<{ readonly items: GeographyMunicipality[] }>> {
  return query(`${BASE}/geography/search?q=${encodeURIComponent(text)}`);
}

/**
 * Productos para los selectores: búsqueda del servidor por nombre, SKU y slug, con cursor. Cambiar
 * el texto es otra búsqueda y empieza sin cursor.
 */
export function listPickerProducts(options: {
  readonly q: string;
  readonly pageToken: string | null;
}): Promise<MutationResult<PickerProductPage>> {
  const params = new URLSearchParams();

  if (options.q.trim().length >= 2) params.set('q', options.q.trim());
  if (options.pageToken !== null) params.set('pageToken', options.pageToken);

  const text = params.toString();

  return query<PickerProductPage>(`${BASE}/products${text === '' ? '' : `?${text}`}`);
}

// Relaciones de un producto ---------------------------------------------------------------------

export function listProductRelations(
  productId: string,
  pageToken: string | null,
): Promise<MutationResult<ShippingProductRelationPage>> {
  return query<ShippingProductRelationPage>(
    `${BASE}/products/${segment(productId)}/relations${
      pageToken === null ? '' : `?pageToken=${encodeURIComponent(pageToken)}`
    }`,
  );
}

/** Solo relaciones directas: asignar o retirar el producto de reglas de productos. */
export function changeProductRelations(
  productId: string,
  body: { readonly idempotencyKey: string; readonly changes: readonly ShippingRelationChange[] },
): Promise<MutationResult<ShippingProductRelationsResult>> {
  return send<ShippingProductRelationsResult>(
    `${BASE}/products/${segment(productId)}/relations`,
    'POST',
    body,
    200,
  );
}

export function previewShipping(
  body: ShippingPreviewRequest,
): Promise<MutationResult<ShippingPreview>> {
  return send<ShippingPreview>(`${BASE}/preview`, 'POST', body, 200);
}
