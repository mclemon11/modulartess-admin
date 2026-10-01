import { describe, expect, it } from 'vitest';

import type { AdminProductVariant, ProductAttributeDefinition } from '@/lib/api/catalog';

import {
  activateSwatch,
  attributesBody,
  canRemoveOption,
  combinationMatrix,
  draftsForMissing,
  hasSwatchIssues,
  isLightColor,
  moveOption,
  newOption,
  pickerValue,
  rebaseSwatch,
  removeOption,
  renameOption,
  setOptionHex,
  swatchChanged,
  swatchFromProduct,
  toggleOptionImage,
  validateSwatch,
  type SwatchAxisDraft,
} from './swatch-draft';
import type { AxisDraft, VariantDraft } from './variant-draft';

/**
 * Colores y acabados: modelo local, sin red ni React. Todos los datos son ficticios.
 */

let counter = 0;
const newId = () => `id-${++counter}`;

const SAVED: ProductAttributeDefinition[] = [
  { key: 'size', label: 'Ancho', presentation: 'text', options: [] },
  {
    key: 'color',
    label: 'Color',
    presentation: 'swatch',
    options: [
      {
        value: 'blanco',
        label: 'Blanco',
        hex: '#FFFFFF',
        position: 1,
        imageIds: [],
        activeVariantIds: [],
      },
      {
        value: 'roble',
        label: 'Roble',
        hex: '#A0703C',
        position: 0,
        imageIds: ['img_1'],
        activeVariantIds: ['var_1'],
      },
    ],
  },
];

function variant(
  id: string,
  color: string,
  size: string,
  status: 'active' | 'archived' = 'active',
) {
  return {
    id,
    sku: `SKU-${id}`,
    status,
    combinationKey: `color:${color}|size:${size}`,
    attributes: [
      { key: 'color', value: color, label: color },
      { key: 'size', value: size, label: size },
    ],
  } as unknown as AdminProductVariant;
}

function sizeAxis(values: readonly string[]): AxisDraft {
  return {
    axisId: 'size',
    key: 'size',
    label: 'Ancho',
    values: values.map((value) => ({ valueId: value, value, label: `${value} cm` })),
  };
}

function created(): SwatchAxisDraft {
  const base: SwatchAxisDraft = { key: 'color', label: 'Color', persistedKey: false, options: [] };
  const first = { ...base, options: [newOption('a')] };
  return renameOption(setOptionHex(first, 'a', '#c8a27a'), 'a', 'Roble Natural');
}

describe('creación de colores', () => {
  it('una opción nueva propone su valor estable desde el nombre', () => {
    const swatch = created();
    expect(swatch.options[0]).toMatchObject({
      value: 'roble-natural',
      label: 'Roble Natural',
      hex: '#C8A27A',
      persisted: false,
    });
    expect(hasSwatchIssues(validateSwatch(swatch, null))).toBe(false);
  });

  it('el cuerpo lleva presentación swatch, orden y color en mayúsculas', () => {
    expect(attributesBody([{ key: 'size', label: 'Ancho' }], created())).toEqual([
      { key: 'size', label: 'Ancho', presentation: 'text' },
      {
        key: 'color',
        label: 'Color',
        presentation: 'swatch',
        options: [
          {
            value: 'roble-natural',
            label: 'Roble Natural',
            hex: '#C8A27A',
            position: 0,
            imageIds: [],
          },
        ],
      },
    ]);
  });

  it('nunca envía el uso por variantes: lo calcula el backend', () => {
    const swatch = swatchFromProduct(SAVED);
    expect(JSON.stringify(attributesBody([], swatch))).not.toContain('activeVariantIds');
  });
});

