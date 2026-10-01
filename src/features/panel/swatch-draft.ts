/**
 * Modelo local de **colores y acabados**: el eje visual de un producto y sus opciones.
 *
 * Módulo puro sobre datos: no toca red, DOM ni React. Lo usan el alta y la ficha.
 *
 * Qué es cada cosa, según el contrato:
 *
 * - Un eje visual (`presentation: 'swatch'`) **declara** sus opciones. Cada opción tiene un
 *   `value` estable, un nombre, un color `#RRGGBB`, un orden y, opcionalmente, imágenes del mismo
 *   producto.
 * - El `value` es la **identidad**: se propone desde el nombre al crear la opción y, una vez que
 *   el backend la guardó, ya no se toca. Corregir el nombre o el color no crea otra opción.
 * - Qué variantes usan cada opción lo dice el backend (`activeVariantIds`). Aquí no se calcula: se
 *   usa para impedir retirar una opción en uso y para contar qué combinaciones faltan.
 *
 * Lo que se valida aquí es **forma** —hex, nombre, duplicados, tope—, para avisar al escribir. El
 * backend vuelve a validarlo todo y es la autoridad: la regla de «no retirar una opción en uso» la
 * aplica él dentro de su transacción, y responde `409` si alguien se adelanta.
 */

import type {
  AdminProductVariant,
  ProductAttributeDefinition,
  ProductAttributeDefinitionInput,
} from '@/lib/api/catalog';
import {
  ATTRIBUTE_OPTION_IMAGES_MAX,
  ATTRIBUTE_OPTION_LABEL_MAX_LENGTH,
  ATTRIBUTE_OPTIONS_MAX,
  HEX_COLOR_PATTERN,
  VARIANT_MAX_ACTIVE,
} from '@/lib/api/variant-limits';

import { EMPTY_INVENTORY_DRAFT } from './inventory-control';
import {
  combinationKey,
  suggestAxisValue,
  type AxisDraft,
  type VariantAttributeDraft,
  type VariantDraft,
} from './variant-draft';

/** Claves propuestas para el eje visual. Son las que ya usa la tienda; la clave es estable. */
export const SWATCH_AXIS_KEYS = [
  { key: 'color', label: 'Color' },
  { key: 'finish', label: 'Acabado' },
] as const;

export type SwatchOptionDraft = {
  /** Identificador local, solo para React y para las acciones de la lista. */
  readonly optionId: string;
  /** Identidad de la opción. Fija en cuanto `persisted` es `true`. */
  readonly value: string;
  readonly label: string;
  /** Lo que hay escrito en el campo hexadecimal, tal cual, aunque esté a medias. */
  readonly hex: string;
  readonly imageIds: readonly string[];
  /** La opción ya existe en el backend: su `value` no se puede cambiar. */
  readonly persisted: boolean;
  /** Variantes activas que la usan, según el backend. Vacío en una opción nueva. */
  readonly activeVariantIds: readonly string[];
};

export type SwatchAxisDraft = {
  readonly key: string;
  readonly label: string;
  /** La clave ya existe en el backend: no se puede cambiar sin romper las variantes. */
  readonly persistedKey: boolean;
  readonly options: readonly SwatchOptionDraft[];
};

/* ------------------------------------------------------------------ lectura */

/**
 * Identificador local de una opción que ya existe: derivado de su valor, que es único en el eje.
 *
 * Determinista a propósito. La ficha se renderiza en el servidor y se hidrata en el navegador; un
 * identificador aleatorio daría dos HTML distintos y React no los reconcilia.
 */
function savedOptionId(value: string): string {
  return `opcion-${value}`;
}

/** El eje visual del producto, si declara uno. El panel gestiona uno por producto. */
export function swatchFromProduct(
  attributes: readonly ProductAttributeDefinition[],
): SwatchAxisDraft | null {
  const axis = attributes.find((entry) => entry.presentation === 'swatch');

  if (axis === undefined) {
    return null;
  }

  return {
    key: axis.key,
    label: axis.label,
    persistedKey: true,
    options: [...axis.options]
      .sort((left, right) => left.position - right.position)
      .map((option) => ({
        optionId: savedOptionId(option.value),
        value: option.value,
        label: option.label,
        hex: option.hex,
        imageIds: [...option.imageIds],
        persisted: true,
        activeVariantIds: [...option.activeVariantIds],
      })),
  };
}

