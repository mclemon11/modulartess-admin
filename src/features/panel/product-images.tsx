'use client';

import { useId, useRef, useState } from 'react';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';
import type { AdminProduct, AdminProductImage } from '@/lib/api/catalog';
import {
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_CONTENT_TYPES,
  IMAGE_MAX_ACTIVE,
  IMAGE_MAX_BYTES,
} from '@/lib/api/image-limits';

import styles from './catalog.module.css';
import {
  archiveProductImage,
  updateProductImage,
  uploadProductImage,
  type MutationResult,
} from './catalog-client';
import { describeCatalogFailure } from './catalog-errors';

/**
 * Gestor de imágenes del producto.
 *
 * Sigue la referencia de creación/edición en lo que el contrato permite: rejilla de miniaturas,
 * marca de «Principal» y acciones por imagen. Lo que **no** está: la biblioteca de medios —no hay
 * endpoint— y el reordenar arrastrando.
 *
 * El orden se cambia con botones «Subir» y «Bajar» en vez de arrastrar: mueven la imagen a la
 * posición contigua enviando `position`, funcionan con teclado y lector de pantalla, y no exigen
 * una librería de drag-and-drop. Arrastrar puede añadirse después sobre el mismo `PATCH`.
 *
 * Archivar depende de un permiso distinto al de editar: es una transición de estado, no un cambio
 * de contenido, y `moderator` no la tiene.
 *
 * Cada subida genera su propia `Idempotency-Key` y la conserva mientras esa subida se reintente:
 * si la red falla después de que el objeto ya se creó, el backend responde `replayed` y no se
 * duplica.
 */
