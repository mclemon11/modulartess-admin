/**
 * Modelo local de ejes de variación y de variantes todavía no enviadas.
 *
 * Módulo puro sobre datos: no toca red, DOM ni React. Lo usan las dos pantallas —el alta, donde
 * las variantes viven en memoria hasta que se pulsa «Crear producto», y el detalle, donde se
 * añaden sobre un producto que ya existe—, así que las reglas de forma se escriben una sola vez.
 *
 * Lo que se comprueba aquí replica el contrato: cada variante lleva **exactamente** los ejes que
 * el producto declara, no hay dos combinaciones iguales, el SKU es único, el precio va en pesos
 * enteros y el inventario es un entero no negativo. El backend lo vuelve a validar y es la
 * autoridad definitiva; esto solo evita enviar lo que ya se sabe que va a rechazar y da el aviso
 * en el momento de escribirlo.
 */

import type { AdminProductVariant, CreateProductVariantRequest } from '@/lib/api/catalog';
import {
  ATTRIBUTE_KEY_PATTERN,
  ATTRIBUTE_VALUE_MAX_LENGTH,
  ATTRIBUTE_VALUE_PATTERN,
  ATTRIBUTE_MAX_AXES,
  VARIANT_MAX_ACTIVE,
} from '@/lib/api/variant-limits';

import { SKU_PATTERN } from './product-input';
import { toSku, toSlug } from './slug';

/** Valor posible de un eje. `value` es lo que filtra la tienda; `label`, lo que lee la persona. */
export type AxisValueDraft = {
  readonly valueId: string;
  readonly value: string;
  readonly label: string;
};

/** Eje de variación en edición, con los valores que generarán las combinaciones. */
export type AxisDraft = {
  readonly axisId: string;
  readonly key: string;
  readonly label: string;
  readonly values: readonly AxisValueDraft[];
};

export type VariantAttributeDraft = {
  readonly key: string;
  readonly value: string;
  readonly label: string;
};

/**
 * Variante en edición.
 *
 * El precio y el inventario se guardan como texto, igual que el resto de campos numéricos del
 * formulario: se convierten al validar, y así un campo a medio escribir no se convierte en `NaN`.
 */
export type VariantDraft = {
  readonly draftId: string;
  readonly sku: string;
  readonly priceCop: string;
  readonly stockQuantity: string;
  readonly attributes: readonly VariantAttributeDraft[];
};

/**
 * Clave normalizada de una combinación.
 *
 * Se ordena por clave de eje para que dos variantes con los mismos valores en otro orden
 * produzcan la misma clave. El contrato usa esta misma forma (`finish:roble-natural|size:80`),
 * pero quien decide si dos variantes chocan sigue siendo el backend.
 */
export function combinationKey(attributes: readonly VariantAttributeDraft[]): string {
  return [...attributes]
    .map((attribute) => `${attribute.key}:${attribute.value}`)
    .sort()
    .join('|');
}

/** Ejes declarados, sin los que están a medio escribir. */
export function declaredAxes(
  axes: readonly AxisDraft[],
): readonly { readonly key: string; readonly label: string }[] {
  return axes
    .filter((axis) => axis.key.trim().length > 0 && axis.label.trim().length > 0)
    .map((axis) => ({ key: axis.key.trim(), label: axis.label.trim() }));
}

/**
 * Combinaciones que faltan por crear.
 *
 * Es el producto cartesiano de los valores de cada eje, menos las combinaciones que ya existen
 * —como variante activa o como borrador local—. Generar no crea nada: deja las variantes en la
 * lista local para revisarlas y corregirlas una a una antes de enviarlas.
 */
export function generateCombinations(
  axes: readonly AxisDraft[],
  options: {
    readonly existing: readonly string[];
    readonly baseSku: string;
    readonly basePriceCop: string;
    readonly newId: () => string;
    readonly limit: number;
  },
): readonly VariantDraft[] {
  const usable = axes.filter(
    (axis) =>
      axis.key.trim().length > 0 && axis.values.some((value) => value.value.trim().length > 0),
  );

  if (usable.length === 0) {
    return [];
  }

  let combinations: readonly VariantAttributeDraft[][] = [[]];

  for (const axis of usable) {
    const next: VariantAttributeDraft[][] = [];

    for (const combination of combinations) {
      for (const value of axis.values) {
        if (value.value.trim().length === 0) {
          continue;
        }

        next.push([
          ...combination,
          {
            key: axis.key.trim(),
            value: value.value.trim(),
            label: value.label.trim() === '' ? value.value.trim() : value.label.trim(),
          },
        ]);
      }
    }

    combinations = next;
  }

  const taken = new Set(options.existing);
  const drafts: VariantDraft[] = [];

  for (const attributes of combinations) {
    if (drafts.length >= options.limit) {
      break;
    }

    const key = combinationKey(attributes);

    if (taken.has(key)) {
      continue;
    }

    taken.add(key);
    drafts.push({
      draftId: options.newId(),
      sku: suggestSku(options.baseSku, attributes),
      priceCop: options.basePriceCop,
      stockQuantity: '0',
      attributes,
    });
  }

  return drafts;
}