/**
 * Activa un eje visual.
 *
 * Si el producto ya tiene un eje de **texto** con esa clave —un `finish` de antes—, se convierte
 * conservando la clave: las opciones parten de los valores que usan sus variantes activas, con su
 * nombre, y cada una necesita su color antes de guardar. Así no se rompe ninguna variante.
 */
export function activateSwatch(
  key: string,
  label: string,
  attributes: readonly ProductAttributeDefinition[],
  variants: readonly AdminProductVariant[],
): SwatchAxisDraft {
  const existing = attributes.find((entry) => entry.key === key);
  const values = new Map<string, { label: string; variantIds: string[] }>();

  for (const variant of variants) {
    if (variant.status !== 'active') continue;
    const attribute = variant.attributes.find((entry) => entry.key === key);
    if (attribute === undefined) continue;
    const current = values.get(attribute.value);
    values.set(attribute.value, {
      label: current?.label ?? attribute.label,
      variantIds: [...(current?.variantIds ?? []), variant.id],
    });
  }

  return {
    key,
    label: existing?.label ?? label,
    persistedKey: existing !== undefined,
    options: [...values.entries()].map(([value, entry]) => ({
      optionId: savedOptionId(value),
      value,
      label: entry.label,
      hex: '',
      imageIds: [],
      // El valor ya lo usan variantes guardadas: es su identidad y no se toca.
      persisted: true,
      activeVariantIds: entry.variantIds,
    })),
  };
}

/* ------------------------------------------------------------------ edición */

export function newOption(optionId: string): SwatchOptionDraft {
  return {
    optionId,
    value: '',
    label: '',
    hex: '#FFFFFF',
    imageIds: [],
    persisted: false,
    activeVariantIds: [],
  };
}

/**
 * Cambia el nombre. En una opción **nueva** vuelve a proponer el valor desde el nombre; en una ya
 * guardada, no: el valor es su identidad.
 */
export function renameOption(
  swatch: SwatchAxisDraft,
  optionId: string,
  label: string,
): SwatchAxisDraft {
  return replaceOption(swatch, optionId, (option) => ({
    ...option,
    label,
    value: option.persisted ? option.value : suggestAxisValue(label),
  }));
}

/**
 * Lo que llega del campo hexadecimal o del selector, sincronizado.
 *
 * El campo se guarda tal cual —a medio escribir también—; se añade la `#` si falta y se pasa a
 * mayúsculas. El selector nativo siempre entrega `#rrggbb` completo.
 */
export function setOptionHex(
  swatch: SwatchAxisDraft,
  optionId: string,
  raw: string,
): SwatchAxisDraft {
  const trimmed = raw.trim();
  const hex = (trimmed.startsWith('#') ? trimmed : `#${trimmed}`).toUpperCase().slice(0, 7);

  return replaceOption(swatch, optionId, (option) => ({
    ...option,
    hex: trimmed === '' ? '' : hex,
  }));
}

/** Valor para `<input type="color">`, que solo admite `#rrggbb` en minúsculas. */
export function pickerValue(hex: string): string {
  return HEX_COLOR_PATTERN.test(hex) ? hex.toLowerCase() : '#ffffff';
}

export function toggleOptionImage(
  swatch: SwatchAxisDraft,
  optionId: string,
  imageId: string,
): SwatchAxisDraft {
  return replaceOption(swatch, optionId, (option) => ({
    ...option,
    imageIds: option.imageIds.includes(imageId)
      ? option.imageIds.filter((id) => id !== imageId)
      : [...option.imageIds, imageId],
  }));
}

/** Sube o baja una opción una posición. En los extremos no hace nada. */
export function moveOption(
  swatch: SwatchAxisDraft,
  optionId: string,
  direction: -1 | 1,
): SwatchAxisDraft {
  const index = swatch.options.findIndex((option) => option.optionId === optionId);
  const target = index + direction;

  if (index < 0 || target < 0 || target >= swatch.options.length) {
    return swatch;
  }

  const options = [...swatch.options];
  const [moved] = options.splice(index, 1);

  if (moved !== undefined) {
    options.splice(target, 0, moved);
  }

  return { ...swatch, options };
}

