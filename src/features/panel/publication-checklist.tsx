import type { PublicationReadiness } from '@/lib/api/catalog';

import styles from './catalog.module.css';
import {
  describeReadiness,
  groupBySection,
  SECTION_IDS,
  SECTION_LABELS,
} from './publication-readiness';

/**
 * Lista de lo que falta para publicar.
 *
 * Todo lo que se pinta viene de `publicationReadiness`: el panel no evalúa ninguna regla de
 * publicación, solo traduce los códigos. Cada requisito enlaza con la sección de **esta misma
 * pantalla** donde se resuelve, para no obligar a buscarlo.
 *
 * Server Component: no tiene estado ni eventos. Lo usan el detalle y el alta.
 */
export function PublicationChecklist({
  readiness,
  /** `false` en el alta, donde las secciones existen pero el producto todavía no. */
  linkToSections = true,
}: {
  readonly readiness: PublicationReadiness;
  readonly linkToSections?: boolean;
}) {
  if (readiness.ready) {
    return (
      <div className={styles.readyBox}>
        <p className={styles.readyTitle}>Listo para publicar</p>
        <p className={styles.hint}>
          El backend no encuentra requisitos pendientes. Publicar sigue siendo una acción explícita.
        </p>
      </div>
    );
  }

  const groups = groupBySection(readiness);

  return (
    <div className={styles.pendingBox}>
      <p className={styles.pendingTitle}>{describeReadiness(readiness)}</p>
      {groups.map((group) => (
        <div className={styles.pendingGroup} key={group.section}>
          <p className={styles.pendingSection}>
            {linkToSections ? (
              <a className={styles.link} href={`#${SECTION_IDS[group.section]}`}>
                {SECTION_LABELS[group.section]}
              </a>
            ) : (
              SECTION_LABELS[group.section]
            )}
          </p>
          <ul className={styles.pendingList}>
            {group.items.map((item) => (
              <li key={item.title}>
                <span className={styles.pendingItemTitle}>{item.title}</span>
                <span className={styles.hint}>{item.hint}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
