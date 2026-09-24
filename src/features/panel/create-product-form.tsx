'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';
import type { SetInventoryControl } from '@/lib/api/catalog';
import {
  DESCRIPTION_MAX_LENGTH,
  SHORT_DESCRIPTION_MAX_LENGTH,
  VARIANT_MAX_ACTIVE,
} from '@/lib/api/variant-limits';

import { AttributeAxesEditor } from './attribute-axes-editor';
import { CopField } from './cop-field';
import styles from './catalog.module.css';
import {
  createProduct as createProductRequest,
  createVariant as createVariantRequest,
  readProduct,
  transitionProduct,
  updateProduct as updateProductRequest,
  updateProductImage,
  uploadProductImage,
} from './catalog-client';
import { describeCatalogFailure, productFailureField } from './catalog-errors';
import { CategoryPicker } from './category-picker';
import { withCreatedCategory, type CategoryOption } from './category-selection';
import {
  describeFailedStep,
  describeProgress,
  runCreateFlow,
  withRereadProduct,
  EMPTY_PROGRESS,
  type CreateFlowDeps,
  type CreateFlowInput,
  type CreateFlowProgress,
  type CreateIntent,
} from './create-product-flow';
import { CountedTextarea } from './counted-field';
import {
  EMPTY_ENRICHMENT,
  enrichmentBody,
  enrichmentProblems,
  hasEnrichmentProblems,
  type EnrichmentFields,
} from './enrichment';
import {
  AdditionalDetailsFields,
  ClassificationFields,
  VisibleContentFields,
} from './enrichment-fields';
import { ImageQueueEditor } from './image-queue-editor';
import {
  describeInventoryProblem,
  EMPTY_INVENTORY_DRAFT,
  inventoryBody,
  inventoryProblems,
  type InventoryDraft,
} from './inventory-control';
import { InventoryFields } from './inventory-fields';
import {
  addToQueue,
  entriesMissingAltText,
  moveInQueue,
  removeFromQueue,
  replaceFile,
  resolvePrimary,
  setAltText,
  setCoverIntent,
  type QueueChange,
  type ImageIntent,
  type QueuedImage,
} from './image-queue';
import { describeCopProblem, formatCop, parseCop } from './money';
import { PreviewDialog } from './preview-dialog';
import { ProductDataTabs } from './product-data-tabs';
import { descriptionProblem, shortDescriptionProblem } from './product-content';
import { SKU_PATTERN, SLUG_PATTERN } from './product-input';
import { PublicationChecklist } from './publication-checklist';
import { describeReadiness, SECTION_IDS } from './publication-readiness';
import { SectionHeading } from './section-icon';
import { StatusBadge } from './status-badge';
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

/** Campos que se pueden marcar con un error, en el orden en que aparecen en pantalla. */
export const CREATE_FIELD_ORDER = [
  'name',
  'sku',
  'slug',
  'shortDescription',
  'description',
  'priceCop',
  'inventory',
  'variants',
  'category',
  'images',
] as const;

export type CreateField = (typeof CREATE_FIELD_ORDER)[number];

type Errors = Partial<Record<CreateField, string>>;

/** Las pestañas de «Datos del producto». */
export type CreateTab = 'general' | 'inventario' | 'clasificacion' | 'variantes' | 'detalles';

/** En qué pestaña vive cada campo con error. Los que no están aquí están siempre a la vista. */
export const TAB_OF_FIELD: Readonly<Partial<Record<CreateField, CreateTab>>> = {
  priceCop: 'general',
  inventory: 'inventario',
  variants: 'variantes',
};

/** Nombre corto de cada campo, para la lista de lo pendiente. */
const FIELD_LABELS: Readonly<Record<CreateField, string>> = {
  name: 'Nombre',
  sku: 'SKU',
  slug: 'URL',
  shortDescription: 'Descripción corta',
  description: 'Descripción detallada',
  priceCop: 'Precio',
  inventory: 'Inventario',
  variants: 'Clasificación, contenido o variantes',
  category: 'Categoría',
  images: 'Imágenes',
};

