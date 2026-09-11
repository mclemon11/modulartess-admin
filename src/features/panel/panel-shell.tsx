import type { ReactNode } from 'react';

import { describeRole } from '@/features/session/role-labels';
import { SignOutButton } from '@/features/session/sign-out-button';

import styles from './panel-shell.module.css';
import { SidebarNav } from './sidebar-nav';

/**
 * Estructura común de todas las pantallas del panel.
 *
 * Es un Server Component: solo compone. La cabecera la aporta cada pantalla con `PanelHeader`,
 * porque el breadcrumb depende de la página y un layout no recibe props de su hijo.
 *
 * Preparado para crecer: añadir pedidos, inventario, clientes o usuarios no toca este archivo,
 * solo `navigation.ts` y una carpeta nueva bajo `src/app/panel/`.
 */
export function PanelShell({
  role,
  children,
}: {
  readonly role: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <span aria-hidden="true" className={styles.brandMark} />
            <p className={styles.brandName}>
              Modulartess <span>Admin</span>
            </p>
          </div>
          <SidebarNav />
          <div className={styles.sidebarFooter}>
            <p className={styles.roleLabel}>Rol</p>
            <p className={styles.roleValue}>{describeRole(role)}</p>
            <SignOutButton />
          </div>
        </aside>
        <div className={styles.main}>{children}</div>
      </div>
    </div>
  );
}
