import 'server-only';

/**
 * Resumen comercial del panel. **Solo servidor.**
 *
 * Una única operación —`GET /v1/admin/dashboard/summary`— y ni una cifra calculada aquí. El
 * contrato es tajante: «Every figure comes from real stored data; nothing is estimated, sampled or
 * generated». El panel pinta lo que llega y no deriva ventas del listado de pedidos, que además
 * contaría otra cosa: una venta se atribuye a la fecha en que el pago se **aprobó**, no a la de
 * creación del pedido.
 *
 * Todos los tipos vienen de `./generated/schema`, generado desde la copia comiteada del contrato.
 * Aquí no se declara ni un campo a mano.
 *
 * La sesión de la persona viaja en `x-modulartess-admin-session`. El `Authorization` con el
 * identity token IAM lo pone el middleware compartido de `backendClient()`: son dos canales
 * separados y no se mezclan. Nada de lo que devuelve el backend se registra: el resumen lleva
 * pedidos recientes con nombre de cliente, y un log con eso es una filtración.
 */

import { backendClient } from './backend-client';
import { BackendFailure, failureCodeFromStatus } from './errors';
import type { components, paths } from './generated/schema';
import { ADMIN_SESSION_HEADER } from './session-material';

export type DashboardSummary = components['schemas']['DashboardSummaryDto'];
export type DashboardPeriod = components['schemas']['DashboardPeriodDto'];
export type DashboardCommerce = components['schemas']['DashboardCommerceDto'];
export type DashboardAmountComparison = components['schemas']['DashboardAmountComparisonDto'];
export type DashboardCountComparison = components['schemas']['DashboardCountComparisonDto'];
export type DashboardOperations = components['schemas']['DashboardOperationsDto'];
export type DashboardSeriesPoint = components['schemas']['DashboardSeriesPointDto'];
export type DashboardOrderStatusCount = components['schemas']['DashboardOrderStatusCountDto'];
export type DashboardPaymentStatusCount = components['schemas']['DashboardPaymentStatusCountDto'];
export type DashboardTopProduct = components['schemas']['DashboardTopProductDto'];
export type DashboardAttention = components['schemas']['DashboardAttentionDto'];
export type DashboardEnvironment = components['schemas']['DashboardEnvironmentDto'];

/**
 * Ambiente financiero de las cifras del período.
 *
 * Es un **filtro**, no una etiqueta. El contrato lo dice sin rodeos: ninguna cifra monetaria
 * significa nunca «sandbox + live», y para ver el otro ambiente hay que preguntar otra vez. Con
 * `sandbox`, `approvedSales` **no es ingreso** y la pantalla tiene que decir «Datos de prueba».
 */
export type SalesEnvironment = DashboardEnvironment['salesEnvironment'];

/** Los cuatro períodos que publica el contrato. */
export type DashboardPeriodKind = DashboardPeriod['kind'];

type SummaryQuery = NonNullable<paths['/v1/admin/dashboard/summary']['get']['parameters']['query']>;

/**
 * Lo que el panel puede pedir.
 *
 * `from` y `to` solo acompañan a `custom`: el contrato responde `400` si llegan con cualquier otro
 * período, y quien construye la consulta ya lo respeta. Aquí se vuelve a imponer omitiéndolos, de
 * modo que una llamada mal formada no salga de este módulo.
 */
export type DashboardQuery = {
  readonly period: DashboardPeriodKind;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  /**
   * Qué ambiente financiero se pide. Omitirlo deja elegir al backend, que es lo correcto mientras
   * los pagos reales estén bloqueados: no hay nada que mezclar.
   */
  readonly salesEnvironment?: SalesEnvironment | undefined;
};

/**
 * Un `404` en esta superficie no puede ser «ese resumen no existe»: un resumen no es un recurso
 * direccionable. Significa que el despliegue no tiene la superficie administrativa.
 */
const RESOURCE = { notFound: 'backend_surface_disabled' } as const;

function sessionHeaders(sessionMaterial: string): Record<string, string> {
  return { [ADMIN_SESSION_HEADER]: sessionMaterial };
}

/**
 * Código estable del cuerpo del error.
 *
 * Se lee **solo** para comparar contra la lista cerrada del contrato. No se propaga ningún texto
 * del backend: su forma cambia sin aviso y puede llevar interioridades.
 */
function backendErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const { code } = error as { code: unknown };

  return typeof code === 'string' ? code : null;
}

/**
 * Traduce la respuesta fallida a un código interno estable.
 *
 * El contrato publica cuatro errores y los cuatro significan cosas distintas para quien
 * administra: una consulta mal formada se arregla cambiando el período, una falta de permiso no, y
 * una caída del servicio tampoco.
 */
function summaryFailure(status: number, code: string | null): BackendFailure {
  if (status === 400 && code === 'dashboard_query_invalid') {
    return new BackendFailure('backend_dashboard_query_invalid');
  }

  if (status === 503 && code === 'dashboard_unavailable') {
    return new BackendFailure('backend_dashboard_unavailable');
  }

  return new BackendFailure(failureCodeFromStatus(status, RESOURCE));
}

/**
 * Resumen comercial para el período pedido.
 *
 * `commerce`, `salesSeries` y `topProducts` describen el **período**; `operations`,
 * `ordersByStatus`, `paymentsByStatus` y `attention` son la **fotografía de ahora mismo** y no
 * cambian al cambiar el período. El contrato lo dice y el panel lo respeta en la presentación: son
 * dos lecturas distintas y mezclarlas haría leer un contador actual como si fuera del rango.
 *
 * No hay Route Handler para esto: la pantalla es un Server Component, así que la llamada sale del
 * servidor de Next y el navegador nunca ve la URL del backend. Un BFF aquí sería una salto de más
 * sin nada que añadir.
 */
export async function getDashboardSummary(
  sessionMaterial: string,
  query: DashboardQuery,
): Promise<DashboardSummary> {
  const params: SummaryQuery = { period: query.period };

  if (query.salesEnvironment !== undefined) {
    params.salesEnvironment = query.salesEnvironment;
  }

  // Solo `custom` lleva fechas. Mandarlas con otro período es un `400` del contrato, y mandarlas
  // vacías sería peor: una cadena vacía viaja como parámetro presente.
  if (query.period === 'custom') {
    if (query.from !== undefined && query.from.length > 0) {
      params.from = query.from;
    }

    if (query.to !== undefined && query.to.length > 0) {
      params.to = query.to;
    }
  }

  let response;

  try {
    response = await backendClient().GET('/v1/admin/dashboard/summary', {
      params: { query: params },
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw error instanceof BackendFailure ? error : new BackendFailure('backend_unavailable');
  }

  if (response.error !== undefined || response.data === undefined) {
    throw summaryFailure(response.response.status, backendErrorCode(response.error));
  }

  return response.data;
}
