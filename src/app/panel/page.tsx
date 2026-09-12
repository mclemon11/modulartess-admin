import Link from 'next/link';

import styles from '@/features/panel/catalog.module.css';
import { PanelHeader } from '@/features/panel/panel-header';
import { SectionHeading } from '@/features/panel/section-icon';
import { resolvePanelSession } from '@/features/panel/session-context';
import { describeRole } from '@/features/session/role-labels';

export const dynamic = 'force-dynamic';

/**
 * Portada del panel.
 *
 * No hay métricas de ventas, pedidos ni catálogo: el backend no publica **ninguna** agregación, y
 * un número inventado en un panel administrativo es peor que un panel vacío. Lo que se dice aquí
 * es lo que se sabe de verdad: que la sesión está activa, con qué rol, y cuál es la sección
 * operativa disponible.
 *
 * El shell está preparado para que las siguientes secciones sean una entrada en `navigation.ts` y
 * una carpeta bajo `src/app/panel/`: esta portada no habrá que rehacerla.
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
            <h1 className={styles.pageTitle}>Sesión administrativa activa</h1>
            <p className={styles.pageLead}>
              Tu rol es <strong>{describeRole(role)}</strong>. Cada acción se verifica en el
              backend, que es quien decide qué puede hacer tu rol: el panel solo oculta lo que no te
              corresponde.
            </p>
          </div>
        </div>

        <div className={styles.homeGrid}>
          <section className={styles.card}>
            <div className={styles.cardPad}>
              <SectionHeading icon="productos" title="Productos" />
              <p className={styles.hint}>
                La sección operativa disponible. Desde ahí se crea el catálogo, se suben imágenes,
                se gestionan variantes e inventario y se publica cuando el backend confirma que el
                producto está listo.
              </p>
              <div className={styles.actions}>
                <Link className={styles.buttonPrimary} href="/panel/productos">
                  Ir a productos
                </Link>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardPad}>
              <SectionHeading icon="estado" title="Lo que todavía no está" />
              <p className={styles.hint}>
                Pedidos, clientes, cupones, envíos y las métricas del catálogo no aparecen en la
                navegación porque el contrato todavía no publica sus operaciones. Se añadirán sobre
                este mismo shell cuando existan; mientras tanto, no se aparentan.
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
