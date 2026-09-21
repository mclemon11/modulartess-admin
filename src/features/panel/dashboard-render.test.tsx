import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CustomRangeForm,
  PeriodSelector,
  ResolvedPeriod,
  SalesEnvironmentBanner,
} from './dashboard-controls';
import { DashboardMetrics, TruncatedNotice } from './dashboard-metrics-cards';
import {
  AttentionPanel,
  OperationsPanel,
  StatusDistributionPanel,
  TopProductsPanel,
} from './dashboard-panels';
import { readDashboardRequest } from './dashboard-period';
import { RecentOrdersPanel } from './dashboard-recent-orders';
import { DashboardSalesChart } from './dashboard-sales-chart';
import { formatCop } from './money';

import type {
  DashboardAttention,
  DashboardCommerce,
  DashboardOperations,
  DashboardOrderStatusCount,
  DashboardPaymentStatusCount,
  DashboardSeriesPoint,
  DashboardTopProduct,
} from '@/lib/api/dashboard';
import type { AdminOrderSummary } from '@/lib/api/orders';

/**
 * El Dashboard sobre el HTML que React produce de verdad.
 *
 * No hace falta un DOM: lo que importa es qué llega a pintarse —y qué no—, y eso está en el
 * marcado. Aquí se comprueba lo que un panel de ventas no puede equivocar: presentar una lectura
 * parcial como un total, un `null` como un cero, o una cifra de la fotografía actual como si fuera
 * del período.
 */

function amount(current: number, previous: number, changePercent: number | null) {
  return { currentAmountCop: current, previousAmountCop: previous, changePercent };
}

function count(current: number, previous: number, changePercent: number | null) {
  return { currentCount: current, previousCount: previous, changePercent };
}

const COMMERCE = {
  approvedSales: amount(1450000, 1200000, 20.8),
  createdOrders: count(12, 14, -14.3),
  approvedOrders: count(8, 8, 0),
  unitsSold: count(19, 0, null),
  averageOrderValue: amount(181250, 150000, 20.8),
} as unknown as DashboardCommerce;

const OPERATIONS = {
  pendingPayment: 4,
  paymentProcessing: 1,
  paid: 2,
  preparing: 7,
  readyToShip: 3,
  shipped: 9,
  delivered: 21,
  cancelled: 5,
} as DashboardOperations;

const ATTENTION = {
  pendingPayments: 2,
  staleProcessingPayments: 1,
  readyToShipOrders: 3,
  failedNotifications: 4,
  lowStockProducts: 5,
  paymentIncidents: 2,
} as DashboardAttention;

const ORDERS_BY_STATUS = [
  { status: 'pending_payment', label: 'Pendiente de pago', count: 4 },
  { status: 'paid', label: 'Pedido confirmado', count: 2 },
  { status: 'preparing', label: 'En producción', count: 7 },
  { status: 'ready_to_ship', label: 'Listo para envío', count: 3 },
  { status: 'shipped', label: 'Enviado', count: 9 },
  { status: 'delivered', label: 'Entregado', count: 21 },
  { status: 'cancelled', label: 'Cancelado', count: 5 },
] as unknown as readonly DashboardOrderStatusCount[];

const PAYMENTS_BY_STATUS = [
  { status: 'pending', label: 'Pago pendiente', count: 4 },
  { status: 'processing', label: 'Pago en proceso', count: 1 },
  { status: 'approved', label: 'Pago confirmado', count: 30 },
  { status: 'declined', label: 'Pago rechazado', count: 2 },
  { status: 'expired', label: 'Pago vencido', count: 0 },
  { status: 'error', label: 'Error en el pago', count: 0 },
] as unknown as readonly DashboardPaymentStatusCount[];

function seriesPoint(date: string, amountCop: number): DashboardSeriesPoint {
  return {
    date,
    approvedAmountCop: amountCop,
    approvedOrders: amountCop > 0 ? 1 : 0,
    createdOrders: 2,
  } as DashboardSeriesPoint;
}

