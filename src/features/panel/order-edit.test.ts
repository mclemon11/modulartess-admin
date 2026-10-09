import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { can } from '@/features/session/permissions';
import type { AdminProduct } from '@/lib/api/catalog';
import type { AdminOrder } from '@/lib/api/orders';

import {
  changeSummary,
  customerEmailSummary,
  describeEditFailure,
  emailNotice,
  PAYMENT_REMINDER_SCHEDULED_TEXT,
  describeWarnings,
  draftLinesOf,
  draftProblem,
  editableStatuses,
  editRequestOf,
  itemsEditableFromDetail,
  MANUAL_PAYMENT_EVENTS,
  manualEventsOffered,
  methodLockReason,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  statusLockReason,
  WOMPI_AUTOMATIC,
  ORDER_EDIT_ITEMS_MAX,
  ORDER_LINE_QUANTITY_MAX,
  ORDER_NOTES_INPUT_MAX,
  ORDER_NOTES_MAX,
  parseOrderEdit,
  toOrderPickerProduct,
  type EditDraft,
} from './order-edit';

/**
 * «Editar pedido» (ADR 0013): lo que el panel decide por sí mismo. Precios, totales, pagos y
 * permisos los decide el backend; aquí se protege que el panel no los invente ni los oculte.
 */

const contract = JSON.parse(readFileSync('openapi/backend-v1.json', 'utf8')) as {
  components: { schemas: Record<string, { properties: Record<string, Record<string, unknown>> }> };
};

const ORDER = {
  id: 'ord_1',
  publicId: 'MZ-TEST0001',
  version: 7,
  status: 'paid',
  payment: { status: 'approved' },
  paymentEditing: {
    method: 'wompi',
    methodLabel: 'Wompi',
    manual: false,
    methodLocked: 'payment_not_pending',
    statusLocked: 'payment_status_automatic',
    manualEvents: [],
    reconciliation: {
      locked: 'payment_confirmed_by_provider',
      statuses: [],
      methods: [],
      noteRequired: true,
      externalPaymentIdRequiredFor: ['paid'],
      providerAttemptPreserved: false,
    },
  },
  paymentReconciliation: null,
  internalNotes: null,
  subtotalCop: 2_900_000,
  shippingCop: 0,
  totalCop: 2_900_000,
  items: [
    {
      productId: 'prd_tocador',
      variantId: 'var_roble',
      name: 'Tocador Aura',
      sku: 'TOCADOR-AURA-ROBLE',
      attributes: [{ key: 'finish', value: 'roble', label: 'Roble' }],
      quantity: 2,
      unitPriceCop: 1_450_000,
      totalCop: 2_900_000,
    },
  ],
} as unknown as AdminOrder;

const untouched = (): EditDraft => ({
  status: ORDER.status,
  shipment: null,
  internalNotes: '',
  lines: draftLinesOf(ORDER),
  paymentMethod: 'wompi',
  paymentStatus: null,
});

const ALL = { canEditItems: true, canManagePayments: true } as const;

describe('límites del contrato', () => {
  it('coinciden con la copia comiteada de OpenAPI', () => {
    const edit = contract.components.schemas.EditOrderRequestDto!.properties;
    const line = contract.components.schemas.CreateOrderItemDto!.properties;

    expect(edit.internalNotes!.maxLength).toBe(ORDER_NOTES_INPUT_MAX);
    expect(String(edit.internalNotes!.description)).toContain(`${ORDER_NOTES_MAX} characters`);
    expect(edit.items!.maxItems).toBe(ORDER_EDIT_ITEMS_MAX);
    expect(line.quantity!.maximum).toBe(ORDER_LINE_QUANTITY_MAX);
  });

  it('el detalle publica las notas internas', () => {
    expect(contract.components.schemas.AdminOrderDto!.properties).toHaveProperty('internalNotes');
  });
});

