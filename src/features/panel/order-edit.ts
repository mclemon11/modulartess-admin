/**
 * Edición controlada de pedidos (ADR 0013 del panel, ADR 0028 del backend).
 *
 * Módulo **puro**: forma del cuerpo, límites publicados por el contrato, qué ofrece el formulario y
 * el resumen de cambios. No calcula precios ni totales autoritativos —eso lo hace el backend, y el
 * panel los enseña desde la vista previa— ni decide si un producto está disponible.
 */

import type { AdminProduct } from '@/lib/api/catalog';
import type {
  AdminOrder,
  EditOrderRequest,
  EditOrderResult,
  OrderShipmentInput,
} from '@/lib/api/orders';

import { describeNotificationEvent } from './notification-labels';
import {
  parseReconciliation,
  PROVIDER_RECORD_NOTICE,
  RECONCILIATION_INVALID_MESSAGES,
} from './payment-reconciliation';
import { parseShipmentInput } from './order-input';
import { describePaymentStatus } from './payment-status';

/** Límites del contrato. `order-edit.test.ts` los contrasta con `openapi/backend-v1.json`. */
export const ORDER_NOTES_MAX = 2000;
export const ORDER_NOTES_INPUT_MAX = 4000;
export const ORDER_EDIT_ITEMS_MAX = 50;
export const ORDER_LINE_QUANTITY_MAX = 100;
const ID_MAX = 120;

