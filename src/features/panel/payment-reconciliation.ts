/**
 * Conciliación manual del pago (ADR 0014 del panel, ADR 0029 del backend).
 *
 * Módulo **puro**: forma del cuerpo, qué ofrece el formulario, las comprobaciones previas y el
 * resumen. Separa siempre dos cosas que el panel nunca mezcla:
 *
 * 1. el **intento de pago original** —lo que reportó Wompi—, que solo se lee;
 * 2. la **conciliación manual** —lo que el equipo constató por otro canal—, que se edita con permiso.
 *
 * La autoridad es el backend: este módulo explica antes de llamar, pero no decide nada.
 */

import type {
  AdminOrder,
  AdminOrderListItem,
  AdminPaymentAttempt,
  EditOrderRequest,
  EditOrderResult,
} from '@/lib/api/orders';

import { presentAttempt } from './payment-attempts';
import { describePaymentStatus } from './payment-status';

type ReconciliationInput = NonNullable<EditOrderRequest['paymentReconciliation']>;
export type ReconciliationStatus = ReconciliationInput['status'];
export type ReconciliationMethod = ReconciliationInput['finalMethod'];
export type AdminReconciliation = NonNullable<AdminOrder['paymentReconciliation']>;
type ReconciliationEditing = AdminOrder['paymentEditing']['reconciliation'];

/** Límites del contrato. `payment-reconciliation.test.ts` los contrasta con el contrato. */
export const RECONCILIATION_NOTE_MAX = 1000;
export const RECONCILIATION_NOTE_INPUT_MAX = 2000;
export const RECONCILIATION_EXTERNAL_ID_MAX = 120;

export const RECONCILIATION_STATUSES: readonly ReconciliationStatus[] = [
  'pending',
  'unpaid',
  'failed',
  'paid',
];

export const RECONCILIATION_METHODS: readonly ReconciliationMethod[] = [
  'wompi',
  'addi',
  'bank_transfer',
  'cash',
];

/** Lo que se elige en el formulario. «Revisión requerida» no se elige: la deriva el backend. */
export const RECONCILIATION_STATUS_LABELS: Readonly<Record<ReconciliationStatus, string>> = {
  pending: 'Pendiente de gestión',
  unpaid: 'No pagado',
  failed: 'Error / Fallido',
  paid: 'Pagado',
};

/** El medio final, tal como se dice en la conciliación. Addi aquí es Addi Marketplace. */
export const RECONCILIATION_METHOD_LABELS: Readonly<Record<ReconciliationMethod, string>> = {
  wompi: 'Wompi (confirmado manualmente)',
  addi: 'Addi Marketplace',
  bank_transfer: 'Transferencia bancaria',
  cash: 'Efectivo',
};

/** El aviso que acompaña siempre a una conciliación sobre un intento de Wompi. */
export const PROVIDER_RECORD_NOTICE = 'Este cambio no modifica la transacción en Wompi.';

/** Nombre del medio final para la persona: Addi aquí es siempre Addi Marketplace. */
export function finalMethodName(code: string, label: string): string {
  return code === 'addi' ? 'Addi Marketplace' : label;
}

/** Por qué no se puede conciliar ahora, en una frase, o `null` si se puede. */
export function reconciliationLockReason(editing: ReconciliationEditing): string | null {
  switch (editing.locked) {
    case null:
      return null;
    case 'payment_confirmed_by_provider':
      return 'Wompi confirmó este pago. No se concilia a mano: deshacerlo exige el flujo de devolución o revisión.';
    case 'reconciliation_payment_settled':
      return 'Este pago ya se confirmó manualmente. Corregirlo exige una revisión; no se revierte desde aquí.';
    case 'reconciliation_order_closed':
      return 'Este pedido está cancelado o ya no espera el pago: no se puede conciliar.';
    default:
      return 'El estado del pago no permite conciliarlo ahora.';
  }
}

/** Lo que el formulario de conciliación tiene ahora mismo. */
export type ReconciliationDraft = {
  readonly status: ReconciliationStatus;
  readonly finalMethod: ReconciliationMethod;
  readonly externalPaymentId: string;
  readonly note: string;
};

/** Borrador inicial: la conciliación vigente si la hay; si no, «Pagado» con el medio actual. */
export function reconciliationDraftOf(order: AdminOrder): ReconciliationDraft {
  const current = order.paymentReconciliation?.current;

  return {
    status: current?.status ?? 'paid',
    finalMethod: current?.finalMethod ?? order.paymentEditing.method,
    externalPaymentId: current?.externalPaymentId ?? '',
    note: '',
  };
}

/** ¿Hace falta la referencia externa para este estado? Lo dice el backend, no se deduce aquí. */
export function externalIdRequired(
  editing: ReconciliationEditing,
  status: ReconciliationStatus,
): boolean {
  return editing.externalPaymentIdRequiredFor.includes(status);
}

