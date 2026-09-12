import styles from '@/features/panel/catalog.module.css';

/**
 * Estado de carga de las pantallas del panel.
 *
 * Cada página se renderiza en el servidor y llama al backend, así que entre la navegación y los
 * datos hay una espera real. Esto la hace visible en vez de dejar la pantalla anterior congelada.
 *
 * No dibuja un esqueleto con filas falsas: fingir contenido que todavía no existe es la misma
 * mentira que inventar datos, solo que más breve.
 */
export default function PanelLoading() {
  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <div className={styles.cardPad}>
          <p aria-live="polite" className={styles.loading} role="status">
            Cargando…
          </p>
        </div>
      </section>
    </div>
  );
}
