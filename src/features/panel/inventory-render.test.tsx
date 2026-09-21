import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { InventoryEditor, InventoryReadout, ProductInventoryCard } from './inventory-card';
import { InventoryFields } from './inventory-fields';
import { EMPTY_INVENTORY_DRAFT, draftFromInventory } from './inventory-control';
import { StockCell } from './products-table';

import type { AdminProduct, AdminProductVariant, InventoryControl } from '@/lib/api/catalog';

/**
 * Lo que se pinta de verdad, sobre el HTML que React produce.
 *
 * No hace falta un DOM: lo que importa es qué llega al marcado —y sobre todo qué **no** llega—, y
 * eso está entero en el HTML. Un panel de inventario no puede permitirse enseñar una cantidad que
 * el backend mandó en `null`, ni ofrecer un campo «Diferencia» que ya no existe.
 */

function tracked(quantity: number, threshold = 0): InventoryControl {
  return {
    mode: 'tracked',
    quantity,
    lowStockThreshold: threshold,
    availability: quantity > 0 ? 'in_stock' : 'out_of_stock',
    manualAvailability: null,
  };
}

function availability(status: 'in_stock' | 'out_of_stock'): InventoryControl {
  return {
    mode: 'availability',
    quantity: null,
    lowStockThreshold: null,
    availability: status,
    manualAvailability: status,
  };
}

function variant(inventory: InventoryControl, archived = false): AdminProductVariant {
  return {
    inventory,
    archivedAt: archived ? '2026-01-01T00:00:00.000Z' : null,
    status: archived ? 'archived' : 'active',
  } as unknown as AdminProductVariant;
}

function product(
  inventory: InventoryControl,
  variants: readonly AdminProductVariant[] = [],
): AdminProduct {
  return { inventory, variants } as unknown as AdminProduct;
}

const noop = () => undefined;
/** El editor espera un resultado explícito: aquí nunca se llama, pero el tipo lo exige. */
const noSubmit = () => ({ applied: false });

describe('7 y 8. la lectura enseña lo del modo y nada más', () => {
  it('tracked enseña las unidades y el umbral', () => {
    const html = renderToStaticMarkup(<InventoryReadout inventory={tracked(12, 2)} />);

    expect(html).toContain('Existencias actuales');
    expect(html).toContain('12 unidades');
    expect(html).toContain('Umbral de stock bajo');
  });

  it('availability no enseña ninguna cantidad ni ningún umbral', () => {
    const html = renderToStaticMarkup(<InventoryReadout inventory={availability('in_stock')} />);

    expect(html).toContain('Solo disponibilidad');
    expect(html).toContain('Disponible');
    expect(html).not.toContain('Existencias actuales');
    expect(html).not.toContain('Umbral');
    expect(html).not.toContain('unidades');
  });
});

describe('12 y 13. la experiencia por delta desapareció', () => {
  const surfaces = [
    [
      'campos del modo cantidad',
      <InventoryFields draft={EMPTY_INVENTORY_DRAFT} key="a" onChange={noop} />,
    ],
    [
      'formulario del detalle',
      <InventoryEditor
        disabled={false}
        inventory={tracked(8, 1)}
        key="b"
        onCancel={noop}
        onSubmit={noSubmit}
      />,
    ],
    [
      'tarjeta del producto',
      <ProductInventoryCard
        busy={false}
        canEdit
        inventory={tracked(8, 1)}
        key="c"
        onSubmit={noSubmit}
        sellsByVariant={false}
      />,
    ],
  ] as const;

  it.each(surfaces)('%s no ofrece «Diferencia» ni «Motivo»', (_label, element) => {
    const html = renderToStaticMarkup(element);

    expect(html).not.toContain('Diferencia');
    expect(html).not.toContain('Motivo');
    // Tampoco los atajos de +N/−N que el contrato anterior invitaba a poner.
    expect(html).not.toContain('Aplicar ajuste');
  });

  it('el campo de cantidad pide el total, dicho con esas palabras', () => {
    const html = renderToStaticMarkup(
      <InventoryFields draft={EMPTY_INVENTORY_DRAFT} onChange={noop} />,
    );

    expect(html).toContain('Cantidad disponible');
    expect(html).toContain('cuántas unidades hay en total');
    expect(html).toContain('escribe 0');
  });

  it('los dos modos se ofrecen como radios, con su explicación', () => {
    const html = renderToStaticMarkup(
      <InventoryFields draft={EMPTY_INVENTORY_DRAFT} onChange={noop} />,
    );

    expect(html).toContain('type="radio"');
    expect(html).toContain('Controlar cantidad');
    expect(html).toContain('Solo disponibilidad');
    expect(html).toContain('Úsalo cuando no necesites llevar un conteo exacto');
  });

  it('en modo disponibilidad el formulario no pinta ningún campo de cantidad', () => {
    const html = renderToStaticMarkup(
      <InventoryFields draft={draftFromInventory(availability('in_stock'))} onChange={noop} />,
    );

    expect(html).toContain('Con existencias');
    expect(html).toContain('Sin existencias');
    expect(html).not.toContain('Cantidad disponible');
    expect(html).not.toContain('Umbral de stock bajo');
    expect(html).not.toContain('type="number"');
  });
});

