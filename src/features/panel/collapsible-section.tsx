'use client';

import { useState } from 'react';

import styles from './catalog.module.css';
import { Icon, type IconName } from './section-icon';

/**
 * Sección del formulario que se puede plegar.
 *
 * El formulario de producto es largo, y plegar lo que no se está tocando es la forma de acortarlo
 * sin esconder nada: el `<details>` nativo ya es accesible con teclado y lo anuncian los lectores
 * de pantalla, así que no hace falta un acordeón propio.
 *
 * `forceOpen` es la regla que impide que plegar tape un problema: mientras haya un error dentro, la
 * sección se abre y no se deja cerrar. Se usa solo en secciones **opcionales**: lo que la
 * publicación exige nunca se pliega.
 */
export function CollapsibleSection({
  title,
  hint,
  icon,
  id,
  defaultOpen,
  forceOpen,
  children,
}: {
  readonly title: string;
  readonly hint: string;
  readonly icon: IconName;
  readonly id: string;
  readonly defaultOpen: boolean;
  /** Hay algo dentro que no se puede guardar: la sección se queda abierta. */
  readonly forceOpen: boolean;
  readonly children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={styles.card} id={id}>
      <details
        className={styles.foldSection}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        open={open || forceOpen}
      >
        {/*
          El contenido de `summary` es contenido de frase, con un encabezado admitido: por eso aquí
          no se reutiliza `SectionHeading`, que envuelve el suyo en un `div`, y se repiten sus
          clases sobre el propio `summary`.
        */}
        <summary className={`${styles.cardPad} ${styles.sectionHead}`}>
          <span className={styles.sectionIcon}>
            <Icon name={icon} />
          </span>
          <span className={styles.sectionHeadText}>
            <h2 className={styles.sectionTitle}>{title}</h2>
            <span className={styles.sectionHint}>{hint}</span>
            <span aria-hidden="true" className={styles.foldMarker}>
              {open || forceOpen ? 'Ocultar' : 'Mostrar'}
            </span>
          </span>
        </summary>
        <div className={styles.cardPad}>{children}</div>
      </details>
    </section>
  );
}
