'use client';

import { useEffect, useId, useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';
import { VARIANT_MAX_ACTIVE } from '@/lib/api/variant-limits';

import { AttributeAxesEditor } from './attribute-axes-editor';
import { CopField } from './cop-field';
import styles from './catalog.module.css';
import {
  createProduct as createProductRequest,
  createVariant as createVariantRequest,
  transitionProduct,
  updateProduct as updateProductRequest,
  updateProductImage,
  uploadProductImage,
} from './catalog-client';
import { describeCatalogFailure } from './catalog-errors';
import {
  describeProgress,
  runCreateFlow,
  EMPTY_PROGRESS,
  type CreateFlowDeps,
  type CreateFlowInput,
  type CreateFlowProgress,
  type CreateIntent,
} from './create-product-flow';
import {
  EMPTY_ENRICHMENT,
  enrichmentBody,
  enrichmentProblems,
  type EnrichmentFields,
} from './enrichment';
import { ClassificationFields, ContentFields } from './enrichment-fields';
import { ImageQueueEditor } from './image-queue-editor';
import {
  addToQueue,
  entriesMissingAltText,
  moveInQueue,
  removeFromQueue,
  replaceFile,
  resolvePrimary,
  setAltText,
  type QueueChange,
  type QueuedImage,
} from './image-queue';
import { describeCopProblem, formatCop, parseCop } from './money';
import { SKU_PATTERN, SLUG_PATTERN } from './product-input';
import { PublicationChecklist } from './publication-checklist';
import { describeReadiness, SECTION_IDS } from './publication-readiness';
import { SectionHeading } from './section-icon';
import {
  declaredAxes,
  generateCombinations,
  combinationKey,
  validateAxes,
  validateVariantDrafts,
  variantRequestBody,
  type AxisDraft,
  type VariantDraft,
} from './variant-draft';
import { VariantDraftEditor } from './variant-draft-editor';

type Errors = Partial<Record<'sku' | 'slug' | 'name' | 'priceCop' | 'images' | 'variants', string>>;

type Fields = {
  sku: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  priceCop: string;
  stockQuantity: string;
  lowStockThreshold: string;
};

const EMPTY_FIELDS: Fields = {
  sku: '',
  slug: '',
  name: '',
  shortDescription: '',
  description: '',
  priceCop: '',
  stockQuantity: '0',
  lowStockThreshold: '0',
};

/**
 * Alta de producto con su contenido enriquecido, sus imágenes y sus variantes en un solo envío.
 *
 * El contrato obliga a repartir el alta en varias llamadas: `POST /v1/admin/products` solo admite
 * los campos base, la clasificación y los ejes van en un `PATCH`, y ni una imagen ni una variante
 * se pueden crear sin `productId` y sin la `expectedVersion` vigente. Todo eso ocurre **dentro** de
 * este envío, no antes: los datos, los archivos y las variantes viven en memoria hasta que se pulsa
 * «Crear producto». Crear el producto al elegir el primer archivo dejaría un borrador huérfano cada
 * vez que alguien abandona la pantalla.
 *
 * El orden y la reanudación los decide `runCreateFlow`; aquí solo se recogen datos y se pinta el
 * resultado. Nada se pierde si algo falla, y lo que ya llegó al backend deja de ser editable aquí:
 * un reintento no lo reenviaría.
 */
export function CreateProductForm({ canPublish }: { readonly canPublish: boolean }) {
  const router = useRouter();
  const lock = useRef(createOperationLock());

  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [enrichment, setEnrichment] = useState<EnrichmentFields>(EMPTY_ENRICHMENT);
  const [axes, setAxes] = useState<readonly AxisDraft[]>([]);
  const [variants, setVariants] = useState<readonly VariantDraft[]>([]);
  const [queue, setQueue] = useState<readonly QueuedImage[]>([]);
  const [chosenPrimary, setChosenPrimary] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<CreateFlowProgress>(EMPTY_PROGRESS);
  /** Última intención pulsada. Decide qué se cuenta al terminar, no qué se guarda. */
  const [intent, setIntent] = useState<CreateIntent>('draft');

  const ids = {
    sku: useId(),
    slug: useId(),
    name: useId(),
    shortDescription: useId(),
    description: useId(),
    priceCop: useId(),
    stockQuantity: useId(),
    lowStockThreshold: useId(),
  };

  /**
   * Producto ya creado por un intento anterior.
   *
   * Con esto a mano la pantalla deja de ser un formulario de alta y pasa a ser una pantalla de
   * recuperación: los datos ya están en el backend y aquí no se pueden cambiar, porque un
   * reintento no los reenvía. Dejarlos editables sugeriría que el reintento los guardaría.
   */
  const created = progress.product;

  /** Entradas que ya llegaron al backend. Se muestran, pero no se tocan desde aquí. */
  const lockedIds = progress.uploaded.map((done) => done.entryId);
  const lockedDraftIds = progress.variants.map((done) => done.draftId);

  /**
   * Las `object URL` vivas. Se revocan al desmontar: si no, los archivos siguen retenidos en
   * memoria mientras dure la pestaña.
   */
  const liveUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = liveUrls.current;

    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }

      urls.clear();
    };
  }, []);

  function applyChange(change: QueueChange) {
    for (const url of change.revoked) {
      URL.revokeObjectURL(url);
      liveUrls.current.delete(url);
    }

    setQueue(change.queue);
    setChosenPrimary((current) => resolvePrimary(change.queue, current));

    // `exactOptionalPropertyTypes` no admite asignar `undefined`: la clave se quita.
    setErrors((current) => {
      const next = { ...current };

      delete next.images;

      return change.rejected === null ? next : { ...next, images: change.rejected };
    });
  }

  function track(file: File): string {
    const url = URL.createObjectURL(file);

    liveUrls.current.add(url);

    return url;
  }

  function handleAdd(files: FileList) {
    let next = queue;
    let lastChange: QueueChange = { queue, revoked: [], rejected: null };

    for (const file of Array.from(files)) {
      lastChange = addToQueue(next, {
        file,
        previewUrl: track(file),
        entryId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
      });
      next = lastChange.queue;

      for (const url of lastChange.revoked) {
        URL.revokeObjectURL(url);
        liveUrls.current.delete(url);
      }
    }

    applyChange({ queue: next, revoked: [], rejected: lastChange.rejected });
  }

  const flowDeps: CreateFlowDeps = {
    createProduct: (body) => createProductRequest(body),
    enrichProduct: ({ productId, expectedVersion, enrichment: body }) =>
      updateProductRequest(productId, { ...body, expectedVersion }),
    uploadImage: async ({ productId, expectedVersion, entry }) => {
      const form = new FormData();

      form.set('file', entry.file, entry.file.name);
      form.set('altText', entry.altText.trim());
      form.set('expectedVersion', String(expectedVersion));

      return uploadProductImage(productId, form, entry.idempotencyKey);
    },
    setPrimary: ({ productId, imageId, expectedVersion }) =>
      updateProductImage(productId, imageId, { expectedVersion, isPrimary: true }),
    createVariant: ({ productId, expectedVersion, draft }) =>
      createVariantRequest(productId, variantRequestBody(draft, expectedVersion)),
    publishProduct: ({ productId, expectedVersion }) =>
      transitionProduct(productId, 'publish', expectedVersion),
  };

  /** El precio se convierte una sola vez por render: valida, se envía y se pinta desde aquí. */
  const price = parseCop(fields.priceCop);
  const axisProblems = validateAxes(axes);
  /**
   * Solo se validan las variantes que faltan por crear, contra lo que el backend ya tiene.
   *
   * Tras un fallo parcial, las creadas vienen dentro del producto autoritativo: cuentan para el
   * límite y reservan su SKU, pero volver a comprobarlas no tendría sentido porque ya existen.
   */
  const variantValidation = validateVariantDrafts(
    variants.filter((draft) => !lockedDraftIds.includes(draft.draftId)),
    declaredAxes(axes),
    created?.variants ?? [],
  );
  const enrichmentIssues = enrichmentProblems(enrichment);

  function validate(): Errors {
    const found: Errors = {};

    if (!SKU_PATTERN.test(fields.sku.trim())) {
      found.sku = 'Solo mayúsculas, números y guiones. Entre 2 y 64 caracteres.';
    }

    if (!SLUG_PATTERN.test(fields.slug.trim())) {
      found.slug = 'Solo minúsculas, números y guiones. Entre 2 y 64 caracteres.';
    }

    if (fields.name.trim().length === 0) {
      found.name = 'El nombre es obligatorio.';
    }

    if (!price.ok) {
      found.priceCop = describeCopProblem(price.problem);
    }

    if (entriesMissingAltText(queue, lockedIds).length > 0) {
      found.images = 'Cada imagen necesita su texto alternativo.';
    }

    if (
      axisProblems.length > 0 ||
      enrichmentIssues.length > 0 ||
      variantValidation.general.length > 0 ||
      Object.keys(variantValidation.byDraft).length > 0
    ) {
      found.variants =
        'Revisa la clasificación y las variantes: hay datos que el backend no acepta.';
    }

    return found;
  }

  /** Lo que se envía, ya montado: el `POST`, el `PATCH` y las listas de imágenes y variantes. */
  function flowInput(intent: CreateIntent): CreateFlowInput {
    return {
      intent,
      fields: {
        sku: fields.sku.trim(),
        slug: fields.slug.trim(),
        name: fields.name.trim(),
        priceCop: price.ok ? price.value : 0,
        stockQuantity: Number(fields.stockQuantity || 0),
        lowStockThreshold: Number(fields.lowStockThreshold || 0),
        ...(fields.shortDescription.trim() === ''
          ? {}
          : { shortDescription: fields.shortDescription.trim() }),
        ...(fields.description.trim() === '' ? {} : { description: fields.description.trim() }),
      },
      enrichment: enrichmentBody(enrichment, declaredAxes(axes), 'create'),
      queue,
      primaryEntryId: chosenPrimary,
      variants,
    };
  }

  async function submit(resume: CreateFlowProgress, intent: CreateIntent) {
    if (!acquire(lock.current)) {
      return;
    }

    const found = validate();

    setErrors(found);

    if (Object.keys(found).length > 0) {
      release(lock.current);

      return;
    }

    setBusy(true);
    setFailure(null);

    setIntent(intent);

    const result = await runCreateFlow(flowInput(intent), flowDeps, resume);

    setProgress(result);

    const pendingPublication =
      intent === 'publish' &&
      !result.published &&
      result.product?.publicationReadiness.ready !== true;

    if (result.failure === null && result.product !== null && !pendingPublication) {
      // Salida terminal: el candado no se libera porque ya se está navegando.
      router.push(`/panel/productos/${result.product.id}`);

      return;
    }

    release(lock.current);
    setBusy(false);

    // Que falte un requisito no es un fallo: el borrador se guardó entero y lo que falta se
    // enumera con lo que devolvió el backend.
    setFailure(result.failure === null ? null : describeCatalogFailure(result.failure.code));
  }

  const summary = describeProgress(progress, { queue, variants });
  /** Hay clasificación o contenido escrito que todavía no ha llegado al backend. */
  const enrichmentPending =
    !progress.enriched && enrichmentBody(enrichment, declaredAxes(axes), 'create') !== null;
  const pendingImages = summary.pendingImages.length;
  const pendingVariants = summary.pendingVariants.length;

  function field(key: keyof Fields) {
    return {
      value: fields[key],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setFields((current) => ({ ...current, [key]: event.target.value })),
      // Con el producto ya creado estos campos no se reenvían: se deshabilitan en vez de fingir
      // que el reintento los guardaría.
      disabled: busy || created !== null,
    };
  }

  return (
    <form
      className={styles.formGrid}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit(progress, 'draft');
      }}
    >
      {/* Acciones principales arriba, como en la referencia: el formulario es largo y guardar no
          debería exigir recorrerlo entero. Fluye con el contenido, no lo tapa. */}
      <div className={styles.actionBar}>
        <div className={styles.actionBarText}>
          {canPublish
            ? '«Publicar producto» guarda exactamente lo mismo y, solo después, publica si el backend dice que está listo.'
            : 'Tu rol no incluye publicar: el producto queda en borrador.'}
        </div>
        <div className={styles.actionBarButtons}>
          {created === null ? null : (
            <Link className={styles.buttonSecondary} href={`/panel/productos/${created.id}`}>
              Abrir el producto
            </Link>
          )}
          <button className={styles.buttonSecondary} disabled={busy} type="submit">
            {busy && intent === 'draft'
              ? 'Guardando…'
              : created === null
                ? 'Guardar borrador'
                : 'Reintentar lo que falta'}
          </button>
          {canPublish ? (
            <button
              className={styles.button}
              disabled={busy}
              onClick={() => void submit(progress, 'publish')}
              type="button"
            >
              {busy && intent === 'publish' ? 'Guardando y publicando…' : 'Publicar producto'}
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.stack}>
        <div aria-live="assertive">
          {failure === null ? null : (
            <p className={styles.error} role="alert">
              {failure}
            </p>
          )}
        </div>

        {created === null ? null : (
          <div aria-live="polite">
            <p className={styles.success}>
              <strong>Producto creado como borrador.</strong>{' '}
              {progress.enriched
                ? 'La clasificación y el contenido ya están guardados.'
                : enrichmentPending
                  ? 'Falta guardar la clasificación y el contenido.'
                  : ''}{' '}
              Se subieron {summary.uploaded} de {summary.totalImages} imágenes
              {summary.totalVariants === 0
                ? ''
                : ` y se crearon ${summary.createdVariants} de ${summary.totalVariants} variantes`}
              .
              {pendingImages > 0
                ? ` Faltan imágenes: ${summary.pendingImages.map((entry) => entry.file.name).join(', ')}.`
                : ''}
              {pendingVariants > 0
                ? ` Faltan variantes: ${summary.pendingVariants.map((draft) => draft.sku).join(', ')}.`
                : ''}{' '}
              Lo ya guardado no se vuelve a enviar y desde aquí no se edita: hazlo en{' '}
              <Link className={styles.link} href={`/panel/productos/${created.id}`}>
                Abrir el producto
              </Link>
              .{' '}
              {progress.published
                ? 'El producto está publicado.'
                : intent === 'publish' && progress.failure === null
                  ? `No se publicó: ${describeReadiness(created.publicationReadiness).toLowerCase()}. El borrador quedó guardado.`
                  : 'No se ha publicado: publicarlo es una acción aparte.'}
            </p>
          </div>
        )}

        <section className={styles.card} id={SECTION_IDS.basica}>
          <div className={styles.cardPad}>
            <SectionHeading
              hint="Datos principales de tu producto."
              icon="basica"
              title="Información básica"
            />
            <div className={styles.row}>
              <Field
                error={errors.sku}
                hint="Inmutable una vez creado."
                id={ids.sku}
                input={field('sku')}
                label="SKU"
                required
              />
              <Field
                error={errors.slug}
                hint="Inmutable una vez creado."
                id={ids.slug}
                input={field('slug')}
                label="Slug"
                required
              />
            </div>
            <Field
              error={errors.name}
              id={ids.name}
              input={field('name')}
              label="Nombre"
              required
            />
            <Field
              id={ids.shortDescription}
              input={field('shortDescription')}
              label="Descripción corta"
            />
            <div className={styles.field}>
              <label className={styles.label} htmlFor={ids.description}>
                Descripción
              </label>
              <textarea
                className={styles.textarea}
                id={ids.description}
                {...field('description')}
              />
            </div>

            <h3 className={styles.subTitle}>Clasificación</h3>
            <ClassificationFields
              disabled={busy || progress.enriched}
              fields={enrichment}
              mode="create"
              onChange={setEnrichment}
            />
          </div>
        </section>

        <section className={styles.card} id={SECTION_IDS.contenido}>
          <div className={styles.cardPad}>
            <SectionHeading
              hint="Lo que la ficha muestra bajo la descripción."
              icon="contenido"
              title="Características y especificaciones"
            />
            <ContentFields
              disabled={busy || progress.enriched}
              fields={enrichment}
              mode="create"
              onChange={setEnrichment}
            />
            {enrichmentIssues.length === 0 ? null : (
              <ul className={styles.problemList}>
                {enrichmentIssues.map((problem) => (
                  <li className={styles.fieldError} key={problem}>
                    {problem}
                  </li>
                ))}
              </ul>
            )}
            {progress.enriched ? (
              <p className={styles.hint}>
                Ya está guardado en el producto. Para cambiarlo, ábrelo y edítalo desde su detalle.
              </p>
            ) : null}
          </div>
        </section>

        <div id={SECTION_IDS.imagenes}>
          <ImageQueueEditor
            canAdd={created === null}
            disabled={busy}
            lockedIds={lockedIds}
            onAdd={handleAdd}
            onAlt={(entryId, value) => applyChange(setAltText(queue, entryId, value, lockedIds))}
            onMove={(entryId, direction) =>
              applyChange(moveInQueue(queue, entryId, direction, lockedIds))
            }
            onPrimary={(entryId) => setChosenPrimary(entryId)}
            onRemove={(entryId) => applyChange(removeFromQueue(queue, entryId, lockedIds))}
            onReplace={(entryId, file) =>
              applyChange(
                replaceFile(queue, entryId, file, track(file), crypto.randomUUID(), lockedIds),
              )
            }
            primaryEntryId={chosenPrimary}
            queue={queue}
          />
        </div>
        {errors.images === undefined ? null : (
          <p className={styles.error} role="alert">
            {errors.images}
          </p>
        )}

        <div className={styles.row}>
          <section className={styles.card} id={SECTION_IDS.precio}>
            <div className={styles.cardPad}>
              <SectionHeading icon="precio" title="Precio" />
              <CopField
                disabled={busy || created !== null}
                hint="Pesos enteros. El símbolo y los puntos de miles son de la pantalla; al backend va el número."
                label="Precio"
                onChange={(value) => setFields((current) => ({ ...current, priceCop: value }))}
                required
                value={fields.priceCop}
              />
              {errors.priceCop === undefined ? null : (
                <p className={styles.fieldError} role="alert">
                  {errors.priceCop}
                </p>
              )}
            </div>
          </section>
          <section className={styles.card} id={SECTION_IDS.inventario}>
            <div className={styles.cardPad}>
              <SectionHeading icon="inventario" title="Inventario" />
              <Field
                id={ids.stockQuantity}
                input={field('stockQuantity')}
                label="Stock inicial"
                type="number"
              />
              <Field
                id={ids.lowStockThreshold}
                input={field('lowStockThreshold')}
                label="Umbral de stock bajo"
                type="number"
              />
            </div>
          </section>
        </div>

        {variants.length === 0 ? null : (
          <p className={styles.notice}>
            Con variantes, el precio y el inventario se gestionan en cada una. El precio y el stock
            base se guardan igual y no se borran, pero dejan de ser lo que se vende.
          </p>
        )}

        <section className={styles.card} id={SECTION_IDS.variantes}>
          <div className={styles.cardPad}>
            <SectionHeading
              hint="Opcionales. Sin variantes, el producto se vende por su propio SKU, precio e inventario."
              icon="variantes"
              title="Variantes"
            />
            <AttributeAxesEditor
              axes={axes}
              disabled={busy || progress.enriched}
              newId={() => crypto.randomUUID()}
              onChange={setAxes}
              problems={axisProblems}
            />
            <VariantDraftEditor
              activeCount={
                created?.variants.filter((variant) => variant.status === 'active').length ?? 0
              }
              axes={axes}
              disabled={busy}
              drafts={variants}
              lockedDraftIds={lockedDraftIds}
              onAdd={() =>
                setVariants((current) => [
                  ...current,
                  {
                    draftId: crypto.randomUUID(),
                    sku: '',
                    priceCop: fields.priceCop,
                    stockQuantity: '0',
                    attributes: declaredAxes(axes).map((axis) => ({
                      key: axis.key,
                      value: '',
                      label: '',
                    })),
                  },
                ])
              }
              onChange={setVariants}
              onGenerate={() =>
                setVariants((current) => [
                  ...current,
                  ...generateCombinations(axes, {
                    existing: current.map((draft) => combinationKey(draft.attributes)),
                    baseSku: fields.sku,
                    basePriceCop: fields.priceCop,
                    newId: () => crypto.randomUUID(),
                    limit: Math.max(0, VARIANT_MAX_ACTIVE - current.length),
                  }),
                ])
              }
              validation={variantValidation}
            />
          </div>
        </section>

        {errors.variants === undefined ? null : (
          <p className={styles.error} role="alert">
            {errors.variants}
          </p>
        )}

        <p className={styles.hint}>
          {created === null
            ? 'Nada se ha enviado todavía: los datos, las imágenes y las variantes viven en esta pantalla hasta que guardes.'
            : 'El producto ya existe. Lo que falte se reintenta sin repetir lo guardado.'}
        </p>
      </div>

      <aside className={styles.preview}>
        <section className={styles.card}>
          <div className={styles.cardPad}>
            <SectionHeading icon="vistaPrevia" title="Vista previa del producto" />
            <Preview
              fields={fields}
              price={price.ok ? price.value : null}
              primaryEntryId={chosenPrimary}
              queue={queue}
              variantCount={variants.length}
            />
          </div>
        </section>
        <section className={styles.card} style={{ marginTop: 'var(--space-lg)' }}>
          <div className={styles.cardPad}>
            <SectionHeading icon="estado" title="Preparación para publicar" />
            {created === null ? (
              <p className={styles.hint}>
                El producto nace como <strong>borrador</strong>. Quien decide si está listo para
                publicarse es el backend, al guardarlo: hasta entonces esta pantalla no puede
                adelantarlo sin inventárselo.
              </p>
            ) : (
              <>
                <PublicationChecklist readiness={created.publicationReadiness} />
                <p className={styles.hint}>
                  Para completar lo que falta, abre el producto: aquí los datos guardados ya no se
                  editan.
                </p>
              </>
            )}
          </div>
        </section>
      </aside>
    </form>
  );
}

