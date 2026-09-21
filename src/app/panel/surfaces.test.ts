import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { describePaymentStatus } from '@/features/panel/payment-status';
import { orderStatusVariant } from '@/features/panel/order-status';
import { NAVIGATION } from '@/features/panel/navigation';

/**
 * Las superficies del panel contra el contrato y contra las referencias visuales.
 *
 * Las referencias definen el lenguaje visual, no lo que el panel puede afirmar. Traen métricas,
 * buscadores, filtros, columnas y paginación numérica que el backend no publica, y la tentación de
 * «dejarlo puesto y rellenarlo luego» es exactamente lo que estas pruebas impiden.
 *
 * La comprobación es **estática**: se leen el código fuente y la copia comiteada de OpenAPI. Es
 * más fuerte que renderizar, porque detecta el adorno aunque nadie abra la pantalla, y varias
 * expectativas se **derivan del contrato**, así que el día que el backend publique un campo la
 * prueba avisa en vez de quedarse callada.
 */

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

type Contract = {
  readonly paths: Record<string, unknown>;
  readonly components: {
    readonly schemas: Record<
      string,
      { readonly properties?: Record<string, unknown>; readonly required?: readonly string[] }
    >;
  };
};

const CONTRACT = JSON.parse(read('openapi/backend-v1.json')) as Contract;
const CONTRACT_PATHS = CONTRACT.paths;

function schema(name: string): { readonly properties?: Record<string, unknown> } {
  const found = CONTRACT.components.schemas[name];

  if (found === undefined) {
    throw new Error(`El contrato no publica ${name}.`);
  }

  return found;
}

function publishes(name: string, property: string): boolean {
  return Object.hasOwn(schema(name).properties ?? {}, property);
}

/** Valores del enum `status` de un esquema del contrato. */
function statusEnum(name: string): readonly string[] {
  const status = (schema(name).properties ?? {}).status as { readonly enum?: readonly string[] };

  return status.enum ?? [];
}

const ORDERS_LIST = read('src/app/panel/pedidos/page.tsx');
const ORDERS_TABLE = read('src/features/panel/orders-table.tsx');
const ORDERS_CARD = read('src/features/panel/order-mobile-card.tsx');
const PRODUCTS_LIST = read('src/app/panel/productos/page.tsx');
const PRODUCTS_TABLE = read('src/features/panel/products-table.tsx');
const PRODUCTS_CARD = read('src/features/panel/product-mobile-card.tsx');
const ORDER_DETAIL = read('src/features/panel/order-detail-view.tsx');
const ORDER_CARDS = read('src/features/panel/order-detail-cards.tsx');
const SIMULATOR = read('src/features/panel/payment-simulator.tsx');
const CHROME = read('src/features/panel/panel-chrome.tsx');
const HEADER = read('src/features/panel/panel-header.tsx');
const DASHBOARD = read('src/app/panel/page.tsx');
const DASHBOARD_PANELS = read('src/features/panel/dashboard-panels.tsx');
const DASHBOARD_METRICS = read('src/features/panel/dashboard-metrics-cards.tsx');
const DASHBOARD_CHART = read('src/features/panel/dashboard-sales-chart.tsx');
const DASHBOARD_RECENT = read('src/features/panel/dashboard-recent-orders.tsx');
const INTEGRATIONS_LIST = read('src/app/panel/configuracion/integraciones/page.tsx');
const WOMPI_PAGE = read('src/app/panel/configuracion/integraciones/wompi/page.tsx');
const INCIDENTS_PAGE = read('src/app/panel/configuracion/integraciones/incidencias/page.tsx');
const INTEGRATION_CARDS = read('src/features/panel/integration-cards.tsx');
const CREDENTIALS_FORM = read('src/features/panel/wompi-credentials-form.tsx');

