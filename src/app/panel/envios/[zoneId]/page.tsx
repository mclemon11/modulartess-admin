import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import { loadCategoryCatalog } from '@/features/panel/category-catalog';
import { PanelHeader } from '@/features/panel/panel-header';
import { ErrorState } from '@/features/panel/panel-states';
import { resolvePanelSession } from '@/features/panel/session-context';
import { sessionErrorFromBackendFailure } from '@/features/session/api-errors';
import { can } from '@/features/session/permissions';
import { ActivateZone } from '@/features/shipping/activate-zone';
import { CoverageEditor } from '@/features/shipping/coverage-editor';
import {
  coverageFromEntries,
  departmentOf,
  summariseCoverage,
} from '@/features/shipping/coverage-model';
import { RulesEditor } from '@/features/shipping/rules-editor';
import { describeShippingFailure } from '@/features/shipping/shipping-errors';
import {
  describeRate,
  describeTransit,
  describeValidity,
  SCOPE_LABELS,
  UNMATCHED_LABELS,
} from '@/features/shipping/shipping-labels';
import { mapLimited } from '@/features/shipping/shipping-server';
import styles from '@/features/shipping/shipping.module.css';
import { TargetsEditor, type ProductLabel } from '@/features/shipping/targets-editor';
import { ZoneBadges } from '@/features/shipping/zone-badges';
import { parseStep, readOnlyReason, type StepId } from '@/features/shipping/zone-form-model';
import { ZoneInfoForm } from '@/features/shipping/zone-info-form';
import { canActivate, reviewZone } from '@/features/shipping/zone-review-model';
import { RestoreButton } from '@/features/shipping/zone-row-actions';
import { ZoneSteps } from '@/features/shipping/zone-steps';
import { getProduct } from '@/lib/api/catalog';
import { isBackendFailure } from '@/lib/api/errors';
import {
  getAnalysis,
  getZone,
  listAllCoverage,
  listTargets,
  listDepartments,
  listMunicipalities,
  listRules,
  type GeographyDepartment,
  type ShippingCoverageEntry,
  type ShippingZone,
} from '@/lib/api/shipping';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Zona de envío' };