function summaryOrder(overrides: Partial<AdminOrderSummary> = {}): AdminOrderSummary {
  return {
    id: 'ord_abc',
    publicId: 'MZ-7KQ2R9DA',
    status: 'preparing',
    statusLabel: 'En producción',
    paymentStatus: 'approved',
    version: 3,
    customerName: 'Ana Pérez',
    itemCount: 2,
    previewLine: {
      name: 'Tocador Aura',
      sku: 'TOCADOR-AURA-80',
      primaryImageUrl: null,
      quantity: 2,
    },
    totalCop: 1450000,
    createdAt: '2026-09-05T15:24:00.000Z',
    updatedAt: '2026-09-05T19:30:00.000Z',
    ...overrides,
  } as AdminOrderSummary;
}

describe('tarjetas comerciales', () => {
  const html = renderToStaticMarkup(<DashboardMetrics commerce={COMMERCE} />);

  it('están las cinco', () => {
    for (const title of [
      'Ventas aprobadas',
      'Pedidos creados',
      'Pedidos pagados',
      'Unidades vendidas',
      'Ticket promedio',
    ]) {
      expect(html, title).toContain(title);
    }
  });

  it('los importes se formatean como pesos, sin «COP»', () => {
    expect(html).toContain(formatCop(1450000));
    expect(html).not.toContain('COP');
  });

  /*
   * Ventas aprobadas y pedidos creados son dos cifras distintas y así se pintan. Confundirlas haría
   * que el panel informara de ventas que nadie cobró.
   */
  it('no confunde las ventas con los pedidos creados', () => {
    expect(html).toContain(formatCop(1450000));
    expect(html).toContain('>12<');
    expect(html).toContain('intenciones de compra, no ventas');
  });

  it('el cambio positivo lleva flecha arriba', () => {
    expect(html).toContain('↑ 20,8 %');
  });

  it('el cambio negativo lleva flecha abajo', () => {
    expect(html).toContain('↓ 14,3 %');
  });

  it('el cambio cero se dice con palabras', () => {
    expect(html).toContain('Sin cambio');
  });

  /* `null` no es cero: es que no hay período anterior con el que comparar. */
  it('null se dice como «Sin base anterior», nunca como 0 %', () => {
    expect(html).toContain('Sin base anterior');
    expect(html).not.toContain('↑ 0,0 %');
    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('NaN');
  });

  it('cada tarjeta dice contra qué se compara', () => {
    expect(html.split('Período anterior:').length - 1).toBe(5);
  });

  /* La dirección va en el texto, no solo en el color de la pastilla. */
  it('la tendencia se dice también en palabras', () => {
    expect(html).toContain('Sube 20,8 % frente al período anterior.');
    expect(html).toContain('Baja 14,3 % frente al período anterior.');
  });
});

describe('advertencia de lectura truncada', () => {
  const html = renderToStaticMarkup(<TruncatedNotice />);

  it('dice que las cifras son mínimos', () => {
    expect(html).toContain('La consulta alcanzó su límite de lectura.');
    expect(html).toContain('valores mínimos');
  });

  /* Una advertencia que se descarta con un clic es una advertencia que nadie vuelve a ver. */
  it('no se puede cerrar', () => {
    expect(html).not.toContain('<button');
    expect(html).not.toContain('Cerrar');
  });

  it('se anuncia a los lectores de pantalla', () => {
    expect(html).toContain('role="status"');
  });
});

