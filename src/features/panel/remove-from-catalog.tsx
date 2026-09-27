'use client';

import { createContext, useContext, useId, useRef, useState, type ReactNode } from 'react';

import { useRouter } from 'next/navigation';

import { createOperationLock, acquire, release } from '@/features/auth/operation-lock';
import type { AdminProduct } from '@/lib/api/catalog';

import styles from './catalog.module.css';
import { transitionProduct } from './catalog-client';
import { describeCatalogFailure } from './catalog-errors';

/**
 * «Eliminar del catálogo».
 *
 * Es el **archivado** del contrato (`POST /v1/admin/products/{id}/archive`), con otro nombre para
 * que se encuentre: no hay borrado físico. El producto deja de verse y de poder comprarse, y se
 * conservan pedidos, auditoría, SKU, slug e imágenes. Nunca se presenta como un borrado definitivo.
 *
 * Exige `expectedVersion`, confirmación explícita y un candado **síncrono** tomado antes del primer
 * `await`: un doble clic no manda dos archivados. Solo se monta con `products.archive`; el backend
 * rechaza igualmente a un `moderator`.
 */
export const REMOVE_FROM_CATALOG_TEXT =
  'Este producto dejará de aparecer y de poder comprarse inmediatamente. Los pedidos anteriores, la auditoría, el SKU y el enlace interno se conservarán.';

export const REMOVED_NOTICE = 'Producto eliminado del catálogo';

type NoticeSink = (message: string) => void;

const RemovalNotices = createContext<NoticeSink | null>(null);

/**
 * Región de avisos del listado.
 *
 * Vive por encima de la tabla porque, al refrescar, la fila del producto archivado desaparece del
 * listado normal y con ella cualquier aviso que llevara dentro.
 */
export function RemovalNoticeProvider({ children }: { readonly children: ReactNode }) {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <RemovalNotices.Provider value={setNotice}>
      <div aria-live="polite">
        {notice === null ? null : <p className={styles.notice}>{notice}</p>}
      </div>
      {children}
    </RemovalNotices.Provider>
  );
}

export function RemoveFromCatalogButton({
  product,
  onRemoved,
  onFailure,
  variant = 'row',
}: {
  readonly product: Pick<AdminProduct, 'id' | 'name' | 'version' | 'status'>;
  /** El detalle aplica el producto devuelto; el listado solo refresca. */
  readonly onRemoved?: (updated: AdminProduct) => void;
  readonly onFailure?: (message: string, conflict: boolean) => void;
  readonly variant?: 'row' | 'danger';
}) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const lock = useRef(createOperationLock());
  const notify = useContext(RemovalNotices);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (product.status === 'archived') return null;

  async function confirm() {
    if (!acquire(lock.current)) return;

    setBusy(true);
    setFailure(null);

    const result = await transitionProduct(product.id, 'archive', product.version);

    release(lock.current);
    setBusy(false);

    if (!result.ok) {
      const message = describeCatalogFailure(result.code, result.reference);
      const conflict = result.code === 'version_conflict';

      setFailure(message);
      onFailure?.(message, conflict);
      if (conflict) router.refresh();

      return;
    }

    dialog.current?.close();
    notify?.(REMOVED_NOTICE);
    onRemoved?.(result.data);
    router.refresh();
  }

  return (
    <>
      <button
        className={variant === 'danger' ? styles.buttonDanger : styles.rowAction}
        disabled={busy}
        onClick={() => {
          setFailure(null);
          dialog.current?.showModal();
        }}
        type="button"
      >
        Eliminar del catálogo
      </button>
      <dialog
        aria-describedby={`${id}-text`}
        aria-labelledby={`${id}-title`}
        className={styles.previewDialog}
        ref={dialog}
      >
        <div className={styles.previewDialogBody}>
          <h2 className={styles.sectionTitle} id={`${id}-title`}>
            ¿Eliminar «{product.name}» del catálogo?
          </h2>
          <p className={styles.pageLead} id={`${id}-text`}>
            {REMOVE_FROM_CATALOG_TEXT}
          </p>
          <p className={styles.hint}>
            No es un borrado permanente: lo encontrarás en «Eliminados (archivados)».
          </p>
          <div aria-live="assertive">
            {failure === null ? null : (
              <p className={styles.error} role="alert">
                {failure}
              </p>
            )}
          </div>
          <div className={styles.actions}>
            <button
              className={styles.buttonDanger}
              disabled={busy}
              onClick={() => void confirm()}
              type="button"
            >
              {busy ? 'Eliminando del catálogo…' : 'Eliminar del catálogo'}
            </button>
            <button
              autoFocus
              className={styles.buttonSecondary}
              disabled={busy}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
