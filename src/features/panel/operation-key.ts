/**
 * La clave de idempotencia de una operación, **atada a lo que esa operación dice**.
 *
 * Una clave identifica una petición concreta. Si el backend ya la aplicó y lo que falló fue la red
 * de vuelta, el reintento con la misma clave responde `replayed: true` en lugar de aplicarla otra
 * vez. Cambiarla en el reintento convertiría un fallo de red en un inventario escrito dos veces.
 *
 * Guardar solo la clave —lo que hacía la primera versión de este módulo— no basta, y el hueco era
 * real: tras un fallo se podía abrir otra vez el formulario, escribir otra cantidad o cambiar de
 * modo, y ese cuerpo **distinto** viajaba con la clave del intento anterior. Para el backend eran
 * la misma operación, así que la segunda podía descartarse en silencio y devolver el resultado de
 * la primera.
 *
 * La clave se guarda junto a la **huella** de la operación que representa. Reintentar exactamente
 * lo mismo la reutiliza; cambiar cualquier cosa —cantidad, umbral, modo, disponibilidad, versión o
 * destino— produce una huella distinta y, con ella, una clave nueva.
 *
 * Módulo puro: sin red, sin DOM, sin React. El contenedor es un `useRef`, que es lo que hace que
 * la clave sobreviva a los renders sin provocar ninguno.
 */

import type { SetInventoryControl } from '@/lib/api/catalog';

/** Una clave y la operación a la que pertenece. Nunca se separan. */
export type KeyedOperation = {
  readonly fingerprint: string;
  readonly key: string;
};

/**
 * El registro de claves vivas, una por **destino**.
 *
 * El destino es el producto base o una variante concreta. Se guarda una por destino y no una sola
 * global porque editar la variante B no puede hacer que el reintento de la A estrene clave: son
 * dos operaciones pendientes distintas y cada una conserva la suya.
 */
export type KeyLedger = Map<string, KeyedOperation>;

export function createKeyLedger(): KeyLedger {
  return new Map();
}

/** Escapa un fragmento para que ningún identificador pueda fabricar el separador. */
function part(value: string): string {
  return encodeURIComponent(value);
}

/**
 * La forma canónica del inventario que se va a escribir.
 *
 * Se construye **campo a campo desde el modo**, igual que el cuerpo que viaja. No se usa
 * `JSON.stringify` sobre el objeto: el orden de las claves de un objeto no es algo en lo que
 * apoyarse, y dos cuerpos idénticos serializados en distinto orden producirían huellas distintas
 * —o peor, dos cuerpos distintos podrían producir la misma si alguien añadiera un campo—.
 */
function canonicalInventory(inventory: SetInventoryControl): string {
  if (inventory.mode === 'availability') {
    return `availability|status=${part(inventory.status)}`;
  }

  // El umbral ausente significa cero, que es lo mismo que el backend guardará: se normaliza aquí
  // para que «4 sin umbral» y «4 con umbral 0» no sean dos operaciones distintas.
  return `tracked|quantity=${inventory.quantity}|threshold=${inventory.lowStockThreshold ?? 0}`;
}

export type InventoryTarget = {
  readonly productId: string;
  /** `null` en el inventario base. Dos variantes nunca comparten huella. */
  readonly variantId: string | null;
  readonly expectedVersion: number;
};

/**
 * La identidad de una escritura de inventario.
 *
 * Lleva el tipo de operación, el destino, la versión esperada y el cuerpo canónico. La versión
 * entra a propósito: tras recargar por un `409`, la nueva `expectedVersion` describe una operación
 * distinta —se parte de otro estado— y tiene que llevar su propia clave.
 */
export function inventoryFingerprint(
  target: InventoryTarget,
  inventory: SetInventoryControl,
): string {
  return [
    'inventory.set',
    part(target.productId),
    target.variantId === null ? '-' : part(target.variantId),
    `v=${target.expectedVersion}`,
    canonicalInventory(inventory),
  ].join('|');
}

/** El destino dentro del registro: el producto base o una variante. */
export function inventoryScope(target: InventoryTarget): string {
  return target.variantId ?? 'base';
}

/**
 * La clave de esta operación: la que ya había **si es la misma operación**, o una nueva.
 *
 * «La misma» significa misma huella. Un cuerpo distinto, una versión distinta o un destino distinto
 * estrenan clave, y la anterior se descarta: ya no representa nada que se vaya a reintentar.
 */
export function keyFor(
  ledger: KeyLedger,
  scope: string,
  fingerprint: string,
  newKey: () => string,
): string {
  const existing = ledger.get(scope);

  if (existing !== undefined && existing.fingerprint === fingerprint) {
    return existing.key;
  }

  const key = newKey();

  ledger.set(scope, { fingerprint, key });

  return key;
}

/**
 * La operación terminó: su clave deja de estar viva.
 *
 * Se llama **solo** en el camino de éxito. Liberarla al fallar es el error que rompe la garantía:
 * el reintento del mismo cuerpo pasaría a ser una operación nueva a ojos del backend.
 */
export function releaseKey(ledger: KeyLedger, scope: string): void {
  ledger.delete(scope);
}

/** Lo que hay guardado para ese destino. Existe para poder comprobarlo. */
export function currentOperation(ledger: KeyLedger, scope: string): KeyedOperation | null {
  return ledger.get(scope) ?? null;
}
