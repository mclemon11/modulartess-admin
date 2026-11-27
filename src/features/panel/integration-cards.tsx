import Image from 'next/image';
import Link from 'next/link';

import catalog from './catalog.module.css';
import { formatDateTime } from './format';
import styles from './integrations.module.css';
import {
  describeActiveEnvironment,
  describeIntegrationError,
  describeOpenIncidentCount,
  OPERATIONAL_CLOCKS,
  readOperatingEnvironment,
  type IntegrationHealth,
  type OpenIncidentCount,
} from './integration-labels';
import { SectionHeading } from './section-icon';

import { addiHealth, describeAddiError, describeAddiIncidents } from './addi-integration';
import { describeMetaError, metaHealth } from './meta-integration';
import { describeTikTokError, tiktokHealth } from './tiktok-integration';

import type {
  AddiIntegration,
  MetaIntegration,
  TikTokIntegration,
  WompiEnvironmentConfig,
  WompiIntegration,
} from '@/lib/api/integrations';

/**
 * Los cobros reales en dos palabras.
 *
 * «Bloqueados» es del despliegue; «Desactivados» y «Activos», de una decisión tomada en Configurar
 * Wompi. Antes la tarjeta decía «Habilitados» en cuanto el despliegue los permitía, y eso se leía
 * como «ya se cobra» cuando nadie los había encendido.
 */
function describeLivePayments(integration: WompiIntegration): string {
  if (integration.production.enabledForNewPayments) return 'Activos';
  if (!integration.livePaymentsEnabled) return 'Bloqueados';
  if (!integration.production.configured) return 'Sin llaves de Producción';

  return 'Desactivados';
}

const HEALTH_CLASS = {
  enabled: styles.healthEnabled,
  configured: styles.healthConfigured,
  incomplete: styles.healthIncomplete,
  blocked: styles.healthBlocked,
} as const satisfies Record<IntegrationHealth, unknown>;

/** Pastilla de estado. Lleva **texto completo**: el color acompaña y nunca sustituye. */

/**
 * Logo oficial de cada servicio, servido desde `public/assets/integrations`. Es decorativo: el
 * nombre del servicio ya va en el título de la tarjeta.
 */
const PROVIDER_LOGOS = {
  wompi: '/assets/integrations/wompi.svg',
  addi: '/assets/integrations/addi.svg',
  tiktok: '/assets/integrations/tiktok.svg',
  meta: '/assets/integrations/meta.svg',
} as const;

