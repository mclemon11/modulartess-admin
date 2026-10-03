/**
 * Filtros y cursor del listado de zonas, entre la URL y la consulta del backend.
 *
 * El backend filtra, ordena —`updatedAt` descendente, desempate por id— y pagina con un cursor
 * opaco atado a los filtros. El panel no guarda la lista ni la recorre: traduce la URL a la
 * consulta, pinta la página y ofrece la siguiente. Cambiar un filtro es enviar el formulario, que
 * no lleva cursor: la paginación vuelve a empezar sola, y un cursor de otros filtros no se reutiliza
 * nunca.
 *
 * Módulo puro.
 */

import type {
  ShippingCopyState,
  ShippingRateType,
  ShippingZone,
  ShippingZoneStatus,
  ZoneQuery,
} from '@/lib/api/shipping';

export const ZONE_PAGE_SIZE = 20;

export type ZoneTab = 'current' | 'archived' | 'copies';

export type ZoneValidityFilter = 'always' | 'windowed';

export type ZoneFilters = {
  readonly tab: ZoneTab;
  /** Prefijo del nombre, 2+ caracteres. */
  readonly q: string;
  readonly status: ShippingZoneStatus | '';
  readonly copyState: ShippingCopyState | '';
  readonly rate: ShippingRateType | '';
  readonly validity: ZoneValidityFilter | '';
  /** Lo que se escribió para el municipio: un código o un nombre que el servidor resuelve. */
  readonly municipality: string;
  /** Cursor opaco del backend para esta combinación de filtros. */
  readonly cursor: string;
  /** Número de página, solo para decirlo en pantalla. */
  readonly page: number;
};

const RATE_VALUES: readonly string[] = [
  'free',
  'flat_order',
  'per_unit',
  'base_plus_additional',
  'manual_quote',
];
const VALIDITY_VALUES: readonly string[] = ['always', 'windowed'];
/** Estados comerciales que admite cada vista: uno fuera de ella lo rechaza el backend. */
export const STATUS_BY_TAB: Readonly<Record<ZoneTab, readonly ShippingZoneStatus[]>> = {
  current: ['draft', 'active'],
  archived: [],
  copies: ['draft', 'archived'],
};
/** Estados de copia con sentido en cada vista: las vigentes y archivadas son siempre `ready`. */
export const COPY_STATES_BY_TAB: Readonly<Record<ZoneTab, readonly ShippingCopyState[]>> = {
  current: [],
  archived: [],
  copies: ['copying', 'failed', 'discarded'],
};
const CURSOR = /^[A-Za-z0-9_\-=.:+/]{1,512}$/;

type Params = Readonly<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** Lee los filtros de la URL. Cualquier valor que no sea del contrato se ignora. */
export function parseZoneFilters(params: Params): ZoneFilters {
  const tabRaw = first(params.vista);
  const tab: ZoneTab =
    tabRaw === 'archivadas' ? 'archived' : tabRaw === 'copias' ? 'copies' : 'current';
  const statusRaw = first(params.estado);
  const copyRaw = first(params.copia);
  const rateRaw = first(params.tarifa);
  const validityRaw = first(params.vigencia);
  const cursor = first(params.cursor);
  const pageRaw = Number(first(params.pagina));

  return {
    tab,
    q: first(params.q).trim().slice(0, 80),
    status: (STATUS_BY_TAB[tab] as readonly string[]).includes(statusRaw)
      ? (statusRaw as ShippingZoneStatus)
      : '',
    copyState: (COPY_STATES_BY_TAB[tab] as readonly string[]).includes(copyRaw)
      ? (copyRaw as ShippingCopyState)
      : '',
    rate: RATE_VALUES.includes(rateRaw) ? (rateRaw as ShippingRateType) : '',
    validity: VALIDITY_VALUES.includes(validityRaw) ? (validityRaw as ZoneValidityFilter) : '',
    municipality: first(params.municipio).trim().slice(0, 60),
    cursor: CURSOR.test(cursor) ? cursor : '',
    page: cursor !== '' && Number.isInteger(pageRaw) && pageRaw >= 2 ? pageRaw : 1,
  };
}

