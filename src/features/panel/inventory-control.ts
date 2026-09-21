/**
 * Las dos formas de controlar el inventario.
 *
 * El contrato publica un modelo **discriminado** y el panel lo respeta tal cual, sin aplanarlo:
 *
 * - `tracked`: alguien dice cuántas unidades hay, y la disponibilidad se deriva de `quantity > 0`.
 * - `availability`: alguien dice solo si se puede comprar, y **no existe ninguna cantidad**.
 *
 * La tentación de esta pantalla es tratar `availability` como «tracked con cantidad desconocida» y
 * pintar un cero, un uno o un guion en el hueco. Sería un centinela, y un centinela en un
 * inventario acaba sumado: «3 productos con 0 unidades» se lee como tres agotados cuando ninguno lo
 * está. Por eso `quantity` y `lowStockThreshold` llegan en `null` y `null` significa **no aplica**,
 * nunca cero.
 *
 * El otro error que este módulo evita es mandar campos del modo equivocado. El backend los rechaza
 * —«fields of one mode are rejected in the other»— y construir el cuerpo campo a campo desde el
 * modo elegido hace imposible que se cuelen.
 *
 * Las etiquetas están en español porque las lee quien administra la tienda; los códigos —`tracked`,
 * `availability`, `in_stock`, `out_of_stock`— son los del contrato y no se traducen al viajar.
 *
 * Módulo puro.
 */

import type { InventoryControl, SetInventoryControl } from '@/lib/api/catalog';

export type InventoryMode = InventoryControl['mode'];
export type InventoryAvailability = InventoryControl['availability'];

/** Cómo se llama cada modo en pantalla. */
const MODE_LABELS: Readonly<Record<InventoryMode, string>> = {
  tracked: 'Controlar cantidad',
  availability: 'Solo disponibilidad',
};

/** Cómo se nombra el modo cuando se está describiendo algo ya configurado. */
const MODE_SHORT_LABELS: Readonly<Record<InventoryMode, string>> = {
  tracked: 'Cantidad',
  availability: 'Solo disponibilidad',
};

/** Qué significa elegir cada uno. Es lo que decide la elección, no el nombre. */
const MODE_HINTS: Readonly<Record<InventoryMode, string>> = {
  tracked:
    'Escribes cuántas unidades hay. El sistema mostrará el producto sin existencias cuando llegue a cero.',
  availability:
    'Úsalo cuando no necesites llevar un conteo exacto. El estado se cambia manualmente.',
};

export function describeInventoryMode(mode: string): string {
  return Object.hasOwn(MODE_LABELS, mode) ? MODE_LABELS[mode as InventoryMode] : mode;
}

export function shortInventoryMode(mode: string): string {
  return Object.hasOwn(MODE_SHORT_LABELS, mode) ? MODE_SHORT_LABELS[mode as InventoryMode] : mode;
}

export function inventoryModeHint(mode: InventoryMode): string {
  return MODE_HINTS[mode];
}

/** Los dos modos, en el orden en que se ofrecen. `tracked` primero: es el caso común. */
export const INVENTORY_MODES: readonly InventoryMode[] = ['tracked', 'availability'];

const AVAILABILITY_LABELS: Readonly<Record<InventoryAvailability, string>> = {
  in_stock: 'Con existencias',
  out_of_stock: 'Sin existencias',
};

export function describeAvailability(value: string): string {
  return Object.hasOwn(AVAILABILITY_LABELS, value)
    ? AVAILABILITY_LABELS[value as InventoryAvailability]
    : value;
}

export const AVAILABILITY_OPTIONS: readonly InventoryAvailability[] = ['in_stock', 'out_of_stock'];

/**
 * Cómo se lee un inventario concreto, ya resuelto.
 *
 * `tone` existe para el color, y nunca es lo único: cada lectura lleva su `label` escrito. Un
 * «Stock bajo» distinguido solo por un ámbar más pálido que el verde no lo distingue nadie.
 */
export type InventoryTone = 'inStock' | 'lowStock' | 'outOfStock';

export type InventoryReading = {
  readonly tone: InventoryTone;
  /** El estado en palabras: «Disponible», «Stock bajo» o «Sin existencias». */
  readonly label: string;
  /**
   * La cantidad dicha en palabras, o `null` en modo disponibilidad.
   *
   * `null` es lo correcto ahí y no un hueco por rellenar: no hay cantidad que decir, y escribir
   * «0 unidades» afirmaría algo que el contrato se cuida de no afirmar.
   */
  readonly quantityLabel: string | null;
};

/**
 * ¿Está por debajo del umbral?
 *
 * Solo tiene sentido en `tracked`, y solo con cantidad **positiva**: cero no es «stock bajo», es
 * «sin existencias», y son dos avisos distintos. Con el umbral en cero nunca hay aviso, que es lo
 * que significa un umbral de cero: no avisar.
 */
