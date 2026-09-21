import type { ReactNode } from 'react';

import styles from './catalog.module.css';

/**
 * Encabezado de una pantalla: título, descripción y acciones.
 *
 * Las cuatro superficies del panel lo pintaban con la misma tríada de `div`s copiada; tenerlo en
 * un sitio es lo que hace que el título, el aire bajo él y la posición de las acciones sigan
 * coincidiendo cuando una pantalla cambie.
 *
 * Es el **único** `h1` de la pantalla. Las tarjetas de dentro empiezan en `h2`.
 */
export function PanelPageHeader({
  title,
  lead,
  actions,
}: {
  readonly title: string;
  readonly lead?: string | undefined;
  readonly actions?: ReactNode;
}) {
  return (
    <div className={styles.pageHead}>
      <div className={styles.pageHeadText}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {lead === undefined ? null : <p className={styles.pageLead}>{lead}</p>}
      </div>
      {actions === undefined ? null : <div className={styles.pageHeadActions}>{actions}</div>}
    </div>
  );
}