describe('forma del cuerpo', () => {
  it('acepta estado, notas y líneas sin precio', () => {
    const body = {
      expectedVersion: 7,
      status: 'preparing',
      internalNotes: 'Revisar',
      items: [
        { productId: 'prd_1', variantId: 'var_1', quantity: 2 },
        { productId: 'prd_2', quantity: 1 },
      ],
    };

    expect(parseOrderEdit(body)).toEqual(body);
  });

  it.each([
    ['clave desconocida', { expectedVersion: 7, totalCop: 1 }],
    [
      'precio en la línea',
      { expectedVersion: 7, items: [{ productId: 'p', quantity: 1, priceCop: 9 }] },
    ],
    ['cantidad cero', { expectedVersion: 7, items: [{ productId: 'p', quantity: 0 }] }],
    ['cantidad decimal', { expectedVersion: 7, items: [{ productId: 'p', quantity: 1.5 }] }],
    [
      'cantidad excesiva',
      { expectedVersion: 7, items: [{ productId: 'p', quantity: ORDER_LINE_QUANTITY_MAX + 1 }] },
    ],
    ['sin líneas', { expectedVersion: 7, items: [] }],
    [
      'identificador con barras',
      { expectedVersion: 7, items: [{ productId: '../x', quantity: 1 }] },
    ],
    ['estado inventado', { expectedVersion: 7, status: 'refunded' }],
    [
      'envío sin estado',
      {
        expectedVersion: 7,
        shipment: { carrierName: 'X', trackingNumber: '1', trackingUrl: 'https://x.co/1' },
      },
    ],
    [
      'notas desmesuradas',
      { expectedVersion: 7, internalNotes: 'a'.repeat(ORDER_NOTES_INPUT_MAX + 1) },
    ],
    ['sin versión', { internalNotes: 'x' }],
    ['solo la versión', { expectedVersion: 7 }],
  ])('rechaza %s', (_name, body) => {
    expect(parseOrderEdit(body)).toBeNull();
  });
});

describe('cuerpo a partir del formulario', () => {
  it('sin cambios no hay nada que enviar: cancelar no llama al backend', () => {
    expect(editRequestOf(ORDER, untouched(), ALL)).toBeNull();
  });

  it('solo envía lo que cambió, con la versión que se leyó', () => {
    const draft = { ...untouched(), internalNotes: '  Llamar antes  ' };

    expect(editRequestOf(ORDER, draft, ALL)).toEqual({
      expectedVersion: 7,
      internalNotes: 'Llamar antes',
    });
  });

  it('borrar las notas envía null', () => {
    const withNotes = { ...ORDER, internalNotes: 'algo' } as AdminOrder;

    expect(editRequestOf(withNotes, { ...untouched(), internalNotes: '   ' }, ALL)).toEqual({
      expectedVersion: 7,
      internalNotes: null,
    });
  });

  it('las líneas viajan sin precio y solo con permiso', () => {
    const lines = draftLinesOf(ORDER).map((line) => ({ ...line, quantity: 1 }));
    const draft = { ...untouched(), lines };

    expect(editRequestOf(ORDER, draft, ALL)).toEqual({
      expectedVersion: 7,
      items: [{ productId: 'prd_tocador', variantId: 'var_roble', quantity: 1 }],
    });
    expect(
      editRequestOf(ORDER, draft, { canEditItems: false, canManagePayments: true }),
    ).toBeNull();
  });

  it('despachar lleva los datos de envío', () => {
    const shipment = {
      carrierName: 'Servientrega',
      trackingNumber: '1',
      trackingUrl: 'https://x.co/1',
    };
    const ready = { ...ORDER, status: 'ready_to_ship' } as AdminOrder;

    expect(editRequestOf(ready, { ...untouched(), status: 'shipped', shipment }, ALL)).toEqual({
      expectedVersion: 7,
      status: 'shipped',
      shipment,
    });
  });
});

