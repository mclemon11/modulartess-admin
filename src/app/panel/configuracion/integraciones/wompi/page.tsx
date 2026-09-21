import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import { formatDateTime } from '@/features/panel/format';
import styles from '@/features/panel/integrations.module.css';
import { CopyableValue } from '@/features/panel/copyable-value';
import { Fact, HealthBadge, IntegrationSection } from '@/features/panel/integration-cards';
import { describeIntegrationFailure } from '@/features/panel/integration-errors';
import {
  describeActiveEnvironment,
  describeIntegrationError,
  OPERATIONAL_CLOCKS,
  readEnvironmentHealth,
} from '@/features/panel/integration-labels';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { RefreshButton } from '@/features/panel/refresh-button';
import { resolvePanelSession } from '@/features/panel/session-context';
import { WompiCredentialsForm } from '@/features/panel/wompi-credentials-form';
import {
  WompiConnectionTester,
  WompiEnableToggle,
  WompiRevokeRetiredSecrets,
} from '@/features/panel/wompi-operations';
import { can } from '@/features/session/permissions';
import { isBackendFailure } from '@/lib/api/errors';
import { getWompiIntegration, type WompiEnvironmentConfig } from '@/lib/api/integrations';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Configuración de Wompi.
 *
 * La integración elegida es **Web Checkout alojado**: quien compra paga en la página de Wompi y
 * vuelve. El panel no procesa tarjetas, no tiene formulario de pago propio y no toca un CVC.
 *
 * Seis secciones, en el orden en que se necesitan: qué está pasando, con qué credenciales, dónde
 * avisar al proveedor, cómo comprobarlo, cómo rotar un secreto y por qué producción sigue cerrada.
 *
 * Server Component: la lectura sale del servidor de Next con la sesión de la persona. Las tres
 * acciones —guardar, probar, revocar— pasan por rutas BFF propias, y ninguna habla con Wompi desde
 * el navegador.
 */