describe('edición', () => {
  it('lee las opciones guardadas en su orden y las marca como existentes', () => {
    const swatch = swatchFromProduct(SAVED);
    expect(swatch?.options.map((option) => [option.value, option.persisted])).toEqual([
      ['roble', true],
      ['blanco', true],
    ]);
  });

  it('renombrar una opción guardada no cambia su valor', () => {
    const swatch = swatchFromProduct(SAVED) as SwatchAxisDraft;
    const id = swatch.options[0]?.optionId as string;
    const renamed = renameOption(swatch, id, 'Roble claro');
    expect(renamed.options[0]).toMatchObject({ value: 'roble', label: 'Roble claro' });
    expect(swatchChanged(renamed, swatch)).toBe(true);
  });

  it('convierte un eje de texto existente sin cambiar su clave', () => {
    const swatch = activateSwatch(
      'size',
      '',
      [{ key: 'size', label: 'Ancho', presentation: 'text', options: [] }],
      [variant('v1', 'x', '80'), variant('v2', 'x', '100'), variant('v3', 'x', '120', 'archived')],
    );
    expect(swatch).toMatchObject({ key: 'size', label: 'Ancho', persistedKey: true });
    expect(swatch.options.map((option) => option.value)).toEqual(['80', '100']);
    // Falta el color de cada una: no se puede guardar sin él.
    expect(Object.keys(validateSwatch(swatch, []).byOption)).toHaveLength(2);
  });
});

describe('selector y campo hexadecimal sincronizados', () => {
  it('el campo acepta sin almohadilla y en minúsculas, y el selector recibe #rrggbb', () => {
    const swatch = setOptionHex(created(), 'a', 'ff8800');
    expect(swatch.options[0]?.hex).toBe('#FF8800');
    expect(pickerValue(swatch.options[0]?.hex ?? '')).toBe('#ff8800');
  });

  it('lo que llega del selector se refleja en el campo', () => {
    expect(setOptionHex(created(), 'a', '#0a0b0c').options[0]?.hex).toBe('#0A0B0C');
  });

  it.each(['#FFF', 'blanco', '#GG0000', '#12345', ''])('rechaza «%s» como color', (raw) => {
    const swatch = setOptionHex(created(), 'a', raw);
    expect(validateSwatch(swatch, null).byOption.a).toContain('hexadecimal');
    expect(pickerValue(swatch.options[0]?.hex ?? '')).toBe('#ffffff');
  });
});

describe('orden', () => {
  it('sube y baja opciones y el cuerpo las numera desde cero', () => {
    const swatch = swatchFromProduct(SAVED) as SwatchAxisDraft;
    const blanco = swatch.options[1]?.optionId as string;
    const moved = moveOption(swatch, blanco, -1);
    expect(moved.options.map((option) => option.value)).toEqual(['blanco', 'roble']);
    expect(attributesBody([], moved)[0]?.options?.map((option) => option.position)).toEqual([0, 1]);
    // En el extremo no hace nada.
    expect(moveOption(moved, blanco, -1)).toBe(moved);
  });
});

describe('color claro', () => {
  it('blanco y cremas llevan borde reforzado; los oscuros no', () => {
    expect(isLightColor('#FFFFFF')).toBe(true);
    expect(isLightColor('#FFF8E7')).toBe(true);
    expect(isLightColor('#111111')).toBe(false);
    expect(isLightColor('#A0703C')).toBe(false);
  });
});

describe('imágenes', () => {
  it('asocia y desasocia imágenes activas', () => {
    const swatch = toggleOptionImage(created(), 'a', 'img_9');
    expect(swatch.options[0]?.imageIds).toEqual(['img_9']);
    expect(hasSwatchIssues(validateSwatch(swatch, ['img_9']))).toBe(false);
    expect(toggleOptionImage(swatch, 'a', 'img_9').options[0]?.imageIds).toEqual([]);
  });

  it('sin producto creado no se admite ninguna asociación', () => {
    const swatch = toggleOptionImage(created(), 'a', 'img_9');
    expect(validateSwatch(swatch, null).byOption.a).toContain('cuando el producto ya existe');
  });

  it('una imagen que ya no está activa se señala', () => {
    const swatch = toggleOptionImage(created(), 'a', 'img_archivada');
    expect(validateSwatch(swatch, ['img_1']).byOption.a).toContain('ya no está activa');
  });
});

describe('opción utilizada por variantes', () => {
  it('no se puede retirar; una sin uso sí', () => {
    const swatch = swatchFromProduct(SAVED) as SwatchAxisDraft;
    const [roble, blanco] = swatch.options;
    expect(canRemoveOption(roble!)).toBe(false);
    expect(removeOption(swatch, roble!.optionId).options).toHaveLength(2);
    expect(removeOption(swatch, blanco!.optionId).options.map((option) => option.value)).toEqual([
      'roble',
    ]);
  });
});