export function isLowStock(inventory: InventoryControl): boolean {
  if (inventory.mode !== 'tracked') return false;
  if (inventory.quantity === null || inventory.quantity <= 0) return false;
  if (inventory.lowStockThreshold === null) return false;
  return inventory.quantity <= inventory.lowStockThreshold;
}

/** La lectura completa de un inventario, lista para pintar. */
export function readInventory(inventory: InventoryControl): InventoryReading {
  if (inventory.availability === 'out_of_stock') {
    return {
      tone: 'outOfStock',
      label: 'Sin existencias',
      quantityLabel: inventory.mode === 'tracked' ? unitsLabel(inventory.quantity ?? 0) : null,
    };
  }

  const low = isLowStock(inventory);

  return {
    tone: low ? 'lowStock' : 'inStock',
    label: low ? 'Stock bajo' : 'Disponible',
    quantityLabel: inventory.mode === 'tracked' ? unitsLabel(inventory.quantity ?? 0) : null,
  };
}

export function unitsLabel(quantity: number): string {
  return `${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`;
}

/**
 * El borrador del formulario: lo que la persona está escribiendo.
 *
 * Los dos modos guardan **su propio estado a la vez**, y es deliberado: cambiar de modo y volver no
 * puede perder lo que ya se había escrito. Lo que nunca ocurre es que los dos viajen al backend —de
 * eso se encarga `inventoryBody`, que solo mira el modo elegido—.
 *
 * `quantity` y `lowStockThreshold` son cadenas porque son campos de texto: guardar un número aquí
 * obligaría a decidir qué es un campo vacío antes de que la persona termine de escribir, y la
 * respuesta sensata —«todavía nada»— no cabe en un `number`.
 */
export type InventoryDraft = {
  readonly mode: InventoryMode;
  readonly quantity: string;
  readonly lowStockThreshold: string;
  readonly status: InventoryAvailability;
};

/** Borrador de partida para un producto nuevo: cantidad controlada, sin unidades todavía. */
export const EMPTY_INVENTORY_DRAFT: InventoryDraft = {
  mode: 'tracked',
  quantity: '',
  lowStockThreshold: '0',
  status: 'in_stock',
};

/**
 * Borrador a partir de lo que ya hay guardado.
 *
 * En `availability` los campos de cantidad quedan vacíos, no en cero: el cero es una cantidad y
 * ahí no hay ninguna. Si alguien cambia a `tracked`, el contrato exige escribir una explícita, y
 * un cero precargado se la habría puesto por él.
 */
export function draftFromInventory(inventory: InventoryControl): InventoryDraft {
  return {
    mode: inventory.mode,
    quantity: inventory.quantity === null ? '' : String(inventory.quantity),
    lowStockThreshold:
      inventory.lowStockThreshold === null ? '0' : String(inventory.lowStockThreshold),
    status: inventory.manualAvailability ?? inventory.availability,
  };
}

/** Tope que publica el contrato para la cantidad. */
export const INVENTORY_QUANTITY_MAX = 1_000_000;

export type InventoryProblem =
  'quantity_required' | 'quantity_invalid' | 'quantity_too_large' | 'threshold_invalid';

const PROBLEM_MESSAGES: Readonly<Record<InventoryProblem, string>> = {
  quantity_required: 'Escribe cuántas unidades hay. Si no quedan, escribe 0.',
  quantity_invalid: 'La cantidad tiene que ser un número entero de cero o más.',
  quantity_too_large: `La cantidad no puede superar ${INVENTORY_QUANTITY_MAX.toLocaleString('es-CO')}.`,
  threshold_invalid: 'El umbral tiene que ser un número entero de cero o más.',
};

export function describeInventoryProblem(problem: InventoryProblem): string {
  return PROBLEM_MESSAGES[problem];
}

