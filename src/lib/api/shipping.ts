import 'server-only';

/**
 * Zonas de envío contra el backend. **Solo servidor.**
 *
 * La autoridad es el backend (ADR 0025 del backend): decide cobertura, prioridad, tarifas,
 * resolución por nivel, empates y qué recibe un producto sin regla. Este módulo solo transporta:
 * la sesión de la persona en `x-modulartess-admin-session`, la `Idempotency-Key` en su encabezado
 * y los cuerpos cerrados que publica el contrato. No calcula ningún costo de envío.
 *
 * La geografía (`/v1/geography/*`) es la instantánea DIVIPOLA oficial que publica el backend. Es
 * la misma para todos y el contrato la declara cacheable un día, así que se guarda en memoria del
 * servidor por ese tiempo. El navegador nunca la pide al backend: la recibe del BFF.
 */

import { isPublishedCopyAnswer } from '@/features/shipping/copy-operation-model';

import { backendClient } from './backend-client';
import { BackendFailure, listingFailure, shippingFailure } from './errors';
import type { components, paths } from './generated/schema';
import { ADMIN_SESSION_HEADER } from './session-material';

type Schemas = components['schemas'];

export type ShippingZone = Schemas['ShippingZoneDto'];
export type ShippingZoneStatus = ShippingZone['status'];
export type ShippingCopyState = ShippingZone['copy']['state'];
export type ShippingCoverageSummary = Schemas['ShippingZoneCoverageSummaryDto'];
export type ShippingZoneCreateRequest = Schemas['ShippingZoneCreateDto'];
export type ShippingZoneUpdateRequest = Schemas['ShippingZoneUpdateDto'];
export type ShippingZoneDuplicateRequest = Schemas['ShippingZoneDuplicateDto'];
export type UnmatchedProductBehavior = ShippingZone['unmatchedProductBehavior'];
export type ShippingCoverageEntry = Schemas['ShippingCoverageEntryDto'];
export type ShippingCoverageChange = Schemas['ShippingCoverageChangeDto'];
export type ShippingCoverageKind = ShippingCoverageChange['kind'];
export type ShippingCoverageUpdateRequest = Schemas['ShippingCoverageUpdateDto'];
export type ShippingCoverageResult = Schemas['ShippingCoverageResultDto'];
export type ShippingRule = Schemas['ShippingRuleDto'];
export type ShippingRuleScope = ShippingRule['scope'];
export type ShippingRate = Schemas['ShippingRateDto'];
export type ShippingRateType = ShippingRate['type'];
export type ShippingRuleCreateRequest = Schemas['ShippingRuleCreateDto'];
export type ShippingRuleUpdateRequest = Schemas['ShippingRuleUpdateDto'];
export type ShippingRuleTarget = Schemas['ShippingRuleTargetDto'];
export type ShippingRuleTargetsUpdateRequest = Schemas['ShippingRuleTargetsUpdateDto'];
export type ShippingRuleTargetsResult = Schemas['ShippingRuleTargetsResultDto'];
export type ShippingTargetItemResult = Schemas['ShippingTargetItemResultDto'];
export type ShippingAnalysis = Schemas['ShippingAnalysisDto'];
export type ShippingPreviewRequest = Schemas['ShippingPreviewRequestDto'];
export type ShippingPreview = Schemas['ShippingPreviewDto'];
export type ShippingPreviewLine = Schemas['ShippingPreviewLineDto'];
export type ShippingCharge = Schemas['ShippingChargeDto'];
export type ShippingLevel = ShippingCharge['level'];
export type ShippingOutcome = ShippingPreview['outcome'];
export type ShippingReason = NonNullable<ShippingPreview['reason']>;
export type GeographyDepartment = Schemas['GeographyDepartmentDto'];
export type GeographyDepartmentList = Schemas['GeographyDepartmentListDto'];
export type GeographyMunicipality = Schemas['GeographyMunicipalityDto'];
export type GeographyMunicipalityList = Schemas['GeographyMunicipalityListDto'];
export type ShippingZonePage = Schemas['ShippingZoneListDto'];
export type ShippingCopyOperation = Schemas['ShippingCopyOperationDto'];
export type ShippingProductRelation = Schemas['ShippingProductRelationDto'];
export type ShippingProductRelationPage = Schemas['ShippingProductRelationPageDto'];
export type ShippingRelationChange = Schemas['ShippingRelationChangeDto'];
export type ShippingRelationChangeResult = Schemas['ShippingRelationChangeResultDto'];
export type ShippingProductRelationsResult = Schemas['ShippingProductRelationsResultDto'];