describe('operación actual', () => {
  const html = renderToStaticMarkup(<OperationsPanel operations={OPERATIONS} />);

  it('muestra los ocho valores', () => {
    for (const label of [
      'Pendientes de pago',
      'Pagos procesándose',
      'Pagados por iniciar',
      'En producción',
      'Listos para envío',
      'Enviados',
      'Entregados',
      'Cancelados',
    ]) {
      expect(html, label).toContain(label);
    }
  });

  /* Es de ahora mismo, no del período. Sin esa frase, cambiar a «Hoy» y ver lo mismo confunde. */
  it('declara que no cambia con el período', () => {
    expect(html).toContain('No cambia al cambiar el período');
  });

  /*
   * El listado no admite filtros todavía. Un enlace con un parámetro que nadie lee prometería un
   * filtro que no ocurre.
   */
  it('enlaza al listado como acceso general, sin filtros en la URL', () => {
    expect(html).toContain('href="/panel/pedidos"');
    expect(html).not.toContain('/panel/pedidos?');
  });

  it('no suma los estados en un total propio', () => {
    expect(html).not.toContain('>52<');
  });
});

describe('distribuciones', () => {
  const html = renderToStaticMarkup(
    <StatusDistributionPanel
      ordersByStatus={ORDERS_BY_STATUS}
      paymentsByStatus={PAYMENTS_BY_STATUS}
    />,
  );

  it('usa la etiqueta que manda el backend para cada estado del pedido', () => {
    for (const entry of ORDERS_BY_STATUS) {
      expect(html, entry.status).toContain(entry.label);
    }
  });

  it('usa la etiqueta que manda el backend para cada estado del pago', () => {
    for (const entry of PAYMENTS_BY_STATUS) {
      expect(html, entry.status).toContain(entry.label);
    }
  });

  /* Un cero es información: la fila se muestra igual. */
  it('incluye los estados con cero', () => {
    expect(html).toContain('Pago vencido');
    expect(html).toContain('Error en el pago');
  });

  /* `ready_to_ship` no puede faltar: es el paso que distingue el taller del andén. */
  it('no omite «Listo para envío»', () => {
    expect(html).toContain('Listo para envío');
  });

  it('explica que los dos totales pueden no coincidir', () => {
    expect(html).toContain('no tienen por qué coincidir');
    expect(html).toContain('anteriores al modelo de pago');
  });

  it('con el total en cero no inventa porcentajes', () => {
    const empty = renderToStaticMarkup(
      <StatusDistributionPanel
        ordersByStatus={ORDERS_BY_STATUS.map((entry) => ({ ...entry, count: 0 }))}
        paymentsByStatus={PAYMENTS_BY_STATUS.map((entry) => ({ ...entry, count: 0 }))}
      />,
    );

    expect(empty).not.toContain('width:');
    expect(empty).not.toContain('0 %');
  });
});

describe('gráfico de ventas', () => {
  const series = [
    seriesPoint('2026-09-01', 0),
    seriesPoint('2026-09-02', 500000),
    seriesPoint('2026-09-03', 950000),
  ];

  const html = renderToStaticMarkup(
    <DashboardSalesChart series={series} totalApprovedCop={1450000} />,
  );

  it('dibuja un SVG con viewBox y sin librería externa', () => {
    expect(html).toContain('<svg');
    expect(html).toContain('viewBox="0 0 720 220"');
  });

  it('tiene nombre accesible', () => {
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Ventas aprobadas por día');
  });

  /* La lectura exacta no puede depender de apuntar con un ratón. */
  it('ofrece la alternativa con los valores por día', () => {
    expect(html).toContain('Ver los valores por día');
    expect(html).toContain('<table');
    expect(html).toContain(formatCop(950000));
  });

  it('el total del período es el de commerce, no una suma de la serie', () => {
    expect(html).toContain(formatCop(1450000));
  });

  it('presenta los conteos como contexto, fuera de la escala monetaria', () => {
    expect(html).toContain('pedidos pagados');
    expect(html).toContain('creados');
  });

  it('una serie entera en cero lo dice en lugar de parecer un fallo', () => {
    const empty = renderToStaticMarkup(
      <DashboardSalesChart
        series={[seriesPoint('2026-09-01', 0), seriesPoint('2026-09-02', 0)]}
        totalApprovedCop={0}
      />,
    );

    expect(empty).toContain('No hubo ventas aprobadas en este período');
    expect(empty).toContain(formatCop(0));
    expect(empty).not.toContain('NaN');
  });

  it('un solo día se dibuja sin romperse', () => {
    const single = renderToStaticMarkup(
      <DashboardSalesChart
        series={[seriesPoint('2026-09-19', 450000)]}
        totalApprovedCop={450000}
      />,
    );

    expect(single).toContain('<svg');
    expect(single).not.toContain('NaN');
    expect(single).toContain(formatCop(450000));
  });

  it('noventa y dos días conservan sus noventa y dos filas', () => {
    const long = Array.from({ length: 92 }, (_unused, index) =>
      seriesPoint(`2026-09-${String((index % 28) + 1).padStart(2, '0')}`, index * 1000),
    );
    const html92 = renderToStaticMarkup(
      <DashboardSalesChart series={long} totalApprovedCop={100000} />,
    );

    expect(html92.split('<tr>').length - 1).toBe(93);
    expect(html92).not.toContain('NaN');
  });
});