/** SKU de partida: el base más los valores de la combinación. Editable hasta que se envía. */
export function suggestSku(baseSku: string, attributes: readonly VariantAttributeDraft[]): string {
  const parts = [toSku(baseSku), ...attributes.map((attribute) => toSku(attribute.value))].filter(
    (part) => part.length > 0,
  );

  return parts.join('-');
}

/** Valor normalizado sugerido para una etiqueta de eje. Se puede corregir antes de guardar. */
export function suggestAxisValue(label: string): string {
  return toSlug(label).slice(0, ATTRIBUTE_VALUE_MAX_LENGTH);
}

export type VariantValidation = {
  /** Mensaje por borrador, indexado por `draftId`. */
  readonly byDraft: Readonly<Record<string, string>>;
  /** Problemas que no son de una variante concreta: el límite, los ejes, el total. */
  readonly general: readonly string[];
};

export const EMPTY_VALIDATION: VariantValidation = { byDraft: {}, general: [] };

export function hasIssues(validation: VariantValidation): boolean {
  return validation.general.length > 0 || Object.keys(validation.byDraft).length > 0;
}

/** Ejes declarados en el producto o en el editor, comprobados contra el contrato. */
export function validateAxes(axes: readonly AxisDraft[]): readonly string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  if (axes.length > ATTRIBUTE_MAX_AXES) {
    problems.push(`Un producto admite como máximo ${ATTRIBUTE_MAX_AXES} ejes de variación.`);
  }

  for (const axis of axes) {
    const key = axis.key.trim();
    const label = axis.label.trim();

    if (key.length === 0 && label.length === 0) {
      continue;
    }

    if (!ATTRIBUTE_KEY_PATTERN.test(key)) {
      problems.push(`«${key}» no sirve como clave de eje: minúsculas, números y guiones.`);
    } else if (seen.has(key)) {
      problems.push(`El eje «${key}» está declarado dos veces.`);
    } else {
      seen.add(key);
    }

    if (label.length === 0) {
      problems.push(`El eje «${key}» necesita una etiqueta visible.`);
    }

    for (const value of axis.values) {
      const normalised = value.value.trim();

      if (normalised.length === 0) {
        continue;
      }

      if (!ATTRIBUTE_VALUE_PATTERN.test(normalised)) {
        problems.push(
          `«${normalised}» no sirve como valor de «${key}»: minúsculas, números y guiones, sin acentos.`,
        );
      }

      if (normalised.length > ATTRIBUTE_VALUE_MAX_LENGTH) {
        problems.push(
          `El valor «${normalised}» supera los ${ATTRIBUTE_VALUE_MAX_LENGTH} caracteres.`,
        );
      }
    }
  }

  return problems;
}

/**
 * Comprueba los borradores contra los ejes declarados y contra lo que ya existe en el backend.
 *
 * `existing` son las variantes que devolvió el backend. Solo las activas cuentan para el límite y
 * para la combinación repetida —una archivada ya no es vendible—, pero **su SKU sigue reservado
 * para siempre**, así que ese sí se compara contra todas.
 */