/**
 * ¿Hace falta la nota? La pide el backend cuando interviene Wompi —medio actual o un checkout
 * abierto alguna vez— y también si el medio **final** elegido es Wompi.
 */
export function noteRequired(editing: ReconciliationEditing, draft: ReconciliationDraft): boolean {
  return editing.noteRequired || draft.finalMethod === 'wompi';
}

/**
 * Lo que el formulario detecta antes de llamar al backend, o `null`. El backend comprueba lo mismo
 * y responde `order_reconciliation_invalid` con su motivo; aquí se explica antes.
 */
export function reconciliationProblem(
  editing: ReconciliationEditing,
  draft: ReconciliationDraft,
): string | null {
  const note = draft.note.trim();
  const externalId = draft.externalPaymentId.trim();

  if (!editing.statuses.includes(draft.status)) {
    return 'Ese estado no está disponible para este pedido. Recarga el pedido para ver las opciones vigentes.';
  }
  if (externalIdRequired(editing, draft.status) && externalId === '') {
    return 'Escribe la referencia del pago: la de Addi Marketplace, la del banco o el número del recibo.';
  }
  if (externalId.length > RECONCILIATION_EXTERNAL_ID_MAX) {
    return `La referencia admite como máximo ${RECONCILIATION_EXTERNAL_ID_MAX} caracteres.`;
  }
  if (noteRequired(editing, draft) && note === '') {
    return 'Escribe una nota que explique la conciliación: es obligatoria cuando interviene Wompi.';
  }
  if (note.length > RECONCILIATION_NOTE_MAX) {
    return `La nota admite como máximo ${RECONCILIATION_NOTE_MAX} caracteres.`;
  }
  return null;
}

/** Cuerpo de la vista previa: la conciliación **sola**, con la versión que se leyó. */
export function reconciliationRequestOf(
  order: AdminOrder,
  draft: ReconciliationDraft,
): EditOrderRequest {
  const externalId = draft.externalPaymentId.trim();
  const note = draft.note.trim();

  return {
    expectedVersion: order.version,
    paymentReconciliation: {
      status: draft.status,
      finalMethod: draft.finalMethod,
      externalPaymentId: externalId === '' ? null : externalId,
      note: note === '' ? null : note,
    },
  };
}

/** El mismo cuerpo, con la confirmación explícita que exige guardar. */
export function confirmedReconciliation(request: EditOrderRequest): EditOrderRequest {
  const reconciliation = request.paymentReconciliation;

  return reconciliation === undefined
    ? request
    : { ...request, paymentReconciliation: { ...reconciliation, confirmed: true } };
}

const RECONCILIATION_KEYS = new Set([
  'status',
  'finalMethod',
  'externalPaymentId',
  'note',
  'confirmed',
]);

/**
 * Forma de la conciliación dentro del cuerpo que recibe el BFF. `undefined` si no es válida.
 * Cerrada como en el backend: cualquier otra clave —una transacción, un importe, un dato del
 * proveedor— rechaza el cuerpo entero.
 */
export function parseReconciliation(raw: unknown): ReconciliationInput | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const body = raw as Record<string, unknown>;

  if (Object.keys(body).some((key) => !RECONCILIATION_KEYS.has(key))) return undefined;
  if (!(RECONCILIATION_STATUSES as readonly unknown[]).includes(body.status)) return undefined;
  if (!(RECONCILIATION_METHODS as readonly unknown[]).includes(body.finalMethod)) return undefined;

  const text = (value: unknown, max: number): string | null | undefined | false => {
    if (value === undefined || value === null) return value;
    return typeof value === 'string' && value.length <= max ? value : false;
  };
  const externalPaymentId = text(body.externalPaymentId, RECONCILIATION_EXTERNAL_ID_MAX * 2);
  const note = text(body.note, RECONCILIATION_NOTE_INPUT_MAX);

  if (externalPaymentId === false || note === false) return undefined;
  if (body.confirmed !== undefined && typeof body.confirmed !== 'boolean') return undefined;

  return {
    status: body.status as ReconciliationStatus,
    finalMethod: body.finalMethod as ReconciliationMethod,
    ...(externalPaymentId === undefined ? {} : { externalPaymentId }),
    ...(note === undefined ? {} : { note }),
    ...(body.confirmed === undefined ? {} : { confirmed: body.confirmed }),
  };
}

/** Una fila del resumen que se enseña antes de confirmar. */
export type ReconciliationRow = {
  readonly label: string;
  readonly before: string;
  readonly after: string;
};

