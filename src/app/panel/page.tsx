import Link from 'next/link';

import styles from '@/features/panel/catalog.module.css';
import { PanelHeader } from '@/features/panel/panel-header';
import { SectionHeading } from '@/features/panel/section-icon';
import { resolvePanelSession } from '@/features/panel/session-context';
import { can } from '@/features/session/permissions';
import { describeRole } from '@/features/session/role-labels';

export const dynamic = 'force-dynamic';

/**
 * Portada del panel.
 *
 * Es un punto de partida, no un cuadro de mando: el backend no publica **ninguna** agregación, así
 * que aquí no hay ventas, conteos, gráficas ni alertas. Un número inventado en un panel
 * administrativo es peor que un panel sin números.
 *
 * Lo que sí se dice es real: qué rol tiene la sesión y cuáles son las dos secciones operativas.
 * Los accesos se ocultan según la matriz de permisos, igual que en el resto del panel.
 */
export default async function PanelPage() {
  const result = await resolvePanelSession();
  const role = result.kind === 'active' ? result.session.role : '';

  return (
    <>
      <PanelHeader trail={[{ label: 'Panel' }]} />
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <div className={styles.pageHeadText}>
            <h1 className={styles.pageTitle}>Panel de administración</h1>
            <p className={styles.pageLead}>
              Sesión activa con el rol <strong>{describeRole(role)}</strong>. Cada acción se
              verifica en el backend: el panel solo oculta lo que tu rol no puede hacer.
            </p>
          </div>
        </div>

        <div className={styles.homeGrid}>
          <section className={styles.card}>
            <div className={styles.cardPad}>
              <SectionHeading
                hint="Catálogo, imágenes, inventario y variantes."
                icon="productos"
                title="Productos"
              />
              <p className={styles.hint}>
                Crea y edita productos, sube sus imágenes, ajusta inventario y publícalos cuando el
                backend confirme que están listos.
              </p>
              <div className={styles.actions}>
                <Link className={styles.buttonPrimary} href="/panel/productos">
                  Abrir catálogo
                </Link>
                {can(role, 'products.create') ? (
                  <Link className={styles.buttonSecondary} href="/panel/productos/nuevo">
                    Crear producto
                  </Link>
                ) : null}
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardPad}>
              <SectionHeading
                hint="Las compras que llegan desde la tienda."
                icon="pedidos"
                title="Pedidos"
              />
              <p className={styles.hint}>
                Consulta los pedidos recibidos y mueve su estado a medida que avanzan. No se crean
                desde el panel: un pedido nace cuando alguien compra.
              </p>
              <div className={styles.actions}>
                <Link className={styles.buttonPrimary} href="/panel/pedidos">
                  Ver pedidos
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
