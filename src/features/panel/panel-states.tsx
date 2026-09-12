import type { ReactNode } from 'react';

import styles from './catalog.module.css';
import { Icon, type IconName } from './section-icon';

/**
 * Estados comunes de las pantallas del panel.
 *
 * Lista vacía, fallo del backend y carga se ven igual en Productos y en Pedidos porque son la misma
 * situación contada dos veces. Tenerlos aquí evita que cada pantalla invente su propio vacío y que,
 * con el tiempo, «no hay nada» signifique una cosa en un sitio y otra en el de al lado.
 *
 * Server Components: no tienen estado ni eventos.
 */

/** Lista sin resultados. No es un error: es una lista que todavía no tiene nada. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.empty}>
        <span aria-hidden="true" className={styles.emptyIcon}>
          <Icon name={icon} />
        </span>
        <h2 className={styles.emptyTitle}>{title}</h2>
        <p className={styles.emptyText}>{children}</p>
        {action}
      </div>
    </section>
  );
}

/**
 * El backend no respondió, o respondió que no.
 *
 * El mensaje llega ya traducido desde el código estable del BFF: aquí no se interpreta nada, y el
 * texto original del backend no se muestra nunca.
 */
export function ErrorState({
  title,
  message,
  action,
}: {
  readonly title: string;
  readonly message: string;
  readonly action?: ReactNode;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.empty}>
        <span aria-hidden="true" className={styles.emptyIconDanger}>
          <Icon name="estado" />
        </span>
        <h2 className={styles.emptyTitle}>{title}</h2>
        <p className={styles.error} role="alert">
          {message}
        </p>
        {action}
      </div>
    </section>
  );
}
