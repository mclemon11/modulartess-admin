import catalog from '@/features/panel/catalog.module.css';
import type { ShippingZone } from '@/lib/api/shipping';

import { COPY_STATE_LABELS, ZONE_STATUS_LABELS } from './shipping-labels';
import styles from './shipping.module.css';

/**
 * Estado comercial y estado de copia de una zona.
 *
 * Son dos ejes distintos en el contrato —`status` y `copy.state`— y se pintan como dos insignias.
 * El texto siempre está escrito: el color refuerza, nunca sustituye.
 */
const STATUS_CLASS = {
  draft: catalog.badgeDraft,
  active: catalog.badgeActive,
  archived: catalog.badgeArchived,
} as const;

const DOT_CLASS = {
  draft: catalog.dotDraft,
  active: catalog.dotActive,
  archived: catalog.dotArchived,
} as const;

export function ZoneStatusBadge({ status }: { readonly status: ShippingZone['status'] }) {
  return (
    <span className={STATUS_CLASS[status]}>
      <span aria-hidden="true" className={DOT_CLASS[status]} />
      {ZONE_STATUS_LABELS[status]}
    </span>
  );
}

const COPY_CLASS = {
  copying: styles.badgeCopying,
  failed: styles.badgeFailed,
  discarded: styles.badgeDiscarded,
} as const;

/** Solo se pinta cuando la copia **no** está lista: una zona `ready` es una zona normal. */
export function CopyBadge({ copy }: { readonly copy: ShippingZone['copy'] }) {
  if (copy.state === 'ready') return null;

  return (
    <span className={COPY_CLASS[copy.state]}>
      <span aria-hidden="true">
        {copy.state === 'failed' ? '!' : copy.state === 'copying' ? '…' : '×'}
      </span>
      {COPY_STATE_LABELS[copy.state]}
    </span>
  );
}

export function ZoneBadges({ zone }: { readonly zone: Pick<ShippingZone, 'status' | 'copy'> }) {
  return (
    <span className={styles.badges}>
      <ZoneStatusBadge status={zone.status} />
      <CopyBadge copy={zone.copy} />
    </span>
  );
}