describe('17. un producto con variantes no edita su inventario base', () => {
  it('lo dice y no ofrece formulario', () => {
    const html = renderToStaticMarkup(
      <ProductInventoryCard
        busy={false}
        canEdit
        inventory={tracked(8, 1)}
        onSubmit={noSubmit}
        sellsByVariant
      />,
    );

    expect(html).toContain('Inventario gestionado por variantes');
    expect(html).not.toContain('Actualizar inventario');
    expect(html).not.toContain('Cantidad disponible');
    // Y no presenta el valor base como vendible.
    expect(html).not.toContain('8 unidades');
  });

  it('sin variantes sí ofrece actualizarlo', () => {
    const html = renderToStaticMarkup(
      <ProductInventoryCard
        busy={false}
        canEdit
        inventory={tracked(8, 1)}
        onSubmit={noSubmit}
        sellsByVariant={false}
      />,
    );

    expect(html).toContain('Actualizar inventario');
    expect(html).toContain('8 unidades');
  });

  it('sin permiso no se ofrece, aunque no haya variantes', () => {
    const html = renderToStaticMarkup(
      <ProductInventoryCard
        busy={false}
        canEdit={false}
        inventory={tracked(8, 1)}
        onSubmit={noSubmit}
        sellsByVariant={false}
      />,
    );

    expect(html).not.toContain('Actualizar inventario');
    expect(html).toContain('Tu rol no incluye cambiar el inventario');
  });
});

describe('18. cada variante lleva su propio modo', () => {
  /*
   * Dos variantes del mismo producto, cada una en un modo. Lo que se comprueba es que la lectura
   * de una no arrastra la forma de la otra: la de cantidad dice unidades, la de disponibilidad no.
   */
  it('una con conteo y otra por disponibilidad se leen distinto', () => {
    const conteo = renderToStaticMarkup(<InventoryReadout inventory={tracked(4, 1)} />);
    const manual = renderToStaticMarkup(
      <InventoryReadout inventory={availability('out_of_stock')} />,
    );

    expect(conteo).toContain('4 unidades');
    expect(manual).not.toContain('unidades');
    expect(manual).toContain('Sin existencias');
  });
});

describe('19. las variantes archivadas no se editan', () => {
  /*
   * Se comprueba en la fuente porque es una decisión de estructura: la lista de archivadas de
   * `ProductVariants` no renderiza `VariantRow`, que es quien lleva los controles.
   */
  it('la lista de archivadas no monta la fila editable', () => {
    const source = readFileSync(
      new URL('../../../src/features/panel/product-variants.tsx', import.meta.url),
      'utf8',
    );
    const archived = source.slice(source.indexOf('Archivadas ({archived.length})'));
    const upToNextSection = archived.slice(0, archived.indexOf('Ejes de variación'));

    expect(upToNextSection).not.toContain('<VariantRow');
    expect(upToNextSection).not.toContain('InventoryEditor');
    expect(upToNextSection).toContain('su SKU sigue');
  });
});

describe('20 y 21. la celda del listado', () => {
  it('tracked enseña unidades', () => {
    expect(renderToStaticMarkup(<StockCell product={product(tracked(12))} />)).toContain(
      '12 unidades',
    );
  });

  it('availability no enseña ningún número', () => {
    const html = renderToStaticMarkup(<StockCell product={product(availability('in_stock'))} />);

    expect(html).toContain('Disponible');
    expect(html).not.toMatch(/>\D*\d/);
  });

  it('con variantes enseña el resumen, no la base', () => {
    const html = renderToStaticMarkup(
      <StockCell product={product(tracked(99), [variant(tracked(7))])} />,
    );

    expect(html).toContain('7 unidades en 1 variante');
    expect(html).not.toContain('99');
  });

  it('«Sin existencias» va escrito, no solo en color', () => {
    expect(renderToStaticMarkup(<StockCell product={product(tracked(0))} />)).toContain(
      'Sin existencias',
    );
  });
});