describe('productos más vendidos', () => {
  const products = [
    {
      productId: 'prd_1',
      name: 'Tocador Aura',
      imageUrl: 'https://storage.invalid/aura.jpg',
      units: 6,
      approvedRevenueCop: 3900000,
    },
    {
      productId: 'prd_2',
      name: 'Mesa Nube',
      imageUrl: null,
      units: 1,
      approvedRevenueCop: 150000,
    },
  ] as unknown as readonly DashboardTopProduct[];

  const html = renderToStaticMarkup(<TopProductsPanel products={products} />);

  it('enlaza al producto por su identificador', () => {
    expect(html).toContain('href="/panel/productos/prd_1"');
  });

  /* El nombre y la imagen son los del momento de la venta: no se relee el catálogo. */
  it('usa el nombre histórico como texto alternativo de la imagen', () => {
    expect(html).toContain('alt="Tocador Aura"');
    expect(html).toContain('src="https://storage.invalid/aura.jpg"');
  });

  it('sin imagen usa el tratamiento de siempre', () => {
    expect(html).toContain('Sin imagen');
  });

  it('muestra unidades e ingreso con su plural correcto', () => {
    expect(html).toContain('6 unidades');
    expect(html).toContain('1 unidad');
    expect(html).toContain(formatCop(3900000));
  });

  it('no inventa estrellas, calificaciones ni descuentos', () => {
    for (const needle of ['★', 'Descuento', 'Calificación', 'reseñ']) {
      expect(html, needle).not.toContain(needle);
    }
  });

  it('vacío lo dice con su frase local', () => {
    const empty = renderToStaticMarkup(<TopProductsPanel products={[]} />);

    expect(empty).toContain('Aún no hay ventas aprobadas en este período.');
  });
});

describe('pedidos recientes', () => {
  const orders = [
    summaryOrder(),
    summaryOrder({ id: 'ord_2', publicId: 'MZ-1A2B3C4D', paymentStatus: 'declined' }),
  ];

  const html = renderToStaticMarkup(<RecentOrdersPanel orders={orders} />);

  it('reutiliza las pastillas de pago y de estado del listado', () => {
    expect(html).toContain('Pagado');
    expect(html).toContain('Rechazado');
    expect(html).toContain('En producción');
  });

  it('enlaza al detalle de cada pedido y ofrece ver todos', () => {
    expect(html).toContain('href="/panel/pedidos/ord_abc"');
    expect(html).toContain('href="/panel/pedidos"');
    expect(html).toContain('Ver todos los pedidos');
  });

  /*
   * Vienen dentro del propio resumen: pedir cada uno convertiría una portada en nueve llamadas y
   * daría la misma información.
   */
  it('no vuelve a consultar cada pedido', () => {
    const source = readFileSync('src/features/panel/dashboard-recent-orders.tsx', 'utf8');

    expect(source).not.toContain('getOrder');
    expect(source).not.toContain('fetch(');
  });

  it('pinta tabla y tarjetas del mismo material, sin pedir otra respuesta', () => {
    expect(html.split('MZ-7KQ2R9DA').length - 1).toBe(2);
  });

  it('vacío lo dice con su frase local', () => {
    const empty = renderToStaticMarkup(<RecentOrdersPanel orders={[]} />);

    expect(empty).toContain('Todavía no hay pedidos');
    expect(empty).toContain('Ver todos los pedidos');
  });
});

