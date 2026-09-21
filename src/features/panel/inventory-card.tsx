'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './catalog.module.css';
import { InventoryFields } from './inventory-fields';
import {
  afterInventorySubmit,
  describeAvailability,
  draftFromInventory,
  inventoryChanged,
  inventoryProblems,
  modeChangeWarning,
  planInventorySubmit,
  readInventory,
  shortInventoryMode,
  unitsLabel,
  type InventoryDraft,
} from './inventory-control';

import type { InventoryControl, SetInventoryControl } from '@/lib/api/catalog';

/**
 * Cómo se **lee** un inventario ya guardado.
 *
 * Lo comparten la tarjeta del producto y cada fila de variante. Lo importante es lo que **no**
 * hace: en modo disponibilidad no enseña ninguna cantidad. El contrato manda `quantity: null` ahí,
 * y traducir ese `null` a «0 unidades» sería inventar el dato que el backend evitó mandar.
 */
export function InventoryReadout({ inventory }: { readonly inventory: InventoryControl }) {
  const reading = readInventory(inventory);

  return (
    <dl className={styles.definition}>
      <dt>Control</dt>
      <dd>{shortInventoryMode(inventory.mode)}</dd>
      {inventory.mode === 'tracked' ? (
        <>
          <dt>Existencias actuales</dt>
          <dd className={reading.tone === 'lowStock' ? styles.lowStock : undefined}>
            {reading.quantityLabel ?? unitsLabel(0)}
          </dd>
          <dt>Umbral de stock bajo</dt>
          <dd>{inventory.lowStockThreshold ?? 0}</dd>
        </>
      ) : null}
      <dt>Estado</dt>
      <dd>
        <AvailabilityBadge inventory={inventory} />
      </dd>
    </dl>
  );
}

/** El estado en palabras y en color, nunca solo en color. */
export function AvailabilityBadge({ inventory }: { readonly inventory: InventoryControl }) {
  const reading = readInventory(inventory);

  if (reading.tone === 'outOfStock') {
    return <span className={styles.outOfStock}>{describeAvailability('out_of_stock')}</span>;
  }

  return (
    <span className={reading.tone === 'lowStock' ? styles.pendingPill : styles.readyPill}>
      {reading.label}
    </span>
  );
}

/**
 * Qué contesta quien llama al backend.
 *
 * Es un resultado **explícito**, no una `Promise<void>`. Deducir el éxito de que la promesa
 * terminara era el fallo que se corrige aquí: una mutación fallida resuelve igual que una correcta,
 * así que el editor se cerraba encima de un error y dejaba caer lo escrito.
 */
export type InventorySubmitResult = { readonly applied: boolean };

export type InventorySubmit = (
  body: SetInventoryControl,
) => InventorySubmitResult | Promise<InventorySubmitResult>;

/**
 * El formulario que **establece** el inventario.
 *
 * Tres reglas que no son de presentación:
 *
 * 1. Si nada cambió, el botón no llama. Una petición que no cambia nada gasta una versión del
 *    producto y deja rastro en la auditoría de haber hecho algo que no se hizo.
 * 2. Cambiar de modo pide confirmación. No es un campo más: cambia qué significa el inventario, y
 *    pasar de «quedan 4» a «disponible» deja de publicar esa cantidad.
 * 3. Nunca se actualiza de forma optimista. Quien manda es la respuesta del backend, que llega
 *    completa; adelantarla aquí enseñaría un número que todavía podría ser rechazado.
 */