/** El primer campo con error, en el orden de la pantalla. Pura. */
export function firstProblemField(errors: Errors): CreateField | null {
  return CREATE_FIELD_ORDER.find((field) => errors[field] !== undefined) ?? null;
}

type Fields = {
  sku: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  priceCop: string;
};

const EMPTY_FIELDS: Fields = {
  sku: '',
  slug: '',
  name: '',
  shortDescription: '',
  description: '',
  priceCop: '',
};

type Failure = { readonly message: string; readonly field: CreateField | null };

/**
 * Alta de producto con su contenido enriquecido, su categoría, sus imágenes y sus variantes en un
 * solo envío.
 *
 * **Estructura.** Nombre arriba a todo el ancho, con SKU y URL debajo. A un lado, el área principal:
 * la descripción y una tarjeta compacta «Datos del producto» con pestañas. Al otro, la barra
 * lateral: estado y acciones, lo que falta, la categoría y las imágenes. En móvil y tableta todo
 * cae a una columna en ese mismo orden.
 *
 * **Envío.** El contrato obliga a repartir el alta en varias llamadas —el `POST`, el `PATCH` de
 * enriquecimiento, las imágenes, la portada, las variantes y, si se pide, la publicación— y todo
 * ocurre dentro de este envío: nada se manda antes de pulsar. El orden y la reanudación los decide
 * `runCreateFlow`.
 *
 * **Recuperación.** Si el `POST` salió bien y falla un paso posterior, el producto **ya existe**: se
 * dice «El producto fue creado como borrador», qué paso falló, y se ofrecen «Abrir producto» y
 * «Reintentar lo pendiente». El reintento reutiliza el id y la última versión, y **nunca vuelve a
 * ejecutar el `POST`**. Si falla el propio `POST` —un SKU o una URL reservados—, no existe ningún
 * producto y no se ofrece nada de eso.
 *
 * **Conflicto de versión.** Un `product_version_conflict` en un paso posterior significa que otra
 * persona tocó el producto: se relee y se dice, pero no se reintenta solo, para no pisar su cambio.
 */