function statusText(reconciliation: AdminOrder['paymentReconciliation']): string {
  return reconciliation === null ? 'Sin conciliación' : reconciliation.statusLabel;
}

/**
 * Resumen de la conciliación a partir del pedido actual y del que devolvió la **vista previa**.
 * Todo sale del backend: estado de la conciliación, pago, medio final y estado del pedido.
 */
export function reconciliationSummary(
  before: AdminOrder,
  result: Pick<EditOrderResult, 'order' | 'payment'>,
): ReconciliationRow[] {
  const after = result.order;
  const entry = after.paymentReconciliation?.current;
  const rows: ReconciliationRow[] = [
    {
      label: 'Conciliación',
      before: statusText(before.paymentReconciliation),
      after: statusText(after.paymentReconciliation),
    },
    {
      label: 'Medio final',
      before:
        before.paymentReconciliation === null
          ? finalMethodName(before.paymentEditing.method, before.paymentEditing.methodLabel)
          : finalMethodName(
              before.paymentReconciliation.current.finalMethod,
              before.paymentReconciliation.current.finalMethodLabel,
            ),
      after:
        entry === undefined
          ? finalMethodName(after.paymentEditing.method, after.paymentEditing.methodLabel)
          : finalMethodName(entry.finalMethod, entry.finalMethodLabel),
    },
    {
      label: 'Estado del pago',
      before: describePaymentStatus(result.payment.statusBefore),
      after: describePaymentStatus(result.payment.statusAfter),
    },
  ];

  if (after.statusLabel !== before.statusLabel) {
    rows.push({ label: 'Estado del pedido', before: before.statusLabel, after: after.statusLabel });
  }
  rows.push({
    label: 'Referencia',
    before: before.paymentReconciliation?.current.externalPaymentId ?? '—',
    after: entry?.externalPaymentId ?? '—',
  });
  return rows;
}

/**
 * El intento de pago original, en una línea: «Wompi: Pago rechazado». Solo lectura. `null` si el
 * pedido nunca abrió un checkout.
 */
export function originalAttemptLine(
  attempts: readonly AdminPaymentAttempt[],
  now: number | null,
): { readonly title: string; readonly text: string | null } | null {
  const latest = attempts[0];

  if (latest === undefined) return null;
  const presented = presentAttempt(latest, now);

  return { title: `${latest.provider.label}: ${presented.title}`, text: presented.text };
}

/**
 * El pago final según la conciliación: «Pago final: Addi Marketplace» y «Pagado · Conciliado
 * manualmente». «Confirmado manualmente» con Wompi se dice así y nunca como una confirmación de
 * Wompi.
 */
export function finalPaymentLine(reconciliation: AdminReconciliation): {
  readonly title: string;
  readonly text: string;
} {
  const entry = reconciliation.current;
  const method = finalMethodName(entry.finalMethod, entry.finalMethodLabel);
  const how =
    entry.kind === 'manual_confirmation'
      ? 'Confirmado manualmente, no por Wompi'
      : 'Conciliado manualmente';

  return {
    title: `Pago final: ${method}`,
    text: `${entry.statusLabel} · ${how}`,
  };
}

/** Texto de una fila del listado, o `null` si el pedido nunca se concilió. */
export function reconciliationRowText(
  summary: AdminOrderListItem['paymentReconciliation'],
): { readonly visible: string; readonly review: boolean } | null {
  // Ausente con un backend anterior a ADR 0029 (por ejemplo, tras un rollback): no se pinta nada.
  if (summary === null || summary === undefined) return null;
  const method = finalMethodName(summary.finalMethod, summary.finalMethodLabel);

  return summary.reviewRequired
    ? { visible: `Revisión requerida · ${method}`, review: true }
    : { visible: `Pago final: ${method} · ${summary.statusLabel}`, review: false };
}

/** Texto de cada motivo de una conciliación inválida que publica el backend. */
export const RECONCILIATION_INVALID_MESSAGES: Readonly<Record<string, string>> = {
  status_invalid: 'Ese estado de conciliación no existe.',
  method_invalid: 'Ese medio de pago no existe.',
  note_invalid: 'La nota tiene caracteres que no se admiten.',
  note_too_long: `La nota admite como máximo ${RECONCILIATION_NOTE_MAX} caracteres.`,
  note_required:
    'Escribe una nota que explique la conciliación: es obligatoria cuando interviene Wompi.',
  external_payment_id_invalid: 'La referencia tiene caracteres que no se admiten.',
  external_payment_id_too_long: `La referencia admite como máximo ${RECONCILIATION_EXTERNAL_ID_MAX} caracteres.`,
  external_payment_id_required:
    'Escribe la referencia del pago: la de Addi Marketplace, la del banco o el número del recibo.',
  confirmation_required: 'Confirma la conciliación antes de guardarla.',
};