export function validateVariantDrafts(
  drafts: readonly VariantDraft[],
  axes: readonly { readonly key: string }[],
  existing: readonly AdminProductVariant[] = [],
): VariantValidation {
  const byDraft: Record<string, string> = {};
  const general: string[] = [];

  const axisKeys = [...axes.map((axis) => axis.key)].sort();
  const activeExisting = existing.filter((variant) => variant.status === 'active');
  const takenCombinations = new Set(activeExisting.map((variant) => variant.combinationKey));
  const takenSkus = new Set(existing.map((variant) => variant.sku.toUpperCase()));

  if (drafts.length > 0 && axisKeys.length === 0) {
    general.push('Declara al menos un eje de variación antes de crear variantes.');
  }

  const total = activeExisting.length + drafts.length;

  if (total > VARIANT_MAX_ACTIVE) {
    general.push(
      `Un producto admite como máximo ${VARIANT_MAX_ACTIVE} variantes activas; llevas ${total}.`,
    );
  }

  for (const draft of drafts) {
    const sku = draft.sku.trim().toUpperCase();
    const price = Number(draft.priceCop);
    const stock = Number(draft.stockQuantity);
    const keys = [...draft.attributes.map((attribute) => attribute.key)].sort();
    const key = combinationKey(draft.attributes);

    let message: string | null = null;

    if (!SKU_PATTERN.test(sku)) {
      message = 'SKU inválido: mayúsculas, números y guiones, entre 2 y 64 caracteres.';
    } else if (takenSkus.has(sku)) {
      message = 'Ese SKU ya está reservado. Los SKU no se reutilizan, ni los archivados.';
    } else if (axisKeys.length > 0 && keys.join('|') !== axisKeys.join('|')) {
      message = `La variante debe llevar exactamente los ejes declarados: ${axisKeys.join(', ')}.`;
    } else if (draft.attributes.some((attribute) => attribute.value.trim().length === 0)) {
      message = 'Cada eje necesita su valor.';
    } else if (takenCombinations.has(key)) {
      message = 'Esa combinación ya existe en otra variante activa.';
    } else if (!Number.isInteger(price) || price <= 0 || draft.priceCop.trim() === '') {
      message = 'Precio en pesos enteros, mayor que cero.';
    } else if (!Number.isInteger(stock) || stock < 0 || draft.stockQuantity.trim() === '') {
      message = 'Inventario entero y no negativo.';
    }

    if (message !== null) {
      byDraft[draft.draftId] = message;
      continue;
    }

    takenCombinations.add(key);
    takenSkus.add(sku);
  }

  return { byDraft, general };
}

/** Cuerpo de alta de una variante, con la versión del producto que se acaba de leer. */
export function variantRequestBody(
  draft: VariantDraft,
  expectedVersion: number,
): CreateProductVariantRequest {
  return {
    expectedVersion,
    sku: draft.sku.trim().toUpperCase(),
    priceCop: Number(draft.priceCop),
    stockQuantity: Number(draft.stockQuantity || 0),
    attributes: draft.attributes.map((attribute) => ({
      key: attribute.key.trim(),
      value: attribute.value.trim(),
      label: attribute.label.trim() === '' ? attribute.value.trim() : attribute.label.trim(),
    })),
  };
}

/** Ejes que el producto ya declara, traídos al modelo local para seguir editándolos. */
export function axesFromProduct(
  definitions: readonly { readonly key: string; readonly label: string }[],
  newId: () => string,
): readonly AxisDraft[] {
  return definitions.map((definition) => ({
    axisId: newId(),
    key: definition.key,
    label: definition.label,
    values: [],
  }));
}

/* ------------------------------------------------- edición de la lista de ejes */

/** Eje nuevo, vacío y listo para escribir. */
export function emptyAxis(axisId: string): AxisDraft {
  return { axisId, key: '', label: '', values: [] };
}

export function replaceAxis(
  axes: readonly AxisDraft[],
  axisId: string,
  change: (axis: AxisDraft) => AxisDraft,
): readonly AxisDraft[] {
  return axes.map((axis) => (axis.axisId === axisId ? change(axis) : axis));
}

/**
 * Cambia la etiqueta de un valor y, **solo si el valor normalizado no se ha tocado a mano**,
 * vuelve a sugerirlo desde la etiqueta.
 *
 * Así escribir «Roble natural» propone `roble-natural` sin pisar un valor que alguien haya
 * corregido a propósito: el valor es lo que filtra la tienda y no debería cambiar solo.
 */
export function setValueLabel(
  axes: readonly AxisDraft[],
  axisId: string,
  valueId: string,
  label: string,
): readonly AxisDraft[] {
  return replaceAxis(axes, axisId, (axis) => ({
    ...axis,
    values: axis.values.map((value) =>
      value.valueId === valueId
        ? {
            ...value,
            label,
            value:
              value.value === suggestAxisValue(value.label) ? suggestAxisValue(label) : value.value,
          }
        : value,
    ),
  }));
}