export function CreateProductForm({
  canPublish,
  canCreateCategory,
  categories: initialCategories,
  categoryProblem,
  categoryComplete = true,
}: {
  readonly canPublish: boolean;
  /** `products.update`, que es lo que exige crear una categoría. */
  readonly canCreateCategory: boolean;
  readonly categories: readonly CategoryOption[];
  readonly categoryProblem: string | null;
  /** El catálogo se leyó entero. */
  readonly categoryComplete?: boolean;
}) {
  const router = useRouter();
  const lock = useRef(createOperationLock());

  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [enrichment, setEnrichment] = useState<EnrichmentFields>(EMPTY_ENRICHMENT);
  const [categories, setCategories] = useState<readonly CategoryOption[]>(initialCategories);
  const [axes, setAxes] = useState<readonly AxisDraft[]>([]);
  const [variants, setVariants] = useState<readonly VariantDraft[]>([]);
  /**
   * Inventario del producto base.
   *
   * Vive fuera de `fields` porque no es un campo de texto más: es un modo con sus propios campos,
   * y meterlo en el mismo objeto plano habría reintroducido exactamente lo que el contrato acaba
   * de separar.
   */
  const [inventory, setInventory] = useState<InventoryDraft>(EMPTY_INVENTORY_DRAFT);
  const [queue, setQueue] = useState<readonly QueuedImage[]>([]);
  const [chosenPrimary, setChosenPrimary] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<CreateFlowProgress>(EMPTY_PROGRESS);
  /** Última intención pulsada. Decide qué se cuenta al terminar, no qué se guarda. */
  const [intent, setIntent] = useState<CreateIntent>('draft');
  const [tab, setTab] = useState<CreateTab>('general');

  const ids = {
    sku: useId(),
    slug: useId(),
    name: useId(),
    priceCop: useId(),
    shortDescription: useId(),
    description: useId(),
  };
  const categoryInput = useRef<HTMLInputElement | null>(null);
  const onTabChange = useCallback((key: string) => setTab(key as CreateTab), []);

  /**
   * Producto ya creado por un intento anterior.
   *
   * Con esto a mano la pantalla deja de ser un formulario de alta y pasa a ser una pantalla de
   * recuperación: los datos base ya están en el backend y aquí no se pueden cambiar, porque un
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

  /**
   * Abre la pestaña del campo, si vive en una, y le lleva el foco.
   *
   * El foco va en el siguiente fotograma: para entonces React ya pintó la pestaña, y el campo ha
   * dejado de estar dentro de un panel oculto. Enfocar antes no haría nada.
   */
  function goTo(field: CreateField) {
    const owner = TAB_OF_FIELD[field];

    if (owner !== undefined) setTab(owner);

    requestAnimationFrame(() => {
      const element =
        field === 'category'
          ? categoryInput.current
          : field === 'images'
            ? document.getElementById(SECTION_IDS.imagenes)
            : field === 'variants'
              ? document.getElementById(SECTION_IDS.variantes)
              : field === 'inventory'
                ? document.getElementById(SECTION_IDS.inventario)
                : document.getElementById(ids[field]);

      element?.focus();
      element?.scrollIntoView({ block: 'center' });
    });
  }

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

  /**
   * Encola los archivos elegidos, **con la intención del bloque desde el que se eligieron**.
   *
   * La intención viaja con cada entrada en lugar de deducirse de su posición. El bloque Portada
   * manda una sola imagen con `cover`; el de Galería, varias con `gallery`, y ninguna de ellas
   * puede acabar de portada sin que alguien lo pida.
   */
  function handleAdd(files: FileList, imageIntent: ImageIntent) {
    let next = queue;
    let lastChange: QueueChange = { queue, revoked: [], rejected: null };

    for (const file of Array.from(files)) {
      lastChange = addToQueue(next, {
        file,
        previewUrl: track(file),
        entryId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        intent: imageIntent,
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
  const inventoryIssues = inventoryProblems(inventory);
  /**
   * Los dos topes editoriales, comprobados antes de gastar la llamada.
   *
   * Solo miden longitud. Lo que la publicación exige lo dice `publicationReadiness`, y el panel no
   * lo vuelve a derivar.
   */
  const shortDescriptionIssue = shortDescriptionProblem(fields.shortDescription);
  const descriptionIssue = descriptionProblem(fields.description);

  function validate(): Errors {
    const found: Errors = {};

    // Con el producto ya creado, lo base ya está en el backend: no se vuelve a validar ni a enviar.
    if (created === null) {
      if (fields.name.trim().length === 0) {
        found.name = 'El nombre es obligatorio.';
      }

      if (!SKU_PATTERN.test(fields.sku.trim())) {
        found.sku = 'Solo mayúsculas, números y guiones. Entre 2 y 64 caracteres.';
      }

      if (!SLUG_PATTERN.test(fields.slug.trim())) {
        found.slug = 'Solo minúsculas, números y guiones. Entre 2 y 64 caracteres.';
      }

      // Pasarse del tope sí bloquea. Dejarla vacía no: un borrador sin descripción corta es
      // legítimo, y quien decide que sin ella no se publica es el backend.
      if (shortDescriptionIssue !== null) {
        found.shortDescription = shortDescriptionIssue;
      }

      if (descriptionIssue !== null) {
        found.description = descriptionIssue;
      }

      if (!price.ok) {
        found.priceCop = describeCopProblem(price.problem);
      }

      if (inventoryIssues.length > 0) {
        found.inventory = describeInventoryProblem(inventoryIssues[0]!);
      }
    }

    if (entriesMissingAltText(queue, lockedIds).length > 0) {
      found.images = 'Cada imagen necesita su texto alternativo.';
    }

    /*
     * Con imágenes en cola hace falta decir **cuál** es la portada.
     *
     * Antes se elegía por descarte —la primera de la lista— y eso convertía una imagen puesta en
     * la galería en la portada del producto sin que nadie lo pidiera. Si no hay candidata, se
     * bloquea el envío en lugar de decidirlo por su cuenta.
     */
    if (queue.length > 0 && chosenPrimary === null) {
      found.images = 'Elige la portada antes de guardar: es la primera imagen que verá la tienda.';
    }

    if (
      axisProblems.length > 0 ||
      hasEnrichmentProblems(enrichmentIssues) ||
      variantValidation.general.length > 0 ||
      Object.keys(variantValidation.byDraft).length > 0
    ) {
      found.variants =
        'Revisa la clasificación, el contenido y las variantes: hay datos que no se pueden guardar así.';
    }

    return found;
  }

  /** Lo que se envía, ya montado: el `POST`, el `PATCH` y las listas de imágenes y variantes. */
  function flowInput(submitIntent: CreateIntent): CreateFlowInput {
    return {
      intent: submitIntent,
      fields: {
        sku: fields.sku.trim(),
        slug: fields.slug.trim(),
        name: fields.name.trim(),
        priceCop: price.ok ? price.value : 0,
        /*
         * El inventario se **omite** si el borrador todavía no es válido. Omitirlo significa lo
         * que dice el contrato —«cero unidades controladas»—, no una cantidad inventada, y
         * `validate()` impide llegar aquí con un borrador roto.
         */
        ...(inventoryBody(inventory) === null
          ? {}
          : { inventory: inventoryBody(inventory) as SetInventoryControl }),
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

  async function submit(resume: CreateFlowProgress, submitIntent: CreateIntent) {
    if (!acquire(lock.current)) {
      return;
    }

    const found = validate();

    setErrors(found);

    const first = firstProblemField(found);

    if (first !== null) {
      release(lock.current);
      goTo(first);

      return;
    }

    setBusy(true);
    setFailure(null);
    setNotice(null);
    setIntent(submitIntent);

    const input = flowInput(submitIntent);
    let result = await runCreateFlow(input, flowDeps, resume);

    const pendingPublication =
      submitIntent === 'publish' &&
      !result.published &&
      result.product?.publicationReadiness.ready !== true;

    if (result.failure === null && result.product !== null && !pendingPublication) {
      setProgress(result);
      // Salida terminal: el candado no se libera porque ya se está navegando.
      router.push(`/panel/productos/${result.product.id}`);

      return;
    }

    /*
     * Un conflicto de versión **después** del `POST` significa que otra persona tocó el producto.
     * Se relee para que el reintento parta de lo que de verdad hay, pero no se reintenta solo: lo
     * que haya cambiado tiene que verse antes de volver a enviar.
     */
    if (
      result.failure !== null &&
      result.failure.code === 'version_conflict' &&
      result.product !== null
    ) {
      const reread = await readProduct(result.product.id);

      if (reread.ok) {
        result = withRereadProduct(result, reread.data);
        setNotice(
          'Alguien modificó el producto mientras se completaba el alta. Ya se leyó la versión actual: ábrelo para revisar qué cambió antes de reintentar lo pendiente.',
        );
      }
    }

    setProgress(result);
    release(lock.current);
    setBusy(false);

    if (result.failure === null) {
      return;
    }

    const field = productFailureField(result.failure.code);

    setFailure({
      message: describeCatalogFailure(result.failure.code, result.failure.reference),
      field,
    });

    // El SKU, la URL o la categoría: se marca el campo y se lleva el foco allí.
    if (field !== null) {
      setErrors({ [field]: describeCatalogFailure(result.failure.code) });
      goTo(field);
    }
  }

  const summary = describeProgress(progress, { queue, variants });
  /** Hay clasificación o contenido escrito que todavía no ha llegado al backend. */
  const enrichmentPending =
    !progress.enriched && enrichmentBody(enrichment, declaredAxes(axes), 'create') !== null;
  const pendingImages = summary.pendingImages.length;
  const pendingVariants = summary.pendingVariants.length;
  const hasPending =
    created !== null &&
    (progress.failure !== null || (intent === 'publish' && !progress.published && canPublish));
  /** Lo base ya está en el backend: esos campos se ven, pero no se editan desde aquí. */
  const baseLocked = busy || created !== null;
  const problems = CREATE_FIELD_ORDER.filter((field) => errors[field] !== undefined);

  function field(key: 'sku' | 'slug' | 'name') {
    return {
      value: fields[key],
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        setFields((current) => ({ ...current, [key]: event.target.value }));
        // Al corregir el campo marcado, el aviso se retira de ese campo.
        setErrors((current) => {
          const next = { ...current };

          delete next[key];

          return next;
        });
      },
      disabled: baseLocked,
    };
  }

  return (
    <form
      className={styles.editor}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit(progress, 'draft');
      }}
    >
      <div aria-live="assertive">
        {failure !== null && created === null ? (
          <p className={styles.error} role="alert">
            {failure.message}
          </p>
        ) : null}
      </div>

      {created === null ? null : (
        <div className={styles.recovery} role="status">
          <p>
            <strong>El producto fue creado como borrador.</strong>{' '}
            {progress.failure === null
              ? null
              : `Falló este paso: ${describeFailedStep(progress.failure, { queue, variants })}`}
          </p>
          {failure === null ? null : <p>{failure.message}</p>}
          {notice === null ? null : <p>{notice}</p>}
          <p>
            {progress.enriched
              ? 'La clasificación, la categoría y el contenido ya están guardados. '
              : enrichmentPending
                ? 'Falta guardar la clasificación, la categoría y el contenido. '
                : ''}
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
            {progress.published
              ? 'El producto está publicado.'
              : intent === 'publish' && progress.failure === null
                ? `No se publicó: ${describeReadiness(created.publicationReadiness).toLowerCase()}. El borrador quedó guardado.`
                : 'No se ha publicado.'}
          </p>
          <p>Reintentar no vuelve a crear el producto ni reenvía lo que ya se guardó.</p>
          <div className={styles.recoveryActions}>
            <Link className={styles.buttonSecondary} href={`/panel/productos/${created.id}`}>
              Abrir producto
            </Link>
            {progress.failure === null ? null : (
              <button className={styles.button} disabled={busy} type="submit">
                {busy ? 'Reintentando…' : 'Reintentar lo pendiente'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`${styles.editorTitle} ${styles.anchorTarget}`} id={SECTION_IDS.basica}>
        <Field
          error={errors.name}
          id={ids.name}
          input={field('name')}
          label="Nombre del producto"
          large
          required
        />
        <div className={styles.identifiers}>
          <Field
            error={errors.sku}
            hint="Inmutable una vez creado. Tampoco se libera al archivar."
            id={ids.sku}
            input={field('sku')}
            label="SKU"
            required
          />
          <Field
            error={errors.slug}
            hint="Es la URL pública. Inmutable una vez creado."
            id={ids.slug}
            input={field('slug')}
            label="URL (slug)"
            required
          />
        </div>
      </div>

      <div className={styles.editorBody}>
        <div className={styles.editorMain}>
          <section className={`${styles.card} ${styles.anchorTarget}`} id={SECTION_IDS.contenido}>
            <div className={styles.cardPad}>
              <SectionHeading
                hint="Lo que se lee en la ficha pública."
                icon="contenido"
                title="Descripción"
              />
              <CountedTextarea
                disabled={baseLocked}
                error={errors.shortDescription}
                hint="Resumen visible junto al precio. Escribe 1 o 2 frases claras; evita repetir el nombre."
                id={ids.shortDescription}
                label="Descripción corta"
                max={SHORT_DESCRIPTION_MAX_LENGTH}
                onChange={(value) =>
                  setFields((current) => ({ ...current, shortDescription: value }))
                }
                requirement="necesaria"
                rows={2}
                value={fields.shortDescription}
              />
              <CountedTextarea
                disabled={baseLocked}
                error={errors.description}
                hint="Se muestra dentro de Descripción en la ficha. Explica el uso y los beneficios sin repetir materiales, medidas, garantía o cuidados."
                id={ids.description}
                label="Descripción detallada"
                max={DESCRIPTION_MAX_LENGTH}
                onChange={(value) => setFields((current) => ({ ...current, description: value }))}
                requirement="opcional"
                rows={6}
                value={fields.description}
              />
              <VisibleContentFields
                disabled={busy || progress.enriched}
                fields={enrichment}
                onChange={setEnrichment}
                problems={enrichmentIssues}
              />
              {progress.enriched ? (
                <p className={styles.hint}>
                  Ya está guardado en el producto. Para cambiarlo, ábrelo y edítalo desde su
                  detalle.
                </p>
              ) : null}
            </div>
          </section>

          <ProductDataTabs
            active={tab}
            onChange={onTabChange}
            tabs={[
              {
                key: 'general',
                label: 'General',
                anchor: SECTION_IDS.precio,
                hasProblem: errors.priceCop !== undefined,
                content: (
                  <>
                    <CopField
                      disabled={baseLocked}
                      hint="Pesos enteros, sin centavos."
                      id={ids.priceCop}
                      label="Precio"
                      onChange={(value) =>
                        setFields((current) => ({ ...current, priceCop: value }))
                      }
                      required
                      value={fields.priceCop}
                    />
                    {errors.priceCop === undefined ? null : (
                      <p className={styles.fieldError} role="alert">
                        {errors.priceCop}
                      </p>
                    )}
                    {variants.length === 0 ? null : (
                      <p className={styles.notice}>
                        Con variantes, el precio y el inventario se gestionan en cada una. El precio
                        y el stock base se guardan igual y no se borran, pero dejan de ser lo que se
                        vende.
                      </p>
                    )}
                  </>
                ),
              },
              {
                key: 'inventario',
                label: 'Inventario',
                anchor: SECTION_IDS.inventario,
                hasProblem: errors.inventory !== undefined,
                content: (
                  <>
                    <InventoryFields
                      disabled={baseLocked}
                      draft={inventory}
                      onChange={setInventory}
                    />
                    {inventoryIssues.length === 0 ? null : (
                      <p className={styles.fieldError} role="alert">
                        {describeInventoryProblem(inventoryIssues[0]!)}
                      </p>
                    )}
                    {variants.length === 0 ? null : (
                      <p className={styles.hint}>
                        Con variantes, esto deja de ser lo que se vende: cada variante lleva su
                        propia modalidad y su propio inventario. El valor base se guarda igual y no
                        se borra.
                      </p>
                    )}
                  </>
                ),
              },
              {
                key: 'clasificacion',
                label: 'Clasificación',
                anchor: SECTION_IDS.clasificacion,
                hasProblem: enrichmentIssues.classification.length > 0,
                content: (
                  <ClassificationFields
                    disabled={busy || progress.enriched}
                    fields={enrichment}
                    mode="create"
                    onChange={setEnrichment}
                    problems={enrichmentIssues.classification}
                  />
                ),
              },
              {
                key: 'variantes',
                label: 'Variantes',
                anchor: SECTION_IDS.variantes,
                hasProblem: errors.variants !== undefined,
                content: (
                  <>
                    <p className={styles.notice}>
                      Un color, un acabado o una medida se gestionan como variante{' '}
                      <strong>solo</strong> cuando cada combinación es un artículo vendible de
                      verdad, con su propio SKU, su precio y su inventario. Si solo hay que
                      describirlos, van en «Detalles»: convertir texto libre en variantes crea
                      artículos que nadie puede comprar.
                    </p>
                    <AttributeAxesEditor
                      axes={axes}
                      disabled={busy || progress.enriched}
                      newId={() => crypto.randomUUID()}
                      onChange={setAxes}
                      problems={axisProblems}
                    />
                    <VariantDraftEditor
                      activeCount={
                        created?.variants.filter((variant) => variant.status === 'active').length ??
                        0
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
                            inventory: EMPTY_INVENTORY_DRAFT,
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
                    {errors.variants === undefined ? null : (
                      <p className={styles.fieldError} role="alert">
                        {errors.variants}
                      </p>
                    )}
                  </>
                ),
              },
              {
                key: 'detalles',
                label: 'Detalles',
                anchor: SECTION_IDS.detalles,
                hasProblem: Object.keys(enrichmentIssues.specifications).length > 0,
                content: (
                  <AdditionalDetailsFields
                    disabled={busy || progress.enriched}
                    fields={enrichment}
                    mode="create"
                    onChange={setEnrichment}
                    problems={enrichmentIssues}
                  />
                ),
              },
            ]}
          />

          <p className={styles.hint}>
            {created === null
              ? 'Nada se ha enviado todavía: los datos, las imágenes y las variantes viven en esta pantalla hasta que guardes.'
              : 'El producto ya existe. Lo que falte se reintenta sin repetir lo guardado.'}
          </p>
        </div>

        <aside aria-label="Publicación, categoría e imágenes" className={styles.editorSide}>
          <section className={styles.card}>
            <div className={styles.cardPad}>
              <div className={styles.statusRow}>
                <h2 className={styles.sectionTitle}>Estado</h2>
                {created === null ? (
                  <span className={styles.badgeUnknown}>Sin guardar</span>
                ) : (
                  <StatusBadge status={created.status} />
                )}
              </div>
              <div className={styles.sideActions}>
                {created === null ? (
                  <button className={styles.buttonSecondary} disabled={busy} type="submit">
                    {busy && intent === 'draft' ? 'Guardando…' : 'Guardar borrador'}
                  </button>
                ) : (
                  <Link className={styles.buttonSecondary} href={`/panel/productos/${created.id}`}>
                    Abrir producto
                  </Link>
                )}
                {canPublish && (created === null || hasPending) ? (
                  <button
                    className={styles.button}
                    disabled={busy}
                    onClick={() => void submit(progress, 'publish')}
                    type="button"
                  >
                    {busy && intent === 'publish'
                      ? 'Guardando y publicando…'
                      : created === null
                        ? 'Publicar'
                        : 'Reintentar y publicar'}
                  </button>
                ) : null}
                <PreviewDialog>
                  <Preview
                    categoryName={
                      enrichment.category.kind === 'catalog'
                        ? enrichment.category.category.name
                        : null
                    }
                    fields={fields}
                    price={price.ok ? price.value : null}
                    primaryEntryId={chosenPrimary}
                    queue={queue}
                    variantCount={variants.length}
                  />
                </PreviewDialog>
              </div>
              {canPublish ? null : (
                <p className={styles.hint}>Tu rol puede guardar borradores, no publicar.</p>
              )}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardPad}>
              <SectionHeading icon="estado" title="Preparación" />
              {problems.length === 0 ? null : (
                <>
                  <p className={styles.pendingTitle}>Antes de guardar, corrige:</p>
                  <ul className={styles.problemLinks}>
                    {problems.map((problem) => (
                      <li key={problem}>
                        <button
                          className={styles.problemLink}
                          onClick={() => goTo(problem)}
                          type="button"
                        >
                          {FIELD_LABELS[problem]}: {errors[problem]}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {created === null ? (
                <p className={styles.hint}>
                  El producto nace como <strong>borrador</strong>. Al guardar, el backend indica qué
                  falta para poder publicarlo.
                </p>
              ) : (
                <PublicationChecklist readiness={created.publicationReadiness} />
              )}
            </div>
          </section>

          <section className={`${styles.card} ${styles.anchorTarget}`} id={SECTION_IDS.categoria}>
            <div className={styles.cardPad}>
              <SectionHeading icon="clasificacion" title="Categoría" />
              <CategoryPicker
                canCreate={canCreateCategory}
                catalog={categories}
                catalogComplete={categoryComplete}
                catalogProblem={categoryProblem}
                choice={enrichment.category}
                disabled={busy || progress.enriched}
                error={errors.category ?? null}
                inputRef={categoryInput}
                onChange={(category) => {
                  setEnrichment((current) => ({ ...current, category }));
                  setErrors((current) => {
                    const next = { ...current };

                    delete next.category;

                    return next;
                  });
                }}
                onCreated={(category) =>
                  setCategories((current) => withCreatedCategory(current, category))
                }
              />
              {progress.enriched ? (
                <p className={styles.hint}>Ya está guardada. Para cambiarla, abre el producto.</p>
              ) : null}
            </div>
          </section>

          <div className={styles.anchorTarget} id={SECTION_IDS.imagenes} tabIndex={-1}>
            <ImageQueueEditor
              canAdd={created === null}
              disabled={busy}
              lockedIds={lockedIds}
              onAdd={handleAdd}
              onAlt={(entryId, value) => applyChange(setAltText(queue, entryId, value, lockedIds))}
              onMove={(entryId, direction) =>
                applyChange(moveInQueue(queue, entryId, direction, lockedIds))
              }
              onPrimary={(entryId) => applyChange(setCoverIntent(queue, entryId, lockedIds))}
              onRemove={(entryId) => applyChange(removeFromQueue(queue, entryId, lockedIds))}
              onReplace={(entryId, file) =>
                applyChange(
                  replaceFile(queue, entryId, file, track(file), crypto.randomUUID(), lockedIds),
                )
              }
              queue={queue}
            />
            {errors.images === undefined ? null : (
              <p className={styles.error} role="alert">
                {errors.images}
              </p>
            )}
          </div>
        </aside>
      </div>
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
  categoryName,
}: {
  readonly fields: Fields;
  /** `null` mientras el precio escrito no sea convertible: no se inventa un número. */
  readonly price: number | null;
  readonly queue: readonly QueuedImage[];
  readonly primaryEntryId: string | null;
  readonly variantCount: number;
  readonly categoryName: string | null;
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
      {categoryName === null ? null : <p className={styles.previewText}>{categoryName}</p>}
      <p className={styles.previewName}>
        {fields.name.trim() === '' ? 'Nombre del producto' : fields.name}
      </p>
      <p className={styles.previewPrice}>{price === null ? '—' : formatCop(price)}</p>
      {fields.shortDescription.trim() === '' ? null : (
        <p className={styles.previewText}>{fields.shortDescription}</p>
      )}
      <p className={styles.previewText}>
        {queue.length} {queue.length === 1 ? 'imagen' : 'imágenes'} en cola
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
  large,
  input,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly required?: boolean | undefined;
  /** El nombre del producto: más grande, como título del editor. */
  readonly large?: boolean | undefined;
  readonly input: {
    readonly value: string;
    readonly onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    readonly disabled: boolean;
  };
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // El error se anuncia primero: es lo que hay que corregir.
  const described = [error === undefined ? null : errorId, hint === undefined ? null : hintId]
    .filter((value): value is string => value !== null)
    .join(' ');
  const className =
    large === true
      ? error === undefined
        ? styles.titleInput
        : styles.titleInputInvalid
      : error === undefined
        ? styles.input
        : styles.inputInvalid;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required === true ? ' *' : ''}
      </label>
      <input
        className={className}
        id={id}
        type="text"
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
        <span className={styles.fieldError} id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