describe('requieren atención', () => {
  const html = renderToStaticMarkup(<AttentionPanel attention={ATTENTION} />);

  it('muestra las cinco con su conteo', () => {
    for (const label of [
      'Pagos pendientes',
      'Pagos procesándose',
      'Listos para envío',
      'Notificaciones por revisar',
      'Inventario bajo',
    ]) {
      expect(html, label).toContain(label);
    }
  });

  it('enlaza a pedidos y a productos, y a nada más', () => {
    expect(html).toContain('href="/panel/pedidos"');
    expect(html).toContain('href="/panel/productos"');
    expect(html).not.toContain('/panel/notificaciones');
  });

  /* Esos endpoints no existen: un botón que no llama a nada es peor que el hueco que deja. */
  it.each(['Resolver', 'Reintentar', 'Ver notificaciones'])('no monta «%s»', (needle) => {
    expect(html).not.toContain(needle);
  });

  it('todo en cero se dice «Sin novedades»', () => {
    const quiet = renderToStaticMarkup(
      <AttentionPanel
        attention={{
          pendingPayments: 0,
          staleProcessingPayments: 0,
          readyToShipOrders: 0,
          failedNotifications: 0,
          lowStockProducts: 0,
          paymentIncidents: 0,
        }}
      />,
    );

    expect(quiet).toContain('Sin novedades');
  });
});

describe('controles de período', () => {
  const request = readDashboardRequest({ period: '7d' });

  it('marca el activo con aria-current, no solo con color', () => {
    const html = renderToStaticMarkup(<PeriodSelector request={request} />);

    expect(html).toContain('aria-current="true"');
    expect(html).toContain('href="/panel?period=7d"');
    expect(html).toContain('href="/panel?period=30d"');
  });

  it('el grupo tiene nombre accesible', () => {
    expect(renderToStaticMarkup(<PeriodSelector request={request} />)).toContain(
      'aria-label="Período del resumen"',
    );
  });

  it('el rango personalizado es un formulario GET con etiquetas reales', () => {
    const html = renderToStaticMarkup(
      <CustomRangeForm
        request={readDashboardRequest({ period: 'custom', from: '2026-09-01', to: '2026-09-19' })}
      />,
    );

    expect(html).toContain('method="get"');
    expect(html).toContain('action="/panel"');
    expect(html).toContain('for="dashboard-from"');
    expect(html).toContain('id="dashboard-from"');
    expect(html).toContain('for="dashboard-to"');
    expect(html).toContain('id="dashboard-to"');
    expect(html).toContain('value="2026-09-01"');
    expect(html).toContain('name="period"');
  });

  /* El rango que se muestra es el que resolvió el backend, no uno calculado aquí. */
  it('escribe el rango resuelto y su comparación', () => {
    const html = renderToStaticMarkup(
      <ResolvedPeriod
        period={{
          kind: '30d',
          from: '2026-08-21',
          to: '2026-09-19',
          previousFrom: '2026-07-22',
          previousTo: '2026-08-20',
        }}
        timezone="America/Bogota"
      />,
    );

    expect(html).toContain('America/Bogota');
    expect(html).toContain('se compara con');
    // El día no se corre: `2026-08-21` no puede leerse como el 20.
    expect(html).toContain('21');
    expect(html).not.toContain('20 ago');
  });
});

