'use client';

import { useId, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';
import type { AdminProduct } from '@/lib/api/catalog';

import styles from './catalog.module.css';
import {
  adjustInventory,
  transitionProduct,
  updateProduct,
  type MutationResult,
} from './catalog-client';
import { describeCatalogFailure } from './catalog-errors';
import { enrichmentBody, enrichmentFromProduct, enrichmentProblems } from './enrichment';
import { EnrichmentFieldset } from './enrichment-fields';
import { formatCop, formatDateTime } from './format';
import { variantPermissions, type DetailPermissions } from './product-permissions';
import { ProductImages } from './product-images';
import { ProductVariants } from './product-variants';
import { StatusBadge } from './status-badge';

/**
 * Detalle, edición y acciones de un producto.
 *
 * Todo el estado parte del producto que renderizó el servidor y se **reemplaza** por la respuesta
 * autoritativa de cada mutación: el backend devuelve el producto completo, incluida la nueva
 * `version`, así que el panel nunca calcula por su cuenta cómo quedó.
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
  const inventoryKey = useRef<string | null>(null);

  const ids = {
    name: useId(),
    shortDescription: useId(),
    description: useId(),
    priceCop: useId(),
    lowStockThreshold: useId(),
    delta: useId(),
    reason: useId(),
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
   * Incluye el formulario de clasificación: si se sincronizara solo el producto, los campos
   * seguirían mostrando lo que se escribió antes de la respuesta y el siguiente guardado enviaría
   * eso, no lo que el backend guardó.
   */
  function applyProduct(next: AdminProduct) {
    setProduct(next);
    setEnrichment(enrichmentFromProduct(next));
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!begin()) {
      return;
    }

    const data = new FormData(event.currentTarget);

    // Los ejes no viajan aquí: se declaran en la sección de variantes, que es donde se ven sus
    // consecuencias. Enviarlos desde dos formularios distintos invitaría a pisarlos sin querer.
    const result = await updateProduct(product.id, {
      ...enrichmentBody(enrichment, product.attributes, 'edit'),
      expectedVersion: product.version,
      name: String(data.get('name') ?? '').trim(),
      shortDescription: String(data.get('shortDescription') ?? ''),
      description: String(data.get('description') ?? ''),
      priceCop: Number(data.get('priceCop')),
      lowStockThreshold: Number(data.get('lowStockThreshold')),
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

  async function handleAdjust(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!begin()) {
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);

    // Una clave por operación, conservada entre reintentos de esa misma operación.
    inventoryKey.current ??= crypto.randomUUID();

    const result = await adjustInventory(product.id, {
      expectedVersion: product.version,
      delta: Number(data.get('delta')),
      reason: String(data.get('reason') ?? '').trim(),
      idempotencyKey: inventoryKey.current,
    });

    settle(result, (adjustment) => {
      applyProduct(adjustment.product);
      setNotice(
        adjustment.replayed
          ? 'El ajuste ya se había aplicado; el inventario no cambió.'
          : 'Inventario ajustado.',
      );
      // Operación cerrada: el siguiente ajuste necesita su propia clave.
      inventoryKey.current = null;
      form.reset();
    });
  }

  const lowStock = product.stockQuantity <= product.lowStockThreshold;
  /**
   * Con la primera variante, el precio y el inventario pasan a gestionarse por variante.
   *
   * El contrato lo dice al revés: «A product with no variants sells through its own SKU, price and
   * stock». Los valores base **no se borran ni se transforman**: dejan de ser lo que se vende.
   */
  const sellsByVariant = product.variants.some((variant) => variant.status === 'active');
  const enrichmentIssues = enrichmentProblems(enrichment);

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

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardPad}>
            <h2 className={styles.sectionTitle}>Datos del producto</h2>
            {permissions.canUpdate ? (
              <form noValidate onSubmit={handleSave}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={ids.name}>
                    Nombre
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
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={ids.shortDescription}>
                    Descripción corta
                  </label>
                  <input
                    className={styles.input}
                    defaultValue={product.shortDescription}
                    disabled={busy}
                    id={ids.shortDescription}
                    name="shortDescription"
                    type="text"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={ids.description}>
                    Descripción
                  </label>
                  <textarea
                    className={styles.textarea}
                    defaultValue={product.description}
                    disabled={busy}
                    id={ids.description}
                    name="description"
                  />
                </div>
                <h3 className={styles.sectionTitle}>Clasificación y contenido</h3>
                <EnrichmentFieldset
                  disabled={busy}
                  fields={enrichment}
                  mode="edit"
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

                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={ids.priceCop}>
                      Precio (COP)
                    </label>
                    <input
                      className={styles.input}
                      defaultValue={product.priceCop}
                      disabled={busy}
                      id={ids.priceCop}
                      min={0}
                      name="priceCop"
                      required
                      type="number"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={ids.lowStockThreshold}>
                      Umbral de stock bajo
                    </label>
                    <input
                      className={styles.input}
                      defaultValue={product.lowStockThreshold}
                      disabled={busy}
                      id={ids.lowStockThreshold}
                      min={0}
                      name="lowStockThreshold"
                      type="number"
                    />
                  </div>
                </div>
                {sellsByVariant ? (
                  <p className={styles.notice}>
                    Este producto se vende por variantes: el precio y el inventario que valen son
                    los de cada variante. Estos valores base se conservan tal cual, pero ya no son
                    lo que se compra.
                  </p>
                ) : null}
                <div className={styles.actions}>
                  <button
                    className={styles.button}
                    disabled={busy || enrichmentIssues.length > 0}
                    type="submit"
                  >
                    {busy ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              </form>
            ) : (
              <p className={styles.hint}>Tu rol no permite editar este producto.</p>
            )}
          </div>
        </section>

        <div>
          <section className={styles.card}>
            <div className={styles.cardPad}>
              <h2 className={styles.sectionTitle}>Estado</h2>
              <dl className={styles.definition}>
                <dt>Estado</dt>
                <dd>
                  <StatusBadge status={product.status} />
                </dd>
                <dt>SKU</dt>
                <dd className={styles.immutable}>{product.sku}</dd>
                <dt>Slug</dt>
                <dd className={styles.immutable}>{product.slug}</dd>
                <dt>Categoría</dt>
                <dd>
                  {product.category === null
                    ? 'Sin categoría'
                    : `${product.category.name} (${product.category.slug})`}
                </dd>
                <dt>Tipo</dt>
                <dd>
                  {product.productType === null
                    ? 'Sin tipo'
                    : `${product.productType.name} (${product.productType.slug})`}
                </dd>
                <dt>Destacado</dt>
                <dd>{product.featured ? 'Sí' : 'No'}</dd>
                <dt>Precio base</dt>
                <dd>{formatCop(product.priceCop)}</dd>
                <dt>Inventario base</dt>
                <dd className={lowStock ? styles.lowStock : undefined}>{product.stockQuantity}</dd>
                <dt>Versión</dt>
                <dd>{product.version}</dd>
                <dt>Actualizado</dt>
                <dd>{formatDateTime(product.updatedAt)}</dd>
              </dl>
              <p className={styles.hint}>
                SKU y slug son inmutables: el backend no los deja cambiar.
              </p>

              {permissions.canPublish || permissions.canArchive ? (
                <div className={styles.actions}>
                  {permissions.canPublish && product.status !== 'active' ? (
                    <button
                      className={styles.button}
                      disabled={busy}
                      onClick={() => void handleTransition('publish')}
                      type="button"
                    >
                      Publicar
                    </button>
                  ) : null}
                  {permissions.canArchive && product.status !== 'archived' ? (
                    <button
                      className={styles.buttonDanger}
                      disabled={busy}
                      onClick={() => void handleTransition('archive')}
                      type="button"
                    >
                      Archivar
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          {permissions.canAdjustInventory && sellsByVariant ? (
            <section className={styles.card} style={{ marginTop: 'var(--space-lg)' }}>
              <div className={styles.cardPad}>
                <h2 className={styles.sectionTitle}>Ajustar inventario</h2>
                <p className={styles.notice}>
                  El inventario de este producto se gestiona por variante desde que tiene la
                  primera. El stock base se queda como estaba —no se borra ni se reparte— y aquí ya
                  no se ajusta: hazlo en cada variante.
                </p>
              </div>
            </section>
          ) : null}

          {permissions.canAdjustInventory && !sellsByVariant ? (
            <section className={styles.card} style={{ marginTop: 'var(--space-lg)' }}>
              <form className={styles.cardPad} noValidate onSubmit={handleAdjust}>
                <h2 className={styles.sectionTitle}>Ajustar inventario</h2>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={ids.delta}>
                    Diferencia
                  </label>
                  <input
                    className={styles.input}
                    disabled={busy}
                    id={ids.delta}
                    name="delta"
                    required
                    step={1}
                    type="number"
                  />
                  <span className={styles.hint}>
                    Entero distinto de cero. Negativo para descontar. El stock nunca baja de cero.
                  </span>
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={ids.reason}>
                    Motivo
                  </label>
                  <input
                    className={styles.input}
                    disabled={busy}
                    id={ids.reason}
                    name="reason"
                    required
                    type="text"
                  />
                </div>
                <div className={styles.actions}>
                  <button className={styles.buttonSecondary} disabled={busy} type="submit">
                    {busy ? 'Ajustando…' : 'Aplicar ajuste'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-lg)' }}>
        <ProductVariants
          onProduct={(next) => {
            applyProduct(next);
            setConflict(false);
          }}
          permissions={variantPermissions(role)}
          product={product}
        />
      </div>

      <div style={{ marginTop: 'var(--space-lg)' }}>
        <ProductImages
          canArchive={permissions.canArchive}
          canEdit={permissions.canUpdate}
          onProduct={(next) => {
            applyProduct(next);
            setConflict(false);
          }}
          product={product}
        />
      </div>
    </>
  );
}