describe('qué ofrece el formulario', () => {
  it('el estado actual y solo el siguiente paso del flujo', () => {
    expect(editableStatuses('paid')).toEqual(['paid', 'preparing']);
    expect(editableStatuses('ready_to_ship')).toEqual(['ready_to_ship', 'shipped']);
    expect(editableStatuses('pending_payment')).toEqual(['pending_payment']);
    expect(editableStatuses('cancelled')).toEqual(['cancelled']);
  });

  it.each([
    ['pending_payment', 'pending', true],
    ['paid', 'approved', true],
    ['ready_to_ship', 'approved', true],
    ['pending_payment', 'processing', false],
    ['shipped', 'approved', false],
    ['delivered', 'approved', false],
    ['cancelled', 'pending', false],
  ])('productos editables con %s y pago %s: %s', (status, payment, expected) => {
    expect(itemsEditableFromDetail({ status, payment: { status: payment } } as never)).toBe(
      expected,
    );
  });
});

describe('permisos', () => {
  it('moderator edita estado y notas, pero no productos', () => {
    expect(can('moderator', 'orders.update_status')).toBe(true);
    expect(can('moderator', 'orders.edit_items')).toBe(false);
    expect(can('moderator', 'orders.cancel')).toBe(false);
  });

  it.each(['super_admin', 'master_admin'])('%s cambia productos', (role) => {
    expect(can(role, 'orders.edit_items')).toBe(true);
  });

  it('el botón y el editor de líneas dependen de esos permisos', () => {
    const source = readFileSync('src/features/panel/order-edit-dialog.tsx', 'utf8');

    expect(source).toContain("if (!can(role, 'orders.update_status')) return null;");
    expect(source).toContain("canEditItems={can(role, 'orders.edit_items')}");
  });
});

describe('resumen y mensajes', () => {
  it('los importes del resumen salen de la vista previa del backend', () => {
    const after = {
      ...ORDER,
      subtotalCop: 1_450_000,
      totalCop: 1_470_000,
      shippingCop: 20_000,
      items: [{ ...ORDER.items[0]!, quantity: 1, totalCop: 1_450_000 }],
    } as AdminOrder;
    const rows = changeSummary(ORDER, {
      order: after,
      changedFields: ['items'],
      payment: {
        methodBefore: 'wompi',
        methodAfter: 'wompi',
        statusBefore: 'approved',
        statusAfter: 'approved',
      },
    });

    expect(rows.map((row) => row.label)).toEqual(['Productos', 'Subtotal', 'Envío', 'Total']);
    expect(rows.find((row) => row.label === 'Total')!.after.replace(/\s/g, ' ')).toContain(
      '1.470.000',
    );
  });

  it.each(contract.components.schemas.OrderEditErrorDto!.properties.reason!.enum as string[])(
    'el motivo %s del contrato tiene su propio texto y nunca anuncia un guardado',
    (reason) => {
      const message = describeEditFailure('order_edit_blocked', reason);

      expect(message).not.toBe(describeEditFailure('order_edit_blocked', null));
      expect(message).not.toMatch(/guardad|actualizad/i);
    },
  );

  it('un 409 de versión pide recargar y no anuncia éxito', () => {
    const message = describeEditFailure('version_conflict', null);

    expect(message).toContain('Recarga');
    expect(message).not.toMatch(/guardad|actualizad/i);
  });
});