describe('ambiente financiero', () => {
  const sandboxEnvironment = {
    livePaymentsEnabled: false,
    salesEnvironment: 'sandbox',
    sandboxApprovedOrders: 12,
    liveApprovedOrders: 0,
  } as const;

  /*
   * La prueba que impide el peor error de este panel: enseñar ventas de prueba con el mismo
   * aspecto que las reales y cerrar un mes con dinero que nadie pagó.
   */
  it('con sandbox dice «Datos de prueba» y que no son ingresos', () => {
    const html = renderToStaticMarkup(
      <SalesEnvironmentBanner
        environment={sandboxEnvironment}
        request={readDashboardRequest({ period: '30d' })}
      />,
    );

    expect(html).toContain('Datos de prueba');
    expect(html).toContain('No son ingresos');
  });

  it('dice que los pagos reales están bloqueados cuando lo están', () => {
    const html = renderToStaticMarkup(
      <SalesEnvironmentBanner
        environment={sandboxEnvironment}
        request={readDashboardRequest({ period: '30d' })}
      />,
    );

    expect(html).toContain('pagos reales están bloqueados');
  });

  /* Es un filtro, no una etiqueta: para ver el otro ambiente hay que preguntar otra vez. */
  it('ofrece el otro ambiente como un enlace, no como una suma', () => {
    const html = renderToStaticMarkup(
      <SalesEnvironmentBanner
        environment={sandboxEnvironment}
        request={readDashboardRequest({ period: '7d' })}
      />,
    );

    expect(html).toContain('salesEnvironment=live');
    // Y conserva el período: cambiar de ambiente no devuelve a nadie a «30 días».
    expect(html).toContain('period=7d');
  });

  it('el enlace dice cuántos pedidos hay en el otro ambiente', () => {
    const html = renderToStaticMarkup(
      <SalesEnvironmentBanner
        environment={{ ...sandboxEnvironment, salesEnvironment: 'live', liveApprovedOrders: 0 }}
        request={readDashboardRequest({ period: '30d' })}
      />,
    );

    expect(html).toContain('(12)');
  });

  it('con ventas reales no dice que sean pruebas', () => {
    const html = renderToStaticMarkup(
      <SalesEnvironmentBanner
        environment={{
          livePaymentsEnabled: true,
          salesEnvironment: 'live',
          sandboxApprovedOrders: 3,
          liveApprovedOrders: 40,
        }}
        request={readDashboardRequest({ period: '30d' })}
      />,
    );

    expect(html).toContain('Ventas reales');
    expect(html).toContain('cobros reales');
    expect(html).not.toContain('Datos de prueba');
  });

  /* El ambiente se lee de la URL como el período, y un valor inventado no viaja. */
  it('el ambiente vive en la URL y se estrecha a lo publicado', () => {
    expect(readDashboardRequest({ salesEnvironment: 'sandbox' }).salesEnvironment).toBe('sandbox');
    expect(readDashboardRequest({ salesEnvironment: 'live' }).salesEnvironment).toBe('live');
    expect(
      readDashboardRequest({ salesEnvironment: 'produccion' }).salesEnvironment,
    ).toBeUndefined();
    expect(readDashboardRequest({}).salesEnvironment).toBeUndefined();
  });

  it('el selector de período conserva el ambiente', () => {
    const html = renderToStaticMarkup(
      <PeriodSelector request={readDashboardRequest({ period: '7d', salesEnvironment: 'live' })} />,
    );

    expect(html).toContain('salesEnvironment=live');
  });
});

describe('incidencias de pago en «Requiere atención»', () => {
  it('aparecen con su propio contador y su enlace', () => {
    const html = renderToStaticMarkup(<AttentionPanel attention={ATTENTION} />);

    expect(html).toContain('Incidencias de pago');
    expect(html).toContain('/panel/configuracion/integraciones/incidencias');
  });

  it('explican que son datos que no cuadran, no un fallo de entrega', () => {
    const html = renderToStaticMarkup(<AttentionPanel attention={ATTENTION} />);

    expect(html).toContain('firma válida');
    expect(html).toContain('no cuadran');
  });
});
