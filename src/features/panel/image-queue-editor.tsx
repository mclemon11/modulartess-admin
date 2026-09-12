'use client';

import { useId, useState } from 'react';

import {
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_CONTENT_TYPES,
  IMAGE_MAX_ACTIVE,
} from '@/lib/api/image-limits';

import styles from './catalog.module.css';
import type { QueuedImage } from './image-queue';
import { Icon, SectionHeading } from './section-icon';

/**
 * Editor de la cola local de imágenes.
 *
 * Todavía no hay nada en el bucket: son archivos elegidos en el navegador con su `object URL` de
 * vista previa. Nada se sube hasta que se guarda.
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
  const [dragging, setDragging] = useState(false);
  const atLimit = queue.length >= IMAGE_MAX_ACTIVE;
  const addDisabled = disabled || atLimit || !canAdd;

  /**
   * Soltar archivos usa exactamente la misma puerta que elegirlos.
   *
   * `onAdd` recibe el mismo `FileList`, así que la cola, los límites y las validaciones son los de
   * siempre: arrastrar es otra forma de abrir el selector, no otro camino.
   */
  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    if (addDisabled) {
      return;
    }

    const { files } = event.dataTransfer;

    if (files.length > 0) {
      onAdd(files);
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.cardPad}>
        <SectionHeading
          hint="Se suben al guardar, una detrás de otra."
          icon="imagenes"
          title="Imágenes del producto"
        />
        <div
          className={dragging ? styles.dropzoneActive : styles.dropzone}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => {
            event.preventDefault();

            if (!addDisabled) {
              setDragging(true);
            }
          }}
          onDrop={handleDrop}
        >
          <span aria-hidden="true" className={styles.dropzoneIcon}>
            <Icon name="imagenes" />
          </span>
          <p className={styles.dropzoneTitle}>Arrastra y suelta las imágenes de tu producto aquí</p>
          {/*
           * El control nativo no se ve —«Choose Files / No file chosen» no dice nada— pero sigue
           * siendo el mismo input, enfocable y conectado a su etiqueta: el label es el botón.
           */}
          <label className={addDisabled ? styles.uploadButtonDisabled : styles.uploadButton}>
            Agregar imágenes
            <input
              accept={IMAGE_CONTENT_TYPES.join(',')}
              className="sr-only"
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
          </label>
          <p className={styles.dropzoneHint}>
            JPG, PNG o WebP · hasta {IMAGE_MAX_ACTIVE} imágenes · 10 MB por imagen
          </p>
          {atLimit ? (
            <p className={styles.dropzoneHint}>Has llegado al límite de {IMAGE_MAX_ACTIVE}.</p>
          ) : null}
          {canAdd ? null : (
            <p className={styles.dropzoneHint}>
              El producto ya está creado: las imágenes nuevas se añaden desde su detalle.
            </p>
          )}
        </div>

        <p className={styles.inlineNote}>
          Al guardar, las imágenes quedan en una URL pública —también en borrador y después de
          archivarlas—. No subas nada que deba permanecer privado.
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
                              // `sr-only` en vez de `hidden`: un input oculto con `hidden` no se
                              // puede enfocar, y entonces «Cambiar archivo» solo funciona con ratón.
                              className="sr-only"
                              disabled={disabled}
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
