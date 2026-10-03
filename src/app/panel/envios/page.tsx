import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { EmptyState, ErrorState } from '@/features/panel/panel-states';
import { RefreshButton } from '@/features/panel/refresh-button';
import { resolvePanelSession } from '@/features/panel/session-context';
import { sessionErrorFromBackendFailure } from '@/features/session/api-errors';
import { can } from '@/features/session/permissions';
import { describeShippingFailure } from '@/features/shipping/shipping-errors';
import {
  COPY_STATE_LABELS,
  RATE_TYPE_LABELS,
  RATE_TYPES,
  ZONE_STATUS_LABELS,
} from '@/features/shipping/shipping-labels';
import {
  loadActorNames,
  loadZoneFacts,
  resolveMunicipality,
  type MunicipalityResolution,
  type ZoneFacts,
} from '@/features/shipping/shipping-server';
import styles from '@/features/shipping/shipping.module.css';
import {
  COPY_STATES_BY_TAB,
  firstPage,
  isFiltering,
  parseZoneFilters,
  STATUS_BY_TAB,
  toZoneQuery,
  usableForTab,
  zoneListHref,
  type ZoneFilters,
} from '@/features/shipping/zone-list';
import { ZoneListView, ZonePager } from '@/features/shipping/zone-list-view';
import { isBackendFailure } from '@/lib/api/errors';
import { listZones, type ShippingZonePage } from '@/lib/api/shipping';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Envíos' };

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TRAIL = [{ href: '/panel', label: 'Panel' }, { label: 'Envíos' }];

/**
 * Zonas de envío.
 *
 * Una zona dice **a dónde** se envía —cobertura por código DIVIPOLA— y **cuánto** se cobra —sus
 * reglas, cada una con su tarifa y su alcance de productos—. El backend decide la resolución.
 *
 * El listado es una página del backend: búsqueda por nombre, estado comercial, estado de copia,
 * tipo de tarifa, vigencia y municipio son cláusulas de su consulta, con orden estable y cursor
 * opaco atado a los filtros. Aquí no se carga ni se recorre ninguna lista completa. Las reglas se
 * leen solo para las zonas visibles, para enseñar sus tarifas.
 */