/** Las transiciones del panel, las mismas que publica `POST /status`. */
const NEXT_STATUS: Readonly<Record<string, readonly string[]>> = {
  pending_payment: [],
  paid: ['preparing'],
  preparing: ['ready_to_ship'],
  ready_to_ship: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/** Estados que el selector ofrece: el actual y los siguientes permitidos. */
export function editableStatuses(current: string): readonly string[] {
  return [current, ...(NEXT_STATUS[current] ?? [])];
}

/**
 * ¿Ofrece el formulario cambiar productos?
 *
 * Es **usabilidad**: el backend vuelve a decidirlo con el pago y la versión, y si alguna vez se
 * abrió un checkout —que el panel no ve— responde con su motivo. Aquí solo se ocultan los casos
 * evidentes desde la ficha: despachado, entregado, cancelado o pago en curso.
 */
export function itemsEditableFromDetail(order: Pick<AdminOrder, 'status' | 'payment'>): boolean {
  return (
    ['pending_payment', 'paid', 'preparing', 'ready_to_ship'].includes(order.status) &&
    order.payment.status !== 'processing'
  );
}

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function identifier(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(raw) && raw.length <= ID_MAX
    ? raw
    : null;
}

type PaymentEditing = AdminOrder['paymentEditing'];
export type OrderPaymentMethod = NonNullable<EditOrderRequest['paymentMethod']>;
export type ManualPaymentEvent = NonNullable<EditOrderRequest['paymentStatus']>;

/**
 * Los cuatro medios de pago del contrato, en el orden del selector, con su nombre visible.
 *
 * Exhaustivo sobre el enum generado: si el backend publica otro medio, esto deja de compilar.
 * `order-edit.test.ts` además lo contrasta con `openapi/backend-v1.json`.
 */
export const PAYMENT_METHOD_LABELS: Readonly<Record<OrderPaymentMethod, string>> = {
  bank_transfer: 'Transferencia bancaria',
  cash: 'Efectivo',
  addi: 'Addi',
  wompi: 'Wompi',
};
export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as OrderPaymentMethod[];

/** Desenlaces que una persona puede registrar en un pago manual. Eventos de la máquina de pago. */
export const MANUAL_PAYMENT_EVENTS: readonly ManualPaymentEvent[] = [
  'processing',
  'approved',
  'declined',
  'voided',
];

/**
 * Lo que la máquina de pago admite desde `pending`, que es el único estado en el que se puede
 * cambiar de medio. Sirve para ofrecer un desenlace cuando, en la misma edición, se pasa de Wompi a
 * un medio manual. Es **usabilidad**: el backend vuelve a validarlo contra el medio resultante.
 */
const FROM_PENDING: readonly ManualPaymentEvent[] = ['processing', 'approved', 'voided'];

export function paymentMethodLabel(method: string): string {
  return Object.hasOwn(PAYMENT_METHOD_LABELS, method)
    ? PAYMENT_METHOD_LABELS[method as OrderPaymentMethod]
    : method;
}

export function isManualMethod(method: string): boolean {
  return method !== 'wompi';
}

/**
 * Desenlaces que el formulario ofrece para el medio elegido en el borrador.
 *
 * - Wompi: ninguno. Su estado lo actualizan el webhook y la reconciliación.
 * - El mismo medio que ya tiene el pedido: los que publica el backend en `paymentEditing`.
 * - Otro medio manual: los de un pago pendiente, solo si el medio se puede cambiar.
 */
export function manualEventsOffered(
  editing: PaymentEditing,
  draftMethod: OrderPaymentMethod,
): readonly ManualPaymentEvent[] {
  if (!isManualMethod(draftMethod)) return [];
  if (draftMethod === editing.method) return editing.manualEvents;
  return editing.methodLocked === null ? FROM_PENDING : [];
}

/** Por qué el panel no ofrece cambiar el medio de pago, o `null` si se puede. */
export function methodLockReason(editing: PaymentEditing): string | null {
  switch (editing.methodLocked) {
    case 'payment_not_pending':
      return 'El medio de pago solo se puede cambiar mientras el pago está pendiente.';
    case 'checkout_opened':
      return 'Ya se abrió un pago de Wompi para este pedido: el medio de pago no se puede cambiar aquí. Si se pagó por otro medio, regístralo en «Conciliación manual».';
    default:
      return null;
  }
}

/** Por qué el panel no ofrece registrar un desenlace para el medio elegido, o `null`. */
export function statusLockReason(
  editing: PaymentEditing,
  draftMethod: OrderPaymentMethod,
): string | null {
  if (!isManualMethod(draftMethod)) return WOMPI_AUTOMATIC;
  if (manualEventsOffered(editing, draftMethod).length > 0) return null;
  if (editing.statusLocked === 'checkout_opened' || editing.methodLocked === 'checkout_opened') {
    return 'Ya se abrió un pago de Wompi para este pedido: el estado se registra en «Conciliación manual».';
  }
  return 'El pago ya tiene un desenlace definitivo y no admite otro cambio manual.';
}

export const WOMPI_AUTOMATIC = 'El estado de Wompi se actualiza automáticamente';

const STATUS_VALUES = new Set(Object.keys(NEXT_STATUS));
const ALLOWED_KEYS = new Set([
  'expectedVersion',
  'status',
  'shipment',
  'internalNotes',
  'items',
  'paymentMethod',
  'paymentStatus',
  'paymentReconciliation',
]);

/**
 * Forma del cuerpo de la edición, antes de llegar al backend.
 *
 * Solo las siete claves del contrato; cualquier otra —un precio, un total, el cliente, la
 * dirección, una referencia o transacción de pago, un dato bancario— rechaza el cuerpo entero,
 * igual que hace el backend. Las líneas son producto, variante y cantidad, nunca un importe. El
 * medio y el estado de pago son valores de sus listas cerradas.
 */
export function parseOrderEdit(raw: unknown): EditOrderRequest | null {
  const body = record(raw);

  if (body === null || Object.keys(body).some((key) => !ALLOWED_KEYS.has(key))) return null;

  const version = body.expectedVersion;

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return null;

  const result: EditOrderRequest = { expectedVersion: version };

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUS_VALUES.has(body.status)) return null;
    result.status = body.status as NonNullable<EditOrderRequest['status']>;
  }

  if (body.shipment !== undefined) {
    const shipment = parseShipmentInput(body.shipment);

    if (shipment === null || result.status === undefined) return null;
    result.shipment = shipment;
  }

  if (body.internalNotes !== undefined) {
    if (body.internalNotes !== null && typeof body.internalNotes !== 'string') return null;
    if (
      typeof body.internalNotes === 'string' &&
      body.internalNotes.length > ORDER_NOTES_INPUT_MAX
    ) {
      return null;
    }
    result.internalNotes = body.internalNotes;
  }

  if (body.items !== undefined) {
    if (
      !Array.isArray(body.items) ||
      body.items.length === 0 ||
      body.items.length > ORDER_EDIT_ITEMS_MAX
    ) {
      return null;
    }
    const items: NonNullable<EditOrderRequest['items']> = [];

    for (const entry of body.items) {
      const line = record(entry);

      if (
        line === null ||
        Object.keys(line).some((key) => !['productId', 'variantId', 'quantity'].includes(key))
      ) {
        return null;
      }
      const productId = identifier(line.productId);
      const variantId = line.variantId === undefined ? undefined : identifier(line.variantId);
      const quantity = line.quantity;

      if (
        productId === null ||
        variantId === null ||
        typeof quantity !== 'number' ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > ORDER_LINE_QUANTITY_MAX
      ) {
        return null;
      }
      items.push(
        variantId === undefined ? { productId, quantity } : { productId, variantId, quantity },
      );
    }
    result.items = items;
  }

  if (body.paymentMethod !== undefined) {
    if (
      typeof body.paymentMethod !== 'string' ||
      !(PAYMENT_METHODS as readonly string[]).includes(body.paymentMethod)
    ) {
      return null;
    }
    result.paymentMethod = body.paymentMethod as OrderPaymentMethod;
  }

  if (body.paymentStatus !== undefined) {
    if (
      typeof body.paymentStatus !== 'string' ||
      !(MANUAL_PAYMENT_EVENTS as readonly string[]).includes(body.paymentStatus)
    ) {
      return null;
    }
    result.paymentStatus = body.paymentStatus as ManualPaymentEvent;
  }

  // La conciliación (ADR 0029 del backend) va sola en su edición, como exige el backend.
  if (body.paymentReconciliation !== undefined) {
    const reconciliation = parseReconciliation(body.paymentReconciliation);

    if (reconciliation === undefined || Object.keys(result).length > 1) return null;
    result.paymentReconciliation = reconciliation;
  }

  return Object.keys(result).length > 1 ? result : null;
}

