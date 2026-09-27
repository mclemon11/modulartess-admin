/**
 * Vocabulario del buzón de avisos.
 *
 * El contrato publica `AdminNotificationDto` con enums cerrados —`eventKey`, `audience`,
 * `deliveryMode`, `status`— y **sin** etiquetas: aquí no se está duplicando nada que el backend ya
 * diga. Lo que sí hace falta es no enseñar `order_ready_to_ship` ni `dead_letter` en pantalla.
 *
 * Lo que el contrato deliberadamente **no** publica tampoco se nombra aquí: no hay destinatario, no
 * hay asunto y no hay cuerpo. Y no hay vista previa ni reenvío, porque no existe el endpoint.
 *
 * Módulo puro.
 */

import type { AdminNotification } from '@/lib/api/orders';

type NotificationEventKey = AdminNotification['eventKey'];
type NotificationStatus = AdminNotification['status'];
type NotificationDeliveryMode = AdminNotification['deliveryMode'];
type NotificationAudience = AdminNotification['audience'];

/**
 * Qué hecho del pedido originó el aviso.
 *
 * Mapa **exhaustivo** sobre el enum generado: si el backend añade un evento, esto deja de
 * compilar en vez de enseñar la clave técnica.
 */
const EVENTS: Readonly<Record<NotificationEventKey, string>> = {
  order_received: 'Pedido recibido',
  // Aviso programado para el cliente una hora después del alta. No es un cambio de estado.
  payment_reminder: 'Recordatorio de pago',
  payment_processing: 'Pago en proceso',
  payment_approved: 'Pago confirmado',
  payment_declined: 'Pago rechazado',
  payment_voided: 'Pago anulado',
  payment_expired: 'Pago vencido',
  payment_error: 'Error en el pago',
  order_preparing: 'En producción',
  order_ready_to_ship: 'Listo para envío',
  // «Pedido …» para que en la tarjeta de avisos no se lea como que el correo se entregó.
  order_shipped: 'Pedido enviado',
  order_delivered: 'Pedido entregado',
  order_cancelled: 'Pedido cancelado',
  // Lo pidió una persona desde el panel. Recuerda un estado: no es que haya vuelto a ocurrir.
  order_status_reminder: 'Recordatorio manual de estado',
};

export function describeNotificationEvent(eventKey: string): string {
  return Object.hasOwn(EVENTS, eventKey) ? EVENTS[eventKey as NotificationEventKey] : eventKey;
}

const AUDIENCES: Readonly<Record<NotificationAudience, string>> = {
  customer: 'Cliente',
  admin: 'Administración',
};

export function describeNotificationAudience(audience: string): string {
  return Object.hasOwn(AUDIENCES, audience)
    ? AUDIENCES[audience as NotificationAudience]
    : audience;
}

const DELIVERY_MODES: Readonly<Record<NotificationDeliveryMode, string>> = {
  disabled: 'Deshabilitado',
  preview: 'Vista previa',
  provider: 'Proveedor',
};

export function describeDeliveryMode(mode: string): string {
  return Object.hasOwn(DELIVERY_MODES, mode)
    ? DELIVERY_MODES[mode as NotificationDeliveryMode]
    : mode;
}

/**
 * Lo que de verdad sabemos de cada estado, y nada más.
 *
 * `sent` es que **el proveedor aceptó** el correo, no que llegara al buzón: el backend no recibe
 * confirmaciones de entrega, y el contrato no publica ningún estado «entregado». Por eso aquí no
 * existe «Enviado» ni «Entregado»: decirlo prometería algo que nadie ha comprobado.
 */
const STATUSES: Readonly<Record<NotificationStatus, string>> = {
  pending: 'Pendiente de envío',
  sending: 'Enviando',
  sent: 'Aceptado por el proveedor de correo',
  failed: 'Falló',
  dead_letter: 'No se pudo enviar',
  previewed: 'Previsualizado',
  suppressed: 'No enviado',
};

/** Estados en los que un aviso ya no se mueve solo. `failed` vuelve a `pending` y reintenta. */
const TERMINAL: readonly string[] = ['sent', 'suppressed', 'dead_letter', 'previewed'];

export function isTerminalNotificationStatus(status: string): boolean {
  return TERMINAL.includes(status);
}

export function describeNotificationStatus(status: string): string {
  return Object.hasOwn(STATUSES, status) ? STATUSES[status as NotificationStatus] : status;
}

