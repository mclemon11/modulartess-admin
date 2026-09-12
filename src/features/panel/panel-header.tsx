'use client';

import type { ReactNode } from 'react';

import { describeRole } from '@/features/session/role-labels';

import { BrandLogo } from './brand-logo';
import { Breadcrumb, type Crumb } from './breadcrumb';
import { useDrawer } from './panel-chrome';
import styles from './panel-shell.module.css';
import { Icon } from './section-icon';

/**
 * Cabecera superior de una pantalla.
 *
 * La renderiza cada página, no el shell: el nombre de la sección depende de la ruta y de los datos
 * que la página acaba de cargar —el nombre de un producto, por ejemplo—, y eso el layout no lo sabe.
 *
 * A la derecha va el bloque de sesión: un avatar genérico y el **rol**. Ni nombre, ni correo, ni
 * UID: el contrato publica `uid` y `role`, y el UID no se pinta en ninguna pantalla.
 *
 * Donde las referencias ponen un buscador global y una campana de avisos, aquí no hay nada: ninguno
 * tiene endpoint, y un control que no hace nada es peor que el hueco que deja.
 */
export function PanelHeader({
  trail,
  actions,
}: {
  readonly trail: readonly Crumb[];
  readonly actions?: ReactNode;
}) {
  const drawer = useDrawer();

  return (
    <header className={styles.header}>
      <button
        aria-controls="panel-sidebar"
        aria-expanded={drawer.open}
        aria-label="Abrir menú de secciones"
        className={styles.menuButton}
        onClick={drawer.toggle}
        type="button"
      >
        <span aria-hidden="true" className={styles.menuIcon} />
      </button>

      {/* En móvil la marca ancla la cabecera; en escritorio ya está en la barra lateral. */}
      <BrandLogo className={styles.headerLogo} height={26} />

      <Breadcrumb trail={trail} />

      <div className={styles.headerSide}>
        {actions === undefined ? null : <div className={styles.headerActions}>{actions}</div>}
        <div className={styles.headerUser}>
          <span aria-hidden="true" className={styles.avatar}>
            <Icon name="cliente" />
          </span>
          <span className={styles.headerUserText}>
            <span className={styles.headerUserLabel}>Sesión</span>
            <span className={styles.headerUserRole}>{describeRole(drawer.role)}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