/** Una línea del borrador del formulario. El precio es solo una referencia para estimar. */
export type DraftLine = {
  readonly key: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly name: string;
  readonly sku: string;
  readonly optionLabel: string | null;
  readonly quantity: number;
  /** Precio vigente conocido al elegirlo, o el de la instantánea del pedido. **Estimación.** */
  readonly referenceUnitPriceCop: number;
};

/** Borrador inicial: las líneas tal como están en el pedido. */
export function draftLinesOf(order: AdminOrder): DraftLine[] {
  return order.items.map((line, index) => ({
    key: `line-${index}-${line.productId}-${line.variantId ?? ''}`,
    productId: line.productId,
    variantId: line.variantId,
    name: line.name,
    sku: line.sku,
    optionLabel:
      line.attributes.length === 0
        ? null
        : line.attributes.map((attribute) => attribute.label).join(' · '),
    quantity: line.quantity,
    referenceUnitPriceCop: line.unitPriceCop,
  }));
}

/** ¿Son las mismas líneas que tiene el pedido, en el mismo orden y cantidad? */
export function sameDraftLines(order: AdminOrder, lines: readonly DraftLine[]): boolean {
  return (
    order.items.length === lines.length &&
    order.items.every((line, index) => {
      const draft = lines[index];

      return (
        draft !== undefined &&
        draft.productId === line.productId &&
        draft.variantId === line.variantId &&
        draft.quantity === line.quantity
      );
    })
  );
}

/** Subtotal **estimado** del borrador. El definitivo lo calcula el backend en la vista previa. */
export function estimatedSubtotal(lines: readonly DraftLine[]): number {
  return lines.reduce((sum, line) => sum + line.referenceUnitPriceCop * line.quantity, 0);
}

/** Lo que el formulario tiene ahora mismo. */
export type EditDraft = {
  readonly status: string;
  readonly shipment: OrderShipmentInput | null;
  readonly internalNotes: string;
  readonly lines: readonly DraftLine[];
  readonly paymentMethod: OrderPaymentMethod;
  /** Desenlace manual elegido, o `null` si el estado del pago no cambia. */
  readonly paymentStatus: ManualPaymentEvent | null;
};

/**
 * Cuerpo de la edición: **solo** lo que cambió respecto del pedido.
 *
 * `null` si no cambió nada: el formulario no llama al backend para una edición vacía.
 */
