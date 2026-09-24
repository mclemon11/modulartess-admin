import styles from '@/features/panel/catalog.module.css';

/** Mientras se lee el catálogo. No pinta filas de relleno: no hay datos que simular. */
export default function CategoriesLoading() {
  return (
    <div className={styles.page}>
      <p aria-live="polite" className={styles.hint} role="status">
        Cargando categorías…
      </p>
    </div>
  );
}
