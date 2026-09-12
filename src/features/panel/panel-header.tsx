'use client';

import type { ReactNode } from 'react';

import { Breadcrumb, type Crumb } from './breadcrumb';
import { useDrawer } from './panel-chrome';
import styles from './panel-shell.module.css';

/**
 * Cabecera superior de una pantalla.
 *
 * La renderiza cada página, no el shell: el breadcrumb depende de la ruta y de los datos que la
 * página acaba de cargar —el nombre de un producto, por ejemplo—, y eso el layout no lo sabe.
 *
 * El botón de menú solo aparece por debajo de 60rem, donde la barra lateral es un cajón.
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
      <Breadcrumb trail={trail} />
      {/* Marca centrada: en móvil el breadcrumb se reduce y la cabecera necesita el ancla visual
          que tienen las referencias. */}
      <span className={styles.headerBrand}>MODULARTESS</span>
      {actions === undefined ? null : <div className={styles.headerActions}>{actions}</div>}
    </header>
  );
}
