'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

import catalog from '@/features/panel/catalog.module.css';

import { AssignDialogButton, type AssignableProduct } from './assign-dialog';
import styles from './shipping.module.css';

/**
 * Selección múltiple del listado de productos para envíos.
 *
 * Solo se monta con `shipping.manage`: seleccionar no tiene sentido sin poder asignar. La selección
 * vive en el navegador y se limita a la página cargada; al cambiar de página empieza vacía.
 */
type Selection = {
  readonly selected: ReadonlyMap<string, AssignableProduct>;
  readonly toggle: (product: AssignableProduct) => void;
  readonly setAll: (products: readonly AssignableProduct[], on: boolean) => void;
};

const BulkSelection = createContext<Selection | null>(null);

export function BulkShippingProvider({
  products,
  children,
}: {
  readonly products: readonly AssignableProduct[];
  readonly children: ReactNode;
}) {
  const [selected, setSelected] = useState<ReadonlyMap<string, AssignableProduct>>(new Map());

  const selection: Selection = {
    selected,
    toggle: (product) =>
      setSelected((current) => {
        const next = new Map(current);

        if (next.has(product.id)) next.delete(product.id);
        else next.set(product.id, product);

        return next;
      }),
    setAll: (items, on) =>
      setSelected(on ? new Map(items.map((item) => [item.id, item])) : new Map()),
  };

  return (
    <BulkSelection.Provider value={selection}>
      {children}
      <BulkShippingBar products={products} />
    </BulkSelection.Provider>
  );
}

/** Casilla de una fila o tarjeta. Sin proveedor no se pinta: el listado sigue igual que antes. */
export function SelectProductBox({ product }: { readonly product: AssignableProduct }) {
  const selection = useContext(BulkSelection);

  if (selection === null) return null;

  return (
    <input
      aria-label={`Seleccionar ${product.name}`}
      checked={selection.selected.has(product.id)}
      className={styles.selectBox}
      onChange={() => selection.toggle(product)}
      type="checkbox"
    />
  );
}

/** Casilla de cabecera: marca o desmarca todos los productos de la página. */
export function SelectAllBox({ products }: { readonly products: readonly AssignableProduct[] }) {
  const selection = useContext(BulkSelection);

  if (selection === null) return null;

  const all =
    products.length > 0 && products.every((product) => selection.selected.has(product.id));

  return (
    <input
      aria-label="Seleccionar todos los productos de esta página"
      checked={all}
      className={styles.selectBox}
      onChange={() => selection.setAll(products, !all)}
      type="checkbox"
    />
  );
}

function BulkShippingBar({ products }: { readonly products: readonly AssignableProduct[] }) {
  const selection = useContext(BulkSelection);

  if (selection === null) return null;

  const chosen = [...selection.selected.values()];

  return (
    <div aria-label="Acciones con la selección" className={styles.selectionBar} role="region">
      <span aria-live="polite">
        {chosen.length === 0
          ? 'Selecciona productos para asignarlos a zonas de envío.'
          : `${chosen.length} producto${chosen.length === 1 ? '' : 's'} seleccionado${chosen.length === 1 ? '' : 's'}.`}
      </span>
      <span className={styles.selectionActions}>
        <button
          className={catalog.buttonSecondary}
          onClick={() => selection.setAll(products, chosen.length === 0)}
          type="button"
        >
          {chosen.length === 0 ? 'Seleccionar la página' : 'Quitar selección'}
        </button>
        <AssignDialogButton
          className={catalog.buttonSecondary}
          label="Retirar de zonas de envío"
          mode="remove"
          products={chosen}
        />
        <AssignDialogButton
          className={catalog.buttonPrimary}
          label="Asignar a zonas de envío"
          mode="add"
          products={chosen}
        />
      </span>
    </div>
  );
}