/**
 * URL del listado. Sin `cursor`, es la primera página de esos filtros; el cursor solo viaja junto a
 * los filtros que lo produjeron.
 */
export function zoneListHref(filters: Partial<ZoneFilters>): string {
  const query = new URLSearchParams();

  if (filters.tab === 'archived') query.set('vista', 'archivadas');
  if (filters.tab === 'copies') query.set('vista', 'copias');
  if (filters.q) query.set('q', filters.q);
  if (filters.status) query.set('estado', filters.status);
  if (filters.copyState) query.set('copia', filters.copyState);
  if (filters.rate) query.set('tarifa', filters.rate);
  if (filters.validity) query.set('vigencia', filters.validity);
  if (filters.municipality) query.set('municipio', filters.municipality);
  if (filters.cursor) {
    query.set('cursor', filters.cursor);
    query.set('pagina', String(filters.page ?? 2));
  }

  const text = query.toString();

  return text === '' ? '/panel/envios' : `/panel/envios?${text}`;
}

/** Los mismos filtros sin cursor: la primera página. */
export function firstPage(filters: ZoneFilters): ZoneFilters {
  return { ...filters, cursor: '', page: 1 };
}

const VIEW_BY_TAB: Readonly<Record<ZoneTab, NonNullable<ZoneQuery['view']>>> = {
  current: 'current',
  archived: 'archived',
  copies: 'copies',
};

/**
 * La consulta del contrato. El municipio ya llega resuelto a código DIVIPOLA —nunca viaja un
 * nombre— y la búsqueda solo se manda con 2+ caracteres, como pide el contrato.
 */
export function toZoneQuery(filters: ZoneFilters, municipalityCode: string | null): ZoneQuery {
  return {
    view: VIEW_BY_TAB[filters.tab],
    pageSize: ZONE_PAGE_SIZE,
    ...(filters.q.length >= 2 ? { q: filters.q } : {}),
    ...(filters.status === '' ? {} : { status: filters.status }),
    ...(filters.copyState === '' ? {} : { copyState: filters.copyState }),
    ...(filters.rate === '' ? {} : { rateType: filters.rate }),
    ...(filters.validity === '' ? {} : { validity: filters.validity }),
    ...(municipalityCode === null ? {} : { municipalityCode }),
    ...(filters.cursor === '' ? {} : { pageToken: filters.cursor }),
  };
}

export function isFiltering(filters: ZoneFilters): boolean {
  return (
    filters.q !== '' ||
    filters.status !== '' ||
    filters.copyState !== '' ||
    filters.rate !== '' ||
    filters.validity !== '' ||
    filters.municipality !== ''
  );
}

/**
 * Defensa en profundidad: el backend ya separa las vistas, pero ninguna copia que no esté `ready`
 * se pinta nunca como zona utilizable fuera de «Copias».
 */
export function usableForTab(zones: readonly ShippingZone[], tab: ZoneTab): ShippingZone[] {
  return tab === 'copies' ? [...zones] : zones.filter((zone) => zone.copy.state === 'ready');
}

/** Texto comparable: sin tildes, sin mayúsculas y con los espacios normalizados. */
export function normaliseText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Quién hizo el último cambio, sin pintar nunca el identificador.
 *
 * «Tú» si es la cuenta que mira, el nombre si quien mira puede ver esa cuenta en Usuarios, y si no,
 * «Otra cuenta del panel». El UID no sale del servidor.
 */
export function describeActor(
  actorId: string,
  viewerId: string,
  names: ReadonlyMap<string, string>,
): string {
  if (actorId === viewerId) return 'Tú';

  return names.get(actorId) ?? 'Otra cuenta del panel';
}
