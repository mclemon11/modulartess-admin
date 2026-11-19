import Link from 'next/link';

import { TikTokSettings } from '@/features/panel/tiktok-settings';
import catalog from '@/features/panel/catalog.module.css';
import styles from '@/features/panel/integrations.module.css';
import { describeIntegrationFailure } from '@/features/panel/integration-errors';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { resolvePanelSession } from '@/features/panel/session-context';
import { can } from '@/features/session/permissions';
import { isBackendFailure } from '@/lib/api/errors';
import { getTikTokIntegration } from '@/lib/api/integrations';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Configurar TikTok: píxel de la tienda y compras enviadas desde el servidor.
 *
 * Server Component: la lectura sale del servidor de Next con la sesión de la persona; guardar,
 * probar y activar pasan por rutas BFF propias. El navegador nunca habla con TikTok ni con el
 * backend, y el token de Events API guardado no vuelve a la pantalla: solo su pista.
 */
export default async function TikTokIntegrationPage() {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const role = session.session.role;
  const trail = [
    { href: '/panel', label: 'Panel' },
    { href: '/panel/configuracion', label: 'Configuración' },
    { href: '/panel/configuracion/integraciones', label: 'Integraciones' },
    { label: 'TikTok' },
  ];

  if (!can(role, 'integrations.read')) {
    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Configurar TikTok" />
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
    integration = await getTikTokIntegration(session.session.sessionMaterial);
  } catch (error) {
    const code = isBackendFailure(error) ? error.code : 'backend_unexpected';

    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <PanelPageHeader title="Configurar TikTok" />
          <ErrorState
            action={
              <Link
                className={catalog.buttonSecondary}
                href="/panel/configuracion/integraciones/tiktok"
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
          lead="Pega el Pixel ID y el token de Events API de TikTok, envía una compra de prueba y activa la integración por separado."
          title="Configurar TikTok"
        />

        <section className={styles.settingsCard}>
          <TikTokSettings canManage={can(role, 'integrations.manage')} integration={integration} />
        </section>
      </div>
    </>
  );
}
