import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import styles from '@/features/panel/integrations.module.css';
import { describeIntegrationFailure } from '@/features/panel/integration-errors';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { resolvePanelSession } from '@/features/panel/session-context';
import { WompiCredentialsForm } from '@/features/panel/wompi-credentials-form';
import { can } from '@/features/session/permissions';
import { isBackendFailure } from '@/lib/api/errors';
import { getWompiIntegration } from '@/lib/api/integrations';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Configurar Wompi.
 *
 * La pantalla hace **una cosa**: elegir ambiente, pegar las cuatro llaves oficiales y guardarlas.
 * Antes explicaba la arquitectura entera —resumen operativo, tres relojes, versión de la
 * configuración, rotación, prueba de conexión y una tarjeta grande sobre producción— y enterraba
 * lo único que alguien viene a hacer aquí. Nada de aquello era falso; simplemente no era el
 * trabajo de esta pantalla, y está donde corresponde: en la documentación y en la bandeja de
 * incidencias.
 *
 * La URL de eventos sí se queda, plegada en «Configuración avanzada», porque Wompi la pide **por
 * ambiente** en su propio panel y hay que poder copiarla desde algún sitio.
 *
 * Server Component: la lectura sale del servidor de Next con la sesión de la persona. Guardar pasa
 * por una ruta BFF propia, y el navegador nunca habla con Wompi.
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
          <PanelPageHeader title="Configurar Wompi" />
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

  let integration;

  try {
    integration = await getWompiIntegration(session.session.sessionMaterial);
  } catch (error) {
    const code = isBackendFailure(error) ? error.code : 'backend_unexpected';

    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Configurar Wompi" />
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

  return (
    <>
      <PanelHeader trail={trail} />
      <div className={catalog.page}>
        <PanelPageHeader
          lead="Selecciona el ambiente y pega las cuatro llaves que aparecen en Desarrolladores dentro de Wompi."
          title="Configurar Wompi"
        />

        <section className={styles.settingsCard}>
          <WompiCredentialsForm
            canManage={can(role, 'integrations.manage')}
            integration={integration}
          />
        </section>
      </div>
    </>
  );
}