export function editRequestOf(
  order: AdminOrder,
  draft: EditDraft,
  options: { readonly canEditItems: boolean; readonly canManagePayments: boolean },
): EditOrderRequest | null {
  const body: EditOrderRequest = { expectedVersion: order.version };

  if (draft.status !== order.status) {
    body.status = draft.status as NonNullable<EditOrderRequest['status']>;
    if (draft.status === 'shipped' && draft.shipment !== null) body.shipment = draft.shipment;
  }

  const notes = draft.internalNotes.trim();

  if (notes !== (order.internalNotes ?? '')) body.internalNotes = notes === '' ? null : notes;

  if (options.canEditItems && !sameDraftLines(order, draft.lines)) {
    body.items = draft.lines.map((line) =>
      line.variantId === null
        ? { productId: line.productId, quantity: line.quantity }
        : { productId: line.productId, variantId: line.variantId, quantity: line.quantity },
    );
  }

  if (options.canManagePayments) {
    if (draft.paymentMethod !== order.paymentEditing.method) {
      body.paymentMethod = draft.paymentMethod;
    }
    if (draft.paymentStatus !== null) body.paymentStatus = draft.paymentStatus;
  }

  return Object.keys(body).length > 1 ? body : null;
}

/**
 * Lo que el formulario detecta antes de llamar al backend, o `null`.
 *
 * Un desenlace de pago va en su propia edición, sin cambio de estado ni de productos: así cada
 * edición escribe los avisos de una sola novedad. El backend lo rechaza igual
 * (`order_request_invalid`); aquí se explica antes.
 */
export function draftProblem(request: EditOrderRequest): string | null {
  if (
    request.paymentStatus !== undefined &&
    (request.status !== undefined || request.items !== undefined)
  ) {
    return 'Registra el pago en una edición aparte: no se puede combinar con un cambio de estado del pedido ni de productos.';
  }
  return null;
}

/** Una fila del resumen de cambios que se enseña antes de guardar. */
export type ChangeRow = { readonly label: string; readonly before: string; readonly after: string };

const STATUS_LABELS: Readonly<Record<string, string>> = {
  pending_payment: 'Pendiente de pago',
  paid: 'Pagado',
  preparing: 'En preparación',
  ready_to_ship: 'Listo para despachar',
  shipped: 'Despachado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatCop(value: number): string {
  return COP.format(value);
}

function describeLines(order: AdminOrder): string {
  return order.items
    .map((line) => {
      const option =
        line.attributes.length === 0
          ? ''
          : ` (${line.attributes.map((attribute) => attribute.label).join(' · ')})`;

      return `${line.quantity} × ${line.name}${option}`;
    })
    .join('; ');
}

/**
 * Resumen de cambios a partir del pedido actual y del que devolvió la **vista previa**.
 *
 * Los importes salen del backend, no del formulario: es lo que se va a guardar.
 */
export function changeSummary(
  before: AdminOrder,
  result: Pick<EditOrderResult, 'order' | 'changedFields' | 'payment'>,
): ChangeRow[] {
  const after = result.order;
  const changedFields = result.changedFields;
  const rows: ChangeRow[] = [];

  if (changedFields.includes('status')) {
    rows.push({
      label: 'Estado',
      before: statusLabel(before.status),
      after: statusLabel(after.status),
    });
  }

  if (changedFields.includes('internalNotes')) {
    rows.push({
      label: 'Notas internas',
      before: before.internalNotes ?? 'Sin notas',
      after: after.internalNotes ?? 'Sin notas',
    });
  }

  if (changedFields.includes('items')) {
    rows.push({ label: 'Productos', before: describeLines(before), after: describeLines(after) });
    rows.push({
      label: 'Subtotal',
      before: formatCop(before.subtotalCop),
      after: formatCop(after.subtotalCop),
    });
    rows.push({
      label: 'Envío',
      before: formatCop(before.shippingCop),
      after: formatCop(after.shippingCop),
    });
    rows.push({
      label: 'Total',
      before: formatCop(before.totalCop),
      after: formatCop(after.totalCop),
    });
  }

  if (changedFields.includes('paymentMethod')) {
    rows.push({
      label: 'Medio de pago',
      before: paymentMethodLabel(result.payment.methodBefore),
      after: paymentMethodLabel(result.payment.methodAfter),
    });
  }

  if (changedFields.includes('paymentStatus')) {
    rows.push({
      label: 'Estado del pago',
      before: describePaymentStatus(result.payment.statusBefore),
      after: describePaymentStatus(result.payment.statusAfter),
    });
    if (after.status !== before.status) {
      rows.push({
        label: 'Estado',
        before: statusLabel(before.status),
        after: statusLabel(after.status),
      });
    }
  }

  return rows;
}

