/**
 * Addi Online en el panel (ADR 0030 del backend). Módulo puro.
 *
 * Todo sale del contrato: el canal, el resultado de cada intento con su texto y su tono, la línea
 * de tiempo, las cancelaciones registradas y si se puede registrar otra. Aquí no se deduce ningún
 * estado de Addi: solo se decide qué se enseña y cómo se valida lo que escribe el equipo.
 *
 * Tres lecturas que el panel nunca mezcla: el estado del **pedido**, el estado local del **pago** y
 * lo que **informó Addi**. Un pedido puede seguir «Pendiente de pago» con un intento «Abandonado
 * por el cliente» y no hay contradicción: el cliente puede volver a intentarlo.
 */

import { formatDateTime } from './format';

import type { components } from '@/lib/api/generated/schema';

export type AdminPaymentChannel = components['schemas']['AdminPaymentChannelDto'];
export type AdminAddiOutcome = components['schemas']['AdminAddiOutcomeDto'];
export type AdminAddiListSummary = components['schemas']['AdminAddiListSummaryDto'];
export type AdminAddiPayment = components['schemas']['AdminAddiPaymentDto'];
export type AdminAddiAttempt = components['schemas']['AdminAddiAttemptDto'];
export type AdminAddiCancellation = components['schemas']['AdminAddiCancellationDto'];
export type AddiCancellationInput = components['schemas']['EditOrderAddiCancellationInputDto'];

export type AddiTone = AdminAddiOutcome['tone'];

/** Lo que el panel escribe junto al estado informado por Addi, para que se lea sin el código. */
const PROVIDER_STATUS_TEXT: Readonly<Record<string, string>> = {
  APPROVED: 'APPROVED · aprobado',
  PENDING: 'PENDING · pendiente',
  ABANDONED: 'ABANDONED · el cliente salió del proceso',
  DECLINED: 'DECLINED · crédito no aprobado',
  REJECTED: 'REJECTED · solicitud rechazada',
  INTERNAL_ERROR: 'INTERNAL_ERROR · error en Addi',
  CLIENT_HAS_CREDIT: 'Cliente con crédito vigente (código propio)',
  APPLICATION_REJECTED: 'Addi no abrió la solicitud (código propio)',
  AUTH_REJECTED: 'Credenciales rechazadas al abrirla (código propio)',
};

/** El estado tal como lo informó Addi, o «Sin respuesta de Addi». */
export function providerStatusText(status: string | null): string {
  if (status === null) return 'Sin respuesta de Addi';
  return PROVIDER_STATUS_TEXT[status] ?? status;
}

/** Texto del estado local del intento (`created`, `expired`…), que no es el de Addi. */
const LOCAL_STATUS_TEXT: Readonly<Record<string, string>> = {
  created: 'Abierto',
  processing: 'En curso',
  approved: 'Aprobado',
  declined: 'Rechazado',
  voided: 'Anulado',
  expired: 'Vencido',
  error: 'Error',
};

export function localAttemptStatusText(status: string): string {
  return LOCAL_STATUS_TEXT[status] ?? status;
}

/** «$1.360.000 COP». El importe del intento, que es el del pedido guardado. */
export function amountWithCurrency(amountCop: number, currency: string): string {
  return `$${amountCop.toLocaleString('es-CO')} ${currency}`;
}

export interface AttemptFact {
  readonly label: string;
  readonly value: string;
}

/** Las filas de un intento, en orden de lectura. Ninguna lleva un dato de quien compra. */
export function addiAttemptFacts(attempt: AdminAddiAttempt): readonly AttemptFact[] {
  const facts: AttemptFact[] = [
    { label: 'Estado reportado por Addi', value: providerStatusText(attempt.providerStatus) },
    { label: 'Estado local del intento', value: localAttemptStatusText(attempt.localStatus) },
    { label: 'Referencia interna', value: attempt.reference },
    {
      label: 'Solicitud en Addi',
      value: attempt.externalIdMasked ?? 'Addi aún no informó un identificador',
    },
    { label: 'Importe', value: amountWithCurrency(attempt.amountCop, attempt.currency) },
    { label: 'Abierto', value: formatDateTime(attempt.createdAt) },
    { label: 'Última actualización', value: formatDateTime(attempt.updatedAt) },
    {
      label: 'Enlace de Addi',
      value: attempt.linkDelivered ? 'Entregado al cliente' : 'No entregado',
    },
  ];

  if (attempt.completedAt !== null) {
    facts.push({ label: 'Cerrado', value: formatDateTime(attempt.completedAt) });
  } else {
    facts.push({ label: 'Vence', value: formatDateTime(attempt.expiresAt) });
  }

  if (attempt.lastError !== null) {
    const origin = attempt.lastError.origin === null ? '' : ` (${attempt.lastError.origin})`;

    facts.push({
      label: 'Último error',
      value: `${attempt.lastError.label}${origin} · ${formatDateTime(attempt.lastError.at)}`,
    });
  }

  return facts;
}