describe('pago', () => {
  const editing = (overrides: Partial<AdminOrder['paymentEditing']>) =>
    ({ ...ORDER.paymentEditing, ...overrides }) as AdminOrder['paymentEditing'];
  const PENDING_WOMPI = editing({
    method: 'wompi',
    methodLocked: null,
    statusLocked: 'payment_status_automatic',
    manualEvents: [],
  });
  const PENDING_CASH = editing({
    method: 'cash',
    methodLabel: 'Efectivo',
    manual: true,
    methodLocked: null,
    statusLocked: null,
    manualEvents: ['processing', 'approved', 'voided'],
  });
  const pendingOrder = (paymentEditing: AdminOrder['paymentEditing']) =>
    ({
      ...ORDER,
      status: 'pending_payment',
      payment: { status: 'pending' },
      paymentEditing,
    }) as AdminOrder;

  it('los medios y los desenlaces son exactamente los del contrato', () => {
    const request = contract.components.schemas.EditOrderRequestDto!.properties;

    expect([...PAYMENT_METHODS].sort()).toEqual(
      [...(request.paymentMethod!.enum as string[])].sort(),
    );
    expect([...MANUAL_PAYMENT_EVENTS].sort()).toEqual(
      [...(request.paymentStatus!.enum as string[])].sort(),
    );
    expect(contract.components.schemas.AdminOrderDto!.properties).toHaveProperty('paymentEditing');
  });

  it('el selector ofrece los cuatro medios con su nombre', () => {
    expect(PAYMENT_METHODS.map((method) => PAYMENT_METHOD_LABELS[method])).toEqual([
      'Transferencia bancaria',
      'Efectivo',
      'Addi',
      'Wompi',
    ]);
  });

  it.each(PAYMENT_METHODS)('el cuerpo acepta el medio %s', (paymentMethod) => {
    expect(parseOrderEdit({ expectedVersion: 7, paymentMethod })).toEqual({
      expectedVersion: 7,
      paymentMethod,
    });
  });

  it.each([
    ['un medio inventado', { expectedVersion: 7, paymentMethod: 'card' }],
    ['un estado que no es manual', { expectedVersion: 7, paymentStatus: 'expired' }],
    ['un estado inventado', { expectedVersion: 7, paymentStatus: 'refunded' }],
    ['una referencia', { expectedVersion: 7, paymentMethod: 'cash', reference: 'ABC' }],
    ['una transacción', { expectedVersion: 7, paymentStatus: 'approved', transactionId: 't_1' }],
    [
      'un dato bancario',
      { expectedVersion: 7, paymentMethod: 'bank_transfer', accountNumber: '1' },
    ],
  ])('rechaza %s', (_name, body) => {
    expect(parseOrderEdit(body)).toBeNull();
  });

  it('cambiar de medio mientras está pendiente envía solo el medio', () => {
    const order = pendingOrder(PENDING_WOMPI);
    const draft = {
      ...untouched(),
      status: 'pending_payment',
      paymentMethod: 'bank_transfer' as const,
    };

    expect(editRequestOf(order, draft, ALL)).toEqual({
      expectedVersion: 7,
      paymentMethod: 'bank_transfer',
    });
  });

  it('sin permiso de pagos no viaja ni el medio ni el estado', () => {
    const order = pendingOrder(PENDING_CASH);
    const draft = {
      ...untouched(),
      status: 'pending_payment',
      paymentMethod: 'bank_transfer' as const,
      paymentStatus: 'approved' as const,
    };

    expect(
      editRequestOf(order, draft, { canEditItems: false, canManagePayments: false }),
    ).toBeNull();
    expect(editRequestOf(order, draft, ALL)).toEqual({
      expectedVersion: 7,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'approved',
    });
  });

  it('Wompi no ofrece desenlaces manuales y lo explica', () => {
    expect(manualEventsOffered(PENDING_WOMPI, 'wompi')).toEqual([]);
    expect(statusLockReason(PENDING_WOMPI, 'wompi')).toBe(WOMPI_AUTOMATIC);
    expect(WOMPI_AUTOMATIC).toBe('El estado de Wompi se actualiza automáticamente');
  });

  it.each(['bank_transfer', 'cash', 'addi'] as const)(
    'al pasar de Wompi a %s se ofrecen los desenlaces de un pago pendiente',
    (method) => {
      expect(manualEventsOffered(PENDING_WOMPI, method)).toEqual([
        'processing',
        'approved',
        'voided',
      ]);
      expect(statusLockReason(PENDING_WOMPI, method)).toBeNull();
    },
  );

  it('en el mismo medio manual se ofrece lo que publica el backend', () => {
    const verifying = editing({
      ...PENDING_CASH,
      manualEvents: ['approved', 'declined', 'voided'],
    });

    expect(manualEventsOffered(verifying, 'cash')).toEqual(['approved', 'declined', 'voided']);
  });

  it('un pago confirmado bloquea el medio y el estado, con su motivo', () => {
    const settled = editing({
      method: 'cash',
      manual: true,
      methodLocked: 'payment_not_pending',
      statusLocked: 'payment_settled',
      manualEvents: [],
    });

    expect(methodLockReason(settled)).toMatch(
      /solo se puede cambiar mientras el pago está pendiente/,
    );
    expect(manualEventsOffered(settled, 'bank_transfer')).toEqual([]);
    expect(statusLockReason(settled, 'cash')).toMatch(/desenlace definitivo/);
  });

  it('un checkout de Wompi abierto bloquea el medio y el pago manual', () => {
    const opened = editing({ method: 'wompi', methodLocked: 'checkout_opened', manualEvents: [] });

    expect(methodLockReason(opened)).toMatch(/Wompi/);
    expect(manualEventsOffered(opened, 'cash')).toEqual([]);
    // Con un checkout abierto, el pago se registra en «Conciliación manual» (ADR 0014).
    expect(statusLockReason(opened, 'cash')).toMatch(/Conciliación manual/);
    expect(methodLockReason(opened)).toMatch(/Conciliación manual/);
  });

  it('un desenlace de pago va en su propia edición', () => {
    expect(
      draftProblem({ expectedVersion: 7, paymentStatus: 'approved', status: 'paid' }),
    ).not.toBeNull();
    expect(
      draftProblem({
        expectedVersion: 7,
        paymentStatus: 'approved',
        items: [{ productId: 'p', quantity: 1 }],
      }),
    ).not.toBeNull();
    expect(
      draftProblem({
        expectedVersion: 7,
        paymentStatus: 'approved',
        paymentMethod: 'cash',
        internalNotes: 'x',
      }),
    ).toBeNull();
  });

  it('el resumen enseña medio y estado antes y después, y el paso a pagado', () => {
    const before = pendingOrder(PENDING_WOMPI);
    const after = { ...before, status: 'paid', payment: { status: 'approved' } } as AdminOrder;
    const rows = changeSummary(before, {
      order: after,
      changedFields: ['paymentMethod', 'paymentStatus'],
      payment: {
        methodBefore: 'wompi',
        methodAfter: 'cash',
        statusBefore: 'pending',
        statusAfter: 'approved',
      },
    });

    expect(rows).toEqual([
      { label: 'Medio de pago', before: 'Wompi', after: 'Efectivo' },
      { label: 'Estado del pago', before: 'Pendiente', after: 'Pagado' },
      { label: 'Estado', before: 'Pendiente de pago', after: 'Pagado' },
    ]);
  });

  it('los correos al cliente salen de la respuesta del backend', () => {
    expect(customerEmailSummary([])).toBe('No se enviará ningún correo al cliente.');
    expect(customerEmailSummary(['payment_approved'])).toBe(
      'Se enviará un correo al cliente: «Pago confirmado».',
    );
    expect(customerEmailSummary(['order_preparing'])).toContain('«En producción»');
  });

  it('cada advertencia del contrato tiene texto, sin repetir el correo, y una desconocida no se enseña', () => {
    const warnings = (
      contract.components.schemas.EditOrderResultDto!.properties.warnings!.items as {
        enum: string[];
      }
    ).enum;

    // Todas menos `customer_email` y `payment_reminder_scheduled`, que cuenta `emailNotice`.
    expect(describeWarnings(warnings)).toHaveLength(warnings.length - 2);
    expect(describeWarnings(['customer_email'])).toEqual([]);
    expect(describeWarnings(['payment_reminder_scheduled'])).toEqual([]);
    expect(describeWarnings(['algo_nuevo'])).toEqual([]);
  });

  it('el recordatorio programado sustituye al resumen genérico de correos', () => {
    expect(PAYMENT_REMINDER_SCHEDULED_TEXT).toBe(
      'No se enviará ningún correo al guardar este cambio. Se programará un recordatorio de pago para una hora después.',
    );
    const scheduled = emailNotice({
      customerNotifications: [],
      warnings: ['payment_reminder_superseded', 'payment_reminder_scheduled'],
    });

    expect(scheduled).toEqual({ text: PAYMENT_REMINDER_SCHEDULED_TEXT, reminder: true });
    expect(scheduled.text).not.toContain('No se enviará ningún correo al cliente');
  });

  it.each([
    [[], [], 'No se enviará ningún correo al cliente.'],
    [['payment_approved'], ['manual_payment_confirmation', 'customer_email'], '«Pago confirmado»'],
    [
      [],
      ['online_checkout_disabled', 'payment_reminder_superseded'],
      'No se enviará ningún correo al cliente.',
    ],
  ] as const)(
    'sin recordatorio programado se dice el resumen de siempre (%j)',
    (customerNotifications, warnings, expected) => {
      const notice = emailNotice({
        customerNotifications: [...customerNotifications],
        warnings: [...warnings],
      });

      expect(notice.reminder).toBe(false);
      expect(notice.text).toContain(expected);
      expect(notice.text).not.toBe(PAYMENT_REMINDER_SCHEDULED_TEXT);
    },
  );

  it('el aviso se ve en la revisión, junto al cambio de medio, y al guardar; nunca los dos textos', () => {
    const source = readFileSync('src/features/panel/order-edit-dialog.tsx', 'utf8');

    // Revisión: aviso informativo con role="note", enlazado a la tabla donde está el cambio de medio.
    expect(source).toContain(
      'aria-describedby={step.emails.reminder ? `${id}-reminder` : undefined}',
    );
    expect(source).toContain('<p className={styles.info} id={`${id}-reminder`} role="note">');
    // El resumen genérico solo cuando no hay recordatorio programado.
    expect(source).toContain(
      '{step.emails.reminder ? null : <p className={styles.emails}>{step.emails.text}</p>}',
    );
    // Al guardar: en la región aria-live, con el estilo informativo.
    expect(source).toContain('setNotice(emailNotice(saved));');
    expect(source).toContain(
      '<span className={notice.reminder ? styles.infoInline : catalog.success}>',
    );
    // Informativo, no un error.
    const css = readFileSync('src/features/panel/order-edit.module.css', 'utf8');
    const info = css.slice(css.indexOf('.info {'), css.indexOf('}', css.indexOf('.info {')));
    expect(info).toContain('var(--color-brand-soft)');
    expect(info).not.toMatch(/danger|error/);
    const inline = css.slice(
      css.indexOf('.infoInline {'),
      css.indexOf('}', css.indexOf('.infoInline {')),
    );
    expect(inline).toContain('var(--color-brand-soft)');
    expect(inline).not.toMatch(/danger|error/);
  });

  it('moderator no cambia ni confirma pagos; super_admin y master_admin sí', () => {
    expect(can('moderator', 'payments.manage_manual')).toBe(false);
    expect(can('master_admin', 'payments.manage_manual')).toBe(true);
    expect(can('super_admin', 'payments.manage_manual')).toBe(true);
  });

  it('el diálogo usa ese permiso y confirma explícitamente un pago manual', () => {
    const source = readFileSync('src/features/panel/order-edit-dialog.tsx', 'utf8');

    expect(source).toContain("canManagePayments={can(role, 'payments.manage_manual')}");
    expect(source).toContain(
      "if (step.reconciliation || step.request.paymentStatus === 'approved') {",
    );
    expect(source).toContain("setStep({ ...step, kind: 'confirm' });");
    expect(source).toContain('Sí, confirmar pago');
    expect(source).toContain('Tu rol no permite cambiar el medio ni el estado del pago.');
  });

  it('el resumen de cambios no usa la tabla del catálogo, que se oculta por debajo de 60rem', () => {
    const source = readFileSync('src/features/panel/order-edit-dialog.tsx', 'utf8');

    expect(source).not.toContain('catalog.tableScroll');
    expect(source).not.toContain('catalog.table}');
    expect(source).toMatch(/<table[^>]*className=\{styles\.summary\}/);
  });

  it('la sección «Pago» no enseña referencias, transacciones ni datos técnicos', () => {
    const source = readFileSync('src/features/panel/order-edit-dialog.tsx', 'utf8');
    const section = source.slice(
      source.indexOf('function PaymentFieldset('),
      source.indexOf('function TextField('),
    );

    expect(section).not.toMatch(/reference|transaction|environment|attempt/i);
  });
});