type PageProps = {
  readonly params: Promise<{ readonly zoneId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Nombres de producto que se leen como mucho para pintar asignaciones. */
const PRODUCT_LABELS_MAX = 100;

function failureMessage(error: unknown, fallback: string): string {
  return isBackendFailure(error)
    ? describeShippingFailure(sessionErrorFromBackendFailure(error.code))
    : fallback;
}

/** Nombres de los municipios de la cobertura, leyendo solo los departamentos implicados. */
async function municipalityNames(
  entries: readonly ShippingCoverageEntry[],
): Promise<Record<string, string>> {
  const departments = [
    ...new Set(
      entries
        .filter((entry) => entry.kind === 'municipality' || entry.kind === 'exclusion')
        .map((entry) => departmentOf(entry.code)),
    ),
  ];
  const names: Record<string, string> = {};
  const lists = await mapLimited(departments, (code) => listMunicipalities(code).catch(() => null));

  for (const list of lists) {
    for (const item of list?.items ?? []) names[item.code] = item.name;
  }

  return names;
}

/**
 * Una zona, paso a paso.
 *
 * Cada paso carga en el servidor lo que necesita y monta su formulario con una `key` que incluye
 * la **versión** de la zona: tras un conflicto, «Recargar la versión actual» trae la versión nueva
 * y el formulario vuelve a nacer con esos datos, en lugar de conservar los viejos y chocar otra vez.
 */
export default async function ZonePage({ params, searchParams }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const { role, sessionMaterial } = session.session;
  const { zoneId } = await params;
  const step = parseStep((await searchParams).paso);
  const trail = (label: string) => [
    { href: '/panel', label: 'Panel' },
    { href: '/panel/envios', label: 'Envíos' },
    { label },
  ];

  if (!can(role, 'shipping.read')) {
    return (
      <>
        <PanelHeader trail={trail('Zona')} />
        <div className={catalog.page}>
          <ErrorState message="Tu rol no consulta zonas de envío." title="Sin acceso a envíos" />
        </div>
      </>
    );
  }

  let zone: ShippingZone;

  try {
    zone = await getZone(sessionMaterial, zoneId);
  } catch (error) {
    return (
      <>
        <PanelHeader trail={trail('Zona')} />
        <div className={catalog.page}>
          <ErrorState
            action={
              <Link className={catalog.buttonSecondary} href="/panel/envios">
                Volver a envíos
              </Link>
            }
            message={failureMessage(error, 'No pudimos cargar la zona.')}
            title="No pudimos cargar la zona"
          />
        </div>
      </>
    );
  }

  const reason = readOnlyReason(zone, can(role, 'shipping.manage'));
  const readOnly = reason !== null;
  const key = `${zone.id}:${zone.version}`;

  let body: React.ReactNode;

  try {
    body = await renderStep(step, zone, sessionMaterial, readOnly, key);
  } catch (error) {
    body = (
      <ErrorState
        action={
          <Link
            className={catalog.buttonSecondary}
            href={`/panel/envios/${encodeURIComponent(zone.id)}?paso=${step}`}
          >
            Reintentar
          </Link>
        }
        message={failureMessage(error, 'No pudimos cargar este paso.')}
        title="No pudimos cargar este paso"
      />
    );
  }

  return (
    <>
      <PanelHeader trail={trail(zone.name)} />
      <div className={catalog.page}>
        <div className={catalog.pageHead}>
          <div className={catalog.pageHeadText}>
            <h1 className={catalog.pageTitle}>{zone.name}</h1>
            <p className={catalog.pageLead}>
              <ZoneBadges zone={zone} /> Prioridad {zone.priority} · versión {zone.version}. Cada
              paso guarda con la versión que estás viendo: si otro administrador la cambia antes, el
              backend lo rechaza y podrás recargar.
            </p>
          </div>
          <div className={catalog.pageHeadActions}>
            {zone.status === 'archived' && can(role, 'shipping.manage') ? (
              <RestoreButton variant="primary" zone={zone} />
            ) : null}
            <Link className={catalog.buttonSecondary} href="/panel/envios">
              Volver al listado
            </Link>
          </div>
        </div>
        <ZoneSteps current={step} zoneId={zone.id} />
        {reason === null ? null : (
          <p className={styles.readOnly} role="note">
            <strong>Solo lectura.</strong> {reason}
          </p>
        )}
        {body}
      </div>
    </>
  );
}

async function renderStep(
  step: StepId,
  zone: ShippingZone,
  sessionMaterial: string,
  readOnly: boolean,
  key: string,
): Promise<React.ReactNode> {
  switch (step) {
    case 'informacion':
      return <ZoneInfoForm key={key} readOnly={readOnly} zone={zone} />;

    case 'cobertura': {
      const [departments, coverage] = await Promise.all([
        listDepartments(),
        listAllCoverage(sessionMaterial, zone.id),
      ]);
      const names = await municipalityNames(coverage.items);

      return (
        <>
          {coverage.truncated ? (
            <p className={catalog.notice}>
              La cobertura tiene más entradas de las que se pudieron leer: no la edites hasta
              recargar.
            </p>
          ) : null}
          <CoverageEditor
            departments={departments.items}
            entries={coverage.items}
            key={key}
            knownNames={names}
            readOnly={readOnly || coverage.truncated}
            zone={zone}
          />
        </>
      );
    }

    case 'tarifas': {
      const rules = await listRules(sessionMaterial, zone.id);

      return <RulesEditor key={key} readOnly={readOnly} rules={rules} zone={zone} />;
    }

    case 'productos': {
      const rules = await listRules(sessionMaterial, zone.id);
      const scoped = rules.filter((rule) => rule.status === 'active' && rule.scope !== 'all');
      const [listings, categories] = await Promise.all([
        // Solo la primera página de cada regla; el editor pide las siguientes si hacen falta.
        mapLimited(scoped, (rule) => listTargets(sessionMaterial, rule.id)),
        loadCategoryCatalog(sessionMaterial),
      ]);
      const targets: Record<string, { values: string[]; nextPageToken: string | null }> = {};

      scoped.forEach((rule, index) => {
        const listing = listings[index];

        targets[rule.id] = {
          values: (listing?.items ?? []).map((target) => target.value),
          nextPageToken: listing?.nextPageToken ?? null,
        };
      });

      const productIds = [
        ...new Set(
          scoped
            .filter((rule) => rule.scope === 'products')
            .flatMap((rule) => targets[rule.id]?.values ?? []),
        ),
      ].slice(0, PRODUCT_LABELS_MAX);
      const products = await mapLimited(productIds, (productId) =>
        getProduct(sessionMaterial, productId).catch(() => null),
      );
      const productLabels: Record<string, ProductLabel> = {};

      for (const product of products) {
        if (product !== null)
          productLabels[product.id] = { name: product.name, status: product.status };
      }

      return (
        <TargetsEditor
          categories={categories.options}
          key={key}
          productLabels={productLabels}
          readOnly={readOnly}
          rules={rules}
          targets={targets}
          zone={zone}
        />
      );
    }

    case 'revision':
      return <Review readOnly={readOnly} sessionMaterial={sessionMaterial} zone={zone} />;
  }
}

async function Review({
  zone,
  sessionMaterial,
  readOnly,
}: {
  readonly zone: ShippingZone;
  readonly sessionMaterial: string;
  readonly readOnly: boolean;
}) {
  const [rules, coverage, departments, analysis] = await Promise.all([
    listRules(sessionMaterial, zone.id),
    listAllCoverage(sessionMaterial, zone.id),
    listDepartments()
      .then((list) => list.items)
      .catch((): GeographyDepartment[] => []),
    getAnalysis(sessionMaterial).catch(() => null),
  ]);
  const names = await municipalityNames(coverage.items);
  const departmentName = new Map(
    departments.map((department) => [department.code, department.name]),
  );
  const items = reviewZone({ zone, rules, now: new Date(), analysis });
  const summary = summariseCoverage(coverageFromEntries(coverage.items));
  const draft = coverageFromEntries(coverage.items);
  const active = rules.filter((rule) => rule.status === 'active');
  const municipality = (code: string) => `${names[code] ?? 'Municipio'} (${code})`;

  return (
    <section aria-labelledby="revision-title" className={`${catalog.card} ${catalog.cardPad}`}>
      <h2 className={catalog.sectionTitle} id="revision-title">
        Revisión
      </h2>

      <h3 className={catalog.subTitle}>Información</h3>
      <dl className={styles.definitionGrid}>
        <dt>Nombre</dt>
        <dd>{zone.name}</dd>
        <dt>Descripción</dt>
        <dd>{zone.description ?? '—'}</dd>
        <dt>Prioridad</dt>
        <dd>{zone.priority}</dd>
        <dt>Vigencia</dt>
        <dd>{describeValidity(zone)}</dd>
        <dt>Producto sin regla</dt>
        <dd>{UNMATCHED_LABELS[zone.unmatchedProductBehavior]} (nunca gratis)</dd>
      </dl>

      <h3 className={catalog.subTitle}>Cobertura</h3>
      {draft.national ? <p>Respaldo nacional: todo el país.</p> : null}
      {summary.length === 0 && !draft.national ? <p>Sin cobertura.</p> : null}
      {summary.length === 0 ? null : (
        <ul className={styles.ruleList}>
          {summary.map((line) => (
            <li className={styles.ruleItem} key={line.departmentCode}>
              <span className={styles.ruleText}>
                <span className={styles.cellMain}>
                  {departmentName.get(line.departmentCode) ?? line.departmentCode}
                </span>
                <span>
                  {line.mode === 'whole'
                    ? 'Departamento completo'
                    : line.mode === 'national'
                      ? 'Por respaldo nacional'
                      : `${line.municipalities.length} municipio${line.municipalities.length === 1 ? '' : 's'} específico${line.municipalities.length === 1 ? '' : 's'}`}
                </span>
                {line.municipalities.length === 0 ? null : (
                  <span className={styles.cellSub}>
                    {line.municipalities.map(municipality).join(', ')}
                  </span>
                )}
                {line.exclusions.length === 0 ? null : (
                  <span className={styles.cellSub}>
                    Excepto: {line.exclusions.map(municipality).join(', ')}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className={catalog.subTitle}>Tarifas y productos</h3>
      {active.length === 0 ? <p>Sin reglas activas.</p> : null}
      <ul className={styles.ruleList}>
        {active.map((rule) => {
          const transit = describeTransit(rule.transitDaysMin, rule.transitDaysMax);

          return (
            <li className={styles.ruleItem} key={rule.id}>
              <span className={styles.ruleText}>
                <span className={styles.cellMain}>{rule.name}</span>
                <span>{describeRate(rule.rate)}</span>
                <span className={styles.cellSub}>
                  {SCOPE_LABELS[rule.scope]}
                  {rule.scope === 'all' ? '' : ` · ${rule.targetCount} asignados`}
                  {transit === null ? '' : ` · Tránsito: ${transit}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <h3 className={catalog.subTitle}>Advertencias</h3>
      {analysis === null ? (
        <p className={catalog.hint}>No se pudo consultar el análisis de la red activa.</p>
      ) : null}
      {items.length === 0 ? (
        <p className={styles.ok}>Sin advertencias.</p>
      ) : (
        <ul className={styles.warningList}>
          {items.map((item) => (
            <li
              className={
                item.severity === 'blocking'
                  ? styles.blocking
                  : item.severity === 'warning'
                    ? styles.warning
                    : styles.ok
              }
              key={item.text}
            >
              <strong>
                {item.severity === 'blocking'
                  ? 'Bloquea la activación: '
                  : item.severity === 'warning'
                    ? 'Advertencia: '
                    : 'Información: '}
              </strong>
              {item.text}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.stepNav}>
        <span className={catalog.actions}>
          <Link
            className={catalog.buttonSecondary}
            href={`/panel/envios/vista-previa?borrador=${encodeURIComponent(zone.id)}`}
          >
            Vista previa con este borrador
          </Link>
          <Link className={catalog.buttonSecondary} href="/panel/envios">
            {zone.status === 'draft' ? 'Guardar como borrador y salir' : 'Volver al listado'}
          </Link>
        </span>
        {readOnly ? null : <ActivateZone enabled={canActivate(items, zone)} zone={zone} />}
      </div>
      <p className={catalog.hint}>
        Cada paso ya quedó guardado en el borrador. Guardar como borrador no cambia nada más: la
        zona no cotiza hasta que la actives.
      </p>
    </section>
  );
}