/**
 * Vista previa con los campos reales del formulario. Sin datos inventados.
 *
 * No muestra el inventario: la tienda no publica la cantidad exacta, solo si hay o no existencias,
 * y esa disponibilidad la deriva el backend. Aquí se enseñaría un número que el público no ve.
 */
function Preview({
  fields,
  price,
  queue,
  primaryEntryId,
  variantCount,
}: {
  readonly fields: Fields;
  /** `null` mientras el precio escrito no sea convertible: no se inventa un número. */
  readonly price: number | null;
  readonly queue: readonly QueuedImage[];
  readonly primaryEntryId: string | null;
  readonly variantCount: number;
}) {
  const primary = queue.find((entry) => entry.entryId === primaryEntryId) ?? queue[0];

  return (
    <>
      {primary === undefined ? (
        <span className={styles.previewEmpty}>Sin imagen</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={primary.altText} className={styles.previewImage} src={primary.previewUrl} />
      )}
      <p className={styles.previewName}>
        {fields.name.trim() === '' ? 'Nombre del producto' : fields.name}
      </p>
      <p className={styles.previewPrice}>{price === null ? '—' : formatCop(price)}</p>
      {fields.shortDescription.trim() === '' ? null : (
        <p className={styles.previewText}>{fields.shortDescription}</p>
      )}
      <p className={styles.previewText}>
        {queue.length} imagen{queue.length === 1 ? '' : 'es'} en cola
      </p>
      <p className={styles.previewText}>
        {variantCount === 0
          ? 'Sin variantes: se vende por el SKU base.'
          : `${variantCount} variante${variantCount === 1 ? '' : 's'} preparada${variantCount === 1 ? '' : 's'}`}
      </p>
    </>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  required,
  type = 'text',
  input,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly required?: boolean | undefined;
  readonly type?: 'text' | 'number' | undefined;
  readonly input: {
    readonly value: string;
    readonly onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    readonly disabled: boolean;
  };
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const described = [hint === undefined ? null : hintId, error === undefined ? null : errorId]
    .filter((value): value is string => value !== null)
    .join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required === true ? ' *' : ''}
      </label>
      <input
        className={error === undefined ? styles.input : styles.inputInvalid}
        id={id}
        type={type}
        {...input}
        {...(required === true ? { required: true } : {})}
        {...(error === undefined ? {} : { 'aria-invalid': true })}
        {...(described === '' ? {} : { 'aria-describedby': described })}
      />
      {hint === undefined ? null : (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      )}
      {error === undefined ? null : (
        <span className={styles.fieldError} id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}
