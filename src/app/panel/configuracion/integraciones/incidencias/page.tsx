import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import styles from '@/features/panel/integrations.module.css';
import { describeIntegrationFailure } from '@/features/panel/integration-errors';
import { describeIncidentReason } from '@/features/panel/integration-labels';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { PaymentIncidentsView } from '@/features/panel/payment-incidents-view';
import { readIncidentFilters } from '@/features/panel/payment-incident-filters';
import { RefreshButton } from '@/features/panel/refresh-button';
import { resolvePanelSession } from '@/features/panel/session-context';
import { can } from '@/features/session/permissions';
import { isBackendFailure } from '@/lib/api/errors';
import { listPaymentIncidents } from '@/lib/api/payment-incidents';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Incidencias de pago.
 *
 * Eventos que llegaron **con firma válida** y cuyos datos comerciales no cuadraban. No son intentos
 * de fraude rechazados —esos no llegan hasta aquí, se caen en la verificación de firma— sino
 * inconsistencias reales entre lo que se cobró y lo que creemos haber cobrado, que es exactamente
 * la clase de problema que nadie descubre hasta el cierre de mes.
 *
 * Los filtros viven en la URL y los resuelve este Server Component: son estado navegable, se pueden
 * enlazar y «Actualizar» recarga lo que se estaba mirando. La paginación es por cursor opaco, como
 * en el resto del panel.
 */
export default async function PaymentIncidentsPage({ searchParams }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const role = session.session.role;
  const trail = [
    { href: '/panel', label: 'Panel' },
    { href: '/panel/configuracion', label: 'Configuración' },
    { href: '/panel/configuracion/integraciones', label: 'Integraciones' },
    { label: 'Incidencias de pago' },
  ];

  if (!can(role, 'integrations.read')) {
    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Incidencias de pago" />
          <ErrorState
            action={
              <Link className={catalog.buttonSecondary} href="/panel">
                Volver al panel
              </Link>
            }
            message="Tu rol no tiene acceso a las incidencias de pago."
            title="Acceso insuficiente"
          />
        </div>
      </>
    );
  }

  const filters = readIncidentFilters(await searchParams);

  let page;

  try {
    page = await listPaymentIncidents(session.session.sessionMaterial, {
      status: filters.status,
      environment: filters.environment,
      reason: filters.reason,
      pageToken: filters.pageToken,
    });
  } catch (error) {
    const code = isBackendFailure(error) ? error.code : 'backend_unexpected';

    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Incidencias de pago" />
          <ErrorState
            action={
              <Link
                className={catalog.buttonSecondary}
                href="/panel/configuracion/integraciones/incidencias"
              >
                Reintentar
              </Link>
            }
            message={describeIntegrationFailure(code)}
            title="No pudimos cargar las incidencias"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader trail={trail} />
      <div className={catalog.page}>
        <PanelPageHeader
          actions={<RefreshButton />}
          lead="Eventos con firma válida cuyos datos comerciales no cuadran. Llevan códigos cerrados e identificadores técnicos: ni el payload del proveedor, ni el correo de quien pagó, ni el monto recibido."
          title="Incidencias de pago"
        />

        <IncidentFilters filters={filters} />

        <section className={`${catalog.card} ${catalog.cardPad}`}>
          <PaymentIncidentsView canManage={can(role, 'integrations.manage')} page={page} />

          <div className={catalog.pagination}>
            <p className={catalog.paginationNote}>
              Mostrando {page.items.length} incidencia{page.items.length === 1 ? '' : 's'}.
            </p>
            {page.nextPageToken === null ? (
              <p className={catalog.paginationNote}>No hay más páginas.</p>
            ) : (
              /*
               * «Página siguiente», no «Cargar más».
               *
               * El enlace navega y **sustituye** lo que se está viendo: no acumula resultados
               * debajo de los actuales. «Cargar más» describe lo segundo, y con un cursor opaco lo
               * segundo no ocurre —ni podría, sin estado de cliente que el resto del panel no
               * tiene—.
               */
              <Link
                className={catalog.buttonSecondary}
                href={`/panel/configuracion/integraciones/incidencias?${new URLSearchParams({
                  ...(filters.status === undefined ? {} : { status: filters.status }),
                  ...(filters.environment === undefined
                    ? {}
                    : { environment: filters.environment }),
                  ...(filters.reason === undefined ? {} : { reason: filters.reason }),
                  pageToken: page.nextPageToken,
                }).toString()}`}
              >
                Página siguiente
              </Link>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * Los tres filtros del contrato, como un formulario `GET`.
 *
 * Al enviarlo el navegador construye la URL y navega: funciona sin JavaScript, el resultado se
 * puede enlazar y no hay estado de React de por medio. Es el mismo patrón que el rango
 * personalizado del Dashboard.
 */
function IncidentFilters({
  filters,
}: {
  readonly filters: ReturnType<typeof readIncidentFilters>;
}) {
  return (
    <form
      action="/panel/configuracion/integraciones/incidencias"
      className={styles.filters}
      method="get"
    >
      <div className={styles.filterField}>
        <label className={styles.fieldLabel} htmlFor="incident-status">
          Estado
        </label>
        <select
          className={styles.select}
          defaultValue={filters.status ?? 'open'}
          id="incident-status"
          name="status"
        >
          <option value="open">Abiertas</option>
          <option value="resolved">Resueltas</option>
        </select>
      </div>

      <div className={styles.filterField}>
        <label className={styles.fieldLabel} htmlFor="incident-environment">
          Ambiente
        </label>
        <select
          className={styles.select}
          defaultValue={filters.environment ?? ''}
          id="incident-environment"
          name="environment"
        >
          <option value="">Todos</option>
          <option value="sandbox">Pruebas</option>
          <option value="production">Producción</option>
        </select>
      </div>

      <div className={styles.filterField}>
        <label className={styles.fieldLabel} htmlFor="incident-reason">
          Motivo
        </label>
        <select
          className={styles.select}
          defaultValue={filters.reason ?? ''}
          id="incident-reason"
          name="reason"
        >
          <option value="">Todos</option>
          {INCIDENT_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {describeIncidentReason(reason)}
            </option>
          ))}
        </select>
      </div>

      <button className={catalog.buttonSecondary} type="submit">
        Filtrar
      </button>
    </form>
  );
}

/** Los nueve motivos del contrato. Se enumeran aquí para poder ofrecerlos en el selector. */
const INCIDENT_REASONS = [
  'reference_unknown',
  'provider_mismatch',
  'environment_mismatch',
  'currency_mismatch',
  'amount_mismatch',
  'attempt_bound_to_other_transaction',
  'transaction_bound_to_other_attempt',
  'order_unknown',
  'live_disabled',
] as const;
