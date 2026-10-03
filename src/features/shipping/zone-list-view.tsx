import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import { formatDateTime } from '@/features/panel/format';
import type { ShippingZone } from '@/lib/api/shipping';

import {
  describeCoverageType,
  describeRate,
  describeValidity,
  sumCounts,
  VALIDITY_LABELS,
  validityState,
} from './shipping-labels';
import type { ZoneFacts } from './shipping-server';
import styles from './shipping.module.css';
import { ZoneBadges } from './zone-badges';
import { describeActor, firstPage, zoneListHref, type ZoneFilters } from './zone-list';
import { ZoneRowActions } from './zone-row-actions';

export type ZoneRowContext = {
  readonly facts: ReadonlyMap<string, ZoneFacts>;
  readonly names: ReadonlyMap<string, string>;
  readonly viewerId: string;
  readonly now: Date;
  readonly canManage: boolean;
};

/**
 * Tabla de zonas en escritorio y tarjetas en móvil, con los mismos datos.
 *
 * Todo sale de `ShippingZoneDto` y de las reglas de cada zona. Los conteos de departamentos y
 * municipios son los del resumen que publica el contrato; los de categorías y productos, la suma de
 * `targetCount` de sus reglas activas. Si las reglas no se pudieron leer, se dice «—», nunca cero.
 */