/** Correos al cliente que escribe la edición, en una frase. Vienen del backend, no se deducen. */
export function customerEmailSummary(customerNotifications: readonly string[]): string {
  if (customerNotifications.length === 0) return 'No se enviará ningún correo al cliente.';
  const names = customerNotifications.map((key) => `«${describeNotificationEvent(key)}»`);

  return names.length === 1
    ? `Se enviará un correo al cliente: ${names[0]}.`
    : `Se enviarán ${names.length} correos al cliente: ${names.join(', ')}.`;
}

/** Texto exacto del aviso `payment_reminder_scheduled`. */
export const PAYMENT_REMINDER_SCHEDULED_TEXT =
  'No se enviará ningún correo al guardar este cambio. Se programará un recordatorio de pago para una hora después.';

/**
 * Qué se dice de los correos en la revisión y al guardar.
 *
 * Si el backend anuncia `payment_reminder_scheduled`, ese texto **sustituye** al resumen de correos:
 * «No se enviará ningún correo al cliente» a secas sería verdad al guardar y engañoso una hora
 * después. Nunca se muestran los dos. `reminder` decide el estilo informativo.
 */
export function emailNotice(result: Pick<EditOrderResult, 'customerNotifications' | 'warnings'>): {
  readonly text: string;
  readonly reminder: boolean;
} {
  return result.warnings.includes('payment_reminder_scheduled')
    ? { text: PAYMENT_REMINDER_SCHEDULED_TEXT, reminder: true }
    : { text: customerEmailSummary(result.customerNotifications), reminder: false };
}

const WARNINGS: Readonly<Record<EditOrderResult['warnings'][number], string>> = {
  online_checkout_disabled:
    'La tienda dejará de ofrecer el pago en línea con Wompi para este pedido.',
  payment_reminder_superseded: 'El recordatorio de pago pendiente no se enviará.',
  manual_payment_confirmation:
    'Confirmas que el dinero se recibió por este medio. Queda registrado con tu nombre.',
  customer_email: 'El cliente recibirá un correo con esta novedad.',
  payment_reminder_scheduled: PAYMENT_REMINDER_SCHEDULED_TEXT,
  provider_record_preserved: `${PROVIDER_RECORD_NOTICE} El intento se conserva tal como lo reportó Wompi.`,
  provider_attempt_open:
    'El intento de Wompi todavía podría aprobarse. Si lo hace, quedará registrado y el pedido pasará a «Revisión requerida» como posible pago duplicado.',
  possible_duplicate_payment:
    'Este pedido ya tiene un posible pago duplicado en revisión. Revisa la bandeja de incidencias antes de seguir.',
};

/** Las que ya cuenta `emailNotice` y no se repiten en la lista. */
const TOLD_BY_EMAIL_NOTICE: readonly string[] = ['customer_email', 'payment_reminder_scheduled'];

/**
 * Advertencias del backend en texto. Una advertencia desconocida no se enseña con su clave, y
 * `customer_email` y `payment_reminder_scheduled` tampoco: las cuenta `emailNotice`.
 */
export function describeWarnings(warnings: readonly string[]): string[] {
  return warnings.flatMap((warning) =>
    !TOLD_BY_EMAIL_NOTICE.includes(warning) && Object.hasOwn(WARNINGS, warning)
      ? [WARNINGS[warning as keyof typeof WARNINGS]]
      : [],
  );
}

/** Texto para cada motivo de bloqueo que publica el backend. */
const BLOCK_MESSAGES: Readonly<Record<string, string>> = {
  items_locked_status:
    'Los productos de un pedido despachado, entregado o cancelado ya no se pueden cambiar.',
  payment_in_flight:
    'Hay un pago en curso en Wompi para este pedido. Espera a que termine antes de cambiar los productos.',
  checkout_opened:
    'Ya se abrió un pago de Wompi para este pedido. No se pueden cambiar los productos ni el medio de pago desde aquí; si se pagó por otro medio, regístralo en «Conciliación manual».',
  paid_total_changed:
    'Este pedido ya está pagado y el cambio dejaría un total distinto del pagado. No se crean reembolsos ni saldos: elige un cambio que conserve el total.',
  shipping_not_recalculable:
    'El envío de este pedido ya no se puede volver a cotizar, así que sus productos no se pueden cambiar.',
  payment_not_pending: 'El medio de pago solo se puede cambiar mientras el pago está pendiente.',
  payment_status_automatic: `${WOMPI_AUTOMATIC}: no se registra a mano.`,
  payment_status_transition_invalid:
    'Ese estado de pago no está disponible desde el estado actual. Recarga el pedido para ver las opciones vigentes.',
  payment_confirmed_by_provider:
    'Wompi confirmó este pago. No se concilia a mano: deshacerlo exige el flujo de devolución o revisión.',
  reconciliation_payment_settled:
    'Este pago ya se confirmó manualmente. Corregirlo exige una revisión; no se revierte desde aquí.',
  reconciliation_order_closed:
    'Este pedido está cancelado o ya no espera el pago: no se puede conciliar a ese estado.',
};