/** ¿Se puede retirar? Solo si ninguna variante activa la usa. */
export function canRemoveOption(option: SwatchOptionDraft): boolean {
  return option.activeVariantIds.length === 0;
}

/** Retira una opción **no utilizada**. Una en uso se devuelve sin cambios. */
export function removeOption(swatch: SwatchAxisDraft, optionId: string): SwatchAxisDraft {
  return {
    ...swatch,
    options: swatch.options.filter(
      (option) => option.optionId !== optionId || !canRemoveOption(option),
    ),
  };
}

function replaceOption(
  swatch: SwatchAxisDraft,
  optionId: string,
  change: (option: SwatchOptionDraft) => SwatchOptionDraft,
): SwatchAxisDraft {
  return {
    ...swatch,
    options: swatch.options.map((option) =>
      option.optionId === optionId ? change(option) : option,
    ),
  };
}

/* ----------------------------------------------------------------- validación */

export type SwatchValidation = {
  /** Mensaje por opción, indexado por `optionId`. */
  readonly byOption: Readonly<Record<string, string>>;
  readonly general: readonly string[];
};

/**
 * Forma del eje antes de enviarlo.
 *
 * `activeImageIds` son las imágenes activas del producto, o `null` si el producto todavía no
 * existe: entonces no hay nada que asociar y cualquier asociación sería inventada.
 */
export function validateSwatch(
  swatch: SwatchAxisDraft,
  activeImageIds: readonly string[] | null,
): SwatchValidation {
  const byOption: Record<string, string> = {};
  const general: string[] = [];

  if (swatch.label.trim().length === 0) {
    general.push('El eje necesita un nombre visible, por ejemplo «Color».');
  }

  if (swatch.options.length === 0) {
    general.push('Añade al menos una opción con su nombre y su color.');
  }

  if (swatch.options.length > ATTRIBUTE_OPTIONS_MAX) {
    general.push(`Un eje admite como máximo ${ATTRIBUTE_OPTIONS_MAX} opciones.`);
  }

  const seen = new Map<string, string>();

  for (const option of swatch.options) {
    const label = option.label.trim();
    const value = option.value.trim();
    let message: string | null = null;

    if (label.length === 0) {
      message = 'Escribe el nombre de la opción.';
    } else if (label.length > ATTRIBUTE_OPTION_LABEL_MAX_LENGTH) {
      message = `El nombre supera los ${ATTRIBUTE_OPTION_LABEL_MAX_LENGTH} caracteres.`;
    } else if (value.length === 0) {
      message = 'El nombre necesita al menos una letra o un número.';
    } else if (seen.has(value)) {
      message = `Repite «${seen.get(value) ?? value}»: dos opciones no pueden llamarse igual, aunque cambien mayúsculas, espacios o tildes.`;
    } else if (!HEX_COLOR_PATTERN.test(option.hex)) {
      message = 'El color tiene que ser un hexadecimal de seis cifras, como #C8A27A.';
    } else if (option.imageIds.length > ATTRIBUTE_OPTION_IMAGES_MAX) {
      message = `Una opción admite como máximo ${ATTRIBUTE_OPTION_IMAGES_MAX} imágenes.`;
    } else if (activeImageIds === null && option.imageIds.length > 0) {
      message = 'Las imágenes se asocian cuando el producto ya existe.';
    } else if (
      activeImageIds !== null &&
      option.imageIds.some((id) => !activeImageIds.includes(id))
    ) {
      message = 'Hay una imagen asociada que ya no está activa. Quítala de la opción.';
    }

    if (value.length > 0 && !seen.has(value)) {
      seen.set(value, label);
    }

    if (message !== null) {
      byOption[option.optionId] = message;
    }
  }

  return { byOption, general };
}

export function hasSwatchIssues(validation: SwatchValidation): boolean {
  return validation.general.length > 0 || Object.keys(validation.byOption).length > 0;
}

/* ------------------------------------------------------------------- envío */

