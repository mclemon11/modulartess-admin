'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';
import type { AdminProduct, AdminProductImage } from '@/lib/api/catalog';
import { IMAGE_ALT_MAX_LENGTH, IMAGE_MAX_ACTIVE } from '@/lib/api/image-limits';

import styles from './catalog.module.css';
import {
  archiveProductImage,
  updateProductImage,
  uploadProductImage,
  type MutationResult,
} from './catalog-client';
import { describeCatalogFailure } from './catalog-errors';
import { runCoverFlow } from './cover-flow';
import { uploadQueueSequentially } from './create-product-flow';
import {
  addToQueue,
  coverCandidate,
  entriesMissingAltText,
  galleryEntries,
  markUploaded,
  pendingUploads,
  moveInQueue,
  removeFromQueue,
  replaceFile,
  setAltText,
  type ImageIntent,
  type QueuedImage,
} from './image-queue';
import {
  ALT_TEXT_HELP,
  ImageCounter,
  ImageDropzone,
  PendingEntryCard,
  PendingQueueList,
  type EntryActions,
  type EntryState,
} from './image-queue-editor';
import { IMAGE_ANCHORS } from './product-anchors';
import { SectionHeading } from './section-icon';

/**
 * Portada y Galería de un producto que ya existe.
 *
 * Los dos bloques están separados porque son dos decisiones distintas. La **portada** es la única
 * imagen con `isPrimary: true` y es la primera que se ve en la tienda; la **galería** es todo lo
 * demás. Mezclarlas en una sola rejilla con una estrellita encima convertía «cuál abre la ficha»
 * en algo que había que buscar.
 *
 * Las imágenes nuevas **no se suben al elegirlas**. Se acumulan en la misma cola local que usa el
 * alta —`image-queue.ts`— y se suben con un botón explícito, en serie y con la versión que
 * devolvió la anterior, usando el mismo lote que el alta: `uploadQueueSequentially`. No hay dos
 * implementaciones de cola, y no puede haberlas, porque cada subida incrementa la versión del
 * producto y dos a la vez se pisarían.
 *
 * Archivar depende de un permiso distinto al de editar: es una transición de estado, no un cambio
 * de contenido, y `moderator` no la tiene.
 */
