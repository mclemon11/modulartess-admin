import Link from 'next/link';

import { MetaSettings } from '@/features/panel/meta-settings';
import catalog from '@/features/panel/catalog.module.css';
import styles from '@/features/panel/integrations.module.css';
import { describeIntegrationFailure } from '@/features/panel/integration-errors';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { resolvePanelSession } from '@/features/panel/session-context';
import { can } from '@/features/session/permissions';
import { isBackendFailure } from '@/lib/api/errors';
import { getMetaIntegration } from '@/lib/api/integrations';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Configurar Meta: píxel de la tienda y compras enviadas desde el servidor.
 *
 * Server Component: la lectura sale del servidor de Next con la sesión de la persona; guardar,
 * probar y activar pasan por rutas BFF propias. El navegador nunca habla con Meta ni con el
 * backend, y el token de la API de conversiones guardado no vuelve a la pantalla: solo su pista.
 */
export default async function MetaIntegrationPage() {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const role = session.session.role;
  const trail = [
    { href: '/panel', label: 'Panel' },
    { href: '/panel/configuracion', label: 'Configuración' },
    { href: '/panel/configuracion/integraciones', label: 'Integraciones' },
    { label: 'Meta' },
  ];

  if (!can(role, 'integrations.read')) {
    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Configurar Meta" />
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
    integration = await getMetaIntegration(session.session.sessionMaterial);
  } catch (error) {
    const code = isBackendFailure(error) ? error.code : 'backend_unexpected';

    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Configurar Meta" />
          <ErrorState
            action={
              <Link
                className={catalog.buttonSecondary}
                href="/panel/configuracion/integraciones/meta"
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
          lead="Pega el ID del conjunto de datos y el token de la API de conversiones de Meta, envía una compra de prueba y activa la integración por separado."
          title="Configurar Meta"
        />

        <section className={styles.settingsCard}>
          <MetaSettings canManage={can(role, 'integrations.manage')} integration={integration} />
        </section>
      </div>
    </>
  );
}