/**
 * Los ejes tal como se envían: los de texto del editor y el visual, **en ese orden**.
 *
 * Una opción nueva viaja con el valor propuesto; una guardada, con el suyo, que el backend usa
 * para reconocerla. El uso por variantes no viaja: no se escribe, lo calcula el backend.
 */
export function attributesBody(
  textAxes: readonly { readonly key: string; readonly label: string }[],
  swatch: SwatchAxisDraft | null,
): ProductAttributeDefinitionInput[] {
  const body: ProductAttributeDefinitionInput[] = textAxes
    .filter((axis) => swatch === null || axis.key !== swatch.key.trim())
    .map((axis) => ({ key: axis.key, label: axis.label, presentation: 'text' }));

  if (swatch !== null) {
    body.push({
      key: swatch.key.trim(),
      label: swatch.label.trim(),
      presentation: 'swatch',
      options: swatch.options.map((option, position) => ({
        value: option.value.trim(),
        label: option.label.trim(),
        hex: option.hex.toUpperCase(),
        position,
        imageIds: [...option.imageIds],
      })),
    });
  }

  return body;
}

/** El eje visual como un eje más, para generar y validar variantes con la lógica de siempre. */
export function swatchAsAxis(swatch: SwatchAxisDraft): AxisDraft {
  return {
    axisId: `swatch-${swatch.key}`,
    key: swatch.key.trim(),
    label: swatch.label.trim(),
    values: swatch.options
      .filter((option) => option.value.trim().length > 0)
      .map((option) => ({
        valueId: option.optionId,
        value: option.value.trim(),
        label: option.label.trim(),
      })),
  };
}

/* ------------------------------------------------------------------- matriz */

export type MatrixCellState = 'variant' | 'draft' | 'missing';

export type MatrixCell = {
  /** Combinación en la forma del contrato: `finish:roble|size:80`. */
  readonly key: string;
  readonly attributes: readonly VariantAttributeDraft[];
  readonly state: MatrixCellState;
  /** SKU de la variante activa o del borrador, si lo hay. */
  readonly sku: string | null;
};

export type CombinationMatrix = {
  /** Una fila por opción de color, en su orden. */
  readonly rows: readonly {
    readonly option: VariantAttributeDraft;
    readonly cells: readonly MatrixCell[];
  }[];
  /** Encabezado de cada columna: la combinación de los demás ejes. Vacío si solo hay color. */
  readonly columns: readonly (readonly VariantAttributeDraft[])[];
  readonly missing: readonly MatrixCell[];
  readonly total: number;
};

/**
 * Todas las combinaciones de colores con los demás ejes, y en qué estado está cada una.
 *
 * Es informativa: dice qué existe como variante activa, qué está preparado como borrador y qué
 * falta. No crea nada, y una combinación que falta no es un error —puede que no se venda—, pero se
 * enseña antes de publicar para que nadie lo descubra en la tienda.
 */
export function combinationMatrix(
  swatch: SwatchAxisDraft,
  otherAxes: readonly AxisDraft[],
  variants: readonly AdminProductVariant[],
  drafts: readonly VariantDraft[],
): CombinationMatrix {
  const axis = swatchAsAxis(swatch);
  const active = variants.filter((variant) => variant.status === 'active');
  const others = otherAxes
    .filter((entry) => entry.key.trim().length > 0 && entry.key.trim() !== axis.key)
    .map((entry) => ({
      key: entry.key.trim(),
      values: valuesOfAxis(entry, active),
    }));

  let columns: VariantAttributeDraft[][] = [[]];

  for (const other of others) {
    const next: VariantAttributeDraft[][] = [];
    for (const column of columns) {
      for (const value of other.values) next.push([...column, value]);
    }
    columns = next;
  }

  const byKey = new Map(active.map((variant) => [variant.combinationKey, variant.sku] as const));
  const draftByKey = new Map(
    drafts.map((draft) => [combinationKey(draft.attributes), draft.sku.trim()] as const),
  );
  const missing: MatrixCell[] = [];

  const rows = axis.values.map((value) => {
    const option = { key: axis.key, value: value.value, label: value.label };
    const cells = columns.map((column): MatrixCell => {
      const attributes = [option, ...column];
      const key = combinationKey(attributes);
      const sku = byKey.get(key);
      const draftSku = draftByKey.get(key);
      const cell: MatrixCell =
        sku !== undefined
          ? { key, attributes, state: 'variant', sku }
          : draftSku !== undefined
            ? { key, attributes, state: 'draft', sku: draftSku === '' ? null : draftSku }
            : { key, attributes, state: 'missing', sku: null };
      if (cell.state === 'missing') missing.push(cell);
      return cell;
    });
    return { option, cells };
  });

  return {
    rows,
    columns: others.length === 0 ? [] : columns,
    missing,
    total: rows.length * columns.length,
  };
}

