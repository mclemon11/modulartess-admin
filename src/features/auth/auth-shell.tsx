import type { ReactNode } from 'react';

import { BrandLogo } from '@/features/panel/brand-logo';

import styles from './auth-shell.module.css';

type AuthShellProps = {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
  readonly footnote?: ReactNode;
};

/**
 * Marco visual de las pantallas de autenticación: dos columnas en escritorio.
 *
 * A la izquierda, la marca y el mensaje de bienvenida sobre una composición en violetas y neutros.
 * A la derecha, la tarjeta blanca con el formulario real. Por debajo de 60rem la columna decorativa
 * desaparece —no aporta nada en un móvil y roba la mitad de la pantalla al formulario— y queda el
 * logotipo, el título y los campos.
 *
 * La decoración es **abstracta**: nada de capturas de tienda ni de tarjetas de producto inventadas.
 *
 * Componente de servidor: solo compone estructura y estilos. El comportamiento interactivo vive en
 * los componentes cliente que recibe como `children`.
 */
export function AuthShell({ title, subtitle, children, footnote }: AuthShellProps) {
  return (
    <main className={styles.shell}>
      <section className={styles.aside}>
        <div className={styles.asideContent}>
          <BrandLogo className={styles.asideLogo} height={52} priority />
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        {/* Composición decorativa: formas suaves, sin contenido que aparente datos. */}
        <div aria-hidden="true" className={styles.decoration}>
          <span className={styles.decorationGlow} />
          <span className={styles.decorationCard} />
          <span className={styles.decorationCardSmall} />
        </div>
        <p className={styles.asideTagline}>Diseño · Funcionalidad · Bienestar</p>
      </section>

      <section className={styles.panel}>
        <div className={styles.card}>
          <header className={styles.cardHead}>
            <div>
              <p className={styles.overline}>Modulartess</p>
              <p className={styles.cardTitle}>Admin</p>
            </div>
            <p className={styles.accessChip}>
              <span aria-hidden="true" className={styles.accessIcon}>
                <svg
                  fill="none"
                  height="16"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                  viewBox="0 0 24 24"
                  width="16"
                >
                  <path d="M6 11h12v9H6z" />
                  <path d="M9 11V7a3 3 0 016 0v4" />
                </svg>
              </span>
              <span>
                Acceso exclusivo
                <br />
                para administradores
              </span>
            </p>
          </header>

          {children}

          {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
        </div>
      </section>
    </main>
  );
}
