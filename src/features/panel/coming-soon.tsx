import styles from './catalog.module.css';
import { Icon, type IconName } from './section-icon';

/**
 * Sección anunciada y todavía sin contrato.
 *
 * Enseña de qué se ocupará y dice con todas las letras que aún no está conectada. **No** dibuja
 * importes en cero, ni contadores, ni gráficas vacías: un `$ 0` se lee como un dato, y aquí no hay
 * ninguno que leer hasta que el backend publique sus operaciones.
 */
export function ComingSoon({
  icon,
  title,
  children,
  bullets,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly children: React.ReactNode;
  /** Lo que la sección hará cuando exista. Descripciones, nunca cifras. */
  readonly bullets: readonly string[];
}) {
  return (
    <section className={styles.card}>
      <div className={styles.comingSoon}>
        <span aria-hidden="true" className={styles.comingSoonIcon}>
          <Icon name={icon} />
        </span>
        <p className={styles.comingSoonBadge}>Próximamente</p>
        <h2 className={styles.comingSoonTitle}>{title}</h2>
        <p className={styles.comingSoonText}>{children}</p>
        <ul className={styles.comingSoonList}>
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
