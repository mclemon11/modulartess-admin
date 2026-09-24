import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import contract from '../../../openapi/backend-v1.json';

import {
  ATTRIBUTE_MAX_AXES,
  ATTRIBUTE_VALUE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  FEATURE_MAX_LENGTH,
  FEATURES_MAX_ITEMS,
  SHORT_DESCRIPTION_MAX_LENGTH,
  SPECIFICATION_MAX_LENGTH,
  TAXONOMY_SLUG_MAX_LENGTH,
} from './variant-limits';

/**
 * El contrato OpenAPI es la única fuente de verdad. Estas pruebas fijan lo que el panel da por
 * cierto: si el backend cambia el contrato, fallan aquí en lugar de fallar en producción.
 */

const TYPES_PATH = 'src/lib/api/generated/schema.d.ts';

describe('copia versionada del contrato', () => {
  it('es un documento OpenAPI con las rutas de sesión administrativa', () => {
    expect(contract.openapi).toMatch(/^3\./);
    expect(contract.paths).toHaveProperty(['/v1/admin/auth/session']);
    expect(contract.paths['/v1/admin/auth/session']).toHaveProperty('post');
    expect(contract.paths['/v1/admin/auth/session']).toHaveProperty('get');
  });

  it('no publica ningún DELETE de la sesión: el BFF no puede inventarlo', () => {
    expect(contract.paths['/v1/admin/auth/session']).not.toHaveProperty('delete');
  });

  it('declara la sesión administrativa como apiKey en su propio encabezado', () => {
    expect(contract.components.securitySchemes.adminSession).toEqual({
      in: 'header',
      name: 'x-modulartess-admin-session',
      type: 'apiKey',
    });
  });

  it('devuelve el material de sesión solo en el encabezado de respuesta, nunca en el cuerpo', () => {
    const created = contract.paths['/v1/admin/auth/session'].post.responses['201'];

    expect(created.headers).toHaveProperty('x-modulartess-admin-session');
    expect(Object.keys(contract.components.schemas.AdminSessionCreatedDto.properties)).toEqual([
      'expiresAt',
      'principal',
    ]);
  });

  it('publica exactamente los tres roles administrativos', () => {
    // El backend implementó la ADR 0007: el enum ya no es solo `super_admin`. El orden importa
    // porque es el que el panel refleja en su modelo de permisos.
    expect(contract.components.schemas.AdminPrincipalDto.properties.role.enum).toEqual([
      'super_admin',
      'master_admin',
      'moderator',
    ]);
  });

  it('publica las diecisiete operaciones de catálogo administrativo', () => {
    const operations: string[] = [];

    for (const [path, node] of Object.entries(contract.paths)) {
      if (!path.startsWith('/v1/admin/products')) {
        continue;
      }

      for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
        if (method in node) {
          operations.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    expect(operations.sort()).toEqual([
      'GET /v1/admin/products',
      'GET /v1/admin/products/{productId}',
      'GET /v1/admin/products/{productId}/variants',
      'PATCH /v1/admin/products/{productId}',
      'PATCH /v1/admin/products/{productId}/images/{imageId}',
      'PATCH /v1/admin/products/{productId}/variants/{variantId}',
      'POST /v1/admin/products',
      'POST /v1/admin/products/{productId}/archive',
      'POST /v1/admin/products/{productId}/images',
      'POST /v1/admin/products/{productId}/images/{imageId}/archive',
      'POST /v1/admin/products/{productId}/inventory-adjustments',
      'POST /v1/admin/products/{productId}/publish',
      'POST /v1/admin/products/{productId}/variants',
      'POST /v1/admin/products/{productId}/variants/{variantId}/archive',
      'POST /v1/admin/products/{productId}/variants/{variantId}/inventory-adjustments',
      // Las dos rutas de los modos. Son `PUT` y no `POST` a propósito: escriben el estado final,
      // no acumulan un movimiento.
      'PUT /v1/admin/products/{productId}/inventory',
      'PUT /v1/admin/products/{productId}/variants/{variantId}/inventory',
    ]);
  });

  it('describe cada parámetro de ruta en las operaciones dinámicas', () => {
    const dynamic = Object.entries(contract.paths).filter(([path]) => path.includes('{productId}'));

    expect(dynamic.length).toBe(13);

    let declarations = 0;

    for (const [path, node] of dynamic) {
      for (const [method, operation] of Object.entries(node as Record<string, unknown>)) {
        if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) {
          continue;
        }

        const parameters = [
          ...((node as { parameters?: unknown[] }).parameters ?? []),
          ...(((operation as { parameters?: unknown[] }).parameters ?? []) as unknown[]),
        ] as { in?: string; name?: string; required?: boolean }[];

        // Cada segmento `{...}` de la ruta tiene que estar declarado como parámetro de ruta
        // obligatorio: sin eso, `openapi-fetch` no puede sustituirlo y la operación es
        // inalcanzable desde el panel.
        for (const segment of path.matchAll(/\{(\w+)\}/g)) {
          const name = segment[1];
          const declared = parameters.find((parameter) => parameter.name === name);

          expect(declared, `${method.toUpperCase()} ${path} → ${String(name)}`).toMatchObject({
            in: 'path',
            required: true,
          });
        }

        declarations += 1;
      }
    }

    expect(declarations).toBe(15);
  });

  it('el alta de producto no admite clasificación ni ejes: eso viaja en el PATCH', () => {
    // De aquí sale el orden del alta: crear con los campos base y enriquecer después, antes de
    // crear ninguna variante.
    const create = contract.components.schemas.CreateProductRequestDto.properties;

    expect(Object.keys(create).sort()).toEqual([
      'description',
      // Un único `inventory`: los dos campos planos que había antes desaparecieron del alta.
      'inventory',
      'name',
      'priceCop',
      'shortDescription',
      'sku',
      'slug',
    ]);

    const update = contract.components.schemas.UpdateProductRequestDto.properties;

    for (const field of [
      'attributes',
      'care',
      'category',
      'featured',
      'features',
      'materials',
      'measurements',
      'productType',
      'warranty',
    ]) {
      expect(update).toHaveProperty([field]);
    }
  });

  /*
   * Los números que el panel replica se comparan contra el contrato, no contra una copia escrita a
   * mano en la propia prueba. Así, cuando el backend mueve un tope y se actualiza la copia, lo que
   * falla es la constante desactualizada del panel y no una expectativa que alguien tendría que
   * acordarse de cambiar a la vez.
   */
  it('fija los límites de las variantes que replica el panel', () => {
    const product = contract.components.schemas.AdminProductDto.properties;

    // El máximo de variantes activas solo está en la descripción; de ahí sale VARIANT_MAX_ACTIVE.
    expect(product.variants.description).toContain('At most 72 active ones');
    expect(product.attributes.maxItems).toBe(ATTRIBUTE_MAX_AXES);
    expect(contract.components.schemas.ProductVariantAttributeDto.properties.value.maxLength).toBe(
      ATTRIBUTE_VALUE_MAX_LENGTH,
    );
    expect(contract.components.schemas.ProductTaxonomyDto.properties.slug.maxLength).toBe(
      TAXONOMY_SLUG_MAX_LENGTH,
    );
  });

  it('fija los topes del contenido editorial que replica el formulario', () => {
    const update = contract.components.schemas.UpdateProductRequestDto.properties;
    const create = contract.components.schemas.CreateProductRequestDto.properties;

    // Descripción corta: 180 en el alta y en la edición, el mismo número en los dos sitios.
    expect(create.shortDescription.maxLength).toBe(SHORT_DESCRIPTION_MAX_LENGTH);
    expect(update.shortDescription.maxLength).toBe(SHORT_DESCRIPTION_MAX_LENGTH);

    // Descripción detallada: 3000, y opcional en los dos.
    expect(create.description.maxLength).toBe(DESCRIPTION_MAX_LENGTH);
    expect(update.description.maxLength).toBe(DESCRIPTION_MAX_LENGTH);
    expect(contract.components.schemas.CreateProductRequestDto.required).not.toContain(
      'description',
    );

    // Características: cinco como mucho, de sesenta caracteres como mucho cada una.
    expect(update.features.maxItems).toBe(FEATURES_MAX_ITEMS);
    expect(update.features.items.maxLength).toBe(FEATURE_MAX_LENGTH);

    // Los cuatro detalles adicionales comparten tope.
    for (const key of ['materials', 'measurements', 'warranty', 'care'] as const) {
      expect(update[key].maxLength, key).toBe(SPECIFICATION_MAX_LENGTH);
    }
  });

  it('el alta admite la descripción corta y la detallada, pero no las exige', () => {
    // De aquí sale que el `POST` pueda llevarlas ya: no hace falta esperar al `PATCH` para el
    // texto que la ficha enseña junto al precio.
    expect(contract.components.schemas.CreateProductRequestDto.required).toEqual([
      'sku',
      'slug',
      'name',
      'priceCop',
    ]);
  });

  it('el alta de variante exige expectedVersion, SKU, atributos y precio', () => {
    expect(contract.components.schemas.CreateProductVariantRequestDto.required).toEqual([
      'expectedVersion',
      'sku',
      'attributes',
      'priceCop',
    ]);

    // Ni el SKU ni el stock se editan: el SKU es inmutable y el stock va por ajuste de inventario.
    expect(
      Object.keys(contract.components.schemas.UpdateProductVariantRequestDto.properties).sort(),
    ).toEqual(['attributes', 'expectedVersion', 'priceCop']);
  });

  it('solo los ajustes de inventario y la subida de imagen exigen Idempotency-Key', () => {
    const withKey: string[] = [];

    for (const [path, node] of Object.entries(contract.paths)) {
      for (const [method, operation] of Object.entries(node as Record<string, unknown>)) {
        const parameters = ((operation as { parameters?: { name?: string }[] }).parameters ??
          []) as { name?: string }[];

        if (parameters.some((parameter) => parameter.name === 'Idempotency-Key')) {
          withKey.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    // Crear una variante NO la lleva: lo que evita duplicados ahí es el SKU reservado y la
    // combinación única.
    //
    // `POST /v1/orders` sí la lleva, y es de la tienda, no del panel: un reintento de red que
    // creara dos pedidos dejaría a alguien esperando dos entregas. El panel no crea pedidos, así
    // que no la envía nunca; aparece aquí porque la copia del contrato es completa.
    expect(withKey.sort()).toEqual([
      'POST /v1/admin/products/{productId}/images',
      'POST /v1/admin/products/{productId}/inventory-adjustments',
      'POST /v1/admin/products/{productId}/variants/{variantId}/inventory-adjustments',
      'POST /v1/orders',
      // Las dos rutas que usa el panel desde los dos modos. La clave es obligatoria ahí, y por eso
      // el BFF la exige en el cuerpo antes de llamar: sin ella no hay reintento seguro.
      'PUT /v1/admin/products/{productId}/inventory',
      'PUT /v1/admin/products/{productId}/variants/{variantId}/inventory',
    ]);
  });

  it('el producto administrativo publica la preparación para publicar', () => {
    const product = contract.components.schemas.AdminProductDto;

    // El panel la muestra tal cual y NO recalcula ninguna regla: publish consume esta misma
    // evaluación, así que derivarla aquí acabaría contradiciendo al backend.
    expect(product.required).toContain('publicationReadiness');
    expect(product.properties.publicationReadiness.allOf[0]).toEqual({
      $ref: '#/components/schemas/PublicationReadinessDto',
    });

    const readiness = contract.components.schemas.PublicationReadinessDto;

    expect(readiness.required).toEqual(['ready', 'missing']);
    expect(readiness.properties.missing.items.enum).toHaveLength(9);

    /*
     * Lo que el contrato dejó de exigir.
     *
     * `primary_image` y `gallery` se fueron con las imágenes opcionales; `description`, `features`,
     * `materials`, `measurements`, `warranty` y `care` se fueron con el contenido editorial. De lo
     * editorial solo queda `short_description`. El panel tiene que dejar de pedirlos, no seguir
     * pintándolos como pendientes.
     */
    const codes: readonly string[] = readiness.properties.missing.items.enum;

    for (const retired of [
      'primary_image',
      'gallery',
      'description',
      'features',
      'materials',
      'measurements',
      'warranty',
      'care',
    ]) {
      expect(codes, retired).not.toContain(retired);
    }

    expect(codes).toContain('short_description');
  });

  it('el precio viaja como entero, sin símbolo ni separadores', () => {
    const price = contract.components.schemas.AdminProductDto.properties.priceCop;

    expect(price.type).toBe('number');
    expect(price.format).toBe('int32');
    // El símbolo y los puntos de miles son de la pantalla, no del dato.
    expect(price.description).toContain('never stored as formatted text');
  });

  it('fija los límites del idToken que replica la validación del BFF', () => {
    const { idToken } = contract.components.schemas.AdminSessionRequestDto.properties;

    expect(idToken.minLength).toBe(32);
    expect(idToken.maxLength).toBe(4096);
    expect(contract.components.schemas.AdminSessionRequestDto.required).toEqual(['idToken']);
  });
});

describe('tipos generados', () => {
  it('existen y provienen del generador, no de una edición a mano', () => {
    const generated = readFileSync(TYPES_PATH, 'utf8');

    expect(generated).toContain('auto-generated by openapi-typescript');
    expect(generated).toContain('/v1/admin/auth/session');
  });

  it('están sincronizados con la copia del contrato (lo verifica pnpm api:check)', () => {
    const generated = readFileSync(TYPES_PATH, 'utf8');

    // Toda ruta del contrato debe aparecer en los tipos generados.
    for (const path of Object.keys(contract.paths)) {
      expect(generated).toContain(`"${path}"`);
    }
  });
});

/**
 * Superficie administrativa de pedidos.
 *
 * El panel da por ciertas exactamente estas cinco operaciones y estos campos. Si el backend cambia
 * el contrato y se actualiza la copia, esto falla aquí en lugar de fallar en producción.
 */
describe('pedidos administrativos', () => {
  it('publica exactamente las cinco operaciones que el panel usa', () => {
    const operations: string[] = [];

    for (const [path, node] of Object.entries(contract.paths)) {
      if (!path.startsWith('/v1/admin/orders')) {
        continue;
      }

      for (const method of Object.keys(node)) {
        operations.push(`${method.toUpperCase()} ${path}`);
      }
    }

    expect(operations.sort()).toEqual([
      'GET /v1/admin/orders',
      'GET /v1/admin/orders/{orderId}',
      'POST /v1/admin/orders/{orderId}/cancel',
      'POST /v1/admin/orders/{orderId}/payment-simulation',
      'POST /v1/admin/orders/{orderId}/status',
    ]);
  });

  /* No hay DELETE: un pedido se cancela y queda. El panel no puede inventarlo. */
  it('no publica ningún DELETE de pedidos', () => {
    for (const [path, node] of Object.entries(contract.paths)) {
      if (path.startsWith('/v1/admin/orders')) {
        expect(node, path).not.toHaveProperty('delete');
      }
    }
  });

  it('publica los siete estados del pedido, en el orden del recorrido', () => {
    // `ready_to_ship` entró entre producir y despachar: es la única señal que distingue un pedido
    // todavía en el taller de uno terminado esperando al transportador.
    expect(contract.components.schemas.AdminOrderDto.properties.status.enum).toEqual([
      'pending_payment',
      'paid',
      'preparing',
      'ready_to_ship',
      'shipped',
      'delivered',
      'cancelled',
    ]);
  });

  /*
   * El pago es otra lectura, con sus propios estados. El panel los mantiene separados de los del
   * pedido incluso en el vocabulario: solo `approved` hace avanzar al pedido.
   */
  it('publica los siete estados del pago, separados de los del pedido', () => {
    // `voided` entró con Wompi: una transacción anulada no es un rechazo ni un vencimiento, y el
    // contrato la publica como su propio desenlace en lugar de fundirla con otro.
    expect(contract.components.schemas.OrderPaymentDto.properties.status.enum).toEqual([
      'pending',
      'processing',
      'approved',
      'declined',
      'voided',
      'expired',
      'error',
    ]);
  });

  /*
   * Los hitos del recorrido salen de dos historiales y el contrato dice cómo se desempatan cuando
   * comparten marca de tiempo. Esa regla está en la descripción del `timeline`, no en el esquema,
   * así que se fija aquí: si desapareciera, el panel estaría ordenando por una razón inventada.
   */
  it('fija el desempate entre el historial del pedido y el del pago', () => {
    const timeline = contract.components.schemas.AdminOrderDto.properties.timeline;

    expect(timeline.description).toContain('the payment one comes first');
    expect(timeline.description).toContain('sorting by `at` alone does not decide between them');
  });

  /* Las etiquetas son autoritativas: el panel las consume y no mantiene una tabla paralela. */
  it('publica la etiqueta del estado en el resumen, en la ficha y en cada hito', () => {
    expect(contract.components.schemas.AdminOrderSummaryDto.required).toContain('statusLabel');
    expect(contract.components.schemas.AdminOrderDto.required).toContain('statusLabel');
    expect(contract.components.schemas.OrderTimelineEntryDto.required).toContain('label');
    expect(contract.components.schemas.AdminPaymentEventDto.required).toContain('label');
  });

  /*
   * El simulador es de staging y el contrato lo dice en su descripción: sin pasarela, sin cobro y
   * con `payments.simulate`, que solo tiene `super_admin`. De ahí sale la matriz de permisos.
   */
  it('reserva el simulador a super_admin y lo declara como sandbox', () => {
    const operation = contract.paths['/v1/admin/orders/{orderId}/payment-simulation'].post;

    expect(operation.description).toContain('STAGING ONLY, AND NOT A GATEWAY');
    expect(operation.description).toContain('payments.simulate permission, which only super_admin');
    expect(operation.description).toContain('DOES NOT represent a charge');
  });

  /* El `eventId` es la idempotencia, y el contrato explica qué pasa al repetirlo. */
  it('exige evento, versión e identificador idempotente en la simulación', () => {
    const request = contract.components.schemas.SimulatePaymentRequestDto;

    expect(request.required).toEqual(['event', 'expectedVersion', 'eventId']);
    expect(request.properties.eventId.minLength).toBe(8);
    expect(request.properties.eventId.maxLength).toBe(128);
    expect(request.properties.eventId.description).toContain('Replaying the same eventId');
  });

  /*
   * No hay vista previa, ni reenvío, ni envío manual de avisos. Por eso la tarjeta de
   * Notificaciones es de solo lectura: no es una omisión de diseño.
   */
  it('no publica ninguna operación sobre las notificaciones', () => {
    for (const path of Object.keys(contract.paths)) {
      expect(path).not.toContain('notification');
      expect(path).not.toContain('email');
      expect(path).not.toContain('preview');
    }
  });

  /* Ni destinatario ni cuerpo: el contrato lo dice y el panel no puede pintarlos. */
  it('el aviso no publica destinatario ni cuerpo', () => {
    const notification = contract.components.schemas.AdminNotificationDto;
    const keys = Object.keys(notification.properties);

    expect(keys).not.toContain('recipient');
    expect(keys).not.toContain('to');
    expect(keys).not.toContain('body');
    expect(keys).not.toContain('subject');
    expect(
      contract.components.schemas.AdminOrderDto.properties.notifications.description,
    ).toContain('Bodies and recipients are never returned');
  });

  /*
   * La fila del listado trae esto y nada más: sin líneas completas, sin dirección y sin correo. Es
   * lo que impide que la tabla prometa columnas que no existen.
   */
  it('publica en el resumen solo los campos que pinta la tabla', () => {
    // `paymentStatus` y `statusLabel` entraron para que la lista pueda enseñar las dos lecturas sin
    // abrir cada pedido: el contrato dice que «the row costs no extra read».
    expect(Object.keys(contract.components.schemas.AdminOrderSummaryDto.properties).sort()).toEqual(
      [
        'createdAt',
        'customerName',
        'id',
        'itemCount',
        'paymentStatus',
        'previewLine',
        'publicId',
        'status',
        'statusLabel',
        'totalCop',
        'updatedAt',
        'version',
      ],
    );
  });

  /*
   * `previewLine` es lo que permite enseñar foto y nombre en la lista sin pedir cada pedido. Va en
   * el resumen y es obligatorio, así que la tabla nunca se queda sin qué pintar.
   */
  it('el resumen trae la primera línea con su foto, nombre, SKU y cantidad', () => {
    const summary = contract.components.schemas.AdminOrderSummaryDto;

    expect(summary.required).toContain('previewLine');
    expect(summary.properties.previewLine.allOf[0]).toEqual({
      $ref: '#/components/schemas/AdminOrderPreviewLineDto',
    });

    const preview = contract.components.schemas.AdminOrderPreviewLineDto;

    expect(Object.keys(preview.properties).sort()).toEqual([
      'name',
      'primaryImageUrl',
      'quantity',
      'sku',
    ]);
    // La foto puede faltar: la lista lo dice con «Sin imagen» en vez de inventar un marcador.
    expect(preview.properties.primaryImageUrl.nullable).toBe(true);
  });

  it('el listado solo admite pageToken y pageSize: no hay buscador ni filtros', () => {
    const parameters = contract.paths['/v1/admin/orders'].get.parameters ?? [];
    const names = parameters.map((parameter: { name: string }) => parameter.name).sort();

    expect(names).toEqual(['pageSize', 'pageToken']);
  });

  it('la ficha trae la instantánea de cada línea, con su imagen y sus atributos', () => {
    expect(Object.keys(contract.components.schemas.OrderLineDto.properties).sort()).toEqual([
      'attributes',
      'name',
      'primaryImageUrl',
      'productId',
      'quantity',
      'sku',
      'totalCop',
      'unitPriceCop',
      'variantId',
    ]);
  });

  /* Sin `expectedVersion` no hay control de concurrencia: las tres mutaciones lo exigen. */
  it.each(['UpdateOrderStatusRequestDto', 'CancelOrderRequestDto', 'SimulatePaymentRequestDto'])(
    '%s exige expectedVersion',
    (schema) => {
      const schemas = contract.components.schemas as unknown as Record<
        string,
        { properties: Record<string, unknown>; required?: readonly string[] }
      >;
      const node = schemas[schema];

      expect(node?.properties).toHaveProperty('expectedVersion');
      expect(node?.required).toContain('expectedVersion');
    },
  );

  /* El importe es un entero de pesos: el símbolo y los separadores los pone el panel. */
  it('publica los importes como enteros, no como texto formateado', () => {
    // El JSON importado tiene un tipo literal enorme; se lee por una vista genérica para poder
    // recorrer pares esquema/campo sin que cada acceso necesite su propio estrechamiento.
    const schemas = contract.components.schemas as unknown as Record<
      string,
      { properties: Record<string, { type?: string }> }
    >;

    for (const [schema, field] of [
      ['AdminOrderSummaryDto', 'totalCop'],
      ['AdminOrderDto', 'subtotalCop'],
      ['AdminOrderDto', 'shippingCop'],
      ['AdminOrderDto', 'totalCop'],
      ['OrderLineDto', 'unitPriceCop'],
    ] as const) {
      expect(schemas[schema]?.properties[field]?.type, `${schema}.${field}`).toBe('number');
    }
  });
});

/**
 * Superficie del resumen comercial.
 *
 * Una sola operación, cuatro errores y una forma de respuesta. Lo que se fija aquí es lo que el
 * Dashboard da por cierto: si el backend cambia el contrato y se actualiza la copia, falla en esta
 * prueba y no en una pantalla que enseña cifras.
 */
describe('resumen del dashboard', () => {
  it('publica exactamente una operación de dashboard', () => {
    const operations: string[] = [];

    for (const [path, node] of Object.entries(contract.paths)) {
      if (!path.startsWith('/v1/admin/dashboard')) {
        continue;
      }

      for (const method of Object.keys(node)) {
        operations.push(`${method.toUpperCase()} ${path}`);
      }
    }

    expect(operations).toEqual(['GET /v1/admin/dashboard/summary']);
  });

  /* Tres parámetros y ninguno más: el panel no puede inventar un filtro ni una granularidad. */
  it('solo admite period, from, to y el ambiente financiero', () => {
    const parameters = contract.paths['/v1/admin/dashboard/summary'].get.parameters ?? [];
    const names = parameters.map((parameter: { name: string }) => parameter.name).sort();

    // `salesEnvironment` es un **filtro**, no una etiqueta: el contrato dice que ninguna cifra
    // monetaria significa nunca «sandbox + live», así que el ambiente se elige al preguntar.
    expect(names).toEqual(['from', 'period', 'salesEnvironment', 'to']);
  });

  it('publica los cuatro períodos y ninguno más', () => {
    const parameters = contract.paths['/v1/admin/dashboard/summary'].get.parameters ?? [];
    const period = parameters.find((parameter: { name: string }) => parameter.name === 'period') as
      { schema: { enum: readonly string[] } } | undefined;

    expect(period?.schema.enum).toEqual(['today', '7d', '30d', 'custom']);
  });

  /*
   * `from` es obligatorio con `custom` y se rechaza con cualquier otro período. De ahí sale que el
   * módulo server-only los omita en lugar de dejarlos viajar.
   */
  it('reserva from y to para el período personalizado', () => {
    const parameters = contract.paths['/v1/admin/dashboard/summary'].get.parameters ?? [];
    const from = parameters.find((parameter: { name: string }) => parameter.name === 'from') as
      { description: string } | undefined;

    expect(from?.description).toContain('Required for period=custom');
    expect(from?.description).toContain('rejected for any other period');
    expect(from?.description).toContain('At most 92 days');
  });

  it('publica los cuatro errores que el panel traduce', () => {
    const responses = contract.paths['/v1/admin/dashboard/summary'].get.responses as Record<
      string,
      { description: string }
    >;

    expect(Object.keys(responses).sort()).toEqual(['200', '400', '401', '403', '503']);
    expect(responses['400']?.description).toContain('dashboard_query_invalid');
    expect(responses['401']?.description).toContain('admin_session_required');
    expect(responses['403']?.description).toContain('admin_forbidden');
    expect(responses['503']?.description).toContain('dashboard_unavailable');
  });

  /*
   * El resumen trae las once secciones que pinta la pantalla. Si el backend retirara una, la
   * pantalla dejaría de compilar antes de quedarse con un hueco silencioso.
   */
  it('el resumen trae todas las secciones que el Dashboard pinta', () => {
    expect([...contract.components.schemas.DashboardSummaryDto.required].sort()).toEqual([
      'attention',
      'commerce',
      'environment',
      'generatedAt',
      'operations',
      'ordersByStatus',
      'paymentsByStatus',
      'period',
      'recentOrders',
      'salesSeries',
      'timezone',
      'topProducts',
      'truncated',
    ]);
  });

  /*
   * La distinción que la pantalla tiene que declarar: unas cifras son del período y otras son de
   * ahora mismo. Si desapareciera de la descripción, el panel estaría afirmándolo por su cuenta.
   */
  it('fija que la operación es una fotografía y no del período', () => {
    const description = contract.paths['/v1/admin/dashboard/summary'].get.description;

    expect(description).toContain('commerce, salesSeries and topProducts describe the PERIOD');
    expect(description).toContain('are the snapshot of RIGHT NOW');
    expect(description).toContain('do not change when the period changes');
  });

  /* Una venta es un pago aprobado, no un pedido creado. Es la confusión que cuesta dinero. */
  it('fija que la venta se atribuye a la fecha de aprobación del pago', () => {
    const description = contract.paths['/v1/admin/dashboard/summary'].get.description;

    expect(description).toContain('attributed to the approval date and never to the creation date');

    const created = contract.components.schemas.DashboardCommerceDto.properties.createdOrders;

    expect(created.description).toContain('These are intentions to buy, NOT sales');
  });

  /* `null` significa que no hay comparación. El panel no puede convertirlo en cero. */
  it('declara changePercent como nullable y finito', () => {
    for (const schema of ['DashboardAmountComparisonDto', 'DashboardCountComparisonDto'] as const) {
      const node = contract.components.schemas[schema];

      expect(node.required).toContain('changePercent');
      expect(node.properties.changePercent.nullable).toBe(true);
      expect(node.properties.changePercent.description).toContain('as a finite number');
      expect(node.properties.changePercent.description).toContain('null when the previous period');
    }
  });

  /* `truncated` se publica para mostrarse, no para decidir si se muestra. */
  it('publica truncated y explica por qué', () => {
    const truncated = contract.components.schemas.DashboardSummaryDto.properties.truncated;

    expect(truncated.description).toContain('the period figures are a MINIMUM and not a total');
    expect(truncated.description).toContain('published instead of hidden');
  });

  it('la serie trae un punto por día, con los días vacíos en cero', () => {
    const series = contract.components.schemas.DashboardSummaryDto.properties.salesSeries;

    expect(series.description).toContain('One point per calendar day');
    expect(series.description).toContain('never omitted');
    expect([...contract.components.schemas.DashboardSeriesPointDto.required].sort()).toEqual([
      'approvedAmountCop',
      'approvedOrders',
      'createdOrders',
      'date',
    ]);
  });

  /* Los ocho estados de la operación, para que la tarjeta no pueda olvidarse de uno. */
  it('la operación publica los ocho contadores', () => {
    expect([...contract.components.schemas.DashboardOperationsDto.required].sort()).toEqual([
      'cancelled',
      'delivered',
      'paid',
      'paymentProcessing',
      'pendingPayment',
      'preparing',
      'readyToShip',
      'shipped',
    ]);
  });

  /* `ready_to_ship` no puede faltar en la distribución: es el paso que el panel acaba de ganar. */
  it('la distribución publica los siete estados del pedido', () => {
    expect(contract.components.schemas.DashboardOrderStatusCountDto.properties.status.enum).toEqual(
      [
        'pending_payment',
        'paid',
        'preparing',
        'ready_to_ship',
        'shipped',
        'delivered',
        'cancelled',
      ],
    );
  });

  it('la distribución de pagos publica los siete estados del pago', () => {
    expect(
      contract.components.schemas.DashboardPaymentStatusCountDto.properties.status.enum,
    ).toEqual(['pending', 'processing', 'approved', 'declined', 'voided', 'expired', 'error']);
  });

  /*
   * De aquí sale la frase que la tarjeta escribe: los dos totales pueden no coincidir, y quien
   * administra tiene que saberlo antes de restar y creer que faltan pedidos.
   */
  it('avisa de que los pagos por estado pueden sumar menos que los pedidos', () => {
    expect(
      contract.components.schemas.DashboardSummaryDto.properties.paymentsByStatus.description,
    ).toContain('can add up to less than ordersByStatus');
  });

  /* Los pedidos recientes viajan dentro del resumen: no hay que pedir cada uno. */
  it('el resumen trae los pedidos recientes con la proyección del listado', () => {
    const recent = contract.components.schemas.DashboardSummaryDto.properties.recentOrders;

    expect(recent.items).toEqual({ $ref: '#/components/schemas/AdminOrderSummaryDto' });
    expect(recent.description).toContain('The last 8 orders created');
  });

  /* El nombre y la imagen del producto son los de la venta, no los del catálogo de hoy. */
  it('los productos más vendidos usan la instantánea histórica', () => {
    const product = contract.components.schemas.DashboardTopProductDto;

    expect([...product.required].sort()).toEqual([
      'approvedRevenueCop',
      'imageUrl',
      'name',
      'productId',
      'units',
    ]);
    expect(product.properties.name.description).toContain('never read from the current catalogue');
    expect(product.properties.imageUrl.nullable).toBe(true);
  });

  /*
   * Los cinco avisos de atención, con las dos limitaciones que la pantalla tiene que explicar: el
   * inventario bajo no cubre variantes, y la outbox no tiene listado.
   */
  it('publica los seis contadores de atención con sus límites', () => {
    const attention = contract.components.schemas.DashboardAttentionDto;

    expect([...attention.required].sort()).toEqual([
      'failedNotifications',
      'lowStockProducts',
      'paymentIncidents',
      'pendingPayments',
      'readyToShipOrders',
      'staleProcessingPayments',
    ]);
    expect(attention.properties.lowStockProducts.description).toContain(
      'Products that sell through variants are NOT counted',
    );
  });

  /* El período resuelto lo devuelve el backend: el panel no calcula ni una fecha. */
  it('el período resuelto trae su rango y el de comparación', () => {
    expect([...contract.components.schemas.DashboardPeriodDto.required].sort()).toEqual([
      'from',
      'kind',
      'previousFrom',
      'previousTo',
      'to',
    ]);
  });

  /*
   * La fecha real de la venta. El dashboard le atribuye los ingresos, y la ficha del pedido la
   * enseña para que las dos pantallas cuenten lo mismo.
   */
  it('el pago publica cuándo se aprobó por primera vez', () => {
    const approvedAt = contract.components.schemas.OrderPaymentDto.properties.approvedAt;

    expect(contract.components.schemas.OrderPaymentDto.required).toContain('approvedAt');
    expect(approvedAt.nullable).toBe(true);
    expect(approvedAt.description).toContain('This is the real date of the sale');
  });
});

describe('catálogo de categorías', () => {
  const CATEGORY_PATHS = Object.entries(contract.paths).filter(([path]) =>
    path.startsWith('/v1/admin/product-categories'),
  );

  it('publica exactamente las cinco operaciones que el panel usa', () => {
    const operations = CATEGORY_PATHS.flatMap(([path, node]) =>
      ['get', 'post', 'patch', 'put', 'delete']
        .filter((method) => method in (node as object))
        .map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(operations.sort()).toEqual([
      'GET /v1/admin/product-categories',
      'POST /v1/admin/product-categories',
      'POST /v1/admin/product-categories/{categoryId}/archive',
      'POST /v1/admin/product-categories/{categoryId}/reactivate',
      'POST /v1/admin/product-categories/{categoryId}/rename',
    ]);
  });

  /*
   * La primera versión del contrato no declaraba `categoryId`: `openapi-fetch` no podía
   * sustituirlo y las tres operaciones eran inalcanzables. El backend lo corrigió; esto impide que
   * vuelva a pasar sin que nadie lo note.
   */
  it.each(['archive', 'reactivate', 'rename'])(
    '%s declara categoryId como parámetro de ruta obligatorio',
    (operation) => {
      const node = (contract.paths as Record<string, unknown>)[
        `/v1/admin/product-categories/{categoryId}/${operation}`
      ] as {
        post: { parameters?: { name: string; in: string; required?: boolean }[] };
      };

      expect(
        node.post.parameters?.find((parameter) => parameter.name === 'categoryId'),
      ).toMatchObject({ in: 'path', required: true });
    },
  );

  it('las tres mutaciones sobre una categoría existente exigen expectedVersion', () => {
    const schemas = contract.components.schemas as Record<string, { required?: string[] }>;

    expect(schemas.RenameProductCategoryRequestDto?.required).toEqual(
      expect.arrayContaining(['name', 'expectedVersion']),
    );
    expect(schemas.ProductCategoryTransitionRequestDto?.required).toEqual(['expectedVersion']);
  });

  it('el listado solo filtra por estado y pagina por cursor: no hay buscador', () => {
    const list = (
      contract.paths['/v1/admin/product-categories'] as {
        get: { parameters: { name: string }[] };
      }
    ).get;

    expect(list.parameters.map((parameter) => parameter.name).sort()).toEqual([
      'pageSize',
      'pageToken',
      'status',
    ]);
  });

  it('los contadores de productos son nullable: null no es cero', () => {
    const category = (contract.components.schemas as Record<string, unknown>)
      .ProductCategoryDto as {
      properties: Record<string, { nullable?: boolean }>;
    };

    expect(category.properties.assignedProducts?.nullable).toBe(true);
    expect(category.properties.activeProducts?.nullable).toBe(true);
  });
});
