import Link from 'next/link';

import styles from '@/features/panel/catalog.module.css';
import { PanelHeader } from '@/features/panel/panel-header';
import { resolvePanelSession } from '@/features/panel/session-context';
import { describeRole } from '@/features/session/role-labels';

export const dynamic = 'force-dynamic';

/**
 * Portada del panel.
 *
 * No hay métricas: el backend todavía no publica ninguna agregación, y un número inventado en un
 * panel administrativo es peor que un panel vacío.
 */
export default async function PanelPage() {
  const result = await resolvePanelSession();
  const role = result.kind === 'active' ? result.session.role : '';

  return (
    <>
      <PanelHeader trail={[{ label: 'Panel' }]} />
      <div className={styles.cardPad}>
        <h1 className={styles.pageTitle}>Sesión administrativa activa</h1>
        <p className={styles.pageLead}>
          Tu rol es <strong>{describeRole(role)}</strong>. La única sección operativa por ahora es
          el catálogo de productos; pedidos, inventario, clientes y usuarios llegarán sobre este
          mismo shell.
        </p>
        <Link className={styles.button} href="/panel/productos">
          Ir a productos
        </Link>
      </div>
    </>
  );
}
