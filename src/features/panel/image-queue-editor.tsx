'use client';

import { useId, useState } from 'react';

import {
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_CONTENT_TYPES,
  IMAGE_MAX_ACTIVE,
} from '@/lib/api/image-limits';

import styles from './catalog.module.css';
import { coverCandidate, galleryEntries, type ImageIntent, type QueuedImage } from './image-queue';
import { IMAGE_ANCHORS } from './product-anchors';
import { Icon, SectionHeading } from './section-icon';

/**
 * Qué es el texto alternativo y cómo se escribe uno útil.
 *
 * Vive aquí en una constante porque lo usan los dos bloques y las dos pantallas, y porque es el
 * texto que decide si alguien escribe «imagen1.jpg» o algo que sirva.
 */
export const ALT_TEXT_HELP =
  'Describe la imagen para quien no puede verla: se lee en voz alta y se muestra si la imagen no carga. Ejemplo: «Clóset Vitria en madera, visto de frente con puertas abiertas».';

/**
 * La zona de selección, compartida por Portada y Galería y por las dos pantallas.
 *
 * Soltar archivos usa exactamente la misma puerta que elegirlos: `onFiles` recibe el mismo
 * `FileList`, así que los límites y las validaciones son los de siempre. Arrastrar es otra forma
 * de abrir el selector, no otro camino con sus propias reglas.
 */
export function ImageDropzone({
  title,
  buttonLabel,
  hint,
  multiple,
  disabled,
  onFiles,
  children,
}: {
  readonly title: string;
  readonly buttonLabel: string;
  readonly hint?: string;
  readonly multiple: boolean;
  readonly disabled: boolean;
  readonly onFiles: (files: FileList) => void;
  readonly children?: React.ReactNode;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    if (disabled) return;

    const { files } = event.dataTransfer;

    if (files.length > 0) onFiles(files);
  }

  return (
    <div
      className={dragging ? styles.dropzoneActive : styles.dropzone}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();

        if (!disabled) setDragging(true);
      }}
      onDrop={handleDrop}
    >
      <span aria-hidden="true" className={styles.dropzoneIcon}>
        <Icon name="imagenes" />
      </span>
      <p className={styles.dropzoneTitle}>{title}</p>
      {/*
       * El control nativo no se ve —«Choose Files / No file chosen» no dice nada y no se puede dar
       * estilo— pero sigue siendo el mismo `input`: enfocable con el tabulador y conectado a su
       * etiqueta, que hace de botón.
       */}
      <label className={disabled ? styles.uploadButtonDisabled : styles.uploadButton}>
        {buttonLabel}
        <input
          accept={IMAGE_CONTENT_TYPES.join(',')}
          className="sr-only"
          disabled={disabled}
          id={inputId}
          {...(multiple ? { multiple: true } : {})}
          onChange={(event) => {
            const { files } = event.target;

            if (files !== null && files.length > 0) onFiles(files);

            // Permite volver a elegir el mismo archivo tras quitarlo.
            event.target.value = '';
          }}
          type="file"
        />
      </label>
      {hint === undefined ? null : <p className={styles.dropzoneHint}>{hint}</p>}
      {children}
    </div>
  );
}

/** «7 de 10 imágenes activas», contando la portada. El contrato tope en 10. */
export function ImageCounter({ active }: { readonly active: number }) {
  return (
    <p className={styles.hint}>
      {active} de {IMAGE_MAX_ACTIVE} imágenes activas, contando la portada.
    </p>
  );
}

