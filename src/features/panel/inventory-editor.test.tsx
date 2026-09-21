import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { InventoryEditor, ProductInventoryCard } from './inventory-card';
import { afterInventorySubmit, draftFromInventory, planInventorySubmit } from './inventory-control';

import type { InventoryControl } from '@/lib/api/catalog';

/**
 * El editor de inventario: cuándo se cierra y cuándo no.
 *
 * Se cerraba siempre. `ProductInventoryCard` lo hacía después de `await onSubmit(body)` —una
 * promesa resuelta no dice si la operación salió bien— y `VariantRow` ni siquiera esperaba. Tras
 * un error había que reabrirlo y reescribirlo, y reescribirlo con otra cantidad era exactamente lo
 * que colaba un cuerpo distinto con la clave del intento anterior.
 */

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const TRACKED: InventoryControl = {
  mode: 'tracked',
  quantity: 8,
  lowStockThreshold: 2,
  availability: 'in_stock',
  manualAvailability: null,
};

const noop = () => undefined;

describe('el resultado es explícito, no una promesa cumplida', () => {
  it('el tipo obliga a decir si se aplicó', () => {
    const source = read('src/features/panel/inventory-card.tsx');

    expect(source).toContain('export type InventorySubmitResult = { readonly applied: boolean };');
    expect(source).toContain('InventorySubmitResult | Promise<InventorySubmitResult>');
  });

  it('el cierre depende de ese resultado, no de que el await terminara', () => {
    const source = executable(read('src/features/panel/inventory-card.tsx'));

    expect(source).toContain("afterInventorySubmit(result) === 'close'");
    // Ya no existe el `await` seguido de un cierre incondicional.
    expect(source).not.toMatch(/await onSubmit\(body\);\s*setEditing\(false\)/);
  });

  it('la tarjeta del producto cierra solo con onDone', () => {
    const source = executable(read('src/features/panel/inventory-card.tsx'));
    const card = source.slice(source.indexOf('export function ProductInventoryCard('));

    expect(card).toContain('onDone={() => setEditing(false)}');
    expect(card).toContain('onSubmit={onSubmit}');
    // El envoltorio que cerraba pase lo que pase desapareció.
    expect(card).not.toContain('await onSubmit(body)');
  });

  it('la fila de variante también', () => {
    const source = executable(read('src/features/panel/product-variants.tsx'));
    const editor = source.slice(source.indexOf('<InventoryEditor'), source.indexOf('submitLabel='));

    expect(editor).toContain('onDone={() => setEditingInventory(false)}');
    expect(editor).toContain('onSubmit={onInventory}');
    // Cerrar junto a la llamada —lo que hacía antes— tiraba el borrador aunque fallara.
    expect(editor).not.toMatch(/onInventory\(inventory\);\s*setEditingInventory\(false\)/);
  });
});

describe('éxito y fallo', () => {
  /*
   * La decisión vive en `inventory-control.ts`, no dentro del componente: son tres caminos con
   * consecuencias y comprobarlos no debería exigir montar un formulario con DOM. El componente es
   * una carcasa sobre estas dos funciones, y las pruebas de abajo comprueban que lo sigue siendo.
   */
  it('un éxito confirmado cierra el editor', () => {
    expect(afterInventorySubmit({ applied: true })).toBe('close');
  });

  it('un fallo lo deja abierto', () => {
    expect(afterInventorySubmit({ applied: false })).toBe('keep-open');
  });

  it('un borrador sin cambios no llega a enviarse', () => {
    const plan = planInventorySubmit(TRACKED, draftFromInventory(TRACKED), false);

    expect(plan.kind).toBe('blocked');
  });

  it('un borrador inválido tampoco', () => {
    const plan = planInventorySubmit(
      TRACKED,
      { mode: 'tracked', quantity: '', lowStockThreshold: '0', status: 'in_stock' },
      false,
    );

    expect(plan.kind).toBe('blocked');
  });

  it('cambiar de modo pide confirmación antes de enviar', () => {
    const draft = { ...draftFromInventory(TRACKED), mode: 'availability' as const };

    expect(planInventorySubmit(TRACKED, draft, false)).toEqual({
      kind: 'confirm',
      to: 'availability',
    });
    expect(planInventorySubmit(TRACKED, draft, true)).toEqual({
      kind: 'send',
      body: { mode: 'availability', status: 'in_stock' },
    });
  });

  it('un cambio de cantidad se envía sin confirmación', () => {
    const draft = { ...draftFromInventory(TRACKED), quantity: '15' };

    expect(planInventorySubmit(TRACKED, draft, false)).toEqual({
      kind: 'send',
      body: { mode: 'tracked', quantity: 15, lowStockThreshold: 2 },
    });
  });

  it('el componente delega en las dos, no decide por su cuenta', () => {
    const source = executable(read('src/features/panel/inventory-card.tsx'));
    const submit = source.slice(
      source.indexOf('async function submit('),
      source.indexOf('return (', source.indexOf('async function submit(')),
    );

    expect(submit).toContain('planInventorySubmit(inventory, draft, confirming)');
    expect(submit).toContain("afterInventorySubmit(result) === 'close'");
    // Sin la comprobación de montaje, un cierre podría llegar a una fila ya remontada.
    expect(submit).toContain('mounted.current');
  });
});

describe('lo que el editor pinta', () => {
  it('con el borrador sin cambios, el botón no deja enviar', () => {
    const html = renderToStaticMarkup(
      <InventoryEditor
        disabled={false}
        inventory={TRACKED}
        onCancel={noop}
        onSubmit={() => ({ applied: false })}
      />,
    );

    expect(html).toContain('No hay nada que cambiar todavía');
    expect(html).toContain('disabled=""');
  });

  it('la tarjeta no actualiza nada de forma optimista', () => {
    const source = executable(read('src/features/panel/inventory-card.tsx'));

    // El componente no guarda ninguna copia del inventario: pinta el que recibe. Lo único que
    // tiene en estado es el borrador, que es lo que se está escribiendo.
    expect(source).not.toContain('useState(inventory)');
    expect(source).not.toContain('setInventory');
    expect(source).toContain('<InventoryReadout inventory={inventory} />');
  });

  it('sin permiso no se ofrece el formulario', () => {
    const html = renderToStaticMarkup(
      <ProductInventoryCard
        busy={false}
        canEdit={false}
        inventory={TRACKED}
        onSubmit={() => ({ applied: false })}
        sellsByVariant={false}
      />,
    );

    expect(html).toContain('Tu rol no incluye cambiar el inventario');
    expect(html).not.toContain('Actualizar inventario');
  });
});
