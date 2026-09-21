import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  describeDeliveryMode,
  describeNotificationAudience,
  describeNotificationError,
  describeNotificationEvent,
  describeNotificationStatus,
  notificationNote,
  notificationTone,
} from './notification-labels';

/**
 * Vocabulario del buzón de avisos.
 *
 * Lo que se comprueba aquí es que el panel no presente un estado como lo que no es. El contrato lo
 * dice sin rodeos —«previewed means it was rendered for inspection and NOT sent. suppressed means
 * delivery was off»— y las tres confusiones tienen consecuencias reales: creer que un correo salió,
 * creer que hubo un error, o creer que el pedido no se actualizó.
 */

type Contract = {
  readonly components: {
    readonly schemas: Record<
      string,
      { readonly properties?: Record<string, { readonly enum?: readonly string[] }> }
    >;
  };
};

const CONTRACT = JSON.parse(readFileSync('openapi/backend-v1.json', 'utf8')) as Contract;

function published(property: string): readonly string[] {
  return CONTRACT.components.schemas.AdminNotificationDto?.properties?.[property]?.enum ?? [];
}

describe('enums del contrato', () => {
  it.each(['eventKey', 'audience', 'deliveryMode', 'status'])(
    'el panel nombra todos los valores de %s',
    (property) => {
      const values = published(property);
      const describe_ = {
        eventKey: describeNotificationEvent,
        audience: describeNotificationAudience,
        deliveryMode: describeDeliveryMode,
        status: describeNotificationStatus,
      }[property];

      expect(values.length).toBeGreaterThan(0);

      for (const value of values) {
        expect(describe_?.(value), `${property}/${value}`).not.toBe(value);
      }
    },
  );
});

describe('audiencia', () => {
  it.each([
    ['customer', 'Cliente'],
    ['admin', 'Administración'],
  ])('%s se lee «%s»', (value, label) => {
    expect(describeNotificationAudience(value)).toBe(label);
  });
});

describe('modo de entrega', () => {
  it.each([
    ['disabled', 'Deshabilitado'],
    ['preview', 'Vista previa'],
    ['provider', 'Proveedor'],
  ])('%s se lee «%s»', (value, label) => {
    expect(describeDeliveryMode(value)).toBe(label);
  });
});

describe('estado del aviso', () => {
  it.each([
    ['pending', 'Pendiente'],
    ['sending', 'Enviando'],
    ['sent', 'Enviado'],
    ['failed', 'Falló'],
    ['dead_letter', 'Requiere atención'],
    ['previewed', 'Previsualizado'],
    ['suppressed', 'Suprimido'],
  ])('%s se lee «%s»', (value, label) => {
    expect(describeNotificationStatus(value)).toBe(label);
  });

  /* Una plantilla generada para revisión **no** es un correo enviado. */
  it('previewed no se presenta como sent', () => {
    expect(describeNotificationStatus('previewed')).not.toBe(describeNotificationStatus('sent'));
    expect(notificationNote('previewed')).toBe(
      'La plantilla se generó para revisión. No se envió un correo.',
    );
    expect(notificationTone('previewed')).not.toBe('success');
  });

  /* El envío estaba apagado a propósito: no es un fallo de nadie. */
  it('suppressed no se presenta como error', () => {
    expect(notificationNote('suppressed')).toBe('El envío estaba deshabilitado para este entorno.');
    expect(notificationTone('suppressed')).not.toBe('danger');
  });

  /* El pedido sí se actualizó: lo que falló fue el correo, y eso hay que decirlo. */
  it.each(['failed', 'dead_letter'])('%s deja claro que el pedido sí se actualizó', (status) => {
    expect(notificationNote(status)).toBe(
      'El pedido se actualizó, pero la notificación no pudo entregarse.',
    );
    expect(notificationTone(status)).toBe('danger');
  });

  it('los estados que no se prestan a confusión no llevan nota', () => {
    for (const status of ['pending', 'sending', 'sent']) {
      expect(notificationNote(status), status).toBeNull();
    }
  });
});

describe('order_ready_to_ship', () => {
  /*
   * El backend escribe ese aviso al confirmar la transición. El panel no lo envía y no ofrece
   * enviarlo: solo lo nombra.
   */
  it('lo publica el contrato y el panel lo llama «Listo para envío»', () => {
    expect(published('eventKey')).toContain('order_ready_to_ship');
    expect(describeNotificationEvent('order_ready_to_ship')).toBe('Listo para envío');
  });
});

describe('errores de entrega', () => {
  /* El contrato dice que `lastErrorCode` «is never the provider's message». Tampoco se enseña. */
  it('traduce los códigos conocidos y resume los demás sin mostrarlos', () => {
    expect(describeNotificationError('invalid_recipient')).toBe(
      'La dirección de destino no es válida',
    );

    const unknown = describeNotificationError('smtp_550_5_1_1');

    expect(unknown).not.toBeNull();
    expect(unknown).not.toContain('smtp_550');
  });

  it('sin error no inventa ninguno', () => {
    expect(describeNotificationError(null)).toBeNull();
  });
});

describe('valores que el panel no conoce', () => {
  it('no rompen la tarjeta: se muestran tal cual', () => {
    expect(describeNotificationEvent('order_returned')).toBe('order_returned');
    expect(describeNotificationStatus('bounced')).toBe('bounced');
    expect(notificationTone('bounced')).toBe('neutral');
    expect(notificationNote('bounced')).toBeNull();
  });
});