export default async function ShippingPage({ searchParams }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const { role, sessionMaterial, uid } = session.session;

  if (!can(role, 'shipping.read')) {
    return (
      <>
        <PanelHeader trail={TRAIL} />
        <div className={catalog.page}>
          <PanelPageHeader title="Envíos" />
          <ErrorState message="Tu rol no consulta zonas de envío." title="Sin acceso a envíos" />
        </div>
      </>
    );
  }

  const canManage = can(role, 'shipping.manage');
  const filters = parseZoneFilters(await searchParams);
  const now = new Date();
  // El municipio se filtra por código: un nombre se resuelve antes en la geografía oficial.
  const municipality: MunicipalityResolution | null =
    filters.municipality === '' ? null : await resolveMunicipality(filters.municipality);
  const municipalityCode = municipality?.kind === 'one' ? municipality.code : null;
  const blockedByMunicipality = municipality !== null && municipalityCode === null;

  let page: ShippingZonePage | null = null;
  let failure: string | null = null;
  let failureCode: string | null = null;

  if (!blockedByMunicipality) {
    try {
      page = await listZones(sessionMaterial, toZoneQuery(filters, municipalityCode));
    } catch (error) {
      failureCode = isBackendFailure(error) ? sessionErrorFromBackendFailure(error.code) : null;
      failure =
        failureCode === null
          ? 'No pudimos cargar las zonas de envío.'
          : describeShippingFailure(failureCode);
    }
  }

  const zones = page === null ? [] : usableForTab(page.items, filters.tab);
  let facts = new Map<string, ZoneFacts>();
  let factsFailed = false;

  try {
    facts = await loadZoneFacts(sessionMaterial, zones);
  } catch {
    factsFailed = true;
  }

  const names = await loadActorNames(sessionMaterial, role);
  const filtering = isFiltering(filters);

  return (
    <>
      <PanelHeader trail={TRAIL} />
      <div className={catalog.page}>
        <PanelPageHeader
          actions={
            <>
              <RefreshButton />
              <Link className={catalog.buttonSecondary} href="/panel/envios/vista-previa">
                Vista previa
              </Link>
              {canManage ? (
                <Link className={catalog.buttonPrimary} href="/panel/envios/nueva">
                  <span aria-hidden="true">+</span> Crear zona
                </Link>
              ) : null}
            </>
          }
          lead={
            canManage
              ? 'A dónde se envía y cuánto cuesta. Una zona se crea como borrador, se le da cobertura y tarifas, y se activa cuando está lista.'
              : 'Consulta de zonas, cobertura y tarifas. Tu rol las ve en modo de solo lectura.'
          }
          title="Envíos"
        />

        <nav aria-label="Vista de zonas" className={catalog.viewTabs}>
          {(
            [
              ['current', 'Vigentes'],
              ['archived', 'Archivadas'],
              ['copies', 'Copias'],
            ] as const
          ).map(([tab, label]) => (
            <Link
              aria-current={filters.tab === tab ? 'page' : undefined}
              className={filters.tab === tab ? catalog.viewTabActive : catalog.viewTab}
              href={zoneListHref({ tab })}
              key={tab}
            >
              {label}
            </Link>
          ))}
        </nav>

        {filters.tab === 'copies' ? (
          <p className={catalog.notice}>
            Copias de zonas que siguen copiándose, que fallaron o que se descartaron. Ninguna es una
            zona utilizable: no se editan, no se activan y no cotizan. Cada una se consulta, se
            reanuda o se descarta desde su operación, aunque se haya cerrado el navegador.
          </p>
        ) : null}

        <ZoneFiltersForm filters={filters} />

        <div aria-live="polite">
          {municipality?.kind === 'one' ? (
            <p className={catalog.hint}>Zonas que cubren {municipality.label}.</p>
          ) : null}
          {municipality?.kind === 'many' ? (
            <div className={catalog.notice}>
              <p>Varios municipios coinciden con «{filters.municipality}». Elige uno:</p>
              <ul className={styles.chips}>
                {municipality.options.map((option) => (
                  <li key={option.code}>
                    <Link
                      className={catalog.rowAction}
                      href={zoneListHref({ ...firstPage(filters), municipality: option.code })}
                    >
                      {option.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {municipality?.kind === 'none' ? (
            <p className={catalog.notice}>
              Ningún municipio de la división oficial coincide con «{filters.municipality}».
            </p>
          ) : null}
          {municipality?.kind === 'unavailable' ? (
            <p className={catalog.notice}>
              La división geográfica no respondió: no se pudo filtrar por municipio. Inténtalo de
              nuevo en unos momentos.
            </p>
          ) : null}
          {factsFailed ? (
            <p className={catalog.hint}>
              No se pudieron leer las reglas de algunas zonas: sus tarifas y conteos se muestran
              como «—».
            </p>
          ) : null}
        </div>

        {failure !== null ? (
          <ErrorState
            action={
              <Link
                className={catalog.buttonSecondary}
                href={
                  failureCode === 'query_unavailable'
                    ? zoneListHref({ tab: filters.tab })
                    : zoneListHref(firstPage(filters))
                }
              >
                {failureCode === 'query_unavailable'
                  ? 'Ver sin filtros'
                  : failureCode === 'cursor_invalid'
                    ? 'Volver a la primera página'
                    : 'Reintentar'}
              </Link>
            }
            message={failure}
            title="No pudimos cargar las zonas de envío"
          />
        ) : blockedByMunicipality ? null : zones.length === 0 ? (
          filtering || filters.page > 1 ? (
            <EmptyState icon="envios" title="Ninguna zona coincide">
              Prueba con otro nombre o municipio, o quita algún filtro.
            </EmptyState>
          ) : (
            <EmptyTab canManage={canManage} tab={filters.tab} />
          )
        ) : (
          <section className={catalog.listSurface}>
            <ZoneListView context={{ facts, names, viewerId: uid, now, canManage }} zones={zones} />
            <ZonePager
              count={zones.length}
              filters={filters}
              nextCursor={page?.nextPageToken ?? null}
            />
          </section>
        )}
      </div>
    </>
  );
}

/**
 * Formulario `GET` de filtros. No lleva cursor: aplicar un filtro siempre vuelve a la primera
 * página, y el backend nunca recibe un cursor de otros filtros.
 */
function ZoneFiltersForm({ filters }: { readonly filters: ZoneFilters }) {
  const statuses = STATUS_BY_TAB[filters.tab];
  const copyStates = COPY_STATES_BY_TAB[filters.tab];

  return (
    <section aria-label="Buscar y filtrar zonas" className={catalog.card}>
      <form action="/panel/envios" className={styles.filters} method="get">
        {filters.tab === 'current' ? null : (
          <input
            name="vista"
            type="hidden"
            value={filters.tab === 'archived' ? 'archivadas' : 'copias'}
          />
        )}
        <div className={`${styles.filterField} ${styles.filterSearch}`}>
          <label className={catalog.label} htmlFor="zonas-q">
            Nombre
          </label>
          <input
            aria-describedby="zonas-hint"
            className={catalog.input}
            defaultValue={filters.q}
            id="zonas-q"
            maxLength={80}
            minLength={2}
            name="q"
            placeholder="Ej.: Valle, Costa"
            type="search"
          />
        </div>
        <div className={styles.filterField}>
          <label className={catalog.label} htmlFor="zonas-municipio">
            Municipio
          </label>
          <input
            aria-describedby="zonas-hint"
            className={catalog.input}
            defaultValue={filters.municipality}
            id="zonas-municipio"
            maxLength={60}
            name="municipio"
            placeholder="Nombre o código DIVIPOLA"
            type="search"
          />
        </div>
        {statuses.length > 0 ? (
          <div className={styles.filterField}>
            <label className={catalog.label} htmlFor="zonas-estado">
              Estado
            </label>
            <select
              className={styles.select}
              defaultValue={filters.status}
              id="zonas-estado"
              name="estado"
            >
              <option value="">Todos</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {ZONE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {copyStates.length > 0 ? (
          <div className={styles.filterField}>
            <label className={catalog.label} htmlFor="zonas-copia">
              Copia
            </label>
            <select
              className={styles.select}
              defaultValue={filters.copyState}
              id="zonas-copia"
              name="copia"
            >
              <option value="">Todas</option>
              {copyStates.map((state) => (
                <option key={state} value={state}>
                  {COPY_STATE_LABELS[state]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className={styles.filterField}>
          <label className={catalog.label} htmlFor="zonas-tarifa">
            Tarifa
          </label>
          <select
            className={styles.select}
            defaultValue={filters.rate}
            id="zonas-tarifa"
            name="tarifa"
          >
            <option value="">Todas</option>
            {RATE_TYPES.map((type) => (
              <option key={type} value={type}>
                {RATE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterField}>
          <label className={catalog.label} htmlFor="zonas-vigencia">
            Vigencia
          </label>
          <select
            className={styles.select}
            defaultValue={filters.validity}
            id="zonas-vigencia"
            name="vigencia"
          >
            <option value="">Todas</option>
            <option value="always">Sin vigencia (siempre)</option>
            <option value="windowed">Con fechas de vigencia</option>
          </select>
        </div>
        <p className={`${catalog.hint} ${styles.filterHint}`} id="zonas-hint">
          El nombre se busca por prefijo de palabra (2 letras o más). El municipio se busca en la
          división oficial (DIVIPOLA) y filtra las zonas que lo cubren, con exclusiones aplicadas.
        </p>
        <div className={styles.filterActions}>
          <button className={catalog.buttonPrimary} type="submit">
            Aplicar
          </button>
          {isFiltering(filters) ? (
            <Link className={catalog.buttonSecondary} href={zoneListHref({ tab: filters.tab })}>
              Limpiar
            </Link>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function EmptyTab({
  tab,
  canManage,
}: {
  readonly tab: ZoneFilters['tab'];
  readonly canManage: boolean;
}) {
  if (tab === 'copies') {
    return (
      <EmptyState icon="envios" title="No hay copias en curso, fallidas ni descartadas">
        Cuando dupliques una zona, su operación de copia aparecerá aquí mientras se completa.
      </EmptyState>
    );
  }

  if (tab === 'archived') {
    return (
      <EmptyState icon="envios" title="No hay zonas archivadas">
        Una zona archivada deja de cotizar. Se puede restaurar como borrador o duplicar.
      </EmptyState>
    );
  }

  return (
    <EmptyState
      action={
        canManage ? (
          <Link className={catalog.buttonPrimary} href="/panel/envios/nueva">
            <span aria-hidden="true">+</span> Crear zona
          </Link>
        ) : (
          <p className={catalog.hint}>Tu rol no permite crear zonas.</p>
        )
      }
      icon="envios"
      title="Todavía no hay zonas de envío"
    >
      Sin zonas activas, ningún destino tiene tarifa: el envío queda en cotización manual o no
      disponible, nunca gratis.
    </EmptyState>
  );
}