export default async function WompiIntegrationPage() {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const role = session.session.role;
  const trail = [
    { href: '/panel', label: 'Panel' },
    { href: '/panel/configuracion', label: 'Configuración' },
    { href: '/panel/configuracion/integraciones', label: 'Integraciones' },
    { label: 'Wompi' },
  ];

  if (!can(role, 'integrations.read')) {
    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Wompi" />
          <ErrorState
            action={
              <Link className={catalog.buttonSecondary} href="/panel">
                Volver al panel
              </Link>
            }
            message="Tu rol no tiene acceso a la configuración de integraciones."
            title="Acceso insuficiente"
          />
        </div>
      </>
    );
  }

  const canManage = can(role, 'integrations.manage');

  let integration;

  try {
    integration = await getWompiIntegration(session.session.sessionMaterial);
  } catch (error) {
    const code = isBackendFailure(error) ? error.code : 'backend_unexpected';

    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Wompi" />
          <ErrorState
            action={
              <Link
                className={catalog.buttonSecondary}
                href="/panel/configuracion/integraciones/wompi"
              >
                Reintentar
              </Link>
            }
            message={describeIntegrationFailure(code)}
            title="No pudimos cargar la configuración"
          />
        </div>
      </>
    );
  }

  const sandbox = integration.sandbox;
  const health = readEnvironmentHealth(sandbox, { blocked: false });
  const production = readEnvironmentHealth(integration.production, {
    blocked: !integration.livePaymentsEnabled,
  });
  const lastError = describeIntegrationError(sandbox.lastErrorCode);

  return (
    <>
      <PanelHeader trail={trail} />
      <div className={catalog.page}>
        <PanelPageHeader
          actions={<RefreshButton />}
          lead="Checkout alojado de Wompi. El panel no procesa tarjetas: quien compra paga en la página del proveedor y el resultado vuelve por evento firmado o por reconciliación."
          title="Wompi"
        />

        <div className={styles.providers}>
          <IntegrationSection
            hint="Qué está configurado y qué ha pasado últimamente."
            icon="estado"
            title="Resumen operativo"
          >
            <div className={styles.providerHead}>
              <HealthBadge health={health.health} label={health.label} />
              <span className={catalog.hint}>{health.detail}</span>
            </div>

            <dl className={styles.facts}>
              <Fact
                label="Ambiente activo"
                value={describeActiveEnvironment(integration.activeEnvironment)}
              />
              <Fact
                hint="Es una constante del backend, no una casilla. Guardar credenciales no la cambia."
                label="Pagos reales"
                value={integration.livePaymentsEnabled ? 'Habilitados' : 'Bloqueados'}
              />
              <Fact label="Versión de la configuración" value={String(integration.version)} />
              <Fact
                label="Checkouts de prueba"
                value={sandbox.enabledForNewPayments ? 'Habilitados' : 'Deshabilitados'}
              />
              <Fact
                hint="Prefijo y últimos cuatro. La llave entera no la devuelve ninguna operación."
                label="Llave pública"
                value={sandbox.publicKeyMasked ?? 'Sin configurar'}
              />
              <Fact
                hint="Versiones anteriores del secreto de Eventos que todavía se aceptan."
                label="Secretos retirados vigentes"
                value={String(sandbox.retiredEventsSecretCount)}
              />
              <Fact
                hint="Lo fija el backend. El panel no puede cambiarlo."
                label="Periodo de gracia"
                value={`${sandbox.eventsSecretGraceHours} horas`}
              />
              {/*
               * Los tres relojes, cada uno con su matiz. Se enseñan siempre los tres y nunca
               * juntos bajo una etiqueta común: «llegó algo» y «llegó algo auténtico» son cosas
               * distintas, y confundirlas haría leer una integración rota como una sana.
               */}
              {OPERATIONAL_CLOCKS.map((clock) => (
                <Fact
                  hint={clock.hint}
                  key={clock.key}
                  label={clock.label}
                  value={readClock(sandbox, clock.key)}
                />
              ))}
              <Fact
                label="Última prueba de conexión"
                value={
                  sandbox.lastTestedAt === null
                    ? 'Nunca'
                    : `${formatDateTime(sandbox.lastTestedAt)} · ${
                        sandbox.lastTestStatus === 'passed' ? 'Correcta' : 'Falló'
                      }`
                }
              />
            </dl>

            {lastError === null ? null : (
              <p className={catalog.hint}>Último error registrado: {lastError}</p>
            )}

            <WompiEnableToggle canManage={canManage} integration={integration} />
          </IntegrationSection>

          <IntegrationSection
            hint="Las cuatro credenciales de pruebas. Se guardan cifradas y no vuelven a mostrarse."
            icon="llave"
            title="Credenciales de pruebas"
          >
            <WompiCredentialsForm canManage={canManage} integration={integration} />
          </IntegrationSection>

          <IntegrationSection
            hint="Cópiala en el comercio de Wompi para que te mande los eventos."
            icon="integraciones"
            title="URL de eventos"
          >
            {/*
             * La URL la deriva el backend de su propia configuración. **No se construye aquí**:
             * componerla con el origen del navegador la ataría a desde dónde se abrió el panel, y
             * un panel abierto por un túnel local acabaría configurando en Wompi una URL que no
             * existe fuera de esa máquina.
             */}
            <CopyableValue
              hint="Solo lectura: la deriva el backend. Pégala en el panel de Wompi, en la configuración de eventos del ambiente de pruebas."
              label="URL de eventos (pruebas)"
              value={sandbox.webhookUrl}
            />
            <CopyableValue
              hint="A donde el proveedor devuelve el navegador al terminar. También la deriva el backend."
              label="URL de retorno (pruebas)"
              value={sandbox.redirectUrl}
            />
            <p className={catalog.hint}>
              La ruta de eventos se publicará mediante API Gateway; el servicio de Cloud Run sigue
              privado por IAM. Hasta que esa publicación exista, Wompi no puede alcanzarla y los
              pagos se cierran por reconciliación.
            </p>
          </IntegrationSection>

          <IntegrationSection
            hint="Comprueba la llave pública contra el proveedor. No mueve dinero."
            icon="estado"
            title="Prueba de configuración"
          >
            <p className={catalog.hint}>
              La prueba consulta al proveedor con la llave pública guardada. Es lo único que puede
              demostrarse sin mover dinero: de las otras tres credenciales solo se informa si hay
              una versión guardada, no que sean correctas.
            </p>
            <WompiConnectionTester canManage={canManage} />
          </IntegrationSection>

          <IntegrationSection
            hint="Rotar deja vivas las versiones anteriores durante un tiempo acotado."
            icon="llave"
            title="Rotación de secretos"
          >
            <p className={catalog.hint}>
              Para rotar un secreto, pégalo en su campo de arriba y guarda: se crea una versión
              nueva y la anterior sigue aceptándose durante {sandbox.eventsSecretGraceHours} horas.
              Esa gracia existe porque el proveedor reintenta durante horas, y sin ella una rotación
              rutinaria perdería desenlaces de pago reales.
            </p>
            <WompiRevokeRetiredSecrets canManage={canManage} integration={integration} />
          </IntegrationSection>

          <IntegrationSection hint="Existe, y está cerrada." icon="pago" title="Producción">
            <div className={styles.providerHead}>
              <HealthBadge health={production.health} label={production.label} />
            </div>
            <p className={catalog.hint}>{production.detail}</p>
            <p className={catalog.hint}>
              El bloqueo es una constante del backend, no una variable de entorno: ningún cambio de
              configuración —ni desde aquí, ni desde el despliegue— habilita cobros reales. Se
              levantará cuando el envío forme parte del total definitivo, el inventario se reserve
              al pagar y exista un procedimiento de devolución.
            </p>
            {/*
             * No hay formulario de producción, y es deliberado. El contrato rechaza cualquier
             * `PATCH` con `environment=production` mientras el bloqueo esté puesto, así que un
             * formulario aquí solo podría producir un error: prometería guardar algo que el
             * backend no va a guardar.
             */}
          </IntegrationSection>
        </div>
      </div>
    </>
  );
}

function readClock(
  config: WompiEnvironmentConfig,
  key: (typeof OPERATIONAL_CLOCKS)[number]['key'],
): string {
  const value = config[key];
  return typeof value === 'string' ? formatDateTime(value) : 'Nunca';
}
