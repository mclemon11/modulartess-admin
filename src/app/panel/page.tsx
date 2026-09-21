import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import styles from '@/features/panel/dashboard.module.css';
import {
  CustomRangeForm,
  PeriodSelector,
  ResolvedPeriod,
  SalesEnvironmentBanner,
} from '@/features/panel/dashboard-controls';
import { DashboardMetrics, TruncatedNotice } from '@/features/panel/dashboard-metrics-cards';
import {
  AttentionPanel,
  OperationsPanel,
  StatusDistributionPanel,
  TopProductsPanel,
} from '@/features/panel/dashboard-panels';
import {
  DEFAULT_PERIOD_HREF,
  readDashboardRequest,
  type DashboardRequest,
} from '@/features/panel/dashboard-period';
import { RecentOrdersPanel } from '@/features/panel/dashboard-recent-orders';
import { DashboardSalesChart } from '@/features/panel/dashboard-sales-chart';
import { describeDashboardFailure, offersDefaultPeriod } from '@/features/panel/dashboard-errors';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { RefreshButton } from '@/features/panel/refresh-button';
import { resolvePanelSession } from '@/features/panel/session-context';
import { getDashboardSummary } from '@/lib/api/dashboard';
import { isBackendFailure } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Dashboard comercial.
 *
 * Un Server Component que hace **una** llamada, `GET /v1/admin/dashboard/summary`, y pinta lo que
 * devuelve. No hay Route Handler: la llamada sale del servidor de Next con la sesión de la persona,
 * así que el navegador no conoce la URL del backend ni la cookie. Un BFF aquí sería un salto de más
 * sin nada que añadir.
 *
 * **Ninguna cifra se calcula aquí.** El contrato dice que «every figure comes from real stored
 * data; nothing is estimated, sampled or generated», y en particular las ventas no se derivan del
 * listado de pedidos: una venta se atribuye a la fecha en que el pago se **aprobó**, no a la de
 * creación, así que sumar pedidos creados daría otra cosa con aspecto de lo mismo.
 *
 * El período vive en la URL —`?period=30d`, `?period=custom&from=…&to=…`—, no en estado de React.
 * Cambiarlo navega y vuelve a ejecutar esta función, de modo que el resultado se puede enlazar y
 * «Actualizar» recarga exactamente lo que se estaba mirando.
 *
 * Dos lecturas distintas conviven en la pantalla y se declaran como tales: `commerce`,
 * `salesSeries` y `topProducts` son del **período**; `operations`, `ordersByStatus`,
 * `paymentsByStatus` y `attention` son la **fotografía de ahora mismo** y no cambian al cambiar el
 * período.
 *
 * Y una tercera distinción, que llegó con la pasarela: las cifras monetarias pertenecen a **un
 * ambiente financiero**, no a los dos. El contrato lo trata como un filtro y la pantalla también;
 * no hay ningún total que sume pruebas y cobros reales, y con `sandbox` el aviso dice que lo que
 * se ve no es ingreso.
 *
 * Lo que las referencias de diseño muestran y **no** está, porque el contrato no lo publica:
 * pasarelas y proveedores de pago con su nombre, integraciones, metas de venta, comparativas contra
 * presupuesto, clientes como entidad, márgenes y devoluciones.
 */
export default async function PanelPage({ searchParams }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') {
    // El layout resuelve las dos salidas: limpiar la cookie o anunciar que el backend no responde.
    return null;
  }

  const request = readDashboardRequest(await searchParams);
  const trail = [{ label: 'Dashboard' }];

  let summary;

  try {
    summary = await getDashboardSummary(session.session.sessionMaterial, {
      period: request.period,
      from: request.from,
      to: request.to,
      salesEnvironment: request.salesEnvironment,
    });
  } catch (error) {
    const code = isBackendFailure(error) ? error.code : 'backend_unexpected';

    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <DashboardHeader request={request} />
          <ErrorState
            action={
              <div className={styles.customForm}>
                <Link className={catalog.buttonSecondary} href="/panel">
                  Reintentar
                </Link>
                {offersDefaultPeriod(code) ? (
                  <Link className={catalog.buttonPrimary} href={DEFAULT_PERIOD_HREF}>
                    Volver a 30 días
                  </Link>
                ) : null}
              </div>
            }
            message={describeDashboardFailure(code)}
            title="No pudimos cargar el resumen"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader trail={trail} />
      <div className={catalog.page}>
        <DashboardHeader request={request} />
        <ResolvedPeriod period={summary.period} timezone={summary.timezone} />

        {/*
         * El ambiente financiero va **antes** de las cifras y con el mismo peso que la advertencia
         * de lectura truncada: las dos dicen qué se puede afirmar de lo que viene debajo. Con datos
         * de prueba, «Ventas aprobadas» no es ingreso.
         */}
        <SalesEnvironmentBanner environment={summary.environment} request={request} />

        {/*
         * La advertencia va **antes** de las cifras y no se puede cerrar: cuando la lectura se
         * truncó, lo que sigue son mínimos, y leerlos como totales es lo que hay que impedir.
         */}
        {summary.truncated ? <TruncatedNotice /> : null}

        <DashboardMetrics commerce={summary.commerce} />

        <div className={styles.mainGrid}>
          <div className={styles.column}>
            <DashboardSalesChart
              series={summary.salesSeries}
              totalApprovedCop={summary.commerce.approvedSales.currentAmountCop}
            />
          </div>
          <div className={styles.column}>
            <OperationsPanel operations={summary.operations} />
            <AttentionPanel attention={summary.attention} />
          </div>
        </div>

        <div className={styles.secondaryGrid}>
          <TopProductsPanel products={summary.topProducts} />
          <StatusDistributionPanel
            ordersByStatus={summary.ordersByStatus}
            paymentsByStatus={summary.paymentsByStatus}
          />
        </div>

        <RecentOrdersPanel orders={summary.recentOrders} />
      </div>
    </>
  );
}

/**
 * Encabezado con los controles de período.
 *
 * Se pinta igual con datos y con error: quien acaba de pedir un rango imposible necesita el
 * selector justo ahí para corregirlo, no debajo de un mensaje que ocupa la pantalla.
 *
 * El rol de la sesión ya no vive aquí. Está en el bloque de sesión del shell, que es donde
 * corresponde: en un dashboard comercial, lo central son las ventas.
 */
function DashboardHeader({ request }: { readonly request: DashboardRequest }) {
  return (
    <PanelPageHeader
      actions={
        <>
          <PeriodSelector request={request} />
          <CustomRangeForm request={request} />
          <RefreshButton />
        </>
      }
      lead="Resumen de ventas, pedidos y operación de tu tienda."
      title="Dashboard"
    />
  );
}