/** Entero no negativo, o `null` si lo escrito no lo es. Una cadena vacía **no** es cero. */
function wholeNumber(raw: string): number | null {
  const text = raw.trim();
  if (text.length === 0 || !/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Qué le falta o le sobra a este borrador.
 *
 * Solo se mira lo del **modo elegido**. Una cantidad ilegible escrita y luego abandonada al cambiar
 * a `availability` no bloquea nada: ese campo ya no viaja.
 */
export function inventoryProblems(draft: InventoryDraft): readonly InventoryProblem[] {
  if (draft.mode === 'availability') return [];

  const problems: InventoryProblem[] = [];
  const quantity = wholeNumber(draft.quantity);

  if (draft.quantity.trim().length === 0) {
    problems.push('quantity_required');
  } else if (quantity === null) {
    problems.push('quantity_invalid');
  } else if (quantity > INVENTORY_QUANTITY_MAX) {
    problems.push('quantity_too_large');
  }

  // El umbral vacío es válido y significa cero: no avisar. Lo que no vale es un texto que no sea
  // un entero.
  if (draft.lowStockThreshold.trim().length > 0 && wholeNumber(draft.lowStockThreshold) === null) {
    problems.push('threshold_invalid');
  }

  return problems;
}

/**
 * El cuerpo que viaja al backend, construido **campo a campo desde el modo**.
 *
 * Es lo que hace imposible mezclar: con `tracked` se escriben `quantity` y `lowStockThreshold` y
 * nada más; con `availability`, `status` y nada más. No se copia el borrador ni se borran campos
 * después, porque «borrar después» es justo donde se olvida uno.
 *
 * Devuelve `null` si el borrador no es válido: quien llama no debe poder mandar un cuerpo a medias.
 */
export function inventoryBody(draft: InventoryDraft): SetInventoryControl | null {
  if (inventoryProblems(draft).length > 0) return null;

  if (draft.mode === 'availability') {
    return { mode: 'availability', status: draft.status };
  }

  const quantity = wholeNumber(draft.quantity);
  if (quantity === null) return null;

  return {
    mode: 'tracked',
    quantity,
    lowStockThreshold: wholeNumber(draft.lowStockThreshold) ?? 0,
  };
}

/**
 * ¿Cambiaría algo este borrador respecto de lo guardado?
 *
 * Existe para **no llamar** cuando no hay nada que cambiar. Una petición que no cambia nada gasta
 * una versión del producto, deja una entrada en la auditoría y hace creer que se hizo algo.
 *
 * Cambiar de modo siempre cuenta como cambio, aunque la disponibilidad efectiva coincida: pasar de
 * «tengo 4» a «está disponible» cambia qué significa el inventario, no solo su valor.
 */
export function inventoryChanged(current: InventoryControl, draft: InventoryDraft): boolean {
  if (current.mode !== draft.mode) return true;

  if (draft.mode === 'availability') {
    return (current.manualAvailability ?? current.availability) !== draft.status;
  }

  const body = inventoryBody(draft);
  if (body === null || body.mode !== 'tracked') return false;

  return (
    current.quantity !== body.quantity ||
    (current.lowStockThreshold ?? 0) !== (body.lowStockThreshold ?? 0)
  );
}

/** ¿Este cambio necesita confirmación? Solo cambiar de modo, que cambia cómo se interpreta todo. */
export function changesInventoryMode(current: InventoryControl, draft: InventoryDraft): boolean {
  return current.mode !== draft.mode;
}

/**
 * Qué advertir al cambiar de modo.
 *
 * Las dos direcciones pierden o exigen algo distinto, y decirlo en genérico no ayudaría a decidir.
 */
export function modeChangeWarning(to: InventoryMode): string {
  return to === 'availability'
    ? 'Dejarás de llevar un conteo: la cantidad actual deja de ser el inventario vigente y no se publicará. La disponibilidad pasará a cambiarse a mano.'
    : 'Empezarás a llevar un conteo: hay que escribir cuántas unidades existen ahora, y la disponibilidad pasará a derivarse de esa cantidad.';
}

/**
 * Qué hacer cuando alguien pulsa «Guardar inventario».
 *
 * Vive aquí, en el módulo puro, y no dentro del componente, porque son tres decisiones con
 * consecuencias —no enviar, pedir confirmación o enviar— y comprobarlas no debería exigir montar
 * un formulario. El componente se queda con lo que sí es suyo: el estado y el marcado.
 */
export type InventorySubmitPlan =
  | { readonly kind: 'blocked' }
  | { readonly kind: 'confirm'; readonly to: InventoryMode }
  | { readonly kind: 'send'; readonly body: SetInventoryControl };

export function planInventorySubmit(
  current: InventoryControl,
  draft: InventoryDraft,
  confirmed: boolean,
): InventorySubmitPlan {
  const body = inventoryBody(draft);

  // Un borrador inválido o que no cambia nada no llama: gastaría una versión del producto y
  // dejaría en la auditoría rastro de haber hecho algo que no se hizo.
  if (body === null || !inventoryChanged(current, draft)) {
    return { kind: 'blocked' };
  }

  if (changesInventoryMode(current, draft) && !confirmed) {
    return { kind: 'confirm', to: draft.mode };
  }

  return { kind: 'send', body };
}

/**
 * Qué hacer con el formulario cuando llega la respuesta.
 *
 * Se cierra **solo** con una confirmación del backend. La regla vive aquí, escrita una vez, porque
 * cerrarlo antes de tiempo es lo que tiraba el borrador tras un error y obligaba a reescribirlo
 * —y reescribirlo con otra cantidad era lo que colaba un cuerpo distinto con la clave anterior—.
 */
export function afterInventorySubmit(result: { readonly applied: boolean }): 'close' | 'keep-open' {
  return result.applied ? 'close' : 'keep-open';
}