export type ShippingZoneView = 'current' | 'archived' | 'all' | 'copies';

/** Tope de cambios por petición que publica el contrato, para cobertura y para asignaciones. */
export const SHIPPING_CHANGES_MAX = 400;

/**
 * Páginas que se leen como mucho al recorrer la cobertura o las asignaciones de una regla.
 *
 * Con 500 por página cubre de sobra los 1.122 municipios más los 33 departamentos. Si se alcanza,
 * quien llama lo sabe por `truncated` y lo dice en pantalla en vez de pintar una lista incompleta
 * como si fuera entera.
 */
const MAX_PAGES = 10;
const PAGE_SIZE = 500;

function sessionHeaders(sessionMaterial: string): Record<string, string> {
  return { [ADMIN_SESSION_HEADER]: sessionMaterial };
}

function toFailure(error: unknown): BackendFailure {
  return error instanceof BackendFailure ? error : new BackendFailure('backend_unavailable');
}

type Outcome<T> = {
  readonly data?: T;
  readonly error?: unknown;
  readonly response: Response;
};

/** Una llamada: red y temporizador a `backend_unavailable`; un rechazo, a su código estable. */
async function call<T>(run: () => Promise<Outcome<T>>): Promise<T> {
  let response: Outcome<T>;

  try {
    response = await run();
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw shippingFailure(response.response.status, response.error);
  }

  return response.data;
}

// ------------------------------------------------------------------------------------------------
// Zonas
// ------------------------------------------------------------------------------------------------

export type ZoneQuery = NonNullable<
  paths['/v1/admin/shipping/zones']['get']['parameters']['query']
>;

/** Lo que filtra: todo menos el cursor y el tamaño de página. */
function isFiltered(query: ZoneQuery): boolean {
  return (
    query.q !== undefined ||
    query.status !== undefined ||
    query.copyState !== undefined ||
    query.rateType !== undefined ||
    query.validity !== undefined ||
    query.municipalityCode !== undefined
  );
}

/**
 * Una página de zonas, filtrada y ordenada **por el backend** —«every filter is a clause of the
 * Firestore query, never an in-memory pass»—. El cursor es opaco y está atado a los filtros: el
 * panel nunca lo construye, solo lo devuelve.
 */
export async function listZones(
  sessionMaterial: string,
  query: ZoneQuery,
): Promise<ShippingZonePage> {
  try {
    return await call(() =>
      backendClient().GET('/v1/admin/shipping/zones', {
        params: { query },
        headers: sessionHeaders(sessionMaterial),
      }),
    );
  } catch (error) {
    throw listingFailure(toFailure(error), {
      cursor: query.pageToken !== undefined,
      filtered: isFiltered(query),
    });
  }
}

