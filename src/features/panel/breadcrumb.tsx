import Link from 'next/link';

import styles from './panel-shell.module.css';

export type Crumb = {
  readonly label: string;
  /** Sin `href` es la página actual: se marca con `aria-current` y no enlaza a ningún sitio. */
  readonly href?: string;
};

export function Breadcrumb({ trail }: { readonly trail: readonly Crumb[] }) {
  return (
    <nav aria-label="Ruta de navegación">
      <ol className={styles.breadcrumb}>
        {trail.map((crumb, index) => (
          <li key={crumb.label}>
            {index > 0 ? (
              <span aria-hidden="true" className={styles.separator}>
                /
              </span>
            ) : null}
            {crumb.href === undefined ? (
              <span aria-current="page" className={styles.breadcrumbCurrent}>
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href}>{crumb.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
