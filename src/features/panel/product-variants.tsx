'use client';

import { useId, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';
import type { AdminProduct, AdminProductVariant } from '@/lib/api/catalog';
import { VARIANT_MAX_ACTIVE } from '@/lib/api/variant-limits';

import { AttributeAxesEditor } from './attribute-axes-editor';
import styles from './catalog.module.css';
import { CopField } from './cop-field';
import {
  adjustVariantInventory,
  archiveVariant,
  createVariant,
  updateProduct,
  updateVariant,
  type MutationResult,
} from './catalog-client';
import { describeCatalogFailure } from './catalog-errors';
import { formatCop, groupCop, parseCop } from './money';
import type { VariantPermissions } from './product-permissions';
import {
  axesFromProduct,
  combinationKey,
  declaredAxes,
  generateCombinations,
  validateAxes,
  validateVariantDrafts,
  type AxisDraft,
  type VariantDraft,
} from './variant-draft';
import { SectionHeading } from './section-icon';
import { VariantDraftEditor } from './variant-draft-editor';
import { createVariantsSequentially } from './variant-creation';

/**
 * Variantes de un producto que ya existe.
 *
 * Tres reglas del contrato gobiernan esta pantalla:
 *
 *   - Cada operación lleva la `expectedVersion` del **producto** y devuelve el producto completo
 *     con su versión nueva. El estado local se reemplaza con esa respuesta; nunca se calcula aquí
 *     cómo quedó.
 *   - Por eso las altas van **en serie**: dos a la vez partirían de la misma versión y la segunda
 *     chocaría con un `409`.
 *   - Un `409` no se reintenta a ciegas: significa que alguien cambió el producto mientras tanto,
 *     y lo que se ofrece es recargar.
 *
 * El stock exacto se muestra aquí porque es la pantalla de administración. La tienda solo publica
 * si hay o no existencias, y esa disponibilidad la deriva el backend.
 */
export function ProductVariants({
  product,
  permissions,
  onProduct,
}: {
  readonly product: AdminProduct;
  readonly permissions: VariantPermissions;
  readonly onProduct: (next: AdminProduct) => void;
}) {
  const router = useRouter();
  const lock = useRef(createOperationLock());
  /** Clave de idempotencia del ajuste de inventario en curso, por variante. */
  const inventoryKeys = useRef(new Map<string, string>());

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [axes, setAxes] = useState<readonly AxisDraft[]>(() =>
    axesFromProduct(product.attributes, () => crypto.randomUUID()),
  );
  const [drafts, setDrafts] = useState<readonly VariantDraft[]>([]);

  const active = product.variants.filter((variant) => variant.status === 'active');
  const archived = product.variants.filter((variant) => variant.status === 'archived');
  const axisProblems = validateAxes(axes);
  /**
   * Se valida contra los ejes que **el producto declara**, no contra los del editor de arriba.
   *
   * Si alguien añade un eje y todavía no lo ha guardado, el backend rechazaría la variante por no
   * llevar exactamente los ejes declarados. Avisarlo aquí es más útil que descubrirlo en el 400.
   */
  const validation = validateVariantDrafts(drafts, product.attributes, product.variants);

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

  /** Declara los ejes. El contrato los sustituye enteros y no reescribe las variantes que existan. */
  async function handleSaveAxes() {
    if (!begin()) {
      return;
    }

    settle(
      await updateProduct(product.id, {
        expectedVersion: product.version,
        attributes: declaredAxes(axes).map((axis) => ({ key: axis.key, label: axis.label })),
      }),
      (updated) => {
        onProduct(updated);
        setNotice('Ejes de variación guardados.');
      },
    );
  }

  /**
   * Crea las variantes preparadas, una detrás de otra, cada una con la última versión devuelta.
   *
   * Si una falla, las anteriores siguen creadas: se quitan de la lista local —su SKU ya está
   * reservado y reenviarlas sería un conflicto— y quedan solo las que faltan, listas para
   * reintentar.
   */
  async function handleCreateVariants() {
    if (!begin()) {
      return;
    }

    const progress = await createVariantsSequentially(product, drafts, (body) =>
      createVariant(product.id, body),
    );

    release(lock.current);
    setBusy(false);
    onProduct(progress.product);

    const done = progress.created.map((entry) => entry.draftId);

    setDrafts((current) => current.filter((draft) => !done.includes(draft.draftId)));

    if (progress.failure === null) {
      setConflict(false);
      setNotice(
        `${progress.created.length} variante${progress.created.length === 1 ? '' : 's'} creada${
          progress.created.length === 1 ? '' : 's'
        }.`,
      );

      return;
    }

    setConflict(progress.failure.code === 'version_conflict');
    setFailure(
      `${describeCatalogFailure(progress.failure.code)} Se crearon ${progress.created.length} de ${
        drafts.length
      }; las que faltan siguen en la lista.`,
    );
  }

  async function handleVariantSave(
    variant: AdminProductVariant,
    body: Record<string, unknown>,
    message: string,
  ) {
    if (!begin()) {
      return;
    }

    settle(
      await updateVariant(product.id, variant.id, { ...body, expectedVersion: product.version }),
      (result) => {
        onProduct(result.product);
        setNotice(message);
      },
    );
  }

  async function handleArchive(variant: AdminProductVariant) {
    if (!begin()) {
      return;
    }

    settle(await archiveVariant(product.id, variant.id, product.version), (result) => {
      onProduct(result.product);
      setNotice(
        'Variante archivada. Su SKU y su identificador quedan reservados para siempre; archivar la última activa deja el producto sin nada que vender.',
      );
    });
  }

  async function handleAdjust(variant: AdminProductVariant, delta: number, reason: string) {
    if (!begin()) {
      return;
    }

    // Una clave por operación, conservada entre reintentos de esa misma operación.
    const key = inventoryKeys.current.get(variant.id) ?? crypto.randomUUID();

    inventoryKeys.current.set(variant.id, key);

    settle(
      await adjustVariantInventory(product.id, variant.id, {
        expectedVersion: product.version,
        delta,
        reason,
        idempotencyKey: key,
      }),
      (result) => {
        inventoryKeys.current.delete(variant.id);
        onProduct(result.product);
        setNotice(
          result.replayed
            ? 'El ajuste ya se había aplicado; el inventario no cambió.'
            : 'Inventario de la variante ajustado.',
        );
      },
    );
  }

  return (
    <section className={styles.card}>
      <div className={styles.cardPad}>
        <SectionHeading
          hint="Cada variante tiene su SKU, su precio y su inventario."
          icon="variantes"
          title="Variantes"
        />

        <p className={styles.notice}>
          Un color, un acabado o una medida se gestionan como variante <strong>solo</strong> cuando
          cada combinación es un artículo vendible de verdad, con su propio SKU, su precio y su
          inventario. Si solo hay que describirlos, van en «Detalles adicionales»: convertir texto
          libre en variantes crea artículos que nadie puede comprar.
        </p>

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

        {active.length === 0 ? (
          <p className={styles.hint}>
            Este producto no tiene variantes: se vende por su propio SKU, precio e inventario.
          </p>
        ) : (
          <ul className={styles.variantList}>
            {active.map((variant) => (
              <VariantRow
                busy={busy}
                key={`${variant.id}:${variant.version}`}
                onAdjust={(delta, reason) => void handleAdjust(variant, delta, reason)}
                onArchive={() => void handleArchive(variant)}
                onSave={(body, message) => void handleVariantSave(variant, body, message)}
                permissions={permissions}
                variant={variant}
              />
            ))}
          </ul>
        )}

        <p className={styles.hint}>
          {active.length} de {VARIANT_MAX_ACTIVE} variantes activas.
        </p>

        {archived.length === 0 ? null : (
          <>
            <h3 className={styles.sectionTitle} style={{ marginTop: 'var(--space-lg)' }}>
              Archivadas ({archived.length})
            </h3>
            <ul className={styles.variantList}>
              {archived.map((variant) => (
                <li className={styles.variantItemArchived} key={variant.id}>
                  <p className={styles.variantSummary}>
                    <strong>{variant.sku}</strong> · {variant.combinationKey}
                  </p>
                  <p className={styles.hint}>
                    {formatCop(variant.priceCop)} · inventario {variant.stockQuantity} · su SKU
                    sigue reservado.
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}

        {permissions.canUpdate ? (
          <div style={{ marginTop: 'var(--space-lg)' }}>
            <h3 className={styles.sectionTitle}>Ejes de variación</h3>
            <AttributeAxesEditor
              axes={axes}
              disabled={busy}
              newId={() => crypto.randomUUID()}
              onChange={setAxes}
              problems={axisProblems}
            />
            <div className={styles.actions}>
              <button
                className={styles.buttonSecondary}
                disabled={busy || axisProblems.length > 0}
                onClick={() => void handleSaveAxes()}
                type="button"
              >
                Guardar ejes
              </button>
            </div>
            <p className={styles.hint}>
              Declarar ejes sustituye la lista anterior y no reescribe las variantes que ya existen.
              Cada variante nueva tendrá que llevar exactamente estos ejes.
            </p>
          </div>
        ) : null}

        {permissions.canCreate ? (
          <div style={{ marginTop: 'var(--space-lg)' }}>
            <h3 className={styles.sectionTitle}>Añadir variantes</h3>
            <p className={styles.hint}>
              Cada variante lleva exactamente los ejes que el producto declara. Si acabas de añadir
              un eje, guárdalo antes: hasta entonces el backend rechazaría las variantes nuevas.
            </p>
            <VariantDraftEditor
              activeCount={active.length}
              axes={axes}
              disabled={busy}
              drafts={drafts}
              lockedDraftIds={[]}
              onAdd={() =>
                setDrafts((current) => [
                  ...current,
                  {
                    draftId: crypto.randomUUID(),
                    sku: '',
                    priceCop: groupCop(product.priceCop),
                    stockQuantity: '0',
                    // Los ejes que exige el backend son los que el producto declara, no los que
                    // haya en el editor de arriba sin guardar.
                    attributes: product.attributes.map((axis) => ({
                      key: axis.key,
                      value: '',
                      label: '',
                    })),
                  },
                ])
              }
              onChange={setDrafts}
              onGenerate={() =>
                setDrafts((current) => [
                  ...current,
                  ...generateCombinations(axes, {
                    existing: [
                      ...active.map((variant) => variant.combinationKey),
                      ...current.map((draft) => combinationKey(draft.attributes)),
                    ],
                    baseSku: product.sku,
                    basePriceCop: groupCop(product.priceCop),
                    newId: () => crypto.randomUUID(),
                    limit: Math.max(0, VARIANT_MAX_ACTIVE - active.length - current.length),
                  }),
                ])
              }
              validation={validation}
            />
            {drafts.length === 0 ? null : (
              <div className={styles.actions}>
                <button
                  className={styles.button}
                  disabled={
                    busy ||
                    validation.general.length > 0 ||
                    Object.keys(validation.byDraft).length > 0
                  }
                  onClick={() => void handleCreateVariants()}
                  type="button"
                >
                  {busy ? 'Creando…' : `Crear ${drafts.length} variante(s)`}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Una variante activa: sus atributos, su precio, su inventario y su archivado.
 *
 * El SKU no se edita —el contrato lo hace inmutable— y el inventario no se escribe a mano: se
 * mueve con un ajuste, que es idempotente y deja rastro del motivo.
 *
 * Cuando el backend devuelve otra versión, quien la usa cambia la `key` y React remonta la fila.
 * Es preferible a sincronizar con un efecto, que reintroduce el valor viejo durante un render.
 */
function VariantRow({
  variant,
  permissions,
  busy,
  onSave,
  onArchive,
  onAdjust,
}: {
  readonly variant: AdminProductVariant;
  readonly permissions: VariantPermissions;
  readonly busy: boolean;
  readonly onSave: (body: Record<string, unknown>, message: string) => void;
  readonly onArchive: () => void;
  readonly onAdjust: (delta: number, reason: string) => void;
}) {
  const id = useId();
  // El precio se edita con el mismo campo y el mismo conversor que el del producto: se escribe
  // `1.450.000` y al backend viaja el entero.
  const [price, setPrice] = useState(() => groupCop(variant.priceCop));
  const [attributes, setAttributes] = useState(variant.attributes);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');

  const parsedPrice = parseCop(price);
  const priceValid = parsedPrice.ok && parsedPrice.value > 0;
  const priceDirty = parsedPrice.ok && parsedPrice.value !== variant.priceCop;
  const attributesDirty = attributes.some(
    (attribute, index) =>
      attribute.value !== variant.attributes[index]?.value ||
      attribute.label !== variant.attributes[index]?.label,
  );
  const deltaValue = Number(delta);
  const canAdjust =
    delta.trim() !== '' &&
    Number.isInteger(deltaValue) &&
    deltaValue !== 0 &&
    reason.trim().length > 0;

  return (
    <li className={styles.variantItem}>
      <p className={styles.variantSummary}>
        <strong>{variant.sku}</strong> · versión {variant.version}
      </p>

      <div className={styles.row}>
        {attributes.map((attribute) => (
          <div className={styles.field} key={attribute.key}>
            <label className={styles.label} htmlFor={`${id}-${attribute.key}`}>
              {attribute.key}
            </label>
            <input
              className={styles.input}
              disabled={busy || !permissions.canUpdate}
              id={`${id}-${attribute.key}`}
              onChange={(event) =>
                setAttributes((current) =>
                  current.map((entry) =>
                    entry.key === attribute.key
                      ? { ...entry, value: event.target.value, label: entry.label }
                      : entry,
                  ),
                )
              }
              type="text"
              value={attribute.value}
            />
            <input
              aria-label={`Etiqueta de ${attribute.key}`}
              className={styles.input}
              disabled={busy || !permissions.canUpdate}
              onChange={(event) =>
                setAttributes((current) =>
                  current.map((entry) =>
                    entry.key === attribute.key ? { ...entry, label: event.target.value } : entry,
                  ),
                )
              }
              type="text"
              value={attribute.label}
            />
          </div>
        ))}
        <CopField
          disabled={busy || !permissions.canUpdate}
          hint={`${formatCop(variant.priceCop)} guardado.`}
          label="Precio"
          onChange={setPrice}
          value={price}
        />
        <div className={styles.field}>
          <span className={styles.label}>Inventario</span>
          <p className={styles.variantStock}>{variant.stockQuantity}</p>
          <span className={styles.hint}>Se mueve con un ajuste, no escribiéndolo.</span>
        </div>
      </div>

      <div className={styles.imageTileActions}>
        {permissions.canUpdate ? (
          <button
            className={styles.iconButton}
            disabled={busy || !priceValid || (!priceDirty && !attributesDirty)}
            onClick={() =>
              onSave(
                {
                  ...(priceDirty && parsedPrice.ok ? { priceCop: parsedPrice.value } : {}),
                  ...(attributesDirty ? { attributes: [...attributes] } : {}),
                },
                'Variante actualizada.',
              )
            }
            type="button"
          >
            Guardar variante
          </button>
        ) : null}
        {permissions.canArchive ? (
          <button className={styles.iconButton} disabled={busy} onClick={onArchive} type="button">
            Archivar variante
          </button>
        ) : null}
      </div>

      {permissions.canAdjustInventory ? (
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-delta`}>
              Diferencia
            </label>
            <input
              className={styles.input}
              disabled={busy}
              id={`${id}-delta`}
              onChange={(event) => setDelta(event.target.value)}
              step={1}
              type="number"
              value={delta}
            />
            <span className={styles.hint}>
              Entero distinto de cero. Negativo para descontar. El stock nunca baja de cero.
            </span>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-reason`}>
              Motivo
            </label>
            <input
              className={styles.input}
              disabled={busy}
              id={`${id}-reason`}
              onChange={(event) => setReason(event.target.value)}
              type="text"
              value={reason}
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>&nbsp;</span>
            <button
              className={styles.iconButton}
              disabled={busy || !canAdjust}
              onClick={() => onAdjust(deltaValue, reason.trim())}
              type="button"
            >
              Aplicar ajuste
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