/** Valores de un eje de texto: los escritos en el editor y los que ya usan las variantes. */
function valuesOfAxis(
  axis: AxisDraft,
  active: readonly AdminProductVariant[],
): VariantAttributeDraft[] {
  const values = new Map<string, string>();
  const key = axis.key.trim();

  for (const variant of active) {
    const attribute = variant.attributes.find((entry) => entry.key === key);
    if (attribute !== undefined && !values.has(attribute.value)) {
      values.set(attribute.value, attribute.label);
    }
  }

  for (const value of axis.values) {
    const normalised = value.value.trim();
    if (normalised.length > 0 && !values.has(normalised)) {
      values.set(normalised, value.label.trim() === '' ? normalised : value.label.trim());
    }
  }

  return [...values.entries()].map(([value, label]) => ({ key, value, label }));
}

/**
 * Borradores para las combinaciones que faltan, **sin SKU, sin precio y sin inventario**.
 *
 * Cada combinación exige los tres y aquí no se inventa ninguno: el SKU no se genera, el precio no
 * se copia del producto y el inventario no se copia de otra variante. Respeta el tope de variantes
 * activas del backend contando las que ya existen y los borradores que ya hay.
 */
export function draftsForMissing(
  matrix: CombinationMatrix,
  options: {
    readonly activeCount: number;
    readonly draftCount: number;
    readonly newId: () => string;
  },
): { readonly drafts: readonly VariantDraft[]; readonly skipped: number } {
  const room = Math.max(0, VARIANT_MAX_ACTIVE - options.activeCount - options.draftCount);
  const drafts = matrix.missing.slice(0, room).map((cell) => ({
    draftId: options.newId(),
    sku: '',
    priceCop: '',
    inventory: EMPTY_INVENTORY_DRAFT,
    attributes: cell.attributes.map((attribute) => ({ ...attribute })),
  }));

  return { drafts, skipped: matrix.missing.length - drafts.length };
}

/* ------------------------------------------------------------- presentación */

/**
 * ¿Es un color claro, que necesita un borde más marcado para verse sobre fondo blanco?
 *
 * Luminancia relativa de WCAG. Es solo presentación: el borde existe siempre y en los claros se
 * refuerza.
 */
export function isLightColor(hex: string): boolean {
  if (!HEX_COLOR_PATTERN.test(hex)) {
    return true;
  }

  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);

  return luminance > 0.8;
}

/**
 * El borrador **sobre la versión nueva** del producto, sin perder lo escrito.
 *
 * Tras un conflicto de versión se recarga el producto, pero el formulario no se tira: se conserva
 * lo que la persona escribió y se actualiza lo que dice el backend —qué opciones ya existen y qué
 * variantes las usan ahora—, para que no se pueda retirar una opción que entretanto empezó a usarse.
 */
export function rebaseSwatch(
  draft: SwatchAxisDraft,
  saved: SwatchAxisDraft | null,
): SwatchAxisDraft {
  if (saved === null || saved.key !== draft.key) {
    return draft;
  }

  const byValue = new Map(saved.options.map((option) => [option.value, option] as const));

  return {
    ...draft,
    persistedKey: true,
    options: draft.options.map((option) => {
      const stored = byValue.get(option.value);
      return stored === undefined
        ? option
        : { ...option, persisted: true, activeVariantIds: stored.activeVariantIds };
    }),
  };
}

/** ¿Hay cambios sin guardar respecto a lo que tiene el backend? */
export function swatchChanged(
  draft: SwatchAxisDraft | null,
  saved: SwatchAxisDraft | null,
): boolean {
  return JSON.stringify(attributesBody([], draft)) !== JSON.stringify(attributesBody([], saved));
}
