/**
 * «Cancelar como pedido duplicado» (backend: `duplicateCancellation` en la edición). Módulo puro.
 *
 * Cancela el pedido interno que repite a otro —el canónico— **sin ningún correo**: ni al cliente
 * ni al equipo. No toca intentos, callbacks, referencias ni solicitudes del proveedor. Solo se
 * ofrece con `orders.cancel` y `payments.manage_manual`, cuando el backend dice que el pedido no se
 * pagó ni se está pagando, y siempre con vista previa antes de guardar. «Cancelar pedido» sigue
 * igual y sigue enviando su correo.
 */

import type { components } from '@/lib/api/generated/schema';

export type DuplicateCancellationInput =
  components['schemas']['EditOrderDuplicateCancellationInputDto'];
export type AdminDuplicateCancellation = components['schemas']['AdminDuplicateCancellationDto'];
export type AdminDuplicateCancellationEditing =
  components['schemas']['AdminDuplicateCancellationEditingDto'];

export const DUPLICATE_CANCELLATION_REASON = 'duplicate_order';
export const DUPLICATE_CANCELLATION_NOTE_MAX = 1000;
const PUBLIC_ID = /^MZ-[0-9A-Z]{8}$/;

/** El motivo que se propone: «Pedido duplicado de MZ-…». Editable. */
export function duplicateNoteFor(canonicalPublicId: string): string {
  return `Pedido duplicado de ${canonicalPublicId.trim().toUpperCase()}`;
}

export function isPublicOrderId(value: string): boolean {
  return PUBLIC_ID.test(value.trim().toUpperCase());
}

/** Por qué no se ofrece la acción, para decirlo en lugar de esconderla. */
export function duplicateLockText(lock: string | null): string | null {
  switch (lock) {
    case null:
      return null;
    case 'duplicate_order_not_pending':
      return 'Solo se cancela como duplicado un pedido pendiente de pago.';
    case 'duplicate_order_payment_settled':
      return 'El pago está aprobado, en curso o el proveedor informó un APPROVED: no se cancela como duplicado.';
    case 'duplicate_order_attempt_active':
      return 'Hay un intento de pago abierto. Espera a que se cierre antes de cancelarlo como duplicado.';
    case 'duplicate_order_reconciled':
      return 'Este pedido tiene una conciliación manual: no se cancela como duplicado.';
    default:
      return 'Ahora no se puede cancelar como duplicado.';
  }
}

/** Textos de los bloqueos que publica el backend al guardar o previsualizar. */
export const DUPLICATE_BLOCK_MESSAGES: Readonly<Record<string, string>> = {
  duplicate_order_not_pending: 'Solo se cancela como duplicado un pedido pendiente de pago.',
  duplicate_order_payment_settled:
    'El pago de este pedido está aprobado o en curso, o el proveedor informó un APPROVED.',
  duplicate_order_attempt_active: 'Hay un intento de pago abierto para este pedido.',
  duplicate_order_reconciled: 'Este pedido tiene una conciliación manual registrada.',
  duplicate_order_canonical_invalid:
    'El pedido canónico no existe, es este mismo pedido o está cancelado.',
};

/** Textos de los datos mal formados. */
export const DUPLICATE_INVALID_MESSAGES: Readonly<Record<string, string>> = {
  cancellation_reason_invalid: 'El único motivo admitido aquí es «pedido duplicado».',
  canonical_order_required: 'Escribe el número del pedido canónico.',
  canonical_order_invalid: 'El número del pedido canónico tiene la forma MZ-XXXXXXXX.',
  note_required: 'La nota es obligatoria.',
  note_invalid: 'La nota tiene caracteres que no se admiten.',
  note_too_long: `La nota admite como máximo ${DUPLICATE_CANCELLATION_NOTE_MAX} caracteres.`,
  confirmation_required: 'Revisa la vista previa y confirma para guardar.',
};

/** El mensaje propio de esta acción para un fallo de la edición, o `null` si no es suyo. */
export function duplicateFailureText(code: string, reference: string | null): string | null {
  if (reference === null) return null;
  if (code === 'order_edit_blocked') return DUPLICATE_BLOCK_MESSAGES[reference] ?? null;
  if (code === 'order_reconciliation_invalid') return DUPLICATE_INVALID_MESSAGES[reference] ?? null;
  return null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Forma antes de llegar al backend: motivo exacto, canónico, nota y confirmación. Cerrada. */
export function parseDuplicateCancellation(raw: unknown): DuplicateCancellationInput | undefined {
  const body = record(raw);

  if (
    body === null ||
    Object.keys(body).some(
      (key) => !['reason', 'canonicalPublicId', 'note', 'confirmed'].includes(key),
    )
  ) {
    return undefined;
  }
  const { reason, canonicalPublicId, note, confirmed } = body;

  if (reason !== DUPLICATE_CANCELLATION_REASON) return undefined;
  if (typeof canonicalPublicId !== 'string' || canonicalPublicId.length > 40) return undefined;
  if (typeof note !== 'string' || note.length > DUPLICATE_CANCELLATION_NOTE_MAX * 2) {
    return undefined;
  }
  if (confirmed !== undefined && typeof confirmed !== 'boolean') return undefined;

  return {
    reason,
    canonicalPublicId,
    note,
    ...(confirmed === undefined ? {} : { confirmed }),
  };
}

/** El cuerpo de la edición, solo, con la versión que se estaba mirando. */
export function duplicateCancellationBody(
  version: number,
  draft: { canonicalPublicId: string; note: string },
  confirmed: boolean,
): { expectedVersion: number; duplicateCancellation: DuplicateCancellationInput } {
  return {
    expectedVersion: version,
    duplicateCancellation: {
      reason: DUPLICATE_CANCELLATION_REASON,
      canonicalPublicId: draft.canonicalPublicId.trim().toUpperCase(),
      note: draft.note,
      ...(confirmed ? { confirmed: true } : {}),
    },
  };
}

/** «Cancelado como duplicado de MZ-… · 12/10/2026 · master_admin». */
export function duplicateSummary(entry: AdminDuplicateCancellation, at: string): string {
  return `Cancelado como duplicado de ${entry.canonicalPublicId} · ${at} · ${entry.actorRole}`;
}
