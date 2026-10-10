import Link from 'next/link';

import { AddiSettings } from '@/features/panel/addi-settings';
import catalog from '@/features/panel/catalog.module.css';
import styles from '@/features/panel/integrations.module.css';
import { describeIntegrationFailure } from '@/features/panel/integration-errors';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { resolvePanelSession } from '@/features/panel/session-context';
import { can } from '@/features/session/permissions';
import { isBackendFailure } from '@/lib/api/errors';
import { getAddiIntegration } from '@/lib/api/integrations';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Configurar Addi (ADR 0015).
 *
 * Producción únicamente. Server Component: la lectura sale del servidor de Next con la sesión de
 * la persona; guardar, probar y activar pasan por rutas BFF propias. El navegador nunca habla con
 * Addi ni con el backend, y ninguna credencial guardada vuelve a la pantalla.
 */
export default async function AddiIntegrationPage() {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const role = session.session.role;
  const trail = [
    { href: '/panel', label: 'Panel' },
    { href: '/panel/configuracion', label: 'Configuración' },
    { href: '/panel/configuracion/integraciones', label: 'Integraciones' },
    { label: 'Addi' },
  ];

  if (!can(role, 'integrations.read')) {
    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Configurar Addi" />
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
    integration = await getAddiIntegration(session.session.sessionMaterial);
  } catch (error) {
    const code = isBackendFailure(error) ? error.code : 'backend_unexpected';

    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Configurar Addi" />
          <ErrorState
            action={
              <Link
                className={catalog.buttonSecondary}
                href="/panel/configuracion/integraciones/addi"
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
          lead="Producción. Pega las credenciales de operación y de notificación que entregó Addi, prueba la autenticación y activa los pagos por separado."
          title="Configurar Addi"
        />

        <section className={styles.settingsCard}>
          <AddiSettings canManage={can(role, 'integrations.manage')} integration={integration} />
        </section>
      </div>
    </>
  );
}