/** Por qué no se ofrece registrar una cancelación, para decirlo en lugar de esconder el botón. */
export function cancellationLockText(lock: string | null): string | null {
  switch (lock) {
    case null:
      return null;
    case 'addi_cancellation_recorded':
      return 'La cancelación de este crédito ya está registrada.';
    case 'addi_payment_not_approved':
      return 'Solo se registra la cancelación de un crédito que Addi aprobó por su callback.';
    default:
      return 'Ahora no se puede registrar una cancelación.';
  }
}

export const ADDI_CANCELLATION_NOTE_MAX = 1000;
export const ADDI_CANCELLATION_REFERENCE_MAX = 120;

/** Texto de cada motivo de una cancelación mal formada que publica el backend. */
export const ADDI_CANCELLATION_INVALID_MESSAGES: Readonly<Record<string, string>> = {
  confirmed_on_required: 'Indica el día en que Addi confirmó la cancelación.',
  confirmed_on_invalid:
    'El día de la confirmación no puede ser futuro ni anterior a la aprobación de Addi.',
  cancellation_reference_invalid: 'La referencia tiene caracteres que no se admiten.',
  cancellation_reference_too_long: `La referencia admite como máximo ${ADDI_CANCELLATION_REFERENCE_MAX} caracteres.`,
};

/** Texto de cada bloqueo de la cancelación que publica el backend. */
export const ADDI_CANCELLATION_BLOCK_MESSAGES: Readonly<Record<string, string>> = {
  addi_payment_not_approved:
    'Este pedido no tiene un crédito aprobado por Addi: no hay nada que cancelar.',
  addi_cancellation_recorded: 'La cancelación de este crédito ya está registrada.',
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Forma de la cancelación antes de llegar al backend. Cerrada: día, referencia, nota y
 * confirmación. El backend decide si el pedido la admite y valida el día contra la aprobación.
 */
export function parseAddiCancellation(raw: unknown): AddiCancellationInput | undefined {
  const body = record(raw);

  if (
    body === null ||
    Object.keys(body).some(
      (key) => !['confirmedOn', 'externalReference', 'note', 'confirmed'].includes(key),
    )
  ) {
    return undefined;
  }
  const { confirmedOn, externalReference, note, confirmed } = body;

  if (typeof confirmedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(confirmedOn)) {
    return undefined;
  }
  if (typeof note !== 'string' || note.length > ADDI_CANCELLATION_NOTE_MAX * 2) return undefined;
  if (
    externalReference !== undefined &&
    externalReference !== null &&
    (typeof externalReference !== 'string' ||
      externalReference.length > ADDI_CANCELLATION_REFERENCE_MAX * 2)
  ) {
    return undefined;
  }
  if (confirmed !== undefined && typeof confirmed !== 'boolean') return undefined;

  return {
    confirmedOn,
    note,
    ...(externalReference === undefined ? {} : { externalReference }),
    ...(confirmed === undefined ? {} : { confirmed }),
  };
}

/** El cuerpo de la edición para la cancelación, solo, con la versión que se estaba mirando. */
export function addiCancellationBody(
  version: number,
  draft: { confirmedOn: string; externalReference: string; note: string },
  confirmed: boolean,
): { expectedVersion: number; addiCancellation: AddiCancellationInput } {
  const reference = draft.externalReference.trim();

  return {
    expectedVersion: version,
    addiCancellation: {
      confirmedOn: draft.confirmedOn,
      externalReference: reference.length === 0 ? null : reference,
      note: draft.note,
      ...(confirmed ? { confirmed: true } : {}),
    },
  };
}

/** Texto de la cancelación registrada, en una línea. */
export function cancellationSummary(entry: AdminAddiCancellation): string {
  const reference = entry.externalReference === null ? '' : ` · Ref. ${entry.externalReference}`;

  return `${entry.statusLabel} el ${entry.confirmedOn}${reference} · ${entry.sourceLabel}`;
}
