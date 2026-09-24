'use client';

import { useId, useRef } from 'react';

import styles from './catalog.module.css';

/**
 * «Vista previa» como botón que abre un diálogo modal.
 *
 * Antes la vista previa ocupaba una columna alta de forma permanente y competía con el formulario.
 * Ahora se pide cuando hace falta. Es un `<dialog>` nativo abierto con `showModal()`: el navegador
 * atrapa el foco dentro, Escape lo cierra y el foco vuelve al botón que lo abrió. No hace falta
 * reimplementar nada de eso a mano.
 */
export function PreviewDialog({
  title = 'Vista previa del producto',
  children,
}: {
  readonly title?: string;
  readonly children: React.ReactNode;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={styles.buttonSecondary}
        onClick={() => dialog.current?.showModal()}
        type="button"
      >
        Vista previa
      </button>
      <dialog
        aria-labelledby={`${id}-title`}
        className={styles.previewDialog}
        // Un clic fuera de la tarjeta —sobre el fondo— también cierra.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        ref={dialog}
      >
        <div className={styles.previewDialogBody}>
          <div className={styles.previewDialogHead}>
            <h2 className={styles.sectionTitle} id={`${id}-title`}>
              {title}
            </h2>
            <button
              className={styles.buttonSecondary}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cerrar
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
