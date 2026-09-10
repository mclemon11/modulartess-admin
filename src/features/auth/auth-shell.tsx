import type { ReactNode } from 'react';

import styles from './auth-shell.module.css';

type AuthShellProps = {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
  readonly footnote?: ReactNode;
};

/**
 * Marco visual compartido por las pantallas de autenticación.
 *
 * Es un componente de servidor: solo compone estructura y estilos. El comportamiento interactivo
 * vive en los componentes cliente que recibe como `children`.
 */
export function AuthShell({ title, subtitle, children, footnote }: AuthShellProps) {
  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <span aria-hidden="true" className={styles.brandMark} />
          <p className={styles.brandName}>
            Modulartess <span>Admin</span>
          </p>
        </div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
        {children}
        {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
      </section>
    </main>
  );
}