/**
 * La frase que evita que un estado se lea como lo que no es.
 *
 * Son las tres confusiones que el contrato señala y que un panel administrativo no puede permitirse:
 * `previewed` no es «enviado», `suppressed` no es un error, y un `failed` es del correo, **no** de
 * la transición del pedido, que sí se aplicó.
 */
const STATUS_NOTES: Readonly<Partial<Record<NotificationStatus, string>>> = {
  sent: 'El proveedor aceptó el correo. No tenemos confirmación de que haya llegado al buzón del cliente.',
  previewed: 'La plantilla se generó para revisión. No se envió un correo.',
  suppressed: 'El envío estaba deshabilitado para este entorno.',
  failed: 'El pedido se actualizó, pero la notificación no pudo entregarse.',
  dead_letter: 'El pedido se actualizó, pero la notificación no pudo entregarse.',
};

/**
 * Código con el que el backend cierra un recordatorio de pago que dejó de aplicar.
 *
 * No es un error de entrega: el pago avanzó o el pedido se canceló antes de la hora del
 * recordatorio, y por eso no salió. Se explica como lo que es en lugar de decir que el envío
 * estaba deshabilitado o que el proveedor falló.
 */
const REMINDER_NO_LONGER_APPLICABLE = 'payment_reminder_no_longer_applicable';

/**
 * Códigos de supresión que el backend escribe a propósito, con su explicación.
 *
 * Ninguno es un error del proveedor: son decisiones del backend para no mandar un correo que ya no
 * procede. Se explican como lo que son y no se enseñan como un fallo.
 */
const SUPPRESSION_NOTES: Readonly<Record<string, string>> = {
  [REMINDER_NO_LONGER_APPLICABLE]:
    'El pago avanzó o el pedido se canceló antes de la hora del recordatorio. No se envió.',
  payment_reminder_superseded_by_manual_reminder:
    'Se sustituyó por un recordatorio manual de estado. No se envió.',
  notification_environment_mismatch:
    'El aviso se escribió con otro ambiente de pago que el del pedido. No se envió.',
  notification_order_missing: 'El pedido del aviso ya no existe. No se envió.',
};

export function notificationNote(
  status: string,
  lastErrorCode: string | null = null,
): string | null {
  if (
    status === 'suppressed' &&
    lastErrorCode !== null &&
    Object.hasOwn(SUPPRESSION_NOTES, lastErrorCode)
  ) {
    return SUPPRESSION_NOTES[lastErrorCode] ?? null;
  }

  return Object.hasOwn(STATUS_NOTES, status)
    ? (STATUS_NOTES[status as NotificationStatus] ?? null)
    : null;
}

export type NotificationTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

const TONES: Readonly<Record<NotificationStatus, NotificationTone>> = {
  pending: 'neutral',
  sending: 'info',
  sent: 'success',
  failed: 'danger',
  dead_letter: 'danger',
  // Previsualizado no es éxito ni error: es una plantilla generada para mirarla.
  previewed: 'info',
  // Suprimido tampoco es un error: el envío estaba apagado a propósito.
  suppressed: 'neutral',
};

export function notificationTone(status: string): NotificationTone {
  return Object.hasOwn(TONES, status) ? TONES[status as NotificationStatus] : 'neutral';
}

/**
 * Códigos de error de entrega con una lectura segura.
 *
 * `lastErrorCode` es «stable», pero el contrato no publica su conjunto de valores y avisa de que
 * **nunca** es el mensaje del proveedor. Solo se muestran los que tienen traducción aprobada; el
 * resto se resume sin enseñar el código, porque un valor interno en pantalla se lee como una fuga.
 */
const ERROR_CODES: Readonly<Record<string, string>> = {
  invalid_recipient: 'La dirección de destino no es válida',
  provider_unavailable: 'El proveedor de correo no respondió',
  rate_limited: 'El proveedor limitó el envío',
  template_error: 'La plantilla no pudo componerse',
};

export function describeNotificationError(code: string | null): string | null {
  // La nota ya lo explica, y no es un error del proveedor.
  if (code === null || Object.hasOwn(SUPPRESSION_NOTES, code)) {
    return null;
  }

  return ERROR_CODES[code] ?? 'El proveedor devolvió un error que el panel no sabe traducir';
}
