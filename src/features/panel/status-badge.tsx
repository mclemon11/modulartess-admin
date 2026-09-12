import styles from './catalog.module.css';
import { describeStatus, statusVariant } from './product-status';

const CLASS_BY_VARIANT = {
  draft: styles.badgeDraft,
  active: styles.badgeActive,
  archived: styles.badgeArchived,
  unknown: styles.badgeUnknown,
} as const;

const DOT_BY_VARIANT = {
  draft: styles.dotDraft,
  active: styles.dotActive,
  archived: styles.dotArchived,
  unknown: styles.dotUnknown,
} as const;

/**
 * Badge de estado: pastilla clara con punto de color, como en las referencias.
 *
 * El punto es decorativo y va con `aria-hidden`: el estado se lee en el texto, que es lo que
 * anuncia un lector de pantalla. El color por sí solo nunca es el único portador del significado.
 */
export function StatusBadge({ status }: { readonly status: string }) {
  const variant = statusVariant(status);

  return (
    <span className={CLASS_BY_VARIANT[variant]}>
      <span aria-hidden="true" className={DOT_BY_VARIANT[variant]} />
      {describeStatus(status)}
    </span>
  );
}
