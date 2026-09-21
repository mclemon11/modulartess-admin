import Link from 'next/link';

import catalog from './catalog.module.css';
import { formatDateTime } from './format';
import styles from './integrations.module.css';
import {
  describeActiveEnvironment,
  describeIntegrationError,
  describeOpenIncidentCount,
  OPERATIONAL_CLOCKS,
  readEnvironmentHealth,
  type IntegrationHealth,
  type OpenIncidentCount,
} from './integration-labels';
import { Icon, SectionHeading } from './section-icon';

import type { WompiEnvironmentConfig, WompiIntegration } from '@/lib/api/integrations';

const HEALTH_CLASS = {
  enabled: styles.healthEnabled,
  configured: styles.healthConfigured,
  incomplete: styles.healthIncomplete,
  blocked: styles.healthBlocked,
} as const satisfies Record<IntegrationHealth, unknown>;

/** Pastilla de estado. Lleva **texto completo**: el color acompaña y nunca sustituye. */
export function HealthBadge({
  health,
  label,
}: {
  readonly health: IntegrationHealth;
  readonly label: string;
}) {
  return <span className={HEALTH_CLASS[health]}>{label}</span>;
}

/**
 * Tarjeta de Wompi en el listado de integraciones.
 *
 * Resume el ambiente operativo, si sandbox está encendido, si producción sigue bloqueada, los tres
 * relojes y las incidencias abiertas. Todo sale del contrato; nada se deduce aquí.
 */
export function WompiProviderCard({
  integration,
  openIncidents,
  canManage,
}: {
  readonly integration: WompiIntegration;
  /**
   * Incidencias abiertas, con hasta dónde se sabe.
   *
   * Es un tipo y no un número porque «50» y «50 o más» son afirmaciones distintas, y la tarjeta
   * solo puede hacer la que el backend respaldó.
   */
  readonly openIncidents: OpenIncidentCount;
  readonly canManage: boolean;
}) {
  const sandbox = readEnvironmentHealth(integration.sandbox, { blocked: false });
  const error = describeIntegrationError(integration.sandbox.lastErrorCode);

  return (
    <section className={styles.provider}>
      <div className={styles.providerHead}>
        <span aria-hidden="true" className={styles.providerIcon}>
          <Icon name="integraciones" />
        </span>
        <h3 className={styles.providerName}>Wompi</h3>
        <HealthBadge health={sandbox.health} label={sandbox.label} />
      </div>

      <p className={styles.providerText}>
        Pasarela de pagos con checkout alojado. El panel no procesa tarjetas: quien compra paga en
        la página de Wompi y el resultado vuelve por evento firmado o por reconciliación.
      </p>

      <dl className={styles.facts}>
        <Fact
          label="Ambiente activo"
          value={describeActiveEnvironment(integration.activeEnvironment)}
        />
        <Fact
          label="Checkouts de prueba"
          value={integration.sandbox.enabledForNewPayments ? 'Habilitados' : 'Deshabilitados'}
        />
        <Fact
          hint="Es una constante del backend, no una casilla de configuración."
          label="Pagos reales"
          value={integration.livePaymentsEnabled ? 'Habilitados' : 'Bloqueados'}
        />
        {OPERATIONAL_CLOCKS.map((clock) => (
          <Fact
            hint={clock.hint}
            key={clock.key}
            label={clock.label}
            value={readClock(integration.sandbox, clock.key)}
          />
        ))}
        <Fact
          hint={
            openIncidents.kind === 'atLeast'
              ? 'La bandeja pagina: hay más de las que cabían en una consulta. Ábrela para verlas todas.'
              : undefined
          }
          label="Incidencias abiertas"
          value={describeOpenIncidentCount(openIncidents)}
        />
      </dl>

      {error === null ? null : <p className={catalog.hint}>Último error: {error}</p>}

      <div className={styles.providerActions}>
        <Link className={catalog.buttonPrimary} href="/panel/configuracion/integraciones/wompi">
          {canManage ? 'Configurar' : 'Ver configuración'}
        </Link>
        <Link
          className={catalog.buttonSecondary}
          href="/panel/configuracion/integraciones/incidencias"
        >
          Incidencias de pago
        </Link>
      </div>
    </section>
  );
}

function readClock(
  config: WompiEnvironmentConfig,
  key: (typeof OPERATIONAL_CLOCKS)[number]['key'],
) {
  const value = config[key];
  return typeof value === 'string' ? formatDateTime(value) : 'Nunca';
}

/**
 * Addi: anunciada y **sin una sola llamada**.
 *
 * No hay botón que invoque nada, no hay campo que guardar y no hay cifra que enseñar. El contrato
 * no publica ni un endpoint suyo, así que la tarjeta dice en qué punto está y se detiene ahí. Un
 * botón «Configurar» que llevara a un formulario vacío prometería una integración que no existe.
 */
export function AddiProviderCard() {
  return (
    <section className={styles.providerPending}>
      <div className={styles.providerHead}>
        <span aria-hidden="true" className={styles.providerIcon}>
          <Icon name="integraciones" />
        </span>
        <h3 className={styles.providerName}>Addi</h3>
        <span className={styles.healthBlocked}>Pendiente de integración</span>
      </div>

      <p className={styles.providerText}>
        El backend ya está preparado para más de un proveedor, pero Addi todavía no tiene contrato:
        no hay credenciales que guardar, ni ambiente que encender, ni datos que mostrar. Aparecerá
        aquí con su propia configuración cuando el backend publique su superficie.
      </p>
    </section>
  );
}

/** Par etiqueta/valor, con el matiz debajo cuando hace falta distinguir dos cosas parecidas. */
export function Fact({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string | undefined;
}) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
      {hint === undefined ? null : <dd className={styles.factHint}>{hint}</dd>}
    </div>
  );
}

/** Cabecera reutilizada por las tarjetas de la configuración. */
export function IntegrationSection({
  icon,
  title,
  hint,
  children,
}: {
  readonly icon: 'llave' | 'integraciones' | 'incidencias' | 'estado' | 'pago';
  readonly title: string;
  readonly hint?: string | undefined;
  readonly children: React.ReactNode;
}) {
  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading hint={hint} icon={icon} title={title} />
      {children}
    </section>
  );
}
