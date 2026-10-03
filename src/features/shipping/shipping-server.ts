import 'server-only';

/**
 * Lecturas compuestas de envíos. **Solo servidor.**
 *
 * Todo lo que es un listado lo pagina y lo filtra el backend: aquí no se recorre ninguna colección
 * entera. Lo único que se compone es lo que cabe en **una página** ya leída —las reglas de las zonas
 * visibles, para enseñar sus tarifas— y la resolución de un nombre de municipio a su código DIVIPOLA
 * sobre la instantánea oficial. No se calcula ningún costo ni se decide qué regla gana.
 */

import { can } from '@/features/session/permissions';
import { listAdminUsers } from '@/lib/api/admin-users';
import {
  listAllMunicipalities,
  listDepartments,
  listRules,
  listZones,
  type GeographyDepartment,
  type GeographyMunicipality,
  type ShippingRateType,
  type ShippingRule,
  type ShippingZone,
} from '@/lib/api/shipping';

import type { ShippingZoneWithRules } from './shipping-projections';
import { normaliseText } from './zone-list';

const CONCURRENCY = 6;

/** Recorre `items` con como mucho {@link CONCURRENCY} llamadas a la vez, conservando el orden. */
export async function mapLimited<T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>,
  limit = CONCURRENCY,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;

      next += 1;
      results[index] = await run(items[index] as T);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));

  return results;
}

export type ZoneFacts = {
  readonly activeRules: readonly ShippingRule[];
  readonly rateTypes: ReadonlySet<ShippingRateType>;
  /** Suma de `targetCount` de las reglas activas de categorías. */
  readonly categoryCount: number;
  /** Suma de `targetCount` de las reglas activas de productos. */
  readonly productCount: number;
  /** Hay una regla activa para todos los productos. */
  readonly allProducts: boolean;
};

export function factsFromRules(rules: readonly ShippingRule[]): ZoneFacts {
  const activeRules = rules.filter((rule) => rule.status === 'active');

  return {
    activeRules,
    rateTypes: new Set(activeRules.map((rule) => rule.rate.type)),
    categoryCount: activeRules
      .filter((rule) => rule.scope === 'categories')
      .reduce((total, rule) => total + rule.targetCount, 0),
    productCount: activeRules
      .filter((rule) => rule.scope === 'products')
      .reduce((total, rule) => total + rule.targetCount, 0),
    allProducts: activeRules.some((rule) => rule.scope === 'all'),
  };
}

/** Reglas de cada zona, leídas con concurrencia limitada. */
export async function loadZoneFacts(
  sessionMaterial: string,
  zones: readonly ShippingZone[],
): Promise<Map<string, ZoneFacts>> {
  const rules = await mapLimited(zones, (zone) => listRules(sessionMaterial, zone.id));

  return new Map(zones.map((zone, index) => [zone.id, factsFromRules(rules[index] ?? [])]));
}

export type MunicipalityResolution =
  /** Un municipio concreto: su código y cómo nombrarlo. */
  | { readonly kind: 'one'; readonly code: string; readonly label: string }
  /** Varios coinciden: la pantalla ofrece elegir. */
  | { readonly kind: 'many'; readonly options: readonly { code: string; label: string }[] }
  | { readonly kind: 'none' }
  /** La geografía no respondió. */
  | { readonly kind: 'unavailable' };

/**
 * Del texto que se escribe al **código** DIVIPOLA con el que filtra el backend.
 *
 * Un código de cinco dígitos se toma tal cual si existe; un nombre se busca en la instantánea
 * oficial. Una coincidencia exacta o única decide; varias se ofrecen para elegir. El nombre nunca
 * viaja como filtro.
 */
export async function resolveMunicipality(text: string): Promise<MunicipalityResolution> {
  const needle = normaliseText(text);

  if (needle.length < 2) return { kind: 'none' };

  let departments: readonly GeographyDepartment[];
  let municipalities;

  try {
    departments = (await listDepartments()).items;
    municipalities = await listAllMunicipalities();
  } catch {
    return { kind: 'unavailable' };
  }

  const names = new Map(departments.map((department) => [department.code, department.name]));
  const label = (municipality: { name: string; departmentCode: string }) =>
    `${municipality.name} (${names.get(municipality.departmentCode) ?? municipality.departmentCode})`;

  if (/^\d{5}$/.test(needle)) {
    const found = municipalities.find((municipality) => municipality.code === needle);

    return found === undefined
      ? { kind: 'none' }
      : { kind: 'one', code: found.code, label: label(found) };
  }

  const exact = municipalities.filter(
    (municipality) => normaliseText(municipality.name) === needle,
  );
  const partial = municipalities.filter((municipality) =>
    normaliseText(municipality.name).includes(needle),
  );
  const pool = exact.length > 0 ? exact : partial;

  if (pool.length === 0) return { kind: 'none' };
  if (pool.length === 1) {
    const only = pool[0] as GeographyMunicipality;

    return { kind: 'one', code: only.code, label: label(only) };
  }

  return {
    kind: 'many',
    options: pool
      .slice(0, 12)
      .map((municipality) => ({ code: municipality.code, label: label(municipality) })),
  };
}

/**
 * Nombres de las cuentas que quien mira puede ver en Usuarios.
 *
 * Sin `admin_users.read` no se pide nada: el responsable se pinta como «Otra cuenta del panel». Un
 * fallo tampoco rompe el listado de zonas.
 */
export async function loadActorNames(
  sessionMaterial: string,
  role: string,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();

  if (!can(role, 'admin_users.read')) return names;

  let pageToken: string | undefined;

  try {
    for (let page = 0; page < 5; page += 1) {
      const result = await listAdminUsers(
        sessionMaterial,
        pageToken === undefined ? {} : { pageToken },
      );

      for (const user of result.items) names.set(user.id, user.displayName);
      if (result.nextPageToken === null) break;
      pageToken = result.nextPageToken;
    }
  } catch {
    // Sin nombres: el listado sigue funcionando.
  }

  return names;
}

export const ASSIGNABLE_PAGE_SIZE = 20;

export type AssignablePage = {
  readonly items: readonly ShippingZoneWithRules[];
  readonly nextPageToken: string | null;
};

/**
 * Una página de zonas donde se pueden asignar productos —borradores y activas, copias listas—, con
 * sus reglas activas. La busca y la pagina el backend; aquí solo se leen las reglas de esa página.
 */
export async function loadAssignableZones(
  sessionMaterial: string,
  options: { readonly q?: string; readonly pageToken?: string } = {},
): Promise<AssignablePage> {
  const page = await listZones(sessionMaterial, {
    view: 'current',
    copyState: 'ready',
    pageSize: ASSIGNABLE_PAGE_SIZE,
    ...(options.q === undefined || options.q === '' ? {} : { q: options.q }),
    ...(options.pageToken === undefined || options.pageToken === ''
      ? {}
      : { pageToken: options.pageToken }),
  });
  const rules = await mapLimited(page.items, (zone) => listRules(sessionMaterial, zone.id));

  return {
    items: page.items.map((zone, index) => ({
      zone,
      rules: (rules[index] ?? []).filter((rule) => rule.status === 'active'),
    })),
    nextPageToken: page.nextPageToken,
  };
}

/** Nombres oficiales de los departamentos por código. Vacío si la geografía no responde. */
export async function departmentNames(): Promise<Map<string, string>> {
  try {
    const list = await listDepartments();

    return new Map(list.items.map((department) => [department.code, department.name]));
  } catch {
    return new Map();
  }
}