export function ProductImages({
  product,
  canEdit,
  canArchive,
  onProduct,
}: {
  readonly product: AdminProduct;
  /** Subir, cambiar el texto alternativo, reordenar y designar la principal. */
  readonly canEdit: boolean;
  /**
   * Archivar, que es una transición de estado y no una edición.
   *
   * Va por separado porque `moderator` puede editar imágenes pero no archivarlas: agruparlas bajo
   * un único permiso le mostraría una acción que el backend le rechazaría.
   */
  readonly canArchive: boolean;
  readonly onProduct: (next: AdminProduct) => void;
}) {
  const fileId = useId();
  const altId = useId();
  const lock = useRef(createOperationLock());
  const uploadKey = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = product.images
    .filter((image) => image.status === 'active')
    .sort((a, b) => a.position - b.position);
  const archived = product.images.filter((image) => image.status === 'archived');
  const atLimit = active.length >= IMAGE_MAX_ACTIVE;

  function begin(): boolean {
    if (!acquire(lock.current)) {
      return false;
    }

    setBusy(true);
    setFailure(null);
    setNotice(null);

    return true;
  }

  function settle<T extends { product: AdminProduct }>(
    result: MutationResult<T>,
    message: (data: T) => string,
  ) {
    release(lock.current);
    setBusy(false);

    if (result.ok) {
      onProduct(result.data.product);
      setNotice(message(result.data));

      return;
    }

    setFailure(describeCatalogFailure(result.code));
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!begin()) {
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    const altText = String(data.get('altText') ?? '').trim();

    if (!(file instanceof File) || file.size === 0) {
      release(lock.current);
      setBusy(false);
      setFailure('Selecciona un archivo de imagen.');

      return;
    }

    if (file.size > IMAGE_MAX_BYTES) {
      release(lock.current);
      setBusy(false);
      setFailure('La imagen supera los 10 MB que admite el backend.');

      return;
    }

    if (altText.length === 0) {
      release(lock.current);
      setBusy(false);
      setFailure('El texto alternativo es obligatorio.');

      return;
    }

    // Una clave por subida, conservada entre reintentos de esa misma subida.
    uploadKey.current ??= crypto.randomUUID();

    const payload = new FormData();

    payload.set('file', file, file.name);
    payload.set('altText', altText);
    payload.set('expectedVersion', String(product.version));

    const result = await uploadProductImage(product.id, payload, uploadKey.current);

    if (result.ok) {
      uploadKey.current = null;
      form.reset();
    }

    settle(result, (data) =>
      data.replayed ? 'Esa imagen ya se había subido; no se duplicó.' : 'Imagen subida.',
    );
  }

  async function patchImage(image: AdminProductImage, body: Record<string, unknown>, done: string) {
    if (!begin()) {
      return;
    }

    settle(
      await updateProductImage(product.id, image.id, {
        expectedVersion: product.version,
        ...body,
      }),
      () => done,
    );
  }

  async function handleArchive(image: AdminProductImage) {
    if (!begin()) {
      return;
    }

    settle(
      await archiveProductImage(product.id, image.id, product.version),
      () => 'Imagen archivada. El objeto sigue existiendo y su URL pública continúa activa.',
    );
  }

  return (
    <section className={styles.card}>
      <div className={styles.cardPad}>
        <h2 className={styles.sectionTitle}>Imágenes del producto</h2>

        <div aria-live="assertive">
          {failure === null ? null : (
            <p className={styles.error} role="alert">
              {failure}
            </p>
          )}
        </div>
        <div aria-live="polite">
          {notice === null ? null : <p className={styles.notice}>{notice}</p>}
        </div>

        {canEdit ? (
          <form onSubmit={handleUpload} ref={formRef}>
            <div className={styles.dropzone}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={fileId}>
                  Archivo de imagen
                </label>
                <input
                  accept={IMAGE_CONTENT_TYPES.join(',')}
                  className={styles.input}
                  disabled={busy || atLimit}
                  id={fileId}
                  name="file"
                  required
                  type="file"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={altId}>
                  Texto alternativo *
                </label>
                <input
                  className={styles.input}
                  disabled={busy || atLimit}
                  id={altId}
                  maxLength={IMAGE_ALT_MAX_LENGTH}
                  name="altText"
                  required
                  type="text"
                />
                <span className={styles.hint}>
                  Obligatorio. Describe la imagen para quien no puede verla.
                </span>
              </div>
              <button className={styles.button} disabled={busy || atLimit} type="submit">
                {busy ? 'Subiendo…' : 'Agregar imagen'}
              </button>
              <p className={styles.dropzoneHint}>
                JPG, PNG o WebP. Máximo 10 MB por imagen y {IMAGE_MAX_ACTIVE} imágenes activas.
                {atLimit ? ' Has llegado al límite: archiva alguna para subir otra.' : ''}
              </p>
            </div>
            <p className={styles.error}>
              Las imágenes quedan en una URL pública desde el momento en que se suben, incluso con
              el producto en borrador y después de archivarlas. No subas nada que deba permanecer
              privado.
            </p>
          </form>
        ) : null}

        {active.length === 0 ? (
          <p className={styles.hint}>Este producto todavía no tiene imágenes activas.</p>
        ) : (
          <ul className={styles.imageGrid}>
            {active.map((image, index) => (
              <li className={styles.imageTile} key={image.id}>
                <figure className={styles.imageTileFigure}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={image.altText} className={styles.imageTileImg} src={image.publicUrl} />
                  {image.isPrimary ? <span className={styles.primaryFlag}>Principal</span> : null}
                </figure>
                {canEdit ? (
                  <AltTextEditor
                    busy={busy}
                    image={image}
                    key={`${image.id}:${image.altText}`}
                    onSave={(altText) =>
                      void patchImage(image, { altText }, 'Texto alternativo actualizado.')
                    }
                  />
                ) : (
                  <p className={styles.imageAlt}>{image.altText}</p>
                )}
                {canEdit || canArchive ? (
                  <div className={styles.imageTileActions}>
                    <button
                      className={styles.iconButton}
                      disabled={busy || index === 0}
                      onClick={() =>
                        void patchImage(image, { position: index - 1 }, 'Orden actualizado.')
                      }
                      type="button"
                    >
                      ← Subir
                    </button>
                    <button
                      className={styles.iconButton}
                      disabled={busy || index === active.length - 1}
                      onClick={() =>
                        void patchImage(image, { position: index + 1 }, 'Orden actualizado.')
                      }
                      type="button"
                    >
                      Bajar →
                    </button>
                    <button
                      className={styles.iconButton}
                      disabled={busy || image.isPrimary}
                      onClick={() =>
                        void patchImage(image, { isPrimary: true }, 'Imagen principal actualizada.')
                      }
                      type="button"
                    >
                      Principal
                    </button>
                    {canArchive ? (
                      <button
                        className={styles.iconButton}
                        disabled={busy}
                        onClick={() => void handleArchive(image)}
                        type="button"
                      >
                        Archivar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {archived.length === 0 ? null : (
          <>
            <h3 className={styles.sectionTitle} style={{ marginTop: 'var(--space-lg)' }}>
              Archivadas ({archived.length})
            </h3>
            <p className={styles.hint}>
              Fuera de la tienda, pero el objeto no se borró: su URL pública sigue funcionando.
            </p>
            <ul className={styles.imageGrid}>
              {archived.map((image) => (
                <li className={styles.imageTileArchived} key={image.id}>
                  <figure className={styles.imageTileFigure}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={image.altText}
                      className={styles.imageTileImg}
                      src={image.publicUrl}
                    />
                  </figure>
                  <p className={styles.imageAlt}>{image.altText}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Edición del texto alternativo de una imagen ya subida.
 *
 * Se guarda con un botón explícito y no al perder el foco: cada guardado es un `PATCH` con
 * `expectedVersion`, y dispararlo por cada salida de foco gastaría llamadas y provocaría conflictos
 * al editar varias imágenes seguidas.
 *
 * Cuando el backend devuelve otro valor, quien lo usa cambia la `key` y React remonta el campo.
 * Es preferible a sincronizar con un efecto, que reintroduce el valor viejo durante un render.
 */
function AltTextEditor({
  image,
  busy,
  onSave,
}: {
  readonly image: AdminProductImage;
  readonly busy: boolean;
  readonly onSave: (altText: string) => void;
}) {
  const fieldId = useId();
  const [value, setValue] = useState(image.altText);
  const trimmed = value.trim();
  const dirty = trimmed !== image.altText && trimmed.length > 0;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        Texto alternativo
      </label>
      <input
        className={trimmed.length === 0 ? styles.inputInvalid : styles.input}
        disabled={busy}
        id={fieldId}
        maxLength={IMAGE_ALT_MAX_LENGTH}
        onChange={(event) => setValue(event.target.value)}
        type="text"
        value={value}
      />
      <button
        className={styles.iconButton}
        disabled={busy || !dirty}
        onClick={() => onSave(trimmed)}
        type="button"
      >
        Guardar texto
      </button>
    </div>
  );
}