describe('selector de productos', () => {
  const product = (overrides: Record<string, unknown>) =>
    ({
      id: 'prd_1',
      name: 'Espejo',
      sku: 'ESP',
      status: 'active',
      priceCop: 500_000,
      inventory: { availability: 'in_stock' },
      variants: [
        {
          id: 'v1',
          sku: 'ESP-80',
          status: 'active',
          priceCop: 500_000,
          attributes: [{ label: '80 cm' }],
          inventory: { availability: 'out_of_stock' },
        },
        {
          id: 'v2',
          sku: 'ESP-90',
          status: 'archived',
          priceCop: 500_000,
          attributes: [{ label: '90 cm' }],
          inventory: { availability: 'in_stock' },
        },
      ],
      ...overrides,
    }) as unknown as AdminProduct;

  it('solo ofrece lo publicado y las variantes activas, con la disponibilidad del backend', () => {
    expect(toOrderPickerProduct(product({ status: 'draft' }))).toBeNull();
    expect(toOrderPickerProduct(product({ status: 'archived' }))).toBeNull();
    expect(toOrderPickerProduct(product({}))).toEqual({
      id: 'prd_1',
      name: 'Espejo',
      sku: 'ESP',
      priceCop: 500_000,
      availability: 'in_stock',
      variants: [
        {
          id: 'v1',
          sku: 'ESP-80',
          label: '80 cm',
          priceCop: 500_000,
          availability: 'out_of_stock',
        },
      ],
    });
  });
});

