import { describe, expect, it } from 'vitest';

import {
  changesInventoryMode,
  draftFromInventory,
  EMPTY_INVENTORY_DRAFT,
  inventoryBody,
  inventoryChanged,
  inventoryProblems,
  isLowStock,
  readInventory,
  type InventoryDraft,
} from './inventory-control';
import { baseInventoryLabel, listingInventory, variantInventorySummary } from './inventory-summary';

import type { AdminProduct, AdminProductVariant, InventoryControl } from '@/lib/api/catalog';

/**
 * Los dos modos de inventario, comprobados donde se decide: en el módulo puro.
 *
 * Lo que se protege aquí no es la presentación sino las dos afirmaciones que el contrato hace y
 * que un panel puede romper sin enterarse: que en modo disponibilidad **no existe** ninguna
 * cantidad, y que lo que viaja es siempre el estado final, nunca una diferencia.
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

describe('7. modo cantidad: la cantidad se dice', () => {
  it('lee las unidades y el estado', () => {
    expect(readInventory(tracked(12))).toEqual({
      tone: 'inStock',
      label: 'Disponible',
      quantityLabel: '12 unidades',
    });
  });

  it('una unidad va en singular', () => {
    expect(readInventory(tracked(1)).quantityLabel).toBe('1 unidad');
  });

  it('cero es «sin existencias», no «stock bajo»', () => {
    const reading = readInventory(tracked(0, 3));

    expect(reading.tone).toBe('outOfStock');
    expect(reading.label).toBe('Sin existencias');
    expect(isLowStock(tracked(0, 3))).toBe(false);
  });

  it('el umbral en cero no avisa nunca', () => {
    expect(isLowStock(tracked(1, 0))).toBe(false);
  });

  it('por debajo del umbral avisa', () => {
    expect(readInventory(tracked(2, 3)).tone).toBe('lowStock');
  });
});

describe('8. modo disponibilidad: no hay cantidad que mostrar', () => {
  it('no produce ninguna etiqueta de cantidad', () => {
    expect(readInventory(availability('in_stock')).quantityLabel).toBeNull();
    expect(readInventory(availability('out_of_stock')).quantityLabel).toBeNull();
  });

  /*
   * La trampa que esto vigila: `quantity` llega en `null` y un `?? 0` la convertiría en «0
   * unidades», que es una cantidad que nadie escribió.
   */
  it('el borrador no precarga un cero en los campos de cantidad', () => {
    const draft = draftFromInventory(availability('in_stock'));

    expect(draft.quantity).toBe('');
    expect(draft.lowStockThreshold).toBe('0');
  });

  it('el umbral no cuenta como aviso', () => {
    expect(isLowStock(availability('in_stock'))).toBe(false);
  });
});

describe('9 y 10. el cuerpo se construye desde el modo', () => {
  it('tracked manda quantity y umbral, y nunca status', () => {
    const draft: InventoryDraft = {
      mode: 'tracked',
      quantity: '15',
      lowStockThreshold: '2',
      status: 'out_of_stock',
    };
    const body = inventoryBody(draft);

    expect(body).toEqual({ mode: 'tracked', quantity: 15, lowStockThreshold: 2 });
    expect(body).not.toHaveProperty('status');
  });

  it('availability manda status, y nunca quantity ni umbral', () => {
    const draft: InventoryDraft = {
      mode: 'availability',
      quantity: '15',
      lowStockThreshold: '2',
      status: 'out_of_stock',
    };
    const body = inventoryBody(draft);

    expect(body).toEqual({ mode: 'availability', status: 'out_of_stock' });
    expect(body).not.toHaveProperty('quantity');
    expect(body).not.toHaveProperty('lowStockThreshold');
  });

  it('el umbral ausente significa cero, y una cantidad ausente no significa nada', () => {
    expect(
      inventoryBody({ mode: 'tracked', quantity: '4', lowStockThreshold: '', status: 'in_stock' }),
    ).toEqual({ mode: 'tracked', quantity: 4, lowStockThreshold: 0 });

    expect(
      inventoryBody({ mode: 'tracked', quantity: '', lowStockThreshold: '0', status: 'in_stock' }),
    ).toBeNull();
    expect(
      inventoryProblems({
        mode: 'tracked',
        quantity: '',
        lowStockThreshold: '0',
        status: 'in_stock',
      }),
    ).toContain('quantity_required');
  });

  it('una cantidad ilegible escrita y abandonada no bloquea el otro modo', () => {
    const draft: InventoryDraft = {
      mode: 'availability',
      quantity: 'catorce',
      lowStockThreshold: '-1',
      status: 'in_stock',
    };

    expect(inventoryProblems(draft)).toEqual([]);
    expect(inventoryBody(draft)).toEqual({ mode: 'availability', status: 'in_stock' });
  });

  it('rechaza una cantidad por encima del tope del contrato', () => {
    expect(
      inventoryProblems({
        mode: 'tracked',
        quantity: '1000001',
        lowStockThreshold: '0',
        status: 'in_stock',
      }),
    ).toContain('quantity_too_large');
  });
});

