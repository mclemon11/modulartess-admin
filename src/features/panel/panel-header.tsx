import type { ReactNode } from 'react';

import { Breadcrumb, type Crumb } from './breadcrumb';
import styles from './panel-shell.module.css';

/**
 * Cabecera de una pantalla del panel.
 *
 * La renderiza cada página, no el shell: el breadcrumb depende de la ruta y de los datos que la
 * página acaba de cargar (el nombre de un producto, por ejemplo), y eso el layout no lo sabe.
 */
export function PanelHeader({
  trail,
  actions,
}: {
  readonly trail: readonly Crumb[];
  readonly actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <Breadcrumb trail={trail} />
      {actions === undefined ? null : <div>{actions}</div>}
    </header>
  );
}