/** Lo que se pinta, sin los comentarios que explican por qué algo **no** está. */
function rendered(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('shell', () => {
  it('la navegación solo lleva a rutas que existen', () => {
    expect(NAVIGATION.map((item) => item.href)).toEqual([
      '/panel',
      '/panel/pedidos',
      '/panel/productos',
      '/panel/envios',
      '/panel/wallet',
      '/panel/configuracion',
    ]);
  });

  /*
   * La referencia lista Carritos abandonados, Categorías, Inventario, Clientes, Cupones, Banners,
   * Colecciones, Media/Assets, Home, Usuarios administrativos, Configuración y Perfil. Ninguna
   * tiene ruta ni contrato: un enlace a algo que no existe convierte la navegación en una promesa.
   */
  it.each([
    'Carritos abandonados',
    'Categorías',
    'Clientes',
    'Cupones',
    'Banners',
    'Colecciones',
    'Media',
    'Usuarios administrativos',
    'Perfil',
  ])('no anuncia «%s», que no tiene ruta', (label) => {
    expect(NAVIGATION.map((item) => item.label)).not.toContain(label);
    expect(rendered(CHROME)).not.toContain(label);
  });

  /*
   * La cabecera de la referencia trae un buscador global, una campana y un contador de avisos.
   * Ninguno tiene superficie en OpenAPI, y un contador fijo es un dato inventado.
   */
  it.each(['Buscar pedido', 'Buscar producto', 'notificacion', 'Notificacion'])(
    'la cabecera no monta «%s»',
    (needle) => {
      expect(rendered(HEADER)).not.toContain(needle);
    },
  );

  it('la persona se identifica por su rol, nunca con un nombre inventado', () => {
    expect(rendered(HEADER)).toContain('describeRole');
    expect(rendered(HEADER)).not.toContain('Administrador<');
  });

  it('el cajón se puede cerrar con el teclado', () => {
    expect(CHROME).toContain("'Escape'");
  });
});

describe('listado de productos', () => {
  /*
   * La referencia encabeza el listado con cuatro tarjetas —Publicados, Borradores, Archivados y
   * Sin stock— y su variación mensual. `GET /v1/admin/products` devuelve una página: contarla
   * daría el número de esa página, no el del catálogo, y se leería como si fuera el total.
   */
  it.each(['vs. mes anterior', 'Resumen del catálogo', 'Acciones sugeridas', 'Filtros rápidos'])(
    'no monta «%s»',
    (needle) => {
      expect(rendered(PRODUCTS_LIST)).not.toContain(needle);
    },
  );

  it('no ofrece exportación, que no tiene endpoint', () => {
    expect(rendered(PRODUCTS_LIST)).not.toContain('Exportar');
  });

  it('no monta un buscador ni filtros que el contrato no admite', () => {
    const source = rendered(PRODUCTS_LIST) + rendered(PRODUCTS_TABLE);

    expect(source).not.toContain('<input');
    expect(source).not.toContain('<select');
  });

  it('no hay selección múltiple sin acciones por lote', () => {
    expect(rendered(PRODUCTS_TABLE)).not.toContain('type="checkbox"');
  });

  /*
   * La referencia añade una columna «Visibilidad». `AdminProductDto` no la publica, y dejarla
   * vacía para parecerse al diseño sería peor que no tenerla.
   */
  it('no pinta una columna que el contrato no publica', () => {
    expect(publishes('AdminProductDto', 'visibility')).toBe(false);
    expect(rendered(PRODUCTS_TABLE)).not.toContain('Visibilidad');
  });

  it('la tarjeta de móvil conserva los datos de la fila', () => {
    for (const needle of ['SKU', 'formatCop', 'StatusBadge', 'StockCell', 'category']) {
      expect(rendered(PRODUCTS_CARD), needle).toContain(needle);
    }
  });

  it('«Actualizar» recarga de verdad', () => {
    expect(rendered(PRODUCTS_LIST)).toContain('RefreshButton');
    expect(rendered(read('src/features/panel/refresh-button.tsx'))).toContain('router.refresh()');
  });
});

describe('listado de pedidos', () => {
  it.each([
    'Total pedidos',
    'vs. mes anterior',
    'Últimos 30 días',
    'Exportar',
    'requieren atención',
    'Últimos pedidos',
  ])('no monta «%s»', (needle) => {
    expect(rendered(ORDERS_LIST)).not.toContain(needle);
  });

  it('no monta chips de filtro por estado con sus conteos', () => {
    const source = rendered(ORDERS_LIST) + rendered(ORDERS_TABLE);

    expect(source).not.toContain('Pendientes (');
    expect(source).not.toContain('Confirmados (');
  });

  it('no hay selección múltiple sin acciones por lote', () => {
    expect(rendered(ORDERS_TABLE)).not.toContain('type="checkbox"');
  });

  /*
   * La columna «Pago» existe exactamente cuando el resumen publica `paymentStatus`. La expectativa
   * se deriva del contrato: si el backend lo retirara, la prueba pediría quitar la columna en vez
   * de dejarla pintando un hueco.
   */
  it('la columna de pago existe exactamente cuando el resumen la publica', () => {
    const inContract = publishes('AdminOrderSummaryDto', 'paymentStatus');

    expect(inContract).toBe(true);
    expect(rendered(ORDERS_TABLE).includes('>Pago<')).toBe(inContract);
  });

  /* Pago y Estado son dos lecturas distintas y van en dos columnas distintas. */
  it('mantiene separadas las columnas de pago y de estado', () => {
    const table = rendered(ORDERS_TABLE);

    expect(table).toContain('>Pago<');
    expect(table).toContain('>Estado<');
    expect(table).toContain('order.paymentStatus');
    expect(table).toContain('order.statusLabel');
  });

  /*
   * El texto del estado del pedido es el que manda el backend. El panel elige el color y nada más:
   * el contrato avisa de que la etiqueta del hito y la del estado no coinciden siempre y de que esa
   * regla «cannot be derived from the enum».
   */
  it('el texto del estado sale de statusLabel, no de una traducción del panel', () => {
    expect(publishes('AdminOrderSummaryDto', 'statusLabel')).toBe(true);
    expect(rendered(ORDERS_TABLE)).toContain('label={order.statusLabel}');
  });

  it('la lista no pide la ficha de ningún pedido para pintar la tabla', () => {
    const source = rendered(ORDERS_LIST) + rendered(ORDERS_TABLE) + rendered(ORDERS_CARD);

    expect(source).not.toContain('getOrder');
    expect(source).not.toContain('listProducts');
  });

  /* Ni tarjeta, ni entidad, ni referencia: el resumen publica el estado del pago y nada más. */
  it('no inventa un método de pago en el listado', () => {
    const source = rendered(ORDERS_TABLE) + rendered(ORDERS_CARD);

    for (const needle of ['Visa', 'Tarjeta', 'Método de pago', 'Transferencia']) {
      expect(source, needle).not.toContain(needle);
    }
  });

  it('no muestra el correo del cliente, que el resumen no publica', () => {
    expect(publishes('AdminOrderSummaryDto', 'customerEmail')).toBe(false);
    expect(rendered(ORDERS_TABLE)).not.toContain('email');
    expect(rendered(ORDERS_CARD)).not.toContain('email');
  });

  it('el identificador visible es el público, nunca el interno', () => {
    expect(rendered(ORDERS_TABLE)).toContain('{order.publicId}');
    expect(rendered(ORDERS_TABLE)).not.toContain('{order.id}<');
  });

  it('la miniatura sale de la instantánea del pedido, no del catálogo', () => {
    expect(rendered(ORDERS_TABLE)).toContain('previewLine');
    expect(rendered(ORDERS_TABLE)).not.toContain('listProducts');
  });

  it('la tarjeta de móvil conserva los datos de la fila, incluidos los dos estados', () => {
    for (const needle of [
      'publicId',
      'customerName',
      'previewLine',
      'formatCop',
      'createdAt',
      'PaymentStatusBadge',
      'OrderStatusBadge',
    ]) {
      expect(rendered(ORDERS_CARD), needle).toContain(needle);
    }
  });
});

describe('paginación por cursor', () => {
  /*
   * El contrato devuelve un cursor opaco: se puede avanzar, pero no saltar a una página concreta
   * ni saber cuántas hay. Una paginación numérica anunciaría un total que nadie calculó.
   */
  it.each([
    ['productos', PRODUCTS_LIST],
    ['pedidos', ORDERS_LIST],
  ])('%s avanza con el cursor y no numera páginas', (_name, source) => {
    const visible = rendered(source);

    expect(visible).toContain('nextPageToken');
    expect(visible).not.toContain('por página');
    expect(visible).not.toMatch(/de\s+\{[^}]*total/i);
  });
});

describe('detalle del pedido', () => {
  it.each([
    'Contactar cliente',
    'Imprimir pedido',
    'Ver perfil',
    'Ver en mapa',
    'Notas internas',
    'Observaciones del cliente',
    'Canal de venta',
  ])('no monta «%s», que no tiene contrato', (needle) => {
    expect(rendered(ORDER_DETAIL) + rendered(ORDER_CARDS)).not.toContain(needle);
  });

  /*
   * El contrato publica `payment`, así que la tarjeta de pago existe. Lo que **no** publica es el
   * método: ni tarjeta, ni cuatro últimos dígitos, ni referencia bancaria, ni fecha de cobro real.
   * Un método de pago inventado en un panel administrativo se toma por bueno.
   */
  it('publica el pago y el panel lo muestra sin inventar el método', () => {
    expect(publishes('AdminOrderDto', 'payment')).toBe(true);

    const source = rendered(ORDER_DETAIL) + rendered(ORDER_CARDS);

    expect(source).toContain('Información de pago');
    expect(source).toContain('payment.statusLabel');

    for (const needle of [
      'Tarjeta de crédito',
      'Visa',
      'Transferencia',
      'Método de pago',
      'últimos cuatro',
      'Referencia bancaria',
    ]) {
      expect(source, needle).not.toContain(needle);
    }
  });

  /* `sandbox` significa que no hubo cobro, y eso se dice con todas las letras. */
  it('dice que una simulación no es un cobro', () => {
    const source = rendered(ORDER_CARDS) + rendered(SIMULATOR);

    expect(source).toContain('Simulación');
    expect(source).toContain('No se realiz');
  });

  /*
   * El historial de pago muestra lo que se puede mostrar. El `eventId` y el `source` técnico no
   * aportan nada a quien administra y sí enseñan interioridades.
   */
  it('el historial de pago no enseña identificadores ni el origen técnico', () => {
    const cards = rendered(ORDER_CARDS);

    expect(cards).toContain('event.label');
    expect(cards).not.toContain('event.eventId');
    expect(cards).not.toContain('event.source');
  });

  it('no inventa un descuento que el contrato no publica', () => {
    expect(publishes('AdminOrderDto', 'discountCop')).toBe(false);
    expect(rendered(ORDER_CARDS)).not.toContain('Descuento');
  });

  it('los atributos de la línea son los que trae la instantánea', () => {
    expect(rendered(ORDER_CARDS)).toContain('line.attributes');
    // Sin hueco reservado para un color o una medida que esta línea pudo no tener.
    expect(rendered(ORDER_CARDS)).not.toContain('>Color<');
    expect(rendered(ORDER_CARDS)).not.toContain('>Medida<');
  });

  it('no ofrece un selector libre de estados', () => {
    expect(rendered(read('src/features/panel/order-actions-bar.tsx'))).not.toContain('<select');
  });
});

describe('simulador de pago', () => {
  /*
   * Tres condiciones a la vez, y las tres vienen de fuera: el despliegue lo declara, el backend
   * dice qué resultados caben, y la matriz explícita dice quién puede.
   */
  it('exige las tres condiciones antes de pintarse', () => {
    const source = rendered(SIMULATOR);

    expect(source).toContain('order.paymentSimulationEnabled');
    expect(source).toContain('order.availableSimulationEvents.length === 0');
    expect(source).toContain("can(role, 'payments.simulate')");
  });

  /* Los botones son los que manda el backend. El panel no reimplementa la máquina de estados. */
  it('deriva los botones de availableSimulationEvents y no de una tabla local', () => {
    const source = rendered(SIMULATOR);

    expect(source).toContain('order.availableSimulationEvents.map');
    expect(source).not.toContain('<select');
  });

  /* Sin `expectedVersion` dos personas simulando el mismo pedido se pisarían. */
  it('envía el evento, la versión y el identificador idempotente', () => {
    const client = rendered(read('src/features/panel/orders-client.ts'));

    expect(client).toContain('payment-simulation');
    expect(client).toContain('expectedVersion');
    expect(client).toContain('eventId');
  });

  /*
   * El `eventId` vive en memoria. Guardarlo en `localStorage` o en la URL lo haría sobrevivir a la
   * pantalla, y un identificador idempotente reutilizado fuera de su operación deja de proteger.
   */
  it('el identificador idempotente no se guarda en ningún almacén del navegador', () => {
    const source = rendered(SIMULATOR);

    expect(source).toContain('crypto.randomUUID()');
    expect(source).toContain('useRef');

    for (const needle of ['localStorage', 'sessionStorage', 'document.cookie', 'searchParams']) {
      expect(source, needle).not.toContain(needle);
    }
  });

  /* El backend no admite un motivo libre y el panel no lo inventa. */
  it('no manda un reasonCode escrito a mano', () => {
    const source = rendered(SIMULATOR) + rendered(read('src/features/panel/order-input.ts'));

    expect(rendered(SIMULATOR)).not.toContain('<textarea');
    expect(source).not.toContain('body.reasonCode');
  });
});

describe('notificaciones del pedido', () => {
  const CARDS = rendered(ORDER_CARDS);

  /* No hay endpoint de vista previa, de reenvío ni de envío manual: no hay botón. */
  it.each(['Reenviar', 'Vista previa del correo', 'Enviar de nuevo', 'Enviar correo'])(
    'no monta «%s», que no tiene endpoint',
    (needle) => {
      expect(CARDS).not.toContain(needle);
    },
  );

  it('la tarjeta de avisos no monta ningún control', () => {
    const card = CARDS.slice(CARDS.indexOf('OrderNotificationsCard'));

    expect(card.slice(0, card.indexOf('OrderActivityCard'))).not.toContain('<button');
  });

  /*
   * Las tres confusiones que el contrato señala. Cada una lleva su frase, no solo un color: un
   * `previewed` pintado de verde se lee como enviado.
   */
  it.each([
    ['previewed', 'No se envió un correo'],
    ['suppressed', 'El envío estaba deshabilitado'],
    ['failed', 'El pedido se actualizó'],
  ])('%s lleva su explicación', (_status, needle) => {
    expect(read('src/features/panel/notification-labels.ts')).toContain(needle);
  });

  /* El contrato no publica destinatario ni cuerpo, y el panel no los pide. */
  it('no muestra destinatarios ni cuerpos', () => {
    const notification = schema('AdminNotificationDto').properties ?? {};

    expect(Object.keys(notification)).not.toContain('recipient');
    expect(Object.keys(notification)).not.toContain('body');

    for (const needle of ['recipient', 'Destinatario', 'body', 'Asunto']) {
      expect(CARDS, needle).not.toContain(needle);
    }
  });

  /* El correo de «Listo para envío» lo escribe el backend al confirmar la transición. */
  it('nombra order_ready_to_ship con su etiqueta', () => {
    const published: readonly string[] = (
      (schema('AdminNotificationDto').properties ?? {}).eventKey as { enum: readonly string[] }
    ).enum;

    expect(published).toContain('order_ready_to_ship');
    expect(read('src/features/panel/notification-labels.ts')).toContain(
      "order_ready_to_ship: 'Listo para envío'",
    );
  });
});

describe('vocabulario de estados, derivado del contrato', () => {
  /*
   * El panel **ya no traduce** los estados del pedido: el contrato publica la etiqueta en
   * `statusLabel` y, hito a hito, en `timeline[].label`. Mantener una segunda tabla completa
   * garantizaba que el panel y la tienda acabaran diciendo cosas distintas del mismo pedido, y el
   * propio contrato avisa de que la etiqueta del hito no se deduce del enum.
   */
  it('no conserva una tabla local de etiquetas del pedido', () => {
    const source = read('src/features/panel/order-status.ts');
    const published = statusEnum('AdminOrderDto');

    expect(published.length).toBeGreaterThan(0);

    for (const status of published) {
      expect(source, status).not.toContain(`${status}: '`);
    }
  });

  /* Lo que sí decide el panel es el color, y lo decide para **todos** los estados publicados. */
  it('tiene una variante visual para cada estado publicado', () => {
    for (const status of statusEnum('AdminOrderDto')) {
      expect(orderStatusVariant(status), status).not.toBe('unknown');
    }
  });

  /*
   * El pago sí lleva mapa: `AdminOrderSummaryDto` publica `paymentStatus` **sin** etiqueta, y una
   * fila de la lista no puede pedir la ficha para traducirlo.
   */
  it('nombra cada estado de pago publicado, y ninguno inventado', () => {
    const published = statusEnum('OrderPaymentDto');

    expect(published.length).toBeGreaterThan(0);

    for (const status of published) {
      expect(describePaymentStatus(status), status).not.toBe(status);
    }

    const labelled = [
      ...read('src/features/panel/payment-status.ts').matchAll(/^ {2}(\w+): '/gm),
    ].map((match) => match[1]);
    const declared = labelled.slice(0, published.length);

    expect([...declared].sort()).toEqual([...published].sort());
  });

  it('los hitos del recorrido se apoyan en valores que el contrato publica', () => {
    const orderStatuses = new Set(statusEnum('AdminOrderDto'));
    const paymentStatuses = new Set(statusEnum('AdminPaymentEventDto'));
    const journey = read('src/features/panel/order-journey.ts');

    const declared = [...journey.matchAll(/kind: '(order|payment)', status: '(\w+)'/g)].map(
      (match) => [match[1] as string, match[2] as string] as const,
    );

    expect(declared).toHaveLength(7);

    for (const [kind, status] of declared) {
      const published = kind === 'order' ? orderStatuses : paymentStatuses;

      expect(published.has(status), `${kind}/${status}`).toBe(true);
    }
  });

  /*
   * Las transiciones que ofrece el panel son exactamente las que el contrato admite. La lista sale
   * de la descripción del endpoint, así que el día que el backend cambie la máquina de estados
   * esto falla aquí en vez de fallar al pulsar.
   */
  it('no ofrece la transición que el contrato retiró', () => {
    const description = (
      CONTRACT_PATHS['/v1/admin/orders/{orderId}/status'] as {
        readonly post: { readonly description: string };
      }
    ).post.description;

    expect(description).toContain('preparing→shipped is rejected');

    const actions = read('src/features/panel/order-actions.ts');

    expect(actions).toContain("preparing: 'ready_to_ship'");
    expect(actions).not.toContain("preparing: 'shipped'");
  });
});

describe('dashboard', () => {
  const SOURCES =
    rendered(DASHBOARD) +
    rendered(DASHBOARD_PANELS) +
    rendered(DASHBOARD_METRICS) +
    rendered(DASHBOARD_CHART) +
    rendered(DASHBOARD_RECENT);

  /*
   * Una sola operación. El resumen no se compone pidiendo pedidos y productos por separado: el
   * contrato lo publica entero, y componerlo aquí daría cifras distintas de las del backend.
   */
  it('consume exactamente el endpoint del resumen', () => {
    expect(rendered(DASHBOARD)).toContain('getDashboardSummary');
    expect(CONTRACT_PATHS).toHaveProperty(['/v1/admin/dashboard/summary']);
  });

  it('no deriva las ventas del listado de pedidos ni del catálogo', () => {
    for (const forbidden of ['listOrders', 'listProducts', 'getOrder', 'getProduct']) {
      expect(SOURCES, forbidden).not.toContain(forbidden);
    }
  });

  /* La pantalla es un Server Component: el navegador no llama al backend ni a un BFF. */
  it('no es un Client Component ni usa fetch', () => {
    expect(DASHBOARD.startsWith("'use client'")).toBe(false);
    expect(DASHBOARD_PANELS.startsWith("'use client'")).toBe(false);
    expect(DASHBOARD_CHART.startsWith("'use client'")).toBe(false);
    expect(SOURCES).not.toContain('fetch(');
    expect(SOURCES).not.toContain('useState');
  });

  it('se renderiza siempre en el servidor y sin caché', () => {
    expect(DASHBOARD).toContain("export const dynamic = 'force-dynamic'");
    expect(DASHBOARD).toContain("export const fetchCache = 'force-no-store'");
  });

  /*
   * Las referencias de diseño enseñan proveedores de pago, integraciones y metas de venta. Ninguno
   * está en el contrato, y un nombre de proveedor en un panel administrativo se toma por una
   * integración que existe.
   */
  it.each(['Wompi', 'Addi', 'Odoo', 'PayU', 'Mercado Pago', 'Integraciones', 'Meta de ventas'])(
    'no menciona «%s»',
    (needle) => {
      expect(SOURCES, needle).not.toContain(needle);
    },
  );

  /* El Dashboard ya no es una portada de secciones pendientes: enseña datos reales. */
  it('no anuncia nada como «Próximamente»', () => {
    expect(SOURCES).not.toContain('Próximamente');
    expect(SOURCES).not.toContain('ComingSoon');
  });

  /*
   * Los enlaces del Dashboard solo pueden llevar a pantallas que existen. La lista de rutas sale
   * del árbol de `src/app`, así que inventar una ruta falla aquí y no en producción.
   */
  it('todos los enlaces llevan a rutas que existen', () => {
    // Una plantilla `/panel/pedidos/${id}` se corta en el `$`: lo que se comprueba es la parte
    // literal, que es la que fija la ruta.
    const hrefs = [...SOURCES.matchAll(/href=\{?["'`]([^"'`{}$]+)/g)]
      .map((match) => match[1] as string)
      .filter((href) => href.startsWith('/'));

    expect(hrefs.length).toBeGreaterThan(0);

    const ROUTES = [
      '/panel',
      '/panel/pedidos',
      '/panel/pedidos/',
      '/panel/productos',
      '/panel/productos/',
    ];

    for (const href of hrefs) {
      expect(ROUTES.includes(href) || href.startsWith('/panel?period='), href).toBe(true);
    }
  });

  /* Sin filtros en la URL: el listado no los admite, y prometerlos sería mentir. */
  it('no construye filtros que el listado no soporta', () => {
    expect(SOURCES).not.toContain('/panel/pedidos?');
    expect(SOURCES).not.toContain('/panel/productos?');
  });

  /* Las métricas se leen del contrato; ninguna se compone en el panel. */
  it('las cinco métricas salen de commerce', () => {
    const commerce = Object.keys(schema('DashboardCommerceDto').properties ?? {});

    expect(commerce.sort()).toEqual([
      'approvedOrders',
      'approvedSales',
      'averageOrderValue',
      'createdOrders',
      'unitsSold',
    ]);

    for (const key of commerce) {
      expect(rendered(DASHBOARD_METRICS), key).toContain(`commerce.${key}`);
    }
  });

  /* `truncated` se publica para verse. Esconderlo convertiría un mínimo en un total. */
  it('la advertencia de lectura truncada no se puede ocultar', () => {
    expect(Object.keys(schema('DashboardSummaryDto').properties ?? {})).toContain('truncated');
    expect(rendered(DASHBOARD)).toContain('summary.truncated');
    expect(rendered(DASHBOARD_METRICS)).toContain('límite de lectura');
  });

  it('el gráfico no añade una librería de gráficas', () => {
    expect(rendered(DASHBOARD_CHART)).toContain('<svg');
    expect(DASHBOARD_CHART).not.toContain("from 'recharts'");
    expect(DASHBOARD_CHART).not.toContain("from 'chart.js'");
    expect(DASHBOARD_CHART).not.toContain("from 'd3'");
  });

  /*
   * Un tooltip que solo aparece al pasar el ratón deja fuera a quien navega con teclado y a quien
   * usa una pantalla táctil. La lectura exacta vive en la tabla, que está a la vista.
   */
  it('el gráfico no depende de un tooltip de ratón', () => {
    expect(rendered(DASHBOARD_CHART)).not.toContain('onMouseOver');
    expect(rendered(DASHBOARD_CHART)).not.toContain('onMouseMove');
    expect(rendered(DASHBOARD_CHART)).toContain('Ver los valores por día');
  });

  it('el rol de la sesión no es el contenido central', () => {
    expect(rendered(DASHBOARD)).not.toContain('describeRole');
  });
});

describe('integraciones', () => {
  const SOURCES =
    rendered(INTEGRATIONS_LIST) +
    rendered(WOMPI_PAGE) +
    rendered(INCIDENTS_PAGE) +
    rendered(INTEGRATION_CARDS) +
    rendered(CREDENTIALS_FORM);

  /*
   * La regla estructural de toda la superficie: el navegador habla con el BFF y el BFF con el
   * backend. Una llamada directa a Wompi necesitaría la llave privada en el cliente; una a
   * Firestore o a Secret Manager rompería la frontera entera y además el panel no tiene ni
   * credenciales para hacerla.
   */
  it.each([
    'wompi.co',
    'sandbox.wompi.co',
    'checkout.wompi.co',
    'googleapis.com',
    'secretmanager',
    'firebase/firestore',
    'getFirestore',
  ])('ninguna pantalla llama a «%s»', (needle) => {
    expect(SOURCES, needle).not.toContain(needle);
  });

  /* Las páginas son Server Components: la lectura sale del servidor con la sesión de la persona. */
  it('las tres páginas se renderizan en el servidor y sin caché', () => {
    for (const source of [INTEGRATIONS_LIST, WOMPI_PAGE, INCIDENTS_PAGE]) {
      expect(source.startsWith("'use client'")).toBe(false);
      expect(source).toContain("export const dynamic = 'force-dynamic'");
      expect(source).toContain("export const fetchCache = 'force-no-store'");
    }
  });

  /* El permiso se comprueba en cada pantalla, y el backend lo vuelve a exigir por su cuenta. */
  it('las tres exigen integrations.read antes de leer nada', () => {
    for (const source of [INTEGRATIONS_LIST, WOMPI_PAGE, INCIDENTS_PAGE]) {
      expect(rendered(source)).toContain("can(role, 'integrations.read')");
    }
  });

  it('las acciones se reservan a integrations.manage', () => {
    for (const source of [INTEGRATIONS_LIST, WOMPI_PAGE, INCIDENTS_PAGE]) {
      expect(rendered(source)).toContain("can(role, 'integrations.manage')");
    }
  });

  /*
   * La URL de eventos la deriva el backend. Componerla aquí con el origen del navegador la ataría
   * a desde dónde se abrió el panel, y un panel abierto por un túnel local configuraría en Wompi
   * una URL que no existe fuera de esa máquina.
   */
  it('la URL de eventos viene del backend y no se construye', () => {
    expect(rendered(WOMPI_PAGE)).toContain('sandbox.webhookUrl');
    expect(rendered(WOMPI_PAGE)).not.toContain('window.location');
    expect(rendered(WOMPI_PAGE)).not.toContain('NEXT_PUBLIC');
  });

  /* Producción tiene sección, y no tiene formulario: el backend rechazaría cualquier PATCH suyo. */
  it('producción se muestra bloqueada y sin formulario', () => {
    const wompi = rendered(WOMPI_PAGE);

    expect(wompi).toContain('Producción');
    expect(wompi).toContain('livePaymentsEnabled');
    expect(wompi).not.toContain("environment: 'production'");
  });

  /* Addi se anuncia y no ejecuta nada. */
  it('Addi no llama a ningún endpoint', () => {
    const cards = rendered(INTEGRATION_CARDS);
    const addi = cards.slice(cards.indexOf('AddiProviderCard'));

    expect(addi).toContain('Pendiente de integración');
    expect(addi).not.toContain('fetch(');
    expect(addi).not.toContain('/api/admin');
  });

  /* Ninguna variable pública puede llevar credenciales, ni aquí ni en ninguna parte. */
  it('no usa variables NEXT_PUBLIC en esta superficie', () => {
    expect(SOURCES).not.toContain('NEXT_PUBLIC');
  });

  /* Ni el panel ni el contrato guardan la llave entera: solo la versión enmascarada. */
  it('la llave pública solo se lee enmascarada', () => {
    expect(rendered(WOMPI_PAGE)).toContain('publicKeyMasked');
    expect(publishes('WompiEnvironmentConfigDto', 'publicKey')).toBe(false);
  });

  /* Los tres campos secretos son writeOnly en el contrato: si dejaran de serlo, esto lo dice. */
  it.each(['privateKey', 'eventsSecret', 'integritySecret', 'publicKey'])(
    '%s es writeOnly en el contrato',
    (field) => {
      const properties = schema('UpdateWompiIntegrationRequestDto').properties ?? {};
      const property = properties[field] as { writeOnly?: boolean } | undefined;

      expect(property?.writeOnly, field).toBe(true);
    },
  );

  /* Y el contrato no los devuelve por ninguna otra vía. */
  it.each(['privateKey', 'eventsSecret', 'integritySecret'])(
    'la respuesta no publica %s',
    (field) => {
      expect(publishes('WompiEnvironmentConfigDto', field)).toBe(false);
    },
  );

  /* El vocabulario de cierre es cerrado: si el backend admitiera texto libre, esto lo dice. */
  it('el cierre de una incidencia no admite texto libre', () => {
    const properties = schema('ResolvePaymentIncidentRequestDto').properties ?? {};
    const code = properties.resolutionCode as { enum?: readonly string[] } | undefined;

    expect(code?.enum).toHaveLength(5);
    expect(Object.keys(properties).sort()).toEqual(['expectedVersion', 'resolutionCode']);
  });

  /* La incidencia no publica datos personales, y la pantalla no los reconstruye. */
  it.each(['customerEmail', 'payload', 'signature', 'checksum', 'amountInCents'])(
    'la incidencia no publica %s',
    (field) => {
      expect(publishes('PaymentIncidentDto', field)).toBe(false);
    },
  );
});