describe('11. cambiar la cantidad escribe el total final', () => {
  /*
   * La prueba que fallaría si alguien reintrodujera un delta: de 8 a 15 el cuerpo dice 15, no 7.
   * Y para agotar, 0, no −8.
   */
  it('de 8 a 15 se manda 15, no 7', () => {
    const body = inventoryBody({
      mode: 'tracked',
      quantity: '15',
      lowStockThreshold: '0',
      status: 'in_stock',
    });

    expect(body).toMatchObject({ quantity: 15 });
    expect(JSON.stringify(body)).not.toContain('delta');
  });

  it('agotar se escribe con un cero, no con un negativo', () => {
    expect(
      inventoryBody({ mode: 'tracked', quantity: '0', lowStockThreshold: '0', status: 'in_stock' }),
    ).toEqual({ mode: 'tracked', quantity: 0, lowStockThreshold: 0 });
  });
});

describe('14. el estado igual no produce llamada', () => {
  it('un borrador idéntico a lo guardado no cuenta como cambio', () => {
    expect(inventoryChanged(tracked(12, 2), draftFromInventory(tracked(12, 2)))).toBe(false);
    expect(
      inventoryChanged(availability('in_stock'), draftFromInventory(availability('in_stock'))),
    ).toBe(false);
  });

  it('cambiar la cantidad o el umbral sí cuenta', () => {
    expect(
      inventoryChanged(tracked(12, 2), {
        mode: 'tracked',
        quantity: '13',
        lowStockThreshold: '2',
        status: 'in_stock',
      }),
    ).toBe(true);
    expect(
      inventoryChanged(tracked(12, 2), {
        mode: 'tracked',
        quantity: '12',
        lowStockThreshold: '3',
        status: 'in_stock',
      }),
    ).toBe(true);
  });

  /*
   * Cambiar de modo cuenta **aunque la disponibilidad efectiva coincida**: pasar de «tengo 4» a
   * «está disponible» cambia qué significa el inventario, no solo su valor.
   */
  it('cambiar de modo cuenta como cambio y pide confirmación', () => {
    const draft = draftFromInventory(tracked(4));
    const toAvailability: InventoryDraft = { ...draft, mode: 'availability', status: 'in_stock' };

    expect(inventoryChanged(tracked(4), toAvailability)).toBe(true);
    expect(changesInventoryMode(tracked(4), toAvailability)).toBe(true);
    expect(changesInventoryMode(tracked(4), draft)).toBe(false);
  });
});

