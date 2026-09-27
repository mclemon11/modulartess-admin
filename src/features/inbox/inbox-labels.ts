/**
 * Textos de la bandeja, en español, desde los valores cerrados del contrato.
 *
 * Las listas se declaran con los tipos generados: si el backend añade o quita una cola, un estado o
 * un estado de entrega, esto deja de compilar en lugar de pintar un valor en inglés.
 *
 * Módulo puro.
 */

import type {
  CommunicationAttachment,
  CommunicationsSummary,
  ConversationChannel,
  ConversationStatus,
  DeliveryState,
  ReclassifyChannel,
} from '@/lib/api/communications';

/** Las cinco colas de trabajo, en el orden de las pestañas. */
export const WORK_CHANNELS: readonly ReclassifyChannel[] = [
  'orders',
  'shipping',
  'support',
  'complaints',
  'information',
];

export const CHANNEL_LABELS: Readonly<Record<ConversationChannel, string>> = {
  orders: 'Pedidos',
  shipping: 'Envíos',
  support: 'Soporte',
  complaints: 'Reclamos',
  information: 'Información',
  unclassified: 'Revisión',
};

export const CHANNEL_HINTS: Readonly<Record<ConversationChannel, string>> = {
  orders: 'pedidos@modulartess.com · creación, pagos y cancelaciones',
  shipping: 'envios@modulartess.com · guía, transportadora, despacho y entrega',
  support: 'soporte@modulartess.com · ayuda posventa',
  complaints: 'reclamos@modulartess.com · reclamos formales',
  information: 'info@modulartess.com · consultas generales y comerciales',
  unclassified:
    'Correo a direcciones que no son un alias. Sin respuesta automática y con los adjuntos retenidos hasta reclasificar.',
};

export const STATUSES: readonly ConversationStatus[] = ['open', 'pending', 'resolved'];

export const STATUS_LABELS: Readonly<Record<ConversationStatus, string>> = {
  open: 'Abierta',
  pending: 'Pendiente del cliente',
  resolved: 'Resuelta',
};

/**
 * Estado de entrega de una respuesta.
 *
 * «Aceptada» no es «entregada»: significa que el proveedor la tomó. «Entregada» solo aparece
 * cuando el proveedor lo confirmó con un evento, y el panel no lo afirma por su cuenta.
 */
export const DELIVERY_LABELS: Readonly<Record<DeliveryState, string>> = {
  received: 'Recibido',
  queued: 'En cola',
  sending: 'Enviando',
  accepted: 'Aceptada por el proveedor',
  delivered: 'Entregada',
  bounced: 'Rebotada',
  failed: 'No se pudo enviar',
};

export function describeAttachment(attachment: CommunicationAttachment): string {
  switch (attachment.status) {
    case 'stored':
      return 'Disponible';
    case 'held':
      return 'Retenido hasta reclasificar';
    case 'pending':
      return 'Aún no se guardó';
    case 'rejected':
      return attachment.reason === 'type_not_allowed'
        ? 'Rechazado: tipo de archivo no permitido'
        : attachment.reason === 'too_large' || attachment.reason === 'total_too_large'
          ? 'Rechazado: demasiado grande'
          : attachment.reason === 'content_mismatch'
            ? 'Rechazado: el contenido no coincide con su tipo'
            : 'Rechazado';
  }
}

/** Total de no leídos de las colas que devolvió el backend (la de revisión solo si la incluye). */
export function totalUnread(unread: CommunicationsSummary['unread']): number {
  return Object.values(unread).reduce<number>(
    (sum, value) => sum + (typeof value === 'number' ? value : 0),
    0,
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
