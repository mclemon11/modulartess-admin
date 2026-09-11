'use client';

import { useId } from 'react';

import {
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_CONTENT_TYPES,
  IMAGE_MAX_ACTIVE,
} from '@/lib/api/image-limits';

import styles from './catalog.module.css';
import type { QueuedImage } from './image-queue';

/**
 * Editor de la cola local de imágenes.
 *
 * Todavía no hay nada en el bucket: son archivos elegidos en el navegador con su `object URL` de
 * vista previa. Nada se sube hasta que se pulsa «Crear producto».
 *
 * El orden se cambia con botones, no arrastrando: funcionan con teclado y lector de pantalla y no
 * añaden dependencias.
 */
export function ImageQueueEditor({
  queue,
  primaryEntryId,
  disabled,
  lockedIds,
  canAdd,
  onAdd,
  onRemove,
  onMove,
  onAlt,
  onPrimary,
  onReplace,
}: {
  readonly queue: readonly QueuedImage[];
  readonly primaryEntryId: string | null;
  readonly disabled: boolean;
  /** Entradas ya subidas al backend: se muestran, pero no se pueden tocar desde aquí. */
  readonly lockedIds: readonly string[];
  /** Tras crear el producto ya no se añaden imágenes aquí; se añaden desde su detalle. */
  readonly canAdd: boolean;
  readonly onAdd: (files: FileList) => void;
  readonly onRemove: (entryId: string) => void;
  readonly onMove: (entryId: string, direction: -1 | 1) => void;
  readonly onAlt: (entryId: string, value: string) => void;
  readonly onPrimary: (entryId: string) => void;
  readonly onReplace: (entryId: string, file: File) => void;
}) {
  const addId = useId();
  const atLimit = queue.length >= IMAGE_MAX_ACTIVE;
  const addDisabled = disabled || atLimit || !canAdd;

  return (
    <section className={styles.card}>
      <div className={styles.cardPad}>
        <h2 className={styles.sectionTitle}>Imágenes del producto</h2>
        <p className={styles.hint}>
          Se suben cuando pulses «Crear producto», una detrás de otra. Hasta {IMAGE_MAX_ACTIVE}{' '}
          imágenes, JPG, PNG o WebP, máximo 10 MB cada una.
        </p>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={addId}>
            Agregar imágenes
          </label>
          <input
            accept={IMAGE_CONTENT_TYPES.join(',')}
            className={styles.input}
            disabled={addDisabled}
            id={addId}
            multiple
            onChange={(event) => {
              const { files } = event.target;

              if (files !== null && files.length > 0) {
                onAdd(files);
              }

              // Permite volver a elegir el mismo archivo tras quitarlo.
              event.target.value = '';
            }}
            type="file"
          />
          {atLimit ? (
            <span className={styles.hint}>Has llegado al límite de {IMAGE_MAX_ACTIVE}.</span>
          ) : null}
          {canAdd ? null : (
            <span className={styles.hint}>
              El producto ya está creado: las imágenes nuevas se añaden desde su detalle.
            </span>
          )}
        </div>

        <p className={styles.error}>
          Las imágenes quedan en una URL pública desde que se suben, incluso con el producto en
          borrador y después de archivarlas. No subas nada que deba permanecer privado.
        </p>

        {queue.length === 0 ? (
          <p className={styles.hint}>Todavía no has elegido ninguna imagen.</p>
        ) : (
          <ul className={styles.queueList}>
            {queue.map((entry, index) => {
              const isPrimary = entry.entryId === primaryEntryId;
              const isUploaded = lockedIds.includes(entry.entryId);
              // Solo se mueve dentro del bloque pendiente: el orden de lo ya subido lo decide el
              // detalle del producto, no esta pantalla.
              const previous = queue[index - 1];
              const next = queue[index + 1];
              const canMoveUp =
                !isUploaded && previous !== undefined && !lockedIds.includes(previous.entryId);
              const canMoveDown =
                !isUploaded && next !== undefined && !lockedIds.includes(next.entryId);

              return (
                <li
                  className={isPrimary ? styles.queueItemPrimary : styles.queueItem}
                  key={entry.entryId}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={entry.altText === '' ? 'Vista previa sin describir' : entry.altText}
                    className={styles.queueThumb}
                    src={entry.previewUrl}
                  />
                  <div className={styles.queueBody}>
                    <p className={styles.queueFileName}>
                      {entry.file.name}
                      {isPrimary ? ' · Principal' : ''}
                      {isUploaded ? ' · Subida' : ''}
                    </p>
                    {isUploaded ? (
                      <>
                        <p className={styles.imageAlt}>{entry.altText}</p>
                        <p className={styles.hint}>
                          Ya está en el producto. Para cambiarla, ábrelo y edítala desde su detalle.
                        </p>
                      </>
                    ) : (
                      <>
                        <label className={styles.label} htmlFor={`alt-${entry.entryId}`}>
                          Texto alternativo *
                        </label>
                        <input
                          className={
                            entry.altText.trim().length === 0 ? styles.inputInvalid : styles.input
                          }
                          disabled={disabled}
                          id={`alt-${entry.entryId}`}
                          maxLength={IMAGE_ALT_MAX_LENGTH}
                          onChange={(event) => onAlt(entry.entryId, event.target.value)}
                          placeholder="Describe la imagen"
                          required
                          type="text"
                          value={entry.altText}
                          {...(entry.altText.trim().length === 0 ? { 'aria-invalid': true } : {})}
                        />
                        <div className={styles.imageTileActions}>
                          <button
                            className={styles.iconButton}
                            disabled={disabled || !canMoveUp}
                            onClick={() => onMove(entry.entryId, -1)}
                            type="button"
                          >
                            ← Subir
                          </button>
                          <button
                            className={styles.iconButton}
                            disabled={disabled || !canMoveDown}
                            onClick={() => onMove(entry.entryId, 1)}
                            type="button"
                          >
                            Bajar →
                          </button>
                          <button
                            className={styles.iconButton}
                            disabled={disabled || isPrimary}
                            onClick={() => onPrimary(entry.entryId)}
                            type="button"
                          >
                            Principal
                          </button>
                          <label className={styles.iconButton}>
                            Cambiar archivo
                            <input
                              accept={IMAGE_CONTENT_TYPES.join(',')}
                              disabled={disabled}
                              hidden
                              onChange={(event) => {
                                const file = event.target.files?.[0];

                                if (file !== undefined) {
                                  onReplace(entry.entryId, file);
                                }

                                event.target.value = '';
                              }}
                              type="file"
                            />
                          </label>
                          <button
                            className={styles.iconButton}
                            disabled={disabled}
                            onClick={() => onRemove(entry.entryId)}
                            type="button"
                          >
                            Quitar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