export function InventoryEditor({
  inventory,
  disabled,
  onSubmit,
  onCancel,
  onDone,
  submitLabel = 'Guardar inventario',
}: {
  readonly inventory: InventoryControl;
  readonly disabled: boolean;
  readonly onSubmit: InventorySubmit;
  readonly onCancel: () => void;
  /** Se llama solo cuando el backend confirmó el cambio. */
  readonly onDone?: (() => void) | undefined;
  readonly submitLabel?: string;
}) {
  const [draft, setDraft] = useState<InventoryDraft>(() => draftFromInventory(inventory));
  const [confirming, setConfirming] = useState(false);
  /*
   * Entre el `await` y la respuesta, la fila puede haberse remontado —su `key` lleva la versión—
   * o la sección puede haberse desmontado. Avisar a un componente que ya no existe no rompe nada
   * en React 19, pero tampoco significa nada: se comprueba antes de hacerlo.
   */
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const problems = inventoryProblems(draft);
  const changed = inventoryChanged(inventory, draft);

  function change(next: InventoryDraft) {
    setDraft(next);
    // Volver al modo original cancela la confirmación: ya no hay nada que confirmar.
    setConfirming(false);
  }

  async function submit() {
    const plan = planInventorySubmit(inventory, draft, confirming);

    if (plan.kind === 'blocked') return;

    if (plan.kind === 'confirm') {
      setConfirming(true);

      return;
    }

    const result = await onSubmit(plan.body);

    /*
     * El formulario se cierra **solo** si el backend confirmó. En un fallo se queda abierto con el
     * borrador intacto: cerrarlo obligaba a reabrirlo y reescribirlo, y reescribirlo con otra
     * cantidad era justo lo que colaba un cuerpo distinto con la clave del intento anterior.
     */
    if (afterInventorySubmit(result) === 'close' && mounted.current) onDone?.();
  }

  return (
    <div className={styles.inventoryEditor}>
      <InventoryFields disabled={disabled} draft={draft} onChange={change} />

      {confirming ? (
        <p className={styles.notice} role="alert">
          {modeChangeWarning(draft.mode)} Pulsa «{submitLabel}» otra vez para confirmarlo.
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          className={styles.button}
          disabled={disabled || problems.length > 0 || !changed}
          onClick={() => void submit()}
          type="button"
        >
          {disabled ? 'Guardando…' : submitLabel}
        </button>
        <button
          className={styles.buttonSecondary}
          disabled={disabled}
          onClick={onCancel}
          type="button"
        >
          Cancelar
        </button>
      </div>

      {changed || problems.length > 0 ? null : (
        <p className={styles.hint}>
          No hay nada que cambiar todavía. Modifica algo para poder guardarlo.
        </p>
      )}
    </div>
  );
}

/**
 * La tarjeta de inventario del producto base.
 *
 * Con variantes activas **no se edita**. El valor base sigue existiendo —el contrato lo manda y no
 * se borra— pero deja de ser lo que se vende, así que ofrecer aquí un formulario haría creer que
 * cambiarlo cambia algo en la tienda.
 */
export function ProductInventoryCard({
  inventory,
  canEdit,
  sellsByVariant,
  busy,
  onSubmit,
  headingId,
}: {
  readonly inventory: InventoryControl;
  readonly canEdit: boolean;
  readonly sellsByVariant: boolean;
  readonly busy: boolean;
  readonly onSubmit: InventorySubmit;
  readonly headingId?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (sellsByVariant) {
    return (
      <div className={styles.stackSm}>
        <p className={styles.notice} id={headingId}>
          <strong>Inventario gestionado por variantes.</strong> Desde que este producto tiene su
          primera variante activa, lo que se vende es el inventario de cada una. El valor base se
          conserva tal cual, pero ya no gobierna: edítalo en la sección de variantes.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.stackSm} id={headingId}>
      <InventoryReadout inventory={inventory} />

      {canEdit ? (
        editing ? (
          <InventoryEditor
            disabled={busy}
            inventory={inventory}
            onCancel={() => setEditing(false)}
            onDone={() => setEditing(false)}
            onSubmit={onSubmit}
          />
        ) : (
          <div className={styles.actions}>
            <button
              className={styles.buttonSecondary}
              disabled={busy}
              onClick={() => setEditing(true)}
              type="button"
            >
              Actualizar inventario
            </button>
          </div>
        )
      ) : (
        <p className={styles.hint}>Tu rol no incluye cambiar el inventario.</p>
      )}
    </div>
  );
}