function ProviderLogo({ provider }: { readonly provider: keyof typeof PROVIDER_LOGOS }) {
  return (
    <span aria-hidden="true" className={styles.providerLogo}>
      <Image alt="" height={28} src={PROVIDER_LOGOS[provider]} unoptimized width={28} />
    </span>
  );
}

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
 * relojes del ambiente que cobra y las incidencias abiertas. Todo sale del contrato.
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
  const operating = readOperatingEnvironment(integration);
  const error = describeIntegrationError(operating.config.lastErrorCode);

  return (
    <section className={styles.provider}>
      <div className={styles.providerHead}>
        <ProviderLogo provider="wompi" />
        <h3 className={styles.providerName}>Wompi</h3>
        <HealthBadge
          health={operating.health.health}
          label={`${operating.label} · ${operating.health.label}`}
        />
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
          hint={
            integration.livePaymentsEnabled
              ? 'El despliegue los permite. Se activan o desactivan en Configurar Wompi, con confirmación.'
              : 'Los bloquea el despliegue del backend, no una casilla de configuración.'
          }
          label="Pagos reales"
          value={describeLivePayments(integration)}
        />
        {OPERATIONAL_CLOCKS.map((clock) => (
          <Fact
            hint={`${clock.hint} Ambiente: ${operating.label}.`}
            key={clock.key}
            label={clock.label}
            value={readClock(operating.config, clock.key)}
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
 * Tarjeta de Addi (ADR 0015): Producción, con su estado real.
 *
 * `integration` es `null` cuando la lectura falló: la tarjeta lo dice y no inventa un estado. Todo
 * sale del contrato; ningún valor de credencial llega aquí.
 */
export function AddiProviderCard({
  integration,
  canManage,
}: {
  readonly integration: AddiIntegration | null;
  readonly canManage: boolean;
}) {
  if (integration === null) {
    return (
      <section className={styles.provider}>
        <div className={styles.providerHead}>
          <ProviderLogo provider="addi" />
          <h3 className={styles.providerName}>Addi</h3>
          <span className={styles.healthIncomplete}>Estado no disponible</span>
        </div>
        <p className={styles.providerText}>
          No pudimos leer la configuración de Addi. Recarga la página en unos momentos.
        </p>
      </section>
    );
  }

  const { health, label } = addiHealth(integration);
  const error = describeAddiError(integration.lastErrorCode);

  return (
    <section className={styles.provider}>
      <div className={styles.providerHead}>
        <ProviderLogo provider="addi" />
        <h3 className={styles.providerName}>Addi</h3>
        <HealthBadge health={health} label={label} />
      </div>

      <p className={styles.providerText}>
        Compra ahora y paga después, en Producción. Quien compra elige Addi en el checkout, termina
        la solicitud en Addi y el pedido solo cambia cuando llega el callback autenticado.
      </p>

      <dl className={styles.facts}>
        <Fact label="Ambiente" value="Producción" />
        <Fact
          hint={
            integration.livePaymentsEnabled
              ? 'El despliegue los permite. Se activan o desactivan en Configurar Addi, con confirmación.'
              : 'Los bloquea el despliegue del backend, no una casilla de configuración.'
          }
          label="Pagos nuevos"
          value={label}
        />
        <Fact label="Último intento" value={dateOrNever(integration.lastAttemptAt)} />
        <Fact
          label="Último callback válido"
          value={dateOrNever(integration.lastVerifiedWebhookAt)}
        />
        <Fact
          label="Incidencias abiertas"
          value={describeAddiIncidents(integration.openIncidents)}
        />
      </dl>

      {error === null ? null : <p className={catalog.hint}>Último error: {error}</p>}

      <div className={styles.providerActions}>
        <Link className={catalog.buttonPrimary} href="/panel/configuracion/integraciones/addi">
          {canManage ? 'Configurar' : 'Ver configuración'}
        </Link>
      </div>
    </section>
  );
}

/**
 * Tarjeta de TikTok: píxel de la tienda y compras enviadas desde el servidor.
 *
 * `integration` es `null` cuando la lectura falló: la tarjeta lo dice y no inventa un estado. Del
 * token no llega ni la pista: la tarjeta no la necesita.
 */
export function TikTokProviderCard({
  integration,
  canManage,
}: {
  readonly integration: TikTokIntegration | null;
  readonly canManage: boolean;
}) {
  if (integration === null) {
    return (
      <section className={styles.provider}>
        <div className={styles.providerHead}>
          <ProviderLogo provider="tiktok" />
          <h3 className={styles.providerName}>TikTok</h3>
          <span className={styles.healthIncomplete}>Estado no disponible</span>
        </div>
        <p className={styles.providerText}>
          No pudimos leer la configuración de TikTok. Recarga la página en unos momentos.
        </p>
      </section>
    );
  }

  const { health, label } = tiktokHealth(integration);
  const error = describeTikTokError(integration.lastErrorCode);

  return (
    <section className={styles.provider}>
      <div className={styles.providerHead}>
        <ProviderLogo provider="tiktok" />
        <h3 className={styles.providerName}>TikTok</h3>
        <HealthBadge health={health} label={label} />
      </div>

      <p className={styles.providerText}>
        Píxel de la tienda (solo con consentimiento de publicidad) y compras enviadas desde el
        servidor.
      </p>

      <dl className={styles.facts}>
        <Fact label="Estado" value={label} />
        <Fact label="Último evento enviado" value={dateOrNever(integration.lastEventAt)} />
        <Fact
          label="Última prueba"
          value={
            integration.lastTestedAt === null
              ? 'Nunca'
              : `${formatDateTime(integration.lastTestedAt)} · ${integration.lastTestStatus === 'passed' ? 'superada' : 'fallida'}`
          }
        />
      </dl>

      {error === null ? null : <p className={catalog.hint}>Último error: {error}</p>}

      <div className={styles.providerActions}>
        <Link className={catalog.buttonPrimary} href="/panel/configuracion/integraciones/tiktok">
          {canManage ? 'Configurar' : 'Ver configuración'}
        </Link>
      </div>
    </section>
  );
}

/**
 * Tarjeta de Meta: píxel de la tienda y compras enviadas desde el servidor (API de conversiones).
 *
 * `integration` es `null` cuando la lectura falló: la tarjeta lo dice y no inventa un estado. Del
 * token no llega ni la pista: la tarjeta no la necesita.
 */
export function MetaProviderCard({
  integration,
  canManage,
}: {
  readonly integration: MetaIntegration | null;
  readonly canManage: boolean;
}) {
  if (integration === null) {
    return (
      <section className={styles.provider}>
        <div className={styles.providerHead}>
          <ProviderLogo provider="meta" />
          <h3 className={styles.providerName}>Meta</h3>
          <span className={styles.healthIncomplete}>Estado no disponible</span>
        </div>
        <p className={styles.providerText}>
          No pudimos leer la configuración de Meta. Recarga la página en unos momentos.
        </p>
      </section>
    );
  }

  const { health, label } = metaHealth(integration);
  const error = describeMetaError(integration.lastErrorCode);

  return (
    <section className={styles.provider}>
      <div className={styles.providerHead}>
        <ProviderLogo provider="meta" />
        <h3 className={styles.providerName}>Meta</h3>
        <HealthBadge health={health} label={label} />
      </div>

      <p className={styles.providerText}>
        Píxel de Facebook e Instagram en la tienda (solo con consentimiento de publicidad) y compras
        enviadas desde el servidor.
      </p>

      <dl className={styles.facts}>
        <Fact label="Estado" value={label} />
        <Fact label="Última compra enviada" value={dateOrNever(integration.lastEventAt)} />
        <Fact
          label="Última prueba"
          value={
            integration.lastTestedAt === null
              ? 'Nunca'
              : `${formatDateTime(integration.lastTestedAt)} · ${integration.lastTestStatus === 'passed' ? 'superada' : 'fallida'}`
          }
        />
      </dl>

      {error === null ? null : <p className={catalog.hint}>Último error: {error}</p>}

      <div className={styles.providerActions}>
        <Link className={catalog.buttonPrimary} href="/panel/configuracion/integraciones/meta">
          {canManage ? 'Configurar' : 'Ver configuración'}
        </Link>
      </div>
    </section>
  );
}

function dateOrNever(value: string | null): string {
  return value === null ? 'Nunca' : formatDateTime(value);
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