describe('accesibilidad y teclado del diálogo', () => {
  const source = readFileSync('src/features/panel/order-edit-dialog.tsx', 'utf8');

  it('es un diálogo modal nativo con nombre y descripción', () => {
    expect(source).toContain('element.showModal()');
    expect(source).toContain('aria-labelledby={titleId}');
    expect(source).toContain('aria-describedby={leadId}');
  });

  it('Cancelar cierra sin guardar y Escape no interrumpe una operación en curso', () => {
    expect(source).toMatch(/onClick=\{close\}\s+type="button"\s*>\s*Cancelar/);
    expect(source).toContain('if (busy !== null) event.preventDefault();');
  });

  it('el foco vuelve al botón que abrió el diálogo', () => {
    expect(source).toContain('onClosed={() => opener.current?.focus()}');
  });

  it('cada control tiene su etiqueta y Enter en la búsqueda no envía el formulario', () => {
    for (const label of [
      'Estado del pedido',
      'Notas para el equipo',
      'Agregar producto',
      'Cantidad',
      'Opción (obligatoria)',
    ]) {
      expect(source, label).toContain(label);
    }
    expect(source).toContain("if (event.key === 'Enter') {");
    expect(source).toMatch(/aria-label=\{`Quitar \$\{line\.name\}/);
  });

  it('el foco no se pierde: va al mensaje de fallo o al título del paso nuevo', () => {
    expect(source).toContain('if (failure !== null) message.current?.focus();');
    expect(source).toContain('title.current?.focus();');
  });

  it('los fallos se anuncian y un conflicto ofrece recargar', () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain('Recargar pedido');
  });
});
