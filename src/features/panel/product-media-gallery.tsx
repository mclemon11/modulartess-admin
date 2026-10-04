'use client';

import { useId, useRef, useState } from 'react';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';
import type { AdminProduct, AdminProductVideo } from '@/lib/api/catalog';
import { IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES } from '@/lib/api/image-limits';
import {
  VIDEO_MAX_ACTIVE,
  VIDEO_MAX_BYTES,
  VIDEO_TITLE_MAX_LENGTH,
  checkVideoFile,
  formatBytes,
  formatDuration,
} from '@/lib/api/video-limits';

import styles from './catalog.module.css';
import {
  deleteProductVideo,
  reorderProductMedia,
  updateProductVideo,
  uploadProductVideo,
  uploadProductVideoPoster,
  type MutationResult,
} from './catalog-client';
import { VIDEO_REASON_MESSAGES, describeCatalogFailure } from './catalog-errors';
import { moveMedia, galleryItems, type GalleryItem } from './media-gallery-order';
import { IMAGE_ANCHORS } from './product-anchors';
import { SectionHeading } from './section-icon';

/**
 * Galería multimedia de un producto que ya existe (ADR 0026 del backend).
 *
 * Es **el orden en que la tienda enseña** imágenes y videos, en una sola lista. Las imágenes se
 * siguen subiendo en «Portada» y «Galería de imágenes» —ese flujo no cambia—; aquí se suben los
 * videos MP4, su póster y su título, y se ordena todo junto. La portada sigue siendo una imagen
 * aunque un video vaya primero: es la que usan los listados, los enlaces compartidos y el carrito.
 *
 * Cada cambio es una llamada con `expectedVersion`, en serie, con el candado compartido: dos a la
 * vez partirían de la misma versión y la segunda chocaría.
 */