describe('20 y 21. el listado dice lo que corresponde a cada modo', () => {
  it('base tracked: las unidades', () => {
    expect(baseInventoryLabel(product(tracked(12)))).toEqual({
      tone: 'inStock',
      label: '12 unidades',
    });
  });

  it('base tracked en cero: sin existencias', () => {
    expect(baseInventoryLabel(product(tracked(0)))).toEqual({
      tone: 'outOfStock',
      label: 'Sin existencias',
    });
  });

  it('base tracked bajo umbral: la cantidad y el aviso', () => {
    expect(baseInventoryLabel(product(tracked(2, 3)))).toEqual({
      tone: 'lowStock',
      label: '2 unidades · Stock bajo',
    });
  });

  it('base availability: el estado y ningún número', () => {
    expect(baseInventoryLabel(product(availability('in_stock')))).toEqual({
      tone: 'inStock',
      label: 'Disponible',
    });
    expect(baseInventoryLabel(product(availability('out_of_stock')))).toEqual({
      tone: 'outOfStock',
      label: 'Sin existencias',
    });
    expect(baseInventoryLabel(product(availability('in_stock'))).label).not.toMatch(/\d/);
  });
});

describe('22, 23 y 24. el resumen de variantes', () => {
  it('todas con conteo: la suma y cuántas son', () => {
    expect(
      variantInventorySummary([
        variant(tracked(10)),
        variant(tracked(8)),
        variant(tracked(4)),
        variant(tracked(2)),
      ]).label,
    ).toBe('24 unidades en 4 variantes');
  });

  it('todas por disponibilidad: cuántas hay de cada estado, sin cantidades', () => {
    const summary = variantInventorySummary([
      variant(availability('in_stock')),
      variant(availability('in_stock')),
      variant(availability('in_stock')),
      variant(availability('out_of_stock')),
    ]);

    expect(summary.label).toBe('3 con existencias · 1 sin existencias');
    expect(summary.label).not.toContain('unidades');
  });

  /*
   * El caso que más fácil se falsea: sumar las unidades de las que llevan conteo y presentarlas
   * como el inventario del producto, cuando además hay variantes disponibles sin cantidad conocida.
   */
  it('mixtas: lo dice, y no inventa una cantidad total', () => {
    const summary = variantInventorySummary([
      variant(tracked(10)),
      variant(tracked(2)),
      variant(availability('in_stock')),
      variant(availability('out_of_stock')),
    ]);

    expect(summary.label).toBe('Inventario mixto · 2 con cantidad · 2 por disponibilidad');
    expect(summary.label).not.toContain('unidades');
    expect(summary.label).not.toContain('12');
  });

  it('todo agotado se dice antes que cualquier otra cosa', () => {
    expect(
      variantInventorySummary([variant(tracked(0)), variant(availability('out_of_stock'))]),
    ).toEqual({ tone: 'outOfStock', label: 'Variantes sin existencias' });
  });

  it('las archivadas no cuentan', () => {
    expect(variantInventorySummary([variant(tracked(5)), variant(tracked(99), true)]).label).toBe(
      '5 unidades en 1 variante',
    );
  });

  /*
   * 17 en su forma de datos: con variantes activas, el listado **no** enseña el inventario base.
   * Un producto con base agotada y variantes disponibles no puede decir «Sin existencias».
   */
  it('con variantes activas no se usa el inventario base', () => {
    const withVariants = product(tracked(0), [variant(tracked(7))]);

    expect(listingInventory(withVariants).label).toBe('7 unidades en 1 variante');
    expect(listingInventory(product(tracked(0)))).toEqual({
      tone: 'outOfStock',
      label: 'Sin existencias',
    });
  });

  it('sin variantes activas vuelve a mandar la base', () => {
    expect(listingInventory(product(tracked(3), [variant(tracked(9), true)])).label).toBe(
      '3 unidades',
    );
  });
});

describe('el borrador de partida', () => {
  it('nace con conteo y sin cantidad escrita: no se inventa un cero', () => {
    expect(EMPTY_INVENTORY_DRAFT.mode).toBe('tracked');
    expect(EMPTY_INVENTORY_DRAFT.quantity).toBe('');
  });
});