export function getZone(sessionMaterial: string, zoneId: string): Promise<ShippingZone> {
  return call(() =>
    backendClient().GET('/v1/admin/shipping/zones/{zoneId}', {
      params: { path: { zoneId } },
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function createZone(
  sessionMaterial: string,
  body: ShippingZoneCreateRequest,
): Promise<ShippingZone> {
  return call(() =>
    backendClient().POST('/v1/admin/shipping/zones', {
      body,
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function updateZone(
  sessionMaterial: string,
  zoneId: string,
  body: ShippingZoneUpdateRequest,
): Promise<ShippingZone> {
  return call(() =>
    backendClient().PATCH('/v1/admin/shipping/zones/{zoneId}', {
      params: { path: { zoneId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export type ZoneTransition = 'activate' | 'archive' | 'restore';

/**
 * Activar, archivar o restaurar una zona archivada **como borrador**, con `expectedVersion`.
 *
 * Restaurar nunca deja la zona activa: activarla otra vez pasa por todas las comprobaciones.
 */
export function transitionZone(
  sessionMaterial: string,
  zoneId: string,
  transition: ZoneTransition,
  expectedVersion: number,
): Promise<ShippingZone> {
  const init = {
    params: { path: { zoneId } },
    body: { expectedVersion },
    headers: sessionHeaders(sessionMaterial),
  };

  return call(() =>
    transition === 'activate'
      ? backendClient().POST('/v1/admin/shipping/zones/{zoneId}/activate', init)
      : transition === 'archive'
        ? backendClient().POST('/v1/admin/shipping/zones/{zoneId}/archive', init)
        : backendClient().POST('/v1/admin/shipping/zones/{zoneId}/restore', init),
  );
}

export type CopyOperationResult = {
  /** El código HTTP del backend: 200, 201 o 202. */
  readonly status: 200 | 201 | 202;
  readonly operation: ShippingCopyOperation;
};

/**
 * Una llamada que responde el recurso de la operación de copia.
 *
 * Las decisiones salen de `state`, `failureCode`, `copied` y `zone`: `message` es informativo y no
 * se analiza nunca. Antes de que la operación exista, un fallo es el error normal del contrato y no
 * trae ningún identificador.
 */
async function copyCall(
  run: () => Promise<Outcome<ShippingCopyOperation>>,
): Promise<CopyOperationResult> {
  let response: Outcome<ShippingCopyOperation>;

  try {
    response = await run();
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw shippingFailure(response.response.status, response.error);
  }

  const status = response.response.status;
  if (!isPublishedCopyAnswer(status, response.data.state)) {
    throw new BackendFailure('backend_contract_violation');
  }

  return { status: status as CopyOperationResult['status'], operation: response.data };
}

/**
 * Duplica una zona como borrador nuevo, por lotes.
 *
 * La clave la genera el navegador y solo viaja aquí: el backend no la devuelve nunca. La respuesta
 * es la operación de copia —`201` lista, `202` copiando o fallida, `200` si la clave nombra una
 * copia descartada— y lo que la identifica a partir de ahí es su `copyOperationId`.
 */
export function duplicateZone(
  sessionMaterial: string,
  zoneId: string,
  idempotencyKey: string,
  body: ShippingZoneDuplicateRequest,
): Promise<CopyOperationResult> {
  return copyCall(() =>
    backendClient().POST('/v1/admin/shipping/zones/{zoneId}/duplicate', {
      params: { path: { zoneId }, header: { 'Idempotency-Key': idempotencyKey } },
      body,
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function getCopyOperation(
  sessionMaterial: string,
  copyOperationId: string,
): Promise<ShippingCopyOperation> {
  return call(() =>
    backendClient().GET('/v1/admin/shipping/copy-operations/{copyOperationId}', {
      params: { path: { copyOperationId } },
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export type CopyAction = 'resume' | 'discard';

/**
 * Reanudar o descartar una copia por su `copyOperationId`, sin la clave original.
 *
 * Reanudar responde `200` (lista o descartada) o `202` (copiando o fallida otra vez). Descartar
 * responde `200` descartada, también al repetirlo; descartar una terminada es
 * `409 shipping_transition_invalid`.
 */
export function actOnCopyOperation(
  sessionMaterial: string,
  copyOperationId: string,
  action: CopyAction,
): Promise<CopyOperationResult> {
  const init = {
    params: { path: { copyOperationId } },
    headers: sessionHeaders(sessionMaterial),
  };

  return copyCall(() =>
    action === 'resume'
      ? backendClient().POST('/v1/admin/shipping/copy-operations/{copyOperationId}/resume', init)
      : backendClient().POST('/v1/admin/shipping/copy-operations/{copyOperationId}/discard', init),
  );
}

// ------------------------------------------------------------------------------------------------
// Relaciones de un producto
// ------------------------------------------------------------------------------------------------

/** Relaciones del producto con las zonas: directas y heredadas, paginadas por el backend. */
export async function listProductRelations(
  sessionMaterial: string,
  productId: string,
  pageToken?: string,
): Promise<ShippingProductRelationPage> {
  try {
    return await call(() =>
      backendClient().GET('/v1/admin/shipping/products/{productId}/relations', {
        params: {
          path: { productId },
          query: pageToken === undefined ? {} : { pageToken },
        },
        headers: sessionHeaders(sessionMaterial),
      }),
    );
  } catch (error) {
    throw listingFailure(toFailure(error), { cursor: pageToken !== undefined, filtered: false });
  }
}

/** Asignar o retirar **solo relaciones directas**. Las heredadas viven en otras reglas. */
export function changeProductRelations(
  sessionMaterial: string,
  productId: string,
  idempotencyKey: string,
  changes: readonly ShippingRelationChange[],
): Promise<ShippingProductRelationsResult> {
  return call(() =>
    backendClient().POST('/v1/admin/shipping/products/{productId}/relations', {
      params: { path: { productId }, header: { 'Idempotency-Key': idempotencyKey } },
      body: { changes: [...changes] },
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

// ------------------------------------------------------------------------------------------------
// Cobertura
// ------------------------------------------------------------------------------------------------

export type CoverageListing = {
  readonly items: readonly ShippingCoverageEntry[];
  readonly truncated: boolean;
};

/** Todas las entradas de cobertura de una zona, recorriendo el cursor en serie. */
export async function listAllCoverage(
  sessionMaterial: string,
  zoneId: string,
): Promise<CoverageListing> {
  const items: ShippingCoverageEntry[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await call(() =>
      backendClient().GET('/v1/admin/shipping/zones/{zoneId}/coverage', {
        params: {
          path: { zoneId },
          query: { pageSize: PAGE_SIZE, ...(pageToken === undefined ? {} : { pageToken }) },
        },
        headers: sessionHeaders(sessionMaterial),
      }),
    );

    items.push(...result.items);

    if (result.nextPageToken === null || result.nextPageToken === '') {
      return { items, truncated: false };
    }

    pageToken = result.nextPageToken;
  }

  return { items, truncated: true };
}

export function changeCoverage(
  sessionMaterial: string,
  zoneId: string,
  body: ShippingCoverageUpdateRequest,
): Promise<ShippingCoverageResult> {
  return call(() =>
    backendClient().POST('/v1/admin/shipping/zones/{zoneId}/coverage', {
      params: { path: { zoneId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

// ------------------------------------------------------------------------------------------------
// Reglas y asignaciones
// ------------------------------------------------------------------------------------------------

export function listRules(sessionMaterial: string, zoneId: string): Promise<ShippingRule[]> {
  return call(() =>
    backendClient().GET('/v1/admin/shipping/zones/{zoneId}/rules', {
      params: { path: { zoneId } },
      headers: sessionHeaders(sessionMaterial),
    }),
  ).then((list) => list.items);
}

export function createRule(
  sessionMaterial: string,
  zoneId: string,
  body: ShippingRuleCreateRequest,
): Promise<ShippingRule> {
  return call(() =>
    backendClient().POST('/v1/admin/shipping/zones/{zoneId}/rules', {
      params: { path: { zoneId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function getRule(sessionMaterial: string, ruleId: string): Promise<ShippingRule> {
  return call(() =>
    backendClient().GET('/v1/admin/shipping/rules/{ruleId}', {
      params: { path: { ruleId } },
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function updateRule(
  sessionMaterial: string,
  ruleId: string,
  body: ShippingRuleUpdateRequest,
): Promise<ShippingRule> {
  return call(() =>
    backendClient().PATCH('/v1/admin/shipping/rules/{ruleId}', {
      params: { path: { ruleId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function archiveRule(
  sessionMaterial: string,
  ruleId: string,
  expectedVersion: number,
): Promise<ShippingRule> {
  return call(() =>
    backendClient().POST('/v1/admin/shipping/rules/{ruleId}/archive', {
      params: { path: { ruleId } },
      body: { expectedVersion },
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export type ShippingRuleTargetPage = Schemas['ShippingRuleTargetPageDto'];

/** Tamaño de página de las asignaciones de una regla en el editor. */
export const TARGET_PAGE_SIZE = 100;

/** Una página de las categorías o productos asignados a una regla. */
export async function listTargets(
  sessionMaterial: string,
  ruleId: string,
  pageToken?: string,
): Promise<ShippingRuleTargetPage> {
  try {
    return await call(() =>
      backendClient().GET('/v1/admin/shipping/rules/{ruleId}/targets', {
        params: {
          path: { ruleId },
          query: { pageSize: TARGET_PAGE_SIZE, ...(pageToken === undefined ? {} : { pageToken }) },
        },
        headers: sessionHeaders(sessionMaterial),
      }),
    );
  } catch (error) {
    throw listingFailure(toFailure(error), { cursor: pageToken !== undefined, filtered: false });
  }
}

export function changeTargets(
  sessionMaterial: string,
  ruleId: string,
  idempotencyKey: string,
  body: ShippingRuleTargetsUpdateRequest,
): Promise<ShippingRuleTargetsResult> {
  return call(() =>
    backendClient().POST('/v1/admin/shipping/rules/{ruleId}/targets', {
      params: { path: { ruleId }, header: { 'Idempotency-Key': idempotencyKey } },
      body,
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

// ------------------------------------------------------------------------------------------------
// Análisis y vista previa
// ------------------------------------------------------------------------------------------------

export function getAnalysis(sessionMaterial: string): Promise<ShippingAnalysis> {
  return call(() =>
    backendClient().GET('/v1/admin/shipping/analysis', {
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

/** Vista previa de la resolución para un destino y un carrito. No crea nada. */
export function previewShipping(
  sessionMaterial: string,
  body: ShippingPreviewRequest,
): Promise<ShippingPreview> {
  return call(() =>
    backendClient().POST('/v1/admin/shipping/preview', {
      body,
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

// ------------------------------------------------------------------------------------------------
// Geografía DIVIPOLA
// ------------------------------------------------------------------------------------------------

/** El contrato la declara cacheable un día. */
const GEOGRAPHY_TTL_MS = 24 * 60 * 60 * 1000;

type Cached<T> = {
  readonly at: number;
  readonly etag: string | null;
  readonly value: Promise<T>;
};

const geographyCache = new Map<string, Cached<unknown>>();

/** Solo para pruebas: vacía la caché de geografía. */
export function resetGeographyCacheForTests(): void {
  geographyCache.clear();
}

/**
 * Geografía DIVIPOLA con caché y `ETag`.
 *
 * El contrato la publica para la tienda y para este BFF con la misma protección: el servicio es
 * privado por IAM y la llamada viaja con la identidad del BFF, como cualquier otra. No lleva la
 * sesión de la persona —no la necesita— ni ningún token de servicio.
 *
 * Dentro del día que el contrato declara cacheable, se sirve de memoria. Pasado, se revalida con
 * `If-None-Match`: un `304` reutiliza lo que ya había. Una lectura fallida se olvida en el acto, para
 * que un corte puntual no deje la geografía rota durante un día.
 */
function geography<T>(
  key: string,
  run: (headers: Record<string, string>) => Promise<Outcome<T>>,
): Promise<T> {
  const hit = geographyCache.get(key) as Cached<T> | undefined;

  if (hit !== undefined && Date.now() - hit.at < GEOGRAPHY_TTL_MS) return hit.value;

  let etag: string | null = null;
  const value = (async () => {
    let response: Outcome<T>;

    try {
      response = await run(hit?.etag ? { 'If-None-Match': hit.etag } : {});
    } catch (error) {
      throw toFailure(error);
    }

    if (response.response.status === 304 && hit !== undefined) {
      etag = hit.etag;

      return hit.value;
    }

    if (response.error !== undefined || response.data === undefined) {
      throw shippingFailure(response.response.status, response.error);
    }

    etag = response.response.headers.get('etag');

    return response.data;
  })();

  geographyCache.set(key, { at: Date.now(), etag: hit?.etag ?? null, value });
  value.then(
    () => geographyCache.set(key, { at: Date.now(), etag, value }),
    () => geographyCache.delete(key),
  );

  return value;
}

export function listDepartments(): Promise<GeographyDepartmentList> {
  return geography('departments', (headers) =>
    backendClient().GET('/v1/geography/departments', { headers }),
  );
}

export function listMunicipalities(departmentCode: string): Promise<GeographyMunicipalityList> {
  return geography(`municipalities:${departmentCode}`, (headers) =>
    backendClient().GET('/v1/geography/departments/{departmentCode}/municipalities', {
      params: { path: { departmentCode } },
      headers,
    }),
  );
}

/**
 * Todos los municipios de la instantánea oficial, para buscar por nombre en el servidor.
 *
 * Es la división de DANE —1.122 municipios, un conjunto fijo—, no datos de negocio. Son 33 lecturas
 * cacheadas; el resultado nunca viaja entero al navegador.
 */
export async function listAllMunicipalities(): Promise<GeographyMunicipality[]> {
  const departments = await listDepartments();
  const lists = await Promise.all(
    departments.items.map((department) => listMunicipalities(department.code)),
  );

  return lists.flatMap((list) => list.items);
}
