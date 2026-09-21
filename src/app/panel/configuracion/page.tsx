import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import styles from '@/features/panel/integrations.module.css';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { Icon } from '@/features/panel/section-icon';
import { resolvePanelSession } from '@/features/panel/session-context';
import { can } from '@/features/session/permissions';

export const dynamic = 'force-dynamic';

/**
 * Configuración general.
 *
 * Hoy tiene una sola sección —Integraciones— y aun así existe como pantalla propia: es donde
 * vivirán las demás, y llevar «Integraciones» directamente a la barra lateral habría dejado el
 * panel con una entrada de primer nivel para una cosa que es una subsección de la configuración.
 *
 * No hay nada que configurar aquí mismo. Esta pantalla enumera las secciones y dice quién puede
 * entrar en cada una.
 */
export default async function ConfiguracionPage() {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const role = session.session.role;
  const canRead = can(role, 'integrations.read');

  return (
    <>
      <PanelHeader trail={[{ href: '/panel', label: 'Panel' }, { label: 'Configuración' }]} />
      <div className={catalog.page}>
        <PanelPageHeader
          lead="Ajustes de la tienda y conexiones con servicios externos."
          title="Configuración general"
        />

        <div className={styles.providers}>
          <section className={styles.provider}>
            <div className={styles.providerHead}>
              <span aria-hidden="true" className={styles.providerIcon}>
                <Icon name="integraciones" />
              </span>
              <h2 className={styles.providerName}>Integraciones</h2>
            </div>
            <p className={styles.providerText}>
              Pasarelas de pago y servicios conectados: con qué credenciales cobra la tienda, en qué
              ambiente y qué incidencias hay abiertas.
            </p>
            {canRead ? (
              <div className={styles.providerActions}>
                <Link className={catalog.buttonPrimary} href="/panel/configuracion/integraciones">
                  Abrir integraciones
                </Link>
              </div>
            ) : (
              <p className={catalog.hint}>
                Tu rol no tiene acceso a las integraciones. Las gestionan los roles de
                administración.
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