export function ZoneListView({
  zones,
  context,
}: {
  readonly zones: readonly ShippingZone[];
  readonly context: ZoneRowContext;
}) {
  return (
    <>
      <div className={`${catalog.tableScroll} ${styles.zoneTableWrap}`}>
        <table className={`${catalog.table} ${styles.zoneTable}`}>
          <caption className="sr-only">Zonas de envío</caption>
          <thead>
            <tr>
              <th scope="col">Zona</th>
              <th scope="col">Estado</th>
              <th scope="col">Prioridad</th>
              <th scope="col">Cobertura</th>
              <th scope="col">Tarifa</th>
              <th scope="col">Vigencia</th>
              <th scope="col">Alcance</th>
              <th scope="col">Versión y última actualización</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {zones.map((zone) => (
              <tr key={zone.id}>
                <td>
                  <span className={styles.zoneName}>
                    <span className={styles.cellMain}>{zone.name}</span>
                    {zone.description === null || zone.description === '' ? null : (
                      <span className={styles.cellSub}>{zone.description}</span>
                    )}
                  </span>
                </td>
                <td>
                  <ZoneBadges zone={zone} />
                </td>
                <td className={catalog.numeric}>{zone.priority}</td>
                <td>{describeCoverageType(zone)}</td>
                <td>
                  <RateSummary facts={context.facts.get(zone.id)} />
                </td>
                <td>
                  <Validity now={context.now} zone={zone} />
                </td>
                <td>
                  <Counts facts={context.facts.get(zone.id)} zone={zone} />
                </td>
                <td>
                  <span className={styles.zoneName}>
                    <span className={styles.cellMain}>Versión {zone.version}</span>
                    <span>{formatDateTime(zone.updatedAt)}</span>
                    <span className={styles.cellSub}>
                      {describeActor(zone.updatedBy, context.viewerId, context.names)}
                    </span>
                  </span>
                </td>
                <td>
                  <ZoneRowActions canManage={context.canManage} zone={zone} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={styles.zoneCards}>
        {zones.map((zone) => (
          <li className={styles.zoneCard} key={zone.id}>
            <div className={styles.zoneCardHead}>
              <span className={styles.zoneName}>
                <span className={styles.cellMain}>{zone.name}</span>
                {zone.description === null || zone.description === '' ? null : (
                  <span className={styles.cellSub}>{zone.description}</span>
                )}
              </span>
              <ZoneBadges zone={zone} />
            </div>
            <dl className={styles.zoneCardFacts}>
              <div>
                <dt>Prioridad</dt>
                <dd>{zone.priority}</dd>
              </div>
              <div>
                <dt>Cobertura</dt>
                <dd>{describeCoverageType(zone)}</dd>
              </div>
              <div>
                <dt>Tarifa</dt>
                <dd>
                  <RateSummary facts={context.facts.get(zone.id)} />
                </dd>
              </div>
              <div>
                <dt>Vigencia</dt>
                <dd>
                  <Validity now={context.now} zone={zone} />
                </dd>
              </div>
              <div className={styles.zoneCardWide}>
                <dt>Alcance</dt>
                <dd>
                  <Counts facts={context.facts.get(zone.id)} zone={zone} />
                </dd>
              </div>
              <div className={styles.zoneCardWide}>
                <dt>Versión y última actualización</dt>
                <dd>
                  Versión {zone.version} · {formatDateTime(zone.updatedAt)} ·{' '}
                  {describeActor(zone.updatedBy, context.viewerId, context.names)}
                </dd>
              </div>
            </dl>
            <ZoneRowActions canManage={context.canManage} zone={zone} />
          </li>
        ))}
      </ul>
    </>
  );
}

function RateSummary({ facts }: { readonly facts: ZoneFacts | undefined }) {
  if (facts === undefined) return <span className={styles.cellSub}>—</span>;
  if (facts.activeRules.length === 0) {
    return <span className={styles.cellSub}>Sin reglas activas</span>;
  }

  const [first, ...rest] = facts.activeRules;

  return (
    <span className={styles.zoneName}>
      <span>{first === undefined ? '—' : describeRate(first.rate)}</span>
      {rest.length === 0 ? null : (
        <span className={styles.cellSub}>
          y {rest.length} regla{rest.length === 1 ? '' : 's'} más
        </span>
      )}
    </span>
  );
}

function Validity({ zone, now }: { readonly zone: ShippingZone; readonly now: Date }) {
  const state = validityState(zone, now);

  return (
    <span className={styles.zoneName}>
      <span>{VALIDITY_LABELS[state]}</span>
      {state === 'none' ? null : <span className={styles.cellSub}>{describeValidity(zone)}</span>}
    </span>
  );
}

function Counts({
  zone,
  facts,
}: {
  readonly zone: ShippingZone;
  readonly facts: ZoneFacts | undefined;
}) {
  return (
    <dl className={styles.counts}>
      <dt>Departamentos</dt>
      <dd>{zone.coverage.national ? 'Todos' : zone.coverage.departmentCodes.length}</dd>
      <dt>Municipios</dt>
      <dd>{sumCounts(zone.coverage.municipalitiesByDepartment)}</dd>
      <dt>Exclusiones</dt>
      <dd>{sumCounts(zone.coverage.exclusionsByDepartment)}</dd>
      <dt>Categorías</dt>
      <dd>{facts === undefined ? '—' : facts.categoryCount}</dd>
      <dt>Productos</dt>
      <dd>{facts === undefined ? '—' : facts.allProducts ? 'Todos' : facts.productCount}</dd>
    </dl>
  );
}

/**
 * Paginación por cursor: la siguiente página y la vuelta a la primera.
 *
 * El cursor es opaco y solo avanza; no hay total ni saltos a una página concreta, porque el
 * contrato no los publica y calcularlos exigiría leer todas las zonas.
 */
export function ZonePager({
  filters,
  count,
  nextCursor,
}: {
  readonly filters: ZoneFilters;
  readonly count: number;
  readonly nextCursor: string | null;
}) {
  return (
    <nav aria-label="Páginas de zonas" className={styles.pager}>
      <p className={catalog.paginationNote}>
        Página {filters.page} · {count} zona{count === 1 ? '' : 's'} en esta página.
        {nextCursor === null ? ' No hay más páginas.' : ''}
      </p>
      <span className={styles.pagerLinks}>
        {filters.page > 1 ? (
          <Link className={styles.pagerLink} href={zoneListHref(firstPage(filters))}>
            Primera página
          </Link>
        ) : null}
        {nextCursor === null ? null : (
          <Link
            className={styles.pagerLink}
            href={zoneListHref({ ...filters, cursor: nextCursor, page: filters.page + 1 })}
            rel="next"
          >
            Siguiente página
          </Link>
        )}
      </span>
    </nav>
  );
}
