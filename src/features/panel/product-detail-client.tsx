'use client';

import { useId, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';
import type { AdminProduct, SetInventoryControl } from '@/lib/api/catalog';
import { DESCRIPTION_MAX_LENGTH, SHORT_DESCRIPTION_MAX_LENGTH } from '@/lib/api/variant-limits';

import styles from './catalog.module.css';
import {
  setProductInventory,
  transitionProduct,
  updateProduct,
  type MutationResult,
} from './catalog-client';
import { describeCatalogFailure } from './catalog-errors';
import { CopField } from './cop-field';
import { CollapsibleSection } from './collapsible-section';
import { CountedTextarea } from './counted-field';
import {
  enrichmentBody,
  enrichmentFromProduct,
  enrichmentProblems,
  hasEnrichmentProblems,
} from './enrichment';
import {
  AdditionalDetailsFields,
  ClassificationFields,
  VisibleContentFields,
} from './enrichment-fields';
import { formatDateTime } from './format';
import {
  createKeyLedger,
  inventoryFingerprint,
  inventoryScope,
  keyFor,
  releaseKey,
} from './operation-key';
import { ProductInventoryCard, type InventorySubmitResult } from './inventory-card';
import { readInventory } from './inventory-control';
import { formatCop, parseCop } from './money';
import { descriptionProblem, shortDescriptionProblem } from './product-content';
import {
  canPublishNow,
  imagePermissions,
  variantPermissions,
  type DetailPermissions,
} from './product-permissions';
import { ProductImages } from './product-images';
import { ProductVariants } from './product-variants';
import { PublicationChecklist } from './publication-checklist';
import { describeReadiness, SECTION_IDS } from './publication-readiness';
import { SectionHeading } from './section-icon';
import { StatusBadge } from './status-badge';

/**
 * Detalle, edición y acciones de un producto.
 *
 * Todo el estado parte del producto que renderizó el servidor y se **reemplaza** por la respuesta
 * autoritativa de cada mutación: el backend devuelve el producto completo —versión,
 * `publicationReadiness`, imágenes y variantes incluidas—, así que el panel nunca calcula por su
 * cuenta cómo quedó. En particular, la preparación para publicar **no se toca de forma optimista**:
 * si se adelantara en React, el botón diría «listo» antes de que el backend lo confirme.
 *
 * Un `409` no se trata como un error más: significa que alguien cambió el producto entre la
 * lectura y el envío. Se ofrece recargar en lugar de reintentar a ciegas, porque reintentar con la
 * misma `expectedVersion` volvería a fallar y con la nueva pisaría el cambio ajeno.
 */
export function ProductDetailClient({
  initial,
  permissions,
  role,
}: {
  readonly initial: AdminProduct;
  readonly permissions: DetailPermissions;
  /** Rol verificado por el servidor. Decide qué acciones de variante se pintan. */
  readonly role: string;
}) {
  const router = useRouter();
  const [product, setProduct] = useState(initial);
  const [enrichment, setEnrichment] = useState(() => enrichmentFromProduct(initial));
  /**
   * Los dos textos editoriales se controlan desde React, no desde `FormData`.
   *
   * Sin estado no habría contador vivo ni forma de bloquear el envío antes de gastar la llamada: un
   * `defaultValue` solo se lee al enviar, y para entonces ya es tarde para avisar.
   */
  const [shortDescription, setShortDescription] = useState(initial.shortDescription);
  const [description, setDescription] = useState(initial.description);
  const [price, setPrice] = useState(() => String(initial.priceCop));
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(createOperationLock());

  /**
   * Clave de idempotencia de la operación de inventario **en curso**.
   *
   * Se genera una vez por operación y se conserva mientras esa misma operación se reintente: así
   * un fallo de red después de que el ajuste se aplicara no lo aplica dos veces. Se descarta al
   * completarse, para que el siguiente ajuste sea una operación distinta.
   */
  const inventoryKeys = useRef(createKeyLedger());

  /**
   * Problemas del contenido editorial, calculados en cada render.
   *
   * Se declaran antes de los manejadores porque el guardado los consulta para no gastar una llamada
   * en un cuerpo que ya se sabe inválido, y la pantalla los pinta junto a su propio campo.
   */
  const enrichmentIssues = enrichmentProblems(enrichment);
  const shortDescriptionIssue = shortDescriptionProblem(shortDescription) ?? undefined;
  const descriptionIssue = descriptionProblem(description) ?? undefined;
  /** Hay algo que el backend rechazaría. Guardar se deshabilita en vez de gastar la llamada. */
  const blocked =
    shortDescriptionIssue !== undefined ||
    descriptionIssue !== undefined ||
    hasEnrichmentProblems(enrichmentIssues);

  const ids = {
    name: useId(),
  };

  function begin(): boolean {
    if (!acquire(lock.current)) {
      return false;
    }

    setBusy(true);
    setFailure(null);
    setNotice(null);

    return true;
  }

  function settle<T>(result: MutationResult<T>, onSuccess: (data: T) => void) {
    release(lock.current);
    setBusy(false);

    if (result.ok) {
      setConflict(false);
      onSuccess(result.data);

      return;
    }

    setConflict(result.code === 'version_conflict');
    setFailure(describeCatalogFailure(result.code));
  }

  /**
   * Reemplaza el estado local con la respuesta autoritativa del backend.
   *
   * Incluye los formularios: si se sincronizara solo el producto, los campos seguirían mostrando lo
   * que se escribió antes de la respuesta y el siguiente guardado enviaría eso, no lo que el
   * backend guardó.
   */
  function applyProduct(next: AdminProduct) {
    setProduct(next);
    setEnrichment(enrichmentFromProduct(next));
    setShortDescription(next.shortDescription);
    setDescription(next.description);
    setPrice(String(next.priceCop));
    setConflict(false);
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!begin()) {
      return;
    }

    const parsedPrice = parseCop(price);

    if (!parsedPrice.ok) {
      release(lock.current);
      setBusy(false);
      setFailure('Revisa el precio antes de guardar.');

      return;
    }

    /*
     * Lo que ya se sabe que el backend va a rechazar no se envía.
     *
     * La descripción corta vacía **sí** se envía: el contrato la exige para publicar, no para
     * guardar, y vaciarla es una edición legítima que el checklist recoge después. Lo que bloquea
     * es pasarse de los topes, que es lo que devolvería un `400`.
     */
    if (blocked) {
      release(lock.current);
      setBusy(false);
      setFailure('Revisa el contenido marcado en rojo antes de guardar.');

      return;
    }

    const data = new FormData(event.currentTarget);

    // Los ejes no viajan aquí: se declaran en la sección de variantes, que es donde se ven sus
    // consecuencias. Enviarlos desde dos formularios distintos invitaría a pisarlos sin querer.
    const result = await updateProduct(product.id, {
      ...enrichmentBody(enrichment, product.attributes, 'edit'),
      expectedVersion: product.version,
      name: String(data.get('name') ?? '').trim(),
      shortDescription,
      description,
      priceCop: parsedPrice.value,
    });

    settle(result, (updated) => {
      applyProduct(updated);
      setNotice('Cambios guardados.');
    });
  }

  async function handleTransition(transition: 'publish' | 'archive') {
    if (!begin()) {
      return;
    }

    const result = await transitionProduct(product.id, transition, product.version);

    settle(result, (updated) => {
      applyProduct(updated);
      setNotice(transition === 'publish' ? 'Producto publicado.' : 'Producto archivado.');
    });
  }

  /**
   * Establece el inventario del producto base.
   *
   * Manda el **estado final**, no una diferencia, y con la versión que se está viendo. Si alguien
   * lo cambió entre medias, el backend responde `409` y `settle` ofrece recargar: reintentar con
   * la versión nueva escribiría encima de un cambio que no se ha visto.
   *
   * Devuelve si el backend lo confirmó. El formulario lo usa para cerrarse —o no—: deducirlo de
   * que la promesa terminara cerraba el editor encima de un error.
   */
  async function handleInventory(inventory: SetInventoryControl): Promise<InventorySubmitResult> {
    if (!begin()) {
      return { applied: false };
    }

    /*
     * La clave va atada a **esta** operación: destino, versión y cuerpo canónico. Reintentar lo
     * mismo la reutiliza; cambiar la cantidad, el umbral, el modo o la versión estrena clave,
     * porque ya es otra operación y el backend no debe confundirla con la anterior.
     */
    const target = { productId: product.id, variantId: null, expectedVersion: product.version };
    const key = keyFor(
      inventoryKeys.current,
      inventoryScope(target),
      inventoryFingerprint(target, inventory),
      () => crypto.randomUUID(),
    );

    const result = await setProductInventory(product.id, {
      expectedVersion: product.version,
      inventory,
      idempotencyKey: key,
    });

    settle(result, (applied) => {
      applyProduct(applied.product);
      setNotice(
        applied.replayed
          ? 'Ese cambio ya se había aplicado; el inventario quedó como ya estaba.'
          : 'Inventario actualizado.',
      );
      // Operación cerrada: la clave deja de estar viva. Solo aquí, en el camino de éxito: un fallo
      // la **conserva** para que el reintento del mismo cuerpo sea el mismo cambio.
      releaseKey(inventoryKeys.current, inventoryScope(target));
    });

    return { applied: result.ok };
  }

  const baseReading = readInventory(product.inventory);
  /**
   * Con la primera variante, el precio y el inventario pasan a gestionarse por variante.
   *
   * El contrato lo dice al revés: «A product with no variants sells through its own SKU, price and
   * stock». Los valores base **no se borran ni se transforman**: dejan de ser lo que se vende.
   */
  const sellsByVariant = product.variants.some((variant) => variant.status === 'active');
  const readiness = product.publicationReadiness;

  return (
    <>
      <div aria-live="assertive">
        {failure === null ? null : (
          <p className={styles.error} role="alert">
            {conflict ? 'Los datos cambiaron. ' : ''}
            {failure}{' '}
            {conflict ? (
              <button
                className={styles.buttonSecondary}
                onClick={() => router.refresh()}
                type="button"
              >
                Recargar datos
              </button>
            ) : null}
          </p>
        )}
      </div>
      <div aria-live="polite">
        {notice === null ? null : <p className={styles.notice}>{notice}</p>}
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.stack}>
          {permissions.canUpdate ? (
            <form noValidate onSubmit={handleSave}>
              <div className={styles.stack}>
                <section className={styles.card} id={SECTION_IDS.basica}>
                  <div className={styles.cardPad}>
                    <SectionHeading
                      hint="Nombre, descripción corta e identificadores."
                      icon="basica"
                      title="Información básica"
                    />
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={ids.name}>
                        Nombre *
                      </label>
                      <input
                        className={styles.input}
                        defaultValue={product.name}
                        disabled={busy}
                        id={ids.name}
                        name="name"
                        required
                        type="text"
                      />
                    </div>
                    <CountedTextarea
                      disabled={busy}
                      error={shortDescriptionIssue}
                      hint="Resumen visible junto al precio. Escribe 1 o 2 frases claras; evita repetir el nombre."
                      label="Descripción corta"
                      max={SHORT_DESCRIPTION_MAX_LENGTH}
                      onChange={setShortDescription}
                      requirement="necesaria"
                      rows={2}
                      value={shortDescription}
                    />

                    <h3 className={styles.subTitle}>Identificadores</h3>
                    <dl className={styles.definition}>
                      <dt>SKU</dt>
                      <dd className={styles.immutable}>{product.sku}</dd>
                      <dt>Slug</dt>
                      <dd className={styles.immutable}>{product.slug}</dd>
                    </dl>
                    <p className={styles.hint}>
                      SKU y slug son inmutables: el backend no los deja cambiar.
                    </p>
                  </div>
                </section>

                <section className={styles.card} id={SECTION_IDS.clasificacion}>
                  <div className={styles.cardPad}>
                    <SectionHeading
                      hint="Dónde vive el producto dentro del catálogo."
                      icon="clasificacion"
                      title="Clasificación"
                    />
                    <ClassificationFields
                      disabled={busy}
                      fields={enrichment}
                      mode="edit"
                      onChange={setEnrichment}
                      problems={enrichmentIssues.classification}
                    />
                  </div>
                </section>

                <section className={styles.card} id={SECTION_IDS.contenido}>
                  <div className={styles.cardPad}>
                    <SectionHeading
                      hint="Lo que se lee en la ficha pública."
                      icon="contenido"
                      title="Contenido visible"
                    />
                    <CountedTextarea
                      disabled={busy}
                      error={descriptionIssue}
                      hint="Se muestra dentro de Descripción en la ficha. Explica el uso y los beneficios sin repetir materiales, medidas, garantía o cuidados."
                      label="Descripción detallada"
                      max={DESCRIPTION_MAX_LENGTH}
                      onChange={setDescription}
                      requirement="opcional"
                      rows={8}
                      value={description}
                    />
                    <VisibleContentFields
                      disabled={busy}
                      fields={enrichment}
                      onChange={setEnrichment}
                      problems={enrichmentIssues}
                    />
                  </div>
                </section>

                <CollapsibleSection
                  defaultOpen={false}
                  forceOpen={Object.keys(enrichmentIssues.specifications).length > 0}
                  hint="Materiales, medidas, garantía y cuidados. Todos opcionales."
                  icon="detalles"
                  id={SECTION_IDS.detalles}
                  title="Detalles adicionales"
                >
                  <AdditionalDetailsFields
                    disabled={busy}
                    fields={enrichment}
                    mode="edit"
                    onChange={setEnrichment}
                    problems={enrichmentIssues}
                  />
                </CollapsibleSection>

                <section className={styles.card} id={SECTION_IDS.precio}>
                  <div className={styles.cardPad}>
                    <SectionHeading icon="precio" title="Precio" />
                    <CopField
                      disabled={busy}
                      hint="Pesos enteros. Al backend viaja el número, no el texto."
                      label="Precio"
                      onChange={setPrice}
                      required
                      value={price}
                    />
                    {sellsByVariant ? (
                      <p className={styles.hint}>
                        Se conserva, pero lo que se vende es el precio de cada variante.
                      </p>
                    ) : null}
                  </div>
                </section>

                {sellsByVariant ? (
                  <p className={styles.notice}>
                    Este producto se vende por variantes: el precio y el inventario que valen son
                    los de cada variante. Estos valores base se conservan tal cual, pero ya no son
                    lo que se compra.
                  </p>
                ) : null}

                <div className={styles.actionBar}>
                  <div className={styles.actionBarText}>
                    Se envía con la versión {product.version}, la que estás viendo.
                  </div>
                  <div className={styles.actionBarButtons}>
                    <button className={styles.button} disabled={busy || blocked} type="submit">
                      {busy ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                  </div>
                  {blocked ? (
                    <p className={styles.hint}>
                      Corrige lo marcado en rojo para poder guardar. Los campos opcionales pueden
                      quedarse vacíos.
                    </p>
                  ) : null}
                </div>
              </div>
            </form>
          ) : (
            <section className={styles.card} id={SECTION_IDS.basica}>
              <div className={styles.cardPad}>
                <SectionHeading icon="basica" title="Información básica" />
                <dl className={styles.definition}>
                  <dt>Nombre</dt>
                  <dd>{product.name}</dd>
                  <dt>SKU</dt>
                  <dd className={styles.immutable}>{product.sku}</dd>
                  <dt>Slug</dt>
                  <dd className={styles.immutable}>{product.slug}</dd>
                  <dt>Precio</dt>
                  <dd>{formatCop(product.priceCop)}</dd>
                </dl>
                <p className={styles.hint}>Tu rol no permite editar este producto.</p>
              </div>
            </section>
          )}

          {/*
            El inventario vive en su **propia** tarjeta, fuera del formulario del producto.

            No es una decisión de maquetación: tiene su propia ruta, su propia clave de
            idempotencia y su propia confirmación al cambiar de modo. Dentro de «Guardar cambios»,
            corregir una descripción habría reescrito también las existencias.
          */}
          <section className={styles.card} id={SECTION_IDS.inventario}>
            <div className={styles.cardPad}>
              <SectionHeading icon="inventario" title="Inventario del producto" />
              <ProductInventoryCard
                busy={busy}
                canEdit={permissions.canAdjustInventory}
                inventory={product.inventory}
                onSubmit={handleInventory}
                sellsByVariant={sellsByVariant}
              />
            </div>
          </section>

          <div id={SECTION_IDS.imagenes}>
            <ProductImages
              canArchive={imagePermissions(role).canArchive}
              canEdit={imagePermissions(role).canEdit}
              onProduct={applyProduct}
              product={product}
            />
          </div>

          <div id={SECTION_IDS.variantes}>
            <ProductVariants
              onProduct={applyProduct}
              permissions={variantPermissions(role)}
              product={product}
            />
          </div>
        </div>

        <aside className={styles.detailAside}>
          <section className={styles.card}>
            <div className={styles.cardPad}>
              <SectionHeading icon="estado" title="Estado del producto" />
              <dl className={styles.definition}>
                <dt>Estado</dt>
                <dd>
                  <StatusBadge status={product.status} />
                </dd>
                <dt>Categoría</dt>
                <dd>{product.category === null ? 'Sin categoría' : product.category.name}</dd>
                <dt>Tipo</dt>
                <dd>{product.productType === null ? 'Sin tipo' : product.productType.name}</dd>
                <dt>Destacado</dt>
                <dd>{product.featured ? 'Sí' : 'No'}</dd>
                <dt>Precio base</dt>
                <dd>{formatCop(product.priceCop)}</dd>
                <dt>Inventario base</dt>
                <dd className={baseReading.tone === 'lowStock' ? styles.lowStock : undefined}>
                  {/* En modo disponibilidad no hay cantidad: se dice el estado, no un número. */}
                  {baseReading.quantityLabel ?? baseReading.label}
                </dd>
                <dt>Versión</dt>
                <dd>{product.version}</dd>
                <dt>Actualizado</dt>
                <dd>{formatDateTime(product.updatedAt)}</dd>
              </dl>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardPad}>
              <SectionHeading icon="vistaPrevia" title="Preparación para publicar" />
              <PublicationChecklist readiness={readiness} />

              {permissions.canPublish || permissions.canArchive ? (
                <div className={styles.actions}>
                  {permissions.canPublish && product.status !== 'active' ? (
                    <button
                      className={styles.button}
                      disabled={busy || !canPublishNow(permissions, product)}
                      onClick={() => void handleTransition('publish')}
                      type="button"
                    >
                      Publicar producto
                    </button>
                  ) : null}
                  {permissions.canArchive && product.status !== 'archived' ? (
                    <button
                      className={styles.buttonDanger}
                      disabled={busy}
                      onClick={() => void handleTransition('archive')}
                      type="button"
                    >
                      Archivar producto
                    </button>
                  ) : null}
                </div>
              ) : null}

              {permissions.canPublish && product.status !== 'active' && !readiness.ready ? (
                <p className={styles.hint}>
                  «Publicar producto» está deshabilitado:{' '}
                  {describeReadiness(readiness).toLowerCase()}. Complétalos y vuelve a guardar; el
                  backend recalcula esta lista en cada respuesta.
                </p>
              ) : null}
              {permissions.canPublish ? null : (
                <p className={styles.hint}>Tu rol no incluye publicar ni archivar.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
