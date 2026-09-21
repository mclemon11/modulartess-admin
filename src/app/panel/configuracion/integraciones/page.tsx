import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import styles from '@/features/panel/integrations.module.css';
import { AddiProviderCard, WompiProviderCard } from '@/features/panel/integration-cards';
import { describeIntegrationFailure } from '@/features/panel/integration-errors';
import {
  OPEN_INCIDENTS_UNAVAILABLE,
  readOpenIncidentCount,
  type OpenIncidentCount,
} from '@/features/panel/integration-labels';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { RefreshButton } from '@/features/panel/refresh-button';
import { resolvePanelSession } from '@/features/panel/session-context';
import { can } from '@/features/session/permissions';
import { isBackendFailure } from '@/lib/api/errors';
import { getWompiIntegration } from '@/lib/api/integrations';
import { listPaymentIncidents } from '@/lib/api/payment-incidents';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Cuántas incidencias se piden para el contador de la tarjeta.
 *
 * Es el tope de una sola consulta, **no** un total: con este número de resultados y cursor, la
 * tarjeta dice «N o más». Subirlo haría el número exacto más a menudo y la consulta más cara; no
 * cambia lo que la tarjeta puede afirmar.
 */
const OPEN_INCIDENTS_PAGE_SIZE = 50;

/**
 * Integraciones.
 *
 * Una tarjeta por proveedor. Wompi con su estado real y Addi como lo que es: una capacidad que el
 * backend ya contempla y que todavía no tiene contrato.
 *
 * Es un Server Component: las dos lecturas salen del servidor de Next con la sesión de la persona,
 * así que el navegador no conoce la URL del backend ni la cookie. **El navegador tampoco habla con
 * Wompi**, ni aquí ni en ninguna otra pantalla: quien consulta al proveedor es el backend, con su
 * llave privada.
 */
export default async function IntegracionesPage() {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const role = session.session.role;
  const trail = [
    { href: '/panel', label: 'Panel' },
    { href: '/panel/configuracion', label: 'Configuración' },
    { label: 'Integraciones' },
  ];

  if (!can(role, 'integrations.read')) {
    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Integraciones" />
          <ErrorState
            action={
              <Link className={catalog.buttonSecondary} href="/panel">
                Volver al panel
              </Link>
            }
            message="Tu rol no tiene acceso a las integraciones."
            title="Acceso insuficiente"
          />
        </div>
      </>
    );
  }

  const material = session.session.sessionMaterial;

  let integration;

  try {
    integration = await getWompiIntegration(material);
  } catch (error) {
    const code = isBackendFailure(error) ? error.code : 'backend_unexpected';

    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Integraciones" />
          <ErrorState
            action={
              <Link className={catalog.buttonSecondary} href="/panel/configuracion/integraciones">
                Reintentar
              </Link>
            }
            message={describeIntegrationFailure(code)}
            title="No pudimos cargar las integraciones"
          />
        </div>
      </>
    );
  }

  /*
   * Las incidencias abiertas son **contexto**, no el contenido de esta pantalla: si su lectura
   * falla, la tarjeta lo dice y el resto sigue sirviendo. Tumbar la página entera por un contador
   * escondería el estado de la pasarela, que es lo que se viene a ver.
   *
   * Se pide **una sola página**. El contrato no publica un total y la bandeja pagina por cursor,
   * así que contar de verdad exigiría recorrerla entera: tantas llamadas como páginas haya, desde
   * una tarjeta de resumen. Lo que se hace en su lugar es decir hasta dónde se sabe —`readOpen
   * IncidentCount` lo decide por la presencia del cursor— en vez de presentar el tamaño de esta
   * página como si fuera el total.
   */
  let openIncidents: OpenIncidentCount = OPEN_INCIDENTS_UNAVAILABLE;

  try {
    const page = await listPaymentIncidents(material, {
      status: 'open',
      pageSize: OPEN_INCIDENTS_PAGE_SIZE,
    });
    openIncidents = readOpenIncidentCount(page);
  } catch {
    openIncidents = OPEN_INCIDENTS_UNAVAILABLE;
  }

  return (
    <>
      <PanelHeader trail={trail} />
      <div className={catalog.page}>
        <PanelPageHeader
          actions={<RefreshButton />}
          lead="Servicios externos conectados a la tienda. Las credenciales se guardan cifradas y nunca vuelven a mostrarse."
          title="Integraciones"
        />

        <div className={styles.providers}>
          <WompiProviderCard
            canManage={can(role, 'integrations.manage')}
            integration={integration}
            openIncidents={openIncidents}
          />
          <AddiProviderCard />
        </div>
      </div>
    </>
  );
}