describe('duplicados', () => {
  it.each([
    ['mayúsculas', 'Roble', 'ROBLE'],
    ['espacios', 'Roble natural', '  roble   natural '],
    ['tildes', 'Café', 'cafe'],
  ])('avisa de nombres que chocan por %s', (_label, first, second) => {
    let swatch: SwatchAxisDraft = {
      key: 'color',
      label: 'Color',
      persistedKey: false,
      options: [newOption('a'), newOption('b')],
    };
    swatch = renameOption(renameOption(swatch, 'a', first), 'b', second);
    swatch = setOptionHex(setOptionHex(swatch, 'a', '#000000'), 'b', '#111111');
    expect(validateSwatch(swatch, null).byOption.b).toContain('no pueden llamarse igual');
  });
});

describe('matriz color / tamaño', () => {
  const swatch = swatchFromProduct(SAVED) as SwatchAxisDraft;
  const variants = [variant('var_1', 'roble', '80')];
  const drafts: VariantDraft[] = [
    {
      draftId: 'd1',
      sku: 'NUEVO-1',
      priceCop: '',
      inventory: { mode: 'tracked', quantity: '', lowStockThreshold: '' } as never,
      attributes: [
        { key: 'color', value: 'blanco', label: 'Blanco' },
        { key: 'size', value: '80', label: '80 cm' },
      ],
    },
  ];

  it('marca cada combinación como variante, preparada o faltante', () => {
    const matrix = combinationMatrix(swatch, [sizeAxis(['80', '100'])], variants, drafts);
    expect(matrix.total).toBe(4);
    expect(matrix.rows.map((row) => row.cells.map((cell) => cell.state))).toEqual([
      ['variant', 'missing'],
      ['draft', 'missing'],
    ]);
    expect(matrix.missing.map((cell) => cell.key)).toEqual([
      'color:roble|size:100',
      'color:blanco|size:100',
    ]);
  });

  it('prepara las que faltan sin SKU, precio ni inventario escritos', () => {
    const matrix = combinationMatrix(swatch, [sizeAxis(['80', '100'])], variants, drafts);
    const { drafts: prepared } = draftsForMissing(matrix, {
      activeCount: 1,
      draftCount: 1,
      newId,
    });
    expect(prepared).toHaveLength(2);
    for (const draft of prepared) {
      expect(draft.sku).toBe('');
      expect(draft.priceCop).toBe('');
      expect(draft.inventory).toMatchObject({ mode: 'tracked' });
    }
  });

  it('respeta el máximo de variantes del backend', () => {
    const matrix = combinationMatrix(swatch, [sizeAxis(['80', '100'])], variants, drafts);
    expect(draftsForMissing(matrix, { activeCount: 71, draftCount: 0, newId })).toMatchObject({
      skipped: 1,
    });
    expect(draftsForMissing(matrix, { activeCount: 72, draftCount: 0, newId }).drafts).toEqual([]);
  });

  it('solo con color, una columna de estado', () => {
    const matrix = combinationMatrix(swatch, [], variants, []);
    expect(matrix.columns).toEqual([]);
    expect(matrix.total).toBe(2);
  });
});

describe('conflictos', () => {
  it('tras recargar conserva lo escrito y toma el uso real del backend', () => {
    const draft = renameOption(swatchFromProduct(SAVED) as SwatchAxisDraft, 'id-no-existe', 'x');
    const newest: ProductAttributeDefinition[] = [
      {
        ...SAVED[1]!,
        options: SAVED[1]!.options.map((option) =>
          option.value === 'blanco' ? { ...option, activeVariantIds: ['var_9'] } : option,
        ),
      },
    ];
    const edited = { ...draft, label: 'Color del frente' };
    const rebased = rebaseSwatch(edited, swatchFromProduct(newest));
    expect(rebased.label).toBe('Color del frente');
    // «Blanco» empezó a usarse mientras tanto: ya no se puede retirar.
    expect(canRemoveOption(rebased.options.find((option) => option.value === 'blanco')!)).toBe(
      false,
    );
  });
});
