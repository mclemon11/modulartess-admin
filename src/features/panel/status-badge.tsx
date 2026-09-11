import styles from './catalog.module.css';
import { describeStatus, statusVariant } from './product-status';

const CLASS_BY_VARIANT = {
  draft: styles.badgeDraft,
  active: styles.badgeActive,
  archived: styles.badgeArchived,
  unknown: styles.badgeUnknown,
} as const;

export function StatusBadge({ status }: { readonly status: string }) {
  return <span className={CLASS_BY_VARIANT[statusVariant(status)]}>{describeStatus(status)}</span>;
}