export function ProductMediaGallery({
  product,
  canEdit,
  canArchive,
  onProduct,
}: {
  readonly product: AdminProduct;
  /** Subir video y póster, cambiar el título y ordenar. */
  readonly canEdit: boolean;
  /** Eliminar un video: como archivar una imagen, `moderator` no lo tiene. */
  readonly canArchive: boolean;
  readonly onProduct: (next: AdminProduct) => void;
}) {
  const lock = useRef(createOperationLock());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const items = galleryItems(product);
  const activeVideos = product.videos.filter((video) => video.status === 'active');
  const pendingRemoval = product.videos.filter(
    (video) => video.status === 'archived' && video.storageState === 'removal_pending',
  );

  function begin(): boolean {
    if (!acquire(lock.current)) return false;

    setBusy(true);
    setFailure(null);
    setNotice(null);

    return true;
  }

  /** Aplica el resultado; devuelve si fue bien para que quien llama limpie su formulario. */
  function settle<T extends { product: AdminProduct }>(
    result: MutationResult<T>,
    message: (data: T) => string,
  ): boolean {
    release(lock.current);
    setBusy(false);

    if (result.ok) {
      setConflict(false);
      onProduct(result.data.product);
      setNotice(message(result.data));

      return true;
    }

    setConflict(result.code === 'version_conflict');
    setFailure(describeCatalogFailure(result.code, result.reference));

    return false;
  }

  async function move(item: GalleryItem, delta: -1 | 1) {
    const next = moveMedia(items, item.id, delta);

    if (next === null || !begin()) return;

    settle(
      await reorderProductMedia(product.id, product.version, next),
      () =>
        `Orden actualizado: «${item.label}» ahora es el ${next.indexOf(item.id) + 1} de ${next.length}.`,
    );
  }

  return (
    <section className={styles.card} id={IMAGE_ANCHORS.multimedia}>
      <div className={styles.cardPad}>
        <SectionHeading
          hint="Imágenes y videos en el orden en que se verán en la ficha de la tienda."
          icon="imagenes"
          title="Galería multimedia"
        />

        <div aria-live="assertive">
          {failure === null ? null : (
            <p className={styles.error} role="alert">
              {failure}{' '}
              {conflict
                ? 'Recarga el producto antes de volver a intentarlo: cambió mientras tanto.'
                : ''}
            </p>
          )}
        </div>
        <div aria-live="polite">
          {notice === null ? null : <p className={styles.notice}>{notice}</p>}
        </div>

        {items.length === 0 ? (
          <p className={styles.hint}>
            Todavía no hay imágenes ni videos. Las imágenes se suben en «Portada» y «Galería de
            imágenes»; los videos, aquí debajo.
          </p>
        ) : (
          <ol aria-label="Orden de la galería" className={styles.mediaList}>
            {items.map((item, index) => (
              <li className={styles.mediaItem} key={item.id}>
                <MediaThumb item={item} />
                <div className={styles.mediaBody}>
                  <p className={styles.mediaTitle}>
                    <span className={styles.mediaType}>
                      {item.kind === 'video' ? 'Video' : 'Imagen'}
                    </span>{' '}
                    {item.label}
                  </p>
                  <p className={styles.mediaMeta}>
                    Posición {index + 1} de {items.length}
                    {item.kind === 'image' && item.image.isPrimary ? ' · Portada' : ''}
                    {item.kind === 'video'
                      ? ` · ${formatBytes(item.video.sizeBytes)} · ${formatDuration(
                          item.video.durationSeconds,
                        )} · ${item.video.posterState === 'ready' ? 'Con póster' : 'Póster pendiente'}`
                      : ''}
                  </p>
                </div>
                {canEdit ? (
                  <div className={styles.imageTileActions}>
                    <button
                      aria-label={`Mover «${item.label}» antes`}
                      className={styles.iconButton}
                      disabled={busy || index === 0}
                      onClick={() => void move(item, -1)}
                      type="button"
                    >
                      ↑ Antes
                    </button>
                    <button
                      aria-label={`Mover «${item.label}» después`}
                      className={styles.iconButton}
                      disabled={busy || index === items.length - 1}
                      onClick={() => void move(item, 1)}
                      type="button"
                    >
                      ↓ Después
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        <h3 className={styles.sectionTitle}>
          Videos ({activeVideos.length} de {VIDEO_MAX_ACTIVE})
        </h3>
        <p className={styles.hint}>
          Solo MP4 de hasta {formatBytes(VIDEO_MAX_BYTES)}. Sin reproducción automática: en la
          tienda se ve el póster y el video carga al pulsarlo. Un video sin póster no se publica.
        </p>

        {canEdit ? (
          <VideoUploadForm
            atLimit={activeVideos.length >= VIDEO_MAX_ACTIVE}
            busy={busy}
            onUpload={async (form, key) => {
              if (!begin()) return 'Hay otra operación en curso. Espera a que termine.';
              const result = await uploadProductVideo(product.id, form, key);
              settle(result, (data) =>
                data.replayed
                  ? 'Ese video ya se había subido: no se duplicó.'
                  : 'Video subido. Falta su póster para que se publique.',
              );
              return result.ok ? null : describeCatalogFailure(result.code, result.reference);
            }}
            version={product.version}
          />
        ) : (
          <p className={styles.hint}>Tu rol no permite subir videos.</p>
        )}

        {activeVideos.length === 0 ? null : (
          <ul className={styles.videoList}>
            {activeVideos.map((video) => (
              <VideoCard
                busy={busy}
                canArchive={canArchive}
                canEdit={canEdit}
                key={`${video.id}:${video.version}`}
                onDelete={async () => {
                  if (!begin()) return false;
                  return settle(
                    await deleteProductVideo(product.id, video.id, product.version),
                    (data) =>
                      data.video.storageState === 'removal_pending'
                        ? 'Video eliminado de la tienda. Sus archivos no se pudieron borrar todavía; reintenta el borrado más tarde.'
                        : 'Video eliminado de la galería y de la tienda.',
                  );
                }}
                onPoster={async (form) => {
                  if (!begin()) return false;
                  return settle(
                    await uploadProductVideoPoster(product.id, video.id, form),
                    () => 'Póster guardado.',
                  );
                }}
                onTitle={async (title) => {
                  if (!begin()) return false;
                  return settle(
                    await updateProductVideo(product.id, video.id, {
                      expectedVersion: product.version,
                      title,
                    }),
                    () => 'Título del video actualizado.',
                  );
                }}
                version={product.version}
                video={video}
              />
            ))}
          </ul>
        )}

        {pendingRemoval.length === 0 || !canArchive ? null : (
          <>
            <h3 className={styles.sectionTitle}>Eliminados con borrado pendiente</h3>
            <p className={styles.hint}>
              Ya no están en la tienda, pero sus archivos siguen en el almacenamiento.
            </p>
            <ul className={styles.videoList}>
              {pendingRemoval.map((video) => (
                <li className={styles.imageTileArchived} key={video.id}>
                  <p className={styles.mediaTitle}>{video.title}</p>
                  <button
                    className={styles.iconButton}
                    disabled={busy}
                    onClick={() =>
                      void (async () => {
                        if (!begin()) return;
                        settle(
                          await deleteProductVideo(product.id, video.id, product.version),
                          (data) =>
                            data.video.storageState === 'removed'
                              ? 'Archivos del video borrados.'
                              : 'El almacenamiento sigue sin responder; vuelve a intentarlo más tarde.',
                        );
                      })()
                    }
                    type="button"
                  >
                    Reintentar borrado
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className={styles.inlineNote}>
          Los videos y pósteres quedan en una URL pública —también en borrador—. Al eliminar un
          video, sus archivos se borran.
        </p>
      </div>
    </section>
  );
}

/** Miniatura de un elemento: la imagen, o el póster del video con su marca de reproducción. */
function MediaThumb({ item }: { readonly item: GalleryItem }) {
  if (item.kind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- miniatura del bucket público
      <img alt="" className={styles.mediaThumb} src={item.image.publicUrl} />
    );
  }

  const poster = item.video.poster;

  return (
    <span className={styles.mediaThumbFrame}>
      {poster === null ? (
        // Sin póster no se inventa una miniatura: se dice que falta.
        <span className={styles.mediaThumbPending}>Póster pendiente</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura del bucket público
        <img alt="" className={styles.mediaThumb} src={poster.publicUrl} />
      )}
      <span aria-hidden="true" className={styles.playBadge}>
        ▶
      </span>
    </span>
  );
}

/**
 * Alta de un video. El formulario **no se pierde** si la subida falla: el archivo, el título y la
 * clave de idempotencia se conservan, así que reintentar no duplica nada. La clave se renueva solo
 * al elegir otro archivo.
 */
function VideoUploadForm({
  busy,
  atLimit,
  version,
  onUpload,
}: {
  readonly busy: boolean;
  readonly atLimit: boolean;
  readonly version: number;
  /** Devuelve el motivo del rechazo para pintarlo junto al formulario, o `null` si se subió. */
  readonly onUpload: (form: FormData, idempotencyKey: string) => Promise<string | null>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const trimmed = title.trim();

  function choose(next: File | null) {
    setProblem(null);
    setFile(null);
    setKey(null);

    if (next === null) return;

    const check = checkVideoFile(next);

    if (check !== null) {
      setProblem(VIDEO_REASON_MESSAGES[check] ?? 'Ese archivo no es un MP4 admitido.');
      if (input.current !== null) input.current.value = '';

      return;
    }

    setFile(next);
    setKey(crypto.randomUUID());
  }

  async function submit() {
    if (file === null || key === null) return;

    if (trimmed.length === 0) {
      setProblem(VIDEO_REASON_MESSAGES.video_title_required ?? null);

      return;
    }

    const form = new FormData();

    form.set('file', file, file.name);
    form.set('title', trimmed);
    form.set('expectedVersion', String(version));
    setUploading(true);

    const rejection = await onUpload(form, key);

    setUploading(false);

    if (rejection !== null) {
      // El archivo, el título y la clave se conservan: reintentar no duplica nada.
      setProblem(`${rejection} El archivo y el título siguen elegidos.`);
    } else {
      setFile(null);
      setKey(null);
      setTitle('');
      if (input.current !== null) input.current.value = '';
    }
  }

  return (
    <div className={styles.videoForm}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${id}-file`}>
          Archivo de video (MP4)
        </label>
        <input
          accept="video/mp4,.mp4"
          aria-describedby={`${id}-file-hint`}
          className={styles.input}
          disabled={busy || atLimit}
          id={`${id}-file`}
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
          ref={input}
          type="file"
        />
        <span className={styles.hint} id={`${id}-file-hint`}>
          {atLimit
            ? `Has llegado al máximo de ${VIDEO_MAX_ACTIVE} videos activos. Elimina alguno para subir otro.`
            : `MP4 (video/mp4), ${formatBytes(VIDEO_MAX_BYTES)} como máximo.`}
        </span>
        {file === null ? null : (
          <p className={styles.mediaMeta}>
            Elegido: {file.name} · {formatBytes(file.size)}
          </p>
        )}
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${id}-title`}>
          Título del video
        </label>
        <input
          aria-describedby={`${id}-title-hint`}
          className={styles.input}
          disabled={busy || atLimit}
          id={`${id}-title`}
          maxLength={VIDEO_TITLE_MAX_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          type="text"
          value={title}
        />
        <span className={styles.hint} id={`${id}-title-hint`}>
          Describe lo que muestra: es lo que leerán los lectores de pantalla.
        </span>
      </div>
      {problem === null ? null : (
        <p className={styles.fieldError} role="alert">
          {problem}
        </p>
      )}
      <div className={styles.batchBar}>
        <button
          className={styles.button}
          disabled={busy || atLimit || file === null || trimmed.length === 0}
          onClick={() => void submit()}
          type="button"
        >
          {uploading ? 'Subiendo video…' : 'Subir video'}
        </button>
        {uploading && file !== null ? (
          <p aria-live="polite" className={styles.batchProgress}>
            Subiendo {formatBytes(file.size)}. No cierres esta página.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Un video activo: vista previa, título, póster y eliminación con confirmación. */
function VideoCard({
  video,
  busy,
  canEdit,
  canArchive,
  version,
  onTitle,
  onPoster,
  onDelete,
}: {
  readonly video: AdminProductVideo;
  readonly busy: boolean;
  readonly canEdit: boolean;
  readonly canArchive: boolean;
  readonly version: number;
  readonly onTitle: (title: string) => Promise<boolean>;
  readonly onPoster: (form: FormData) => Promise<boolean>;
  readonly onDelete: () => Promise<boolean>;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const posterInput = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState(video.title);
  const [posterProblem, setPosterProblem] = useState<string | null>(null);
  const trimmed = title.trim();
  const dirty = trimmed.length > 0 && trimmed !== video.title;

  async function poster(file: File | null) {
    setPosterProblem(null);

    if (file === null) return;

    if (
      !(IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type) ||
      file.size === 0 ||
      file.size > IMAGE_MAX_BYTES
    ) {
      setPosterProblem(VIDEO_REASON_MESSAGES.poster_invalid ?? null);
      if (posterInput.current !== null) posterInput.current.value = '';

      return;
    }

    const form = new FormData();

    form.set('file', file, file.name);
    form.set('expectedVersion', String(version));
    await onPoster(form);
    if (posterInput.current !== null) posterInput.current.value = '';
  }

  return (
    <li className={styles.videoCard}>
      <div className={styles.videoPreviewFrame}>
        {/*
          Vista previa con los controles del navegador. Sin reproducción automática y con
          `preload="metadata"`: abrir la ficha no descarga el video entero.
        */}
        <video
          aria-label={`Vista previa: ${video.title}`}
          className={styles.videoPreview}
          controls
          playsInline
          poster={video.poster?.publicUrl}
          preload="metadata"
          src={video.publicUrl}
        />
      </div>
      <p className={styles.mediaMeta}>
        MP4 · {formatBytes(video.sizeBytes)} · {formatDuration(video.durationSeconds)}
      </p>
      <p className={video.posterState === 'ready' ? styles.posterReady : styles.posterPending}>
        {video.posterState === 'ready'
          ? 'Póster listo: el video se publica.'
          : 'Póster pendiente: el video no se publica hasta que lo subas.'}
      </p>

      {canEdit ? (
        <>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-poster`}>
              {video.poster === null ? 'Subir póster' : 'Cambiar póster'}
            </label>
            <input
              accept={IMAGE_CONTENT_TYPES.join(',')}
              aria-describedby={`${id}-poster-hint`}
              className={styles.input}
              disabled={busy}
              id={`${id}-poster`}
              onChange={(event) => void poster(event.target.files?.[0] ?? null)}
              ref={posterInput}
              type="file"
            />
            <span className={styles.hint} id={`${id}-poster-hint`}>
              JPG, PNG o WebP · 10 MB como máximo. Es la imagen que se ve antes de reproducir.
            </span>
            {posterProblem === null ? null : (
              <p className={styles.fieldError} role="alert">
                {posterProblem}
              </p>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-title`}>
              Título
            </label>
            <input
              className={trimmed.length === 0 ? styles.inputInvalid : styles.input}
              disabled={busy}
              id={`${id}-title`}
              maxLength={VIDEO_TITLE_MAX_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
              type="text"
              value={title}
            />
            {trimmed.length === 0 ? (
              <p className={styles.fieldError} role="alert">
                El título es obligatorio.
              </p>
            ) : null}
            <button
              className={styles.iconButton}
              disabled={busy || !dirty}
              onClick={() => void onTitle(trimmed)}
              type="button"
            >
              Guardar título
            </button>
          </div>
        </>
      ) : (
        <p className={styles.mediaTitle}>{video.title}</p>
      )}

      {canArchive ? (
        <>
          <button
            className={styles.buttonDanger}
            disabled={busy}
            onClick={() => dialog.current?.showModal()}
            type="button"
          >
            Eliminar video
          </button>
          <dialog
            aria-describedby={`${id}-delete-text`}
            aria-labelledby={`${id}-delete-title`}
            className={styles.previewDialog}
            ref={dialog}
          >
            <div className={styles.previewDialogBody}>
              <h2 className={styles.sectionTitle} id={`${id}-delete-title`}>
                ¿Eliminar el video «{video.title}»?
              </h2>
              <p className={styles.pageLead} id={`${id}-delete-text`}>
                Sale de la galería y de la tienda de inmediato, se desasocia de sus colores y sus
                archivos —video y póster— se borran. No se puede deshacer.
              </p>
              <div className={styles.actions}>
                <button
                  className={styles.buttonDanger}
                  disabled={busy}
                  onClick={() =>
                    void (async () => {
                      if (await onDelete()) dialog.current?.close();
                    })()
                  }
                  type="button"
                >
                  {busy ? 'Eliminando…' : 'Eliminar video'}
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
      ) : null}
    </li>
  );
}