const LINE_MESSAGES: Readonly<Record<string, string>> = {
  order_product_unavailable: 'Uno de los productos ya no está publicado o no existe.',
  order_variant_required: 'Uno de los productos tiene opciones: elige una antes de guardar.',
  order_variant_unavailable: 'Una de las opciones elegidas ya no está disponible.',
  order_out_of_stock: 'Uno de los productos o una de sus opciones está agotado.',
  order_shipping_unavailable:
    'Con estos productos el destino del pedido no tiene envío disponible.',
};

/** Mensaje para un fallo de la edición, con el código estable del BFF y su referencia. */
export function describeEditFailure(code: string, reference: string | null): string {
  switch (code) {
    case 'version_conflict':
      return 'Alguien modificó este pedido mientras lo editabas. Recarga el pedido y vuelve a intentarlo.';
    case 'order_edit_blocked':
      return (
        (reference === null ? undefined : BLOCK_MESSAGES[reference]) ??
        'El estado del pedido o de su pago no permite este cambio.'
      );
    case 'order_line_rejected':
      return (
        (reference === null ? undefined : LINE_MESSAGES[reference]) ??
        'Uno de los productos no se puede agregar tal como está.'
      );
    case 'order_reconciliation_invalid':
      return (
        (reference === null ? undefined : RECONCILIATION_INVALID_MESSAGES[reference]) ??
        'Revisa la conciliación: falta un dato o alguno no tiene un formato válido.'
      );
    case 'order_transition_invalid':
      return 'Ese cambio de estado no está disponible desde el estado actual.';
    case 'shipment_invalid':
      return 'Para despachar hacen falta la transportadora, el número de guía y un enlace https de seguimiento.';
    case 'admin_role_required':
      return 'Tu rol no permite este cambio.';
    case 'invalid_request':
      return 'Revisa los datos: alguno no tiene un formato válido o no hay nada que guardar.';
    case 'not_found':
      return 'Este pedido ya no existe.';
    case 'session_required':
      return 'Tu sesión terminó. Vuelve a iniciar sesión.';
    default:
      return 'No pudimos guardar los cambios. Inténtalo de nuevo en unos momentos.';
  }
}

/** Una variante elegible para una línea de pedido. Disponibilidad tal como la resuelve el backend. */
export type OrderPickerVariant = {
  readonly id: string;
  readonly sku: string;
  readonly label: string;
  readonly priceCop: number;
  readonly availability: 'in_stock' | 'out_of_stock';
};

/** Un producto elegible: solo los publicados. Sin descripción, imágenes ni nada que no se use. */
export type OrderPickerProduct = {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly priceCop: number;
  readonly availability: 'in_stock' | 'out_of_stock';
  readonly variants: readonly OrderPickerVariant[];
};

/**
 * Producto del catálogo, recortado a lo que el selector necesita, o `null` si no está publicado.
 *
 * Mostrar solo lo publicado es usabilidad: el backend rechaza igualmente un borrador o un
 * archivado. Las variantes archivadas no se ofrecen. Precio y disponibilidad son los del catálogo
 * en este momento; el precio final lo pone el backend al guardar.
 */
export function toOrderPickerProduct(product: AdminProduct): OrderPickerProduct | null {
  if (product.status !== 'active') return null;

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    priceCop: product.priceCop,
    availability: product.inventory.availability,
    variants: product.variants
      .filter((variant) => variant.status === 'active')
      .map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        label: variant.attributes.map((attribute) => attribute.label).join(' · ') || variant.sku,
        priceCop: variant.priceCop,
        availability: variant.inventory.availability,
      })),
  };
}