/** Campo de texto alternativo de una entrada pendiente, con su error propio. */
export function AltTextField({
  value,
  entryId,
  disabled,
  onChange,
}: {
  readonly value: string;
  readonly entryId: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  const empty = value.trim().length === 0;

  return (
    <>
      <label className={styles.label} htmlFor={`alt-${entryId}`}>
        Texto alternativo *
      </label>
      <input
        className={empty ? styles.inputInvalid : styles.input}
        disabled={disabled}
        id={`alt-${entryId}`}
        maxLength={IMAGE_ALT_MAX_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Clóset Vitria en madera, visto de frente con puertas abiertas"
        required
        type="text"
        value={value}
        {...(empty ? { 'aria-invalid': true } : {})}
      />
      {/*
       * El error se pinta **junto a su entrada**, no en una lista general al final: con cinco
       * archivos pendientes, «falta un texto alternativo» no dice a cuál le falta.
       */}
      {empty ? (
        <p className={styles.fieldError} id={`alt-error-${entryId}`} role="alert">
          Falta el texto alternativo de este archivo.
        </p>
      ) : null}
    </>
  );
}

/** Tamaño legible del archivo. Los bytes en crudo no le dicen nada a nadie. */
export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Estado de una entrada dentro del lote.
 *
 * `awaitingCover` no es un adorno: significa que el archivo **ya está en el backend** y que lo que
 * falta es marcarlo como principal. Es un estado distinto de «subida» porque la operación que se
 * pidió —cambiar la portada— todavía no ha terminado, y distinto de «falló» porque el archivo no
 * hay que volver a mandarlo.
 */
export type EntryState = 'pending' | 'uploading' | 'uploaded' | 'awaitingCover' | 'failed';

const STATE_LABELS: Readonly<Record<EntryState, string>> = {
  pending: 'Pendiente',
  uploading: 'Subiendo…',
  uploaded: 'Subida',
  awaitingCover: 'Subida; falta marcarla como portada',
  failed: 'Falló',
};

export function describeEntryState(state: EntryState): string {
  return STATE_LABELS[state];
}

export type EntryActions = {
  readonly onRemove: (entryId: string) => void;
  readonly onMove: (entryId: string, direction: -1 | 1) => void;
  readonly onAlt: (entryId: string, value: string) => void;
  readonly onReplace: (entryId: string, file: File) => void;
  /**
   * Convertir en portada.
   *
   * `undefined` deshabilita el botón, y eso es lo que impide que una entrada elegida desde la
   * galería ascienda sin que alguien lo pida explícitamente.
   */
  readonly onCover?: ((entryId: string) => void) | undefined;
};

/**
 * Una entrada pendiente de la cola: vista previa, nombre, tamaño, texto alternativo y acciones.
 *
 * La usan el alta y la edición sin diferencias. Mientras una entrada está subiendo o ya subió, sus
 * controles desaparecen: mover o reemplazar algo que ya está en el backend solo cambiaría la lista
 * local y haría que la pantalla mintiera.
 */
export function PendingEntryCard({
  entry,
  state,
  isCover,
  disabled,
  canMoveUp,
  canMoveDown,
  error,
  actions,
}: {
  readonly entry: QueuedImage;
  readonly state: EntryState;
  readonly isCover: boolean;
  readonly disabled: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  /** Mensaje del fallo de **este** archivo, si lo hubo. */
  readonly error?: string | undefined;
  readonly actions: EntryActions;
}) {
  const settled = state === 'uploaded' || state === 'uploading' || state === 'awaitingCover';

  return (
    <li className={isCover ? styles.queueItemPrimary : styles.queueItem}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={entry.altText === '' ? 'Vista previa sin describir' : entry.altText}
        className={styles.queueThumb}
        src={entry.previewUrl}
      />
      <div className={styles.queueBody}>
        <p className={styles.queueFileName}>
          {entry.file.name}
          {isCover ? ' · Portada' : ''}
        </p>
        <p className={styles.hint}>
          {fileSizeLabel(entry.file.size)} · {describeEntryState(state)}
        </p>

        {error === undefined ? null : (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        )}

        {settled ? (
          <>
            <p className={styles.imageAlt}>{entry.altText}</p>
            <p className={styles.hint}>
              {state === 'awaitingCover'
                ? 'El archivo ya está subido. Reintentar no vuelve a mandarlo: solo lo marca como portada.'
                : state === 'uploaded'
                  ? 'Ya está en el producto. Para cambiarla, edítala en la galería.'
                  : 'Subiendo este archivo…'}
            </p>
          </>
        ) : (
          <>
            <AltTextField
              disabled={disabled}
              entryId={entry.entryId}
              onChange={(value) => actions.onAlt(entry.entryId, value)}
              value={entry.altText}
            />
            <div className={styles.imageTileActions}>
              <button
                className={styles.iconButton}
                disabled={disabled || !canMoveUp}
                onClick={() => actions.onMove(entry.entryId, -1)}
                type="button"
              >
                ← Subir
              </button>
              <button
                className={styles.iconButton}
                disabled={disabled || !canMoveDown}
                onClick={() => actions.onMove(entry.entryId, 1)}
                type="button"
              >
                Bajar →
              </button>
              {actions.onCover === undefined ? null : (
                <button
                  className={styles.iconButton}
                  disabled={disabled || isCover}
                  onClick={() => actions.onCover?.(entry.entryId)}
                  type="button"
                >
                  Convertir en portada
                </button>
              )}
              <label className={styles.iconButton}>
                Cambiar archivo
                <input
                  accept={IMAGE_CONTENT_TYPES.join(',')}
                  // `sr-only` en vez de `hidden`: un input con `hidden` no se puede enfocar, y
                  // entonces «Cambiar archivo» solo funcionaría con ratón.
                  className="sr-only"
                  disabled={disabled}
                  onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (file !== undefined) actions.onReplace(entry.entryId, file);

                    event.target.value = '';
                  }}
                  type="file"
                />
              </label>
              <button
                className={styles.iconButton}
                disabled={disabled}
                onClick={() => actions.onRemove(entry.entryId)}
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
}

/**
 * La lista de entradas pendientes. Compartida por las dos pantallas.
 *
 * El orden de la lista es el orden en que se subirán, y por eso se puede cambiar: la posición de
 * una imagen en la tienda sale de ahí.
 */
export function PendingQueueList({
  queue,
  coverEntryId,
  disabled,
  states,
  errors,
  lockedIds,
  actions,
}: {
  readonly queue: readonly QueuedImage[];
  readonly coverEntryId: string | null;
  readonly disabled: boolean;
  readonly states?: Readonly<Record<string, EntryState>> | undefined;
  readonly errors?: Readonly<Record<string, string>> | undefined;
  readonly lockedIds: readonly string[];
  readonly actions: EntryActions;
}) {
  return (
    <ul className={styles.queueList}>
      {queue.map((entry, index) => {
        const isLocked = lockedIds.includes(entry.entryId);
        const previous = queue[index - 1];
        const next = queue[index + 1];

        return (
          <PendingEntryCard
            actions={actions}
            canMoveDown={!isLocked && next !== undefined && !lockedIds.includes(next.entryId)}
            canMoveUp={!isLocked && previous !== undefined && !lockedIds.includes(previous.entryId)}
            disabled={disabled}
            entry={entry}
            error={errors?.[entry.entryId]}
            isCover={entry.entryId === coverEntryId}
            key={entry.entryId}
            state={states?.[entry.entryId] ?? (isLocked ? 'uploaded' : 'pending')}
          />
        );
      })}
    </ul>
  );
}

/**
 * Portada y Galería de la pantalla de **alta**, donde todo vive todavía en el navegador.
 *
 * Los dos bloques están separados a propósito y no son dos listas del mismo montón: la portada es
 * la primera imagen que se ve en la tienda y la galería es el resto. Mientras no haya portada, la
 * galería no admite archivos —no porque falte sitio, sino porque el backend marca principal a la
 * primera imagen que recibe, y entonces «Agregar imágenes a la galería» habría elegido la portada
 * sin decirlo—.
 */
export function ImageQueueEditor({
  queue,
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
  readonly disabled: boolean;
  /** Entradas ya subidas al backend: se muestran, pero no se pueden tocar desde aquí. */
  readonly lockedIds: readonly string[];
  /** Tras crear el producto ya no se añaden imágenes aquí; se añaden desde su detalle. */
  readonly canAdd: boolean;
  readonly onAdd: (files: FileList, intent: ImageIntent) => void;
  readonly onRemove: (entryId: string) => void;
  readonly onMove: (entryId: string, direction: -1 | 1) => void;
  readonly onAlt: (entryId: string, value: string) => void;
  readonly onPrimary: (entryId: string) => void;
  readonly onReplace: (entryId: string, file: File) => void;
}) {
  const atLimit = queue.length >= IMAGE_MAX_ACTIVE;
  const addDisabled = disabled || atLimit || !canAdd;
  /*
   * La portada sale de la **intención** de la entrada, no de su posición ni de un identificador
   * suelto. El alta sigue mandando `primaryEntryId` a su flujo, pero lo **deriva** de la intención
   * —`resolvePrimary`—: así una imagen elegida en la galería no puede acabar de portada porque
   * resulte ser la primera de la lista.
   */
  const cover = coverCandidate(queue);
  const gallery = galleryEntries(queue);
  const actions: EntryActions = {
    onRemove,
    onMove,
    onAlt,
    onReplace,
    onCover: onPrimary,
  };

  return (
    <div className={styles.imageSections}>
      <section className={styles.card} id={IMAGE_ANCHORS.portada}>
        <div className={styles.cardPad}>
          <SectionHeading
            hint="Es la primera imagen que aparece en la tienda y en la ficha."
            icon="imagenes"
            title="Portada"
          />

          {cover === null ? (
            <ImageDropzone
              buttonLabel="Agregar portada"
              disabled={addDisabled}
              hint="Una sola imagen. JPG, PNG o WebP · 10 MB como máximo."
              multiple={false}
              onFiles={(files) => onAdd(files, 'cover')}
              title="Elige la imagen que abrirá la ficha"
            />
          ) : (
            <>
              <ul className={styles.queueList}>
                <PendingEntryCard
                  actions={{ ...actions, onCover: undefined }}
                  canMoveDown={false}
                  canMoveUp={false}
                  disabled={disabled}
                  entry={cover}
                  isCover
                  state={lockedIds.includes(cover.entryId) ? 'uploaded' : 'pending'}
                />
              </ul>
              <p className={styles.hint}>
                Para cambiarla, usa «Cambiar archivo» aquí arriba o pulsa «Convertir en portada» en
                cualquier imagen de la galería. La anterior no se borra: pasa a la galería.
              </p>
            </>
          )}
        </div>
      </section>

      <section className={styles.card} id={IMAGE_ANCHORS.galeria}>
        <div className={styles.cardPad}>
          <SectionHeading
            hint="Las demás imágenes del producto, en el orden en que se verán."
            icon="imagenes"
            title="Galería"
          />

          {cover === null ? (
            <p className={styles.notice}>
              Agrega primero la portada. La galería son las imágenes que acompañan a esa primera, y
              elegirlas antes decidiría la portada sin que lo hayas dicho.
            </p>
          ) : (
            <ImageDropzone
              buttonLabel="Agregar imágenes a la galería"
              disabled={addDisabled}
              hint={`JPG, PNG o WebP · 10 MB por imagen${
                atLimit ? ` · has llegado al límite de ${IMAGE_MAX_ACTIVE}` : ''
              }`}
              multiple
              onFiles={(files) => onAdd(files, 'gallery')}
              title="Arrastra y suelta varias imágenes aquí"
            >
              {canAdd ? null : (
                <p className={styles.dropzoneHint}>
                  El producto ya está creado: las imágenes nuevas se añaden desde su detalle.
                </p>
              )}
            </ImageDropzone>
          )}

          <ImageCounter active={queue.length} />
          <p className={styles.hint}>{ALT_TEXT_HELP}</p>

          {gallery.length === 0 ? (
            <p className={styles.hint}>
              {cover === null
                ? 'Todavía no has elegido ninguna imagen.'
                : 'Por ahora solo hay portada. Las imágenes son opcionales para publicar.'}
            </p>
          ) : (
            <PendingQueueList
              actions={actions}
              coverEntryId={cover?.entryId ?? null}
              disabled={disabled}
              lockedIds={lockedIds}
              queue={gallery}
            />
          )}

          <p className={styles.inlineNote}>
            Al guardar, las imágenes quedan en una URL pública —también en borrador y después de
            archivarlas—. No subas nada que deba permanecer privado.
          </p>
        </div>
      </section>
    </div>
  );
}