export function ProductImages({
  product,
  canEdit,
  canArchive,
  onProduct,
}: {
  readonly product: AdminProduct;
  /** Subir, cambiar el texto alternativo, reordenar y designar la portada. */
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
  const lock = useRef(createOperationLock());

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Archivos elegidos y todavía no subidos. Es la misma cola local que usa el alta. */
  const [queue, setQueue] = useState<readonly QueuedImage[]>([]);
  /** Estado por entrada dentro del lote: pendiente, subiendo, subida o fallida. */
  const [states, setStates] = useState<Readonly<Record<string, EntryState>>>({});
  const [entryErrors, setEntryErrors] = useState<Readonly<Record<string, string>>>({});
  /** «Subiendo 2 de 5». `null` cuando no hay lote en marcha. */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [conflict, setConflict] = useState(false);

  /**
   * Las `object URL` vivas.
   *
   * Se revocan al quitar una entrada, al reemplazar su archivo, al completarse el lote y al
   * desmontar. Sin esto el navegador retiene cada archivo elegido durante toda la sesión, y con
   * diez fotos de 10 MB eso se nota.
   */
  const liveUrls = useRef(new Set<string>());

  useEffect(
    () => () => {
      for (const url of liveUrls.current) URL.revokeObjectURL(url);

      liveUrls.current.clear();
    },
    [],
  );

  function revoke(urls: readonly string[]) {
    for (const url of urls) {
      URL.revokeObjectURL(url);
      liveUrls.current.delete(url);
    }
  }

  const active = product.images
    .filter((image) => image.status === 'active')
    .sort((a, b) => a.position - b.position);
  const archived = product.images.filter((image) => image.status === 'archived');
  const cover = active.find((image) => image.isPrimary) ?? null;
  const gallery = active.filter((image) => !image.isPrimary);
  /*
   * Cuántas imágenes activas habrá: las que ya tiene el producto más las que **faltan por subir**.
   *
   * Lo pendiente no es `queue.length`. Una candidata a portada que ya se subió y espera su `PATCH`
   * sigue en la cola, pero el backend ya la devolvió dentro de `product.images`: sumarla otra vez
   * contaba una imagen dos veces, enseñaba un total mayor que el real y podía dar el límite por
   * alcanzado cuando todavía quedaba hueco.
   */
  const pending = pendingUploads(queue);
  const plannedActive = active.length + pending.length;
  const atLimit = plannedActive >= IMAGE_MAX_ACTIVE;
  const missingAlt = entriesMissingAltText(galleryEntries(queue));

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
      setConflict(false);
      onProduct(result.data.product);
      setNotice(message(result.data));

      return;
    }

    setConflict(result.code === 'version_conflict');
    setFailure(describeCatalogFailure(result.code));
  }

  /** Aplica un cambio de la cola, revocando lo que haya quedado huérfano. */
  function applyQueue(change: ReturnType<typeof addToQueue>) {
    revoke(change.revoked);
    setQueue(change.queue);

    if (change.rejected !== null) setFailure(change.rejected);
  }

  /**
   * Encola archivos. **No sube nada**: elegir no es subir.
   *
   * Cada entrada recibe aquí su identidad local, su `object URL` y su clave de idempotencia. La
   * clave se genera una sola vez y sobrevive al fallo: si el lote se detiene en el tercer archivo,
   * el reintento de ese archivo manda la misma clave.
   */
  function enqueue(files: FileList, intent: ImageIntent) {
    setFailure(null);

    let current = queue;

    for (const file of Array.from(files)) {
      // Sustituir la candidata a portada no ocupa un hueco nuevo: no cuenta contra el tope.
      const replacesCandidate = intent === 'cover' && coverCandidate(current) !== null;

      if (
        !replacesCandidate &&
        pendingUploads(current).length + active.length >= IMAGE_MAX_ACTIVE
      ) {
        setFailure(
          `El producto admite ${IMAGE_MAX_ACTIVE} imágenes activas y ya no caben más; archiva alguna primero.`,
        );
        break;
      }

      const previewUrl = URL.createObjectURL(file);

      liveUrls.current.add(previewUrl);

      const change = addToQueue(current, {
        file,
        previewUrl,
        entryId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        intent,
      });

      revoke(change.revoked);
      current = change.queue;

      if (change.rejected !== null) setFailure(change.rejected);

      // El bloque Portada admite una sola imagen: si alguien suelta varias, se queda la primera.
      if (intent === 'cover') break;
    }

    setQueue(current);
  }

  /**
   * Sube el archivo elegido como portada y lo deja como principal.
   *
   * Son dos llamadas —subir y marcar— y forman **una** operación: no se anuncia «Portada
   * actualizada» hasta que la respuesta del backend trae esa imagen con `isPrimary: true`.
   *
   * Es reanudable. Si la subida salió bien y falló el paso de marcarla, la entrada conserva su
   * `uploadedImageId` y el reintento entra directo al segundo paso: el archivo ya está en el
   * bucket y volver a mandarlo crearía una imagen de más.
   */
  async function handleCover() {
    const candidate = coverCandidate(queue);

    if (candidate === null) return;

    if (candidate.altText.trim().length === 0) {
      setFailure('La portada necesita su texto alternativo antes de subirse.');

      return;
    }

    if (!begin()) {
      return;
    }

    setEntryErrors({});
    setStates({
      [candidate.entryId]: candidate.uploadedImageId === null ? 'uploading' : 'awaitingCover',
    });

    const outcome = await runCoverFlow(product, candidate.uploadedImageId, {
      upload: async ({ expectedVersion }) => {
        const form = new FormData();

        form.set('file', candidate.file, candidate.file.name);
        form.set('altText', candidate.altText.trim());
        form.set('expectedVersion', String(expectedVersion));

        return uploadProductImage(product.id, form, candidate.idempotencyKey);
      },
      promote: ({ imageId, expectedVersion }) =>
        updateProductImage(product.id, imageId, { expectedVersion, isPrimary: true }),
    });

    release(lock.current);
    setBusy(false);
    onProduct(outcome.product);

    if (outcome.ok) {
      setConflict(false);
      // Operación terminada: la entrada sale de la cola y su vista previa se revoca.
      revoke([candidate.previewUrl]);
      setQueue((current) => current.filter((entry) => entry.entryId !== candidate.entryId));
      setStates({});
      setNotice(
        outcome.alreadyPrimary
          ? 'Portada añadida. Era la primera imagen del producto, así que el backend ya la devolvió como principal.'
          : 'Portada actualizada. La anterior sigue activa y pasa a la galería.',
      );

      return;
    }

    /*
     * El progreso se **guarda** aunque haya fallado. Con el `imageId` anotado, el reintento no
     * vuelve a subir el archivo; sin anotarlo, cada intento dejaría una imagen huérfana más.
     */
    if (outcome.imageId !== null) {
      setQueue((current) => markUploaded(current, candidate.entryId, outcome.imageId ?? ''));
    }

    const message = describeCatalogFailure(outcome.code);

    setConflict(outcome.code === 'version_conflict');
    setStates({ [candidate.entryId]: outcome.imageId === null ? 'failed' : 'awaitingCover' });
    setEntryErrors({ [candidate.entryId]: message });
    setFailure(
      outcome.step === 'upload'
        ? `${message} El archivo no llegó a subirse; conserva su clave, así que reintentar no lo duplica.`
        : `${message} El archivo ya está subido: reintentar solo lo marcará como portada, no volverá a mandarlo.`,
    );
  }

  /**
   * Sube las imágenes de **galería**, estrictamente en serie.
   *
   * Nunca `Promise.all`: cada subida devuelve el producto con una versión nueva, y la siguiente
   * necesita **esa** versión. Lanzarlas a la vez significaría que todas menos una fallan con un
   * `409`.
   *
   * La candidata a portada no entra en este lote. Es lo que impide el fallo que se corrige aquí:
   * mezclarlas hacía que un archivo elegido en «Cambiar portada» viajara como una imagen más y
   * acabara en la galería sin que nadie marcara nada.
   */
  async function handleBatch() {
    const pending = galleryEntries(queue);

    if (pending.length === 0) return;

    const missing = entriesMissingAltText(pending);

    if (missing.length > 0) {
      setFailure(
        `Falta el texto alternativo de ${missing.length} archivo${
          missing.length === 1 ? '' : 's'
        }. Está marcado junto a cada uno.`,
      );

      return;
    }

    /*
     * Con el producto sin imágenes, la primera que reciba el backend será la principal. Si hay una
     * candidata sin subir, subir la galería antes convertiría una imagen de galería en portada.
     */
    // Solo bloquea una candidata **sin subir**: una ya subida no puede robarle el puesto a nadie.
    if (active.length === 0 && coverCandidate(queue)?.uploadedImageId === null) {
      setFailure(
        'Sube primero la portada: la primera imagen que reciba el backend será la principal.',
      );

      return;
    }

    if (!begin()) {
      return;
    }

    const total = pending.length;

    setProgress({ done: 0, total });
    setEntryErrors({});
    setStates(Object.fromEntries(pending.map((entry) => [entry.entryId, 'pending' as EntryState])));

    const batch = await uploadQueueSequentially(
      product,
      pending,
      async ({ productId, expectedVersion, entry }) => {
        setStates((current) => ({ ...current, [entry.entryId]: 'uploading' }));

        const form = new FormData();

        form.set('file', entry.file, entry.file.name);
        form.set('altText', entry.altText.trim());
        form.set('expectedVersion', String(expectedVersion));

        const result = await uploadProductImage(productId, form, entry.idempotencyKey);

        return result.ok
          ? { ok: true as const, data: { product: result.data.product, image: result.data.image } }
          : result;
      },
      [],
      (next, done) => {
        // Cada éxito reemplaza el producto autoritativo: la siguiente subida parte de esa versión.
        onProduct(next);
        setProgress({ done, total });
      },
    );

    release(lock.current);
    setBusy(false);
    onProduct(batch.product);

    const doneIds = batch.uploaded.map((entry) => entry.entryId);

    setStates((current) => {
      const next = { ...current };

      for (const id of doneIds) next[id] = 'uploaded';
      if (batch.failure !== null) next[batch.failure.entryId] = 'failed';

      return next;
    });

    // Las completadas salen de la cola: **no se reenvían**. Sus `object URL` ya no hacen falta.
    const completed = pending.filter((entry) => doneIds.includes(entry.entryId));

    revoke(completed.map((entry) => entry.previewUrl));
    setQueue((current) => current.filter((entry) => !doneIds.includes(entry.entryId)));
    setProgress(null);

    if (batch.failure === null) {
      setConflict(false);
      setNotice(
        `${doneIds.length} imagen${doneIds.length === 1 ? '' : 'es'} subida${
          doneIds.length === 1 ? '' : 's'
        }.`,
      );

      return;
    }

    const message = describeCatalogFailure(batch.failure.code);

    setConflict(batch.failure.code === 'version_conflict');
    setEntryErrors({ [batch.failure.entryId]: message });
    setFailure(
      `${message} Se subieron ${doneIds.length} de ${total}; las que faltan siguen en la lista y conservan su clave, así que reintentar no duplica nada.`,
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

  const actions: EntryActions = {
    onRemove: (entryId) => applyQueue(removeFromQueue(queue, entryId)),
    onMove: (entryId, direction) => applyQueue(moveInQueue(queue, entryId, direction)),
    onAlt: (entryId, value) => applyQueue(setAltText(queue, entryId, value)),
    onReplace: (entryId, file) => {
      const previewUrl = URL.createObjectURL(file);

      liveUrls.current.add(previewUrl);
      // La clave se **renueva**: subir otro archivo es otra operación, y reutilizarla haría que el
      // backend la considerase repetida y devolviera la imagen anterior.
      applyQueue(replaceFile(queue, entryId, file, previewUrl, crypto.randomUUID()));
    },
    onCover: undefined,
  };

  /*
   * Los pendientes se dividen por **intención**, no por posición.
   *
   * La candidata a portada se pinta en el bloque Portada aunque ya exista una portada activa: es
   * el archivo que va a sustituirla, y enseñarlo en la galería era exactamente lo que hacía que
   * «Cambiar portada» acabara añadiendo una imagen más.
   */
  const candidate = coverCandidate(queue);
  const pendingGallery = galleryEntries(queue);

  return (
    <div className={styles.imageSections}>
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

      <section className={styles.card} id={IMAGE_ANCHORS.portada}>
        <div className={styles.cardPad}>
          <SectionHeading
            hint="Es la primera imagen que aparece en la tienda y en la ficha."
            icon="imagenes"
            title="Portada"
          />

          {cover === null ? (
            <p className={styles.notice}>
              Este producto todavía no tiene portada. Las imágenes son opcionales para publicar,
              pero si vas a poner alguna, esta es la primera que se ve.
            </p>
          ) : (
            <figure className={styles.coverFigure}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={cover.altText} className={styles.coverImg} src={cover.publicUrl} />
              <figcaption className={styles.primaryFlag}>Portada</figcaption>
            </figure>
          )}

          {canEdit && cover !== null ? (
            <AltTextEditor
              busy={busy}
              image={cover}
              key={`${cover.id}:${cover.altText}`}
              onSave={(altText) =>
                void patchImage(cover, { altText }, 'Texto alternativo de la portada actualizado.')
              }
            />
          ) : null}
          {!canEdit && cover !== null ? <p className={styles.imageAlt}>{cover.altText}</p> : null}

          {canEdit ? (
            candidate === null ? (
              <ImageDropzone
                buttonLabel={cover === null ? 'Agregar portada' : 'Cambiar portada'}
                disabled={busy || atLimit}
                hint={
                  cover === null
                    ? 'Una sola imagen. JPG, PNG o WebP · 10 MB como máximo.'
                    : 'Una sola imagen. Al subirla queda como portada; la anterior no se borra ni se archiva: pasa a la galería.'
                }
                multiple={false}
                onFiles={(files) => enqueue(files, 'cover')}
                title={
                  cover === null
                    ? 'Elige la imagen que abrirá la ficha'
                    : 'Sube otra imagen para la portada'
                }
              />
            ) : (
              <>
                {/*
                  La candidata se pinta **aquí**, en el bloque Portada, aunque ya exista una portada
                  activa. Es el archivo que va a sustituirla, y enseñarlo entre las de galería era
                  justo lo que hacía que «Cambiar portada» acabara añadiendo una imagen más.
                */}
                <h3 className={styles.sectionTitle}>Portada elegida, sin subir</h3>
                <ul className={styles.queueList}>
                  <PendingEntryCard
                    actions={actions}
                    canMoveDown={false}
                    canMoveUp={false}
                    disabled={busy}
                    entry={candidate}
                    error={entryErrors[candidate.entryId]}
                    isCover
                    state={
                      states[candidate.entryId] ??
                      (candidate.uploadedImageId === null ? 'pending' : 'awaitingCover')
                    }
                  />
                </ul>
                <div className={styles.batchBar}>
                  <button
                    className={styles.button}
                    disabled={busy || candidate.altText.trim().length === 0}
                    onClick={() => void handleCover()}
                    type="button"
                  >
                    {busy
                      ? 'Aplicando…'
                      : candidate.uploadedImageId === null
                        ? 'Subir y poner como portada'
                        : 'Reintentar: marcar como portada'}
                  </button>
                </div>
                <p className={styles.hint}>
                  {candidate.uploadedImageId === null
                    ? 'Son dos pasos: subir el archivo y marcarlo como portada. No diremos que la portada cambió hasta que el backend lo confirme.'
                    : 'El archivo ya está en el producto. Solo falta marcarlo como portada, y reintentar no vuelve a subirlo.'}
                </p>
              </>
            )
          ) : (
            <p className={styles.hint}>Tu rol no permite cambiar las imágenes.</p>
          )}

          {canEdit && cover !== null && candidate === null ? (
            <p className={styles.hint}>
              También puedes elegir cualquier imagen de la galería con «Hacer portada».{' '}
              {ALT_TEXT_HELP}
            </p>
          ) : null}
        </div>
      </section>

      <section className={styles.card} id={IMAGE_ANCHORS.galeria}>
        <div className={styles.cardPad}>
          <SectionHeading
            hint="Las demás imágenes del producto, en el orden en que se verán."
            icon="imagenes"
            title="Galería"
          />

          {canEdit ? (
            cover === null && candidate === null ? (
              /*
               * Sin portada real **y** sin una operación de portada identificada, la galería no
               * admite archivos: el backend marca principal a la primera imagen que recibe, así que
               * «Agregar imágenes a la galería» habría elegido la portada sin decirlo.
               */
              <p className={styles.notice}>
                Agrega primero la portada. La galería son las imágenes que acompañan a esa primera,
                y elegirlas antes decidiría la portada sin que lo hayas dicho.
              </p>
            ) : (
              <ImageDropzone
                buttonLabel="Agregar imágenes a la galería"
                disabled={busy || atLimit}
                hint={`JPG, PNG o WebP · 10 MB por imagen${
                  atLimit ? ` · has llegado al límite de ${IMAGE_MAX_ACTIVE}` : ''
                }`}
                multiple
                onFiles={(files) => enqueue(files, 'gallery')}
                title="Arrastra y suelta varias imágenes aquí"
              />
            )
          ) : null}

          <ImageCounter active={plannedActive} />
          <p className={styles.hint}>{ALT_TEXT_HELP}</p>

          {pendingGallery.length === 0 ? null : (
            <>
              <h3 className={styles.sectionTitle}>Pendientes de subir ({pendingGallery.length})</h3>
              <PendingQueueList
                actions={actions}
                coverEntryId={null}
                disabled={busy}
                errors={entryErrors}
                lockedIds={[]}
                queue={pendingGallery}
                states={states}
              />
            </>
          )}

          {/*
            El lote de la galería cuenta **solo** las entradas de galería. La candidata a portada
            tiene su propio botón en su propio bloque, porque es otra operación: termina con un
            `isPrimary: true` que este lote no manda nunca.
          */}
          {pendingGallery.length === 0 ? null : (
            <div className={styles.batchBar}>
              <button
                className={styles.button}
                disabled={busy || missingAlt.length > 0}
                onClick={() => void handleBatch()}
                type="button"
              >
                {busy
                  ? 'Subiendo…'
                  : `Subir ${pendingGallery.length} imagen${pendingGallery.length === 1 ? '' : 'es'}`}
              </button>
              {progress === null ? null : (
                <p aria-live="polite" className={styles.batchProgress}>
                  Subiendo {Math.min(progress.done + 1, progress.total)} de {progress.total}
                </p>
              )}
              {missingAlt.length === 0 ? null : (
                <p className={styles.hint}>
                  Escribe el texto alternativo que falta para poder subirlas.
                </p>
              )}
            </div>
          )}

          {gallery.length === 0 ? (
            <p className={styles.hint}>
              {cover === null
                ? 'Este producto todavía no tiene imágenes activas.'
                : 'Por ahora solo hay portada. Las imágenes son opcionales para publicar.'}
            </p>
          ) : (
            <ul className={styles.galleryGrid}>
              {gallery.map((image, index) => (
                <li className={styles.imageTile} key={image.id}>
                  <figure className={styles.imageTileFigure}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={image.altText}
                      className={styles.imageTileImg}
                      src={image.publicUrl}
                    />
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
                          void patchImage(
                            image,
                            { position: image.position - 1 },
                            'Orden actualizado.',
                          )
                        }
                        type="button"
                      >
                        ← Subir
                      </button>
                      <button
                        className={styles.iconButton}
                        disabled={busy || index === gallery.length - 1}
                        onClick={() =>
                          void patchImage(
                            image,
                            { position: image.position + 1 },
                            'Orden actualizado.',
                          )
                        }
                        type="button"
                      >
                        Bajar →
                      </button>
                      {canEdit ? (
                        <button
                          className={styles.iconButton}
                          disabled={busy}
                          onClick={() =>
                            void patchImage(
                              image,
                              { isPrimary: true },
                              'Portada actualizada. La anterior sigue activa en la galería.',
                            )
                          }
                          type="button"
                        >
                          Hacer portada
                        </button>
                      ) : null}
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

          <p className={styles.inlineNote}>
            Al guardar, las imágenes quedan en una URL pública —también en borrador y después de
            archivarlas—. No subas nada que deba permanecer privado.
          </p>

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
    </div>
  );
}

/**
 * Edición del texto alternativo de una imagen ya subida.
 *
 * Se guarda con un botón explícito y no al perder el foco: cada guardado es un `PATCH` con
 * `expectedVersion`, y dispararlo por cada salida de foco gastaría llamadas y provocaría
 * conflictos al editar varias imágenes seguidas.
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
      {trimmed.length === 0 ? (
        <p className={styles.fieldError} role="alert">
          El texto alternativo es obligatorio.
        </p>
      ) : null}
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
