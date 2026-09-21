/**
 * El período del dashboard, tal y como llega en la URL.
 *
 * La URL es el estado: `/panel?period=7d`, `/panel?period=custom&from=…&to=…`. No hay estado de
 * React en el selector, así que cambiar de período **navega** y vuelve a ejecutar el Server
 * Component. Eso es lo que hace que el enlace se pueda compartir, que el botón Atrás funcione y que
 * «Actualizar» recargue exactamente lo que se estaba mirando.
 *
 * Aquí **no se calcula ninguna fecha**. El rango real —`from`, `to`, `previousFrom`, `previousTo`—
 * lo devuelve el backend en `period`, porque son días de calendario colombianos y derivarlos en el
 * navegador o en el servidor de Next daría un día distinto según el reloj de quien mire.
 *
 * Módulo puro.
 */

import type { DashboardPeriodKind, SalesEnvironment } from '@/lib/api/dashboard';

/** Los cuatro que publica el contrato, en el orden en que se ofrecen. */
export const PERIOD_KINDS: readonly DashboardPeriodKind[] = ['today', '7d', '30d', 'custom'];

/** Lo que se usa cuando no se pide nada. Treinta días da una lectura estable del negocio. */
export const DEFAULT_PERIOD: DashboardPeriodKind = '30d';

const PERIOD_LABELS: Readonly<Record<DashboardPeriodKind, string>> = {
  today: 'Hoy',
  '7d': '7 días',
  '30d': '30 días',
  custom: 'Personalizado',
};

export function describePeriod(kind: DashboardPeriodKind): string {
  return PERIOD_LABELS[kind];
}

/** Los tres que se ofrecen como botones. `custom` tiene su propio formulario con dos fechas. */
export const QUICK_PERIODS: readonly DashboardPeriodKind[] = ['today', '7d', '30d'];

/**
 * Un parámetro de la URL puede llegar repetido —`?period=7d&period=today`—. Se conserva **el
 * primero** y se descarta el resto: elegir el último dejaría que un enlace manipulado ganara sobre
 * lo que se escribió delante, y quedarse con los dos no tiene sentido.
 */
export function firstValue(value: string | readonly string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : (value as string | undefined);
}

/** Los dos ambientes financieros que publica el contrato. */
export const SALES_ENVIRONMENTS: readonly SalesEnvironment[] = ['sandbox', 'live'];

const SALES_ENVIRONMENT_LABELS: Readonly<Record<SalesEnvironment, string>> = {
  sandbox: 'Datos de prueba',
  live: 'Ventas reales',
};

export function describeSalesEnvironment(environment: SalesEnvironment): string {
  return SALES_ENVIRONMENT_LABELS[environment];
}

export type DashboardRequest = {
  readonly period: DashboardPeriodKind;
  /**
   * Ambiente financiero pedido, o `undefined` para dejar elegir al backend.
   *
   * Es un **filtro**, no una etiqueta: el contrato dice que ninguna cifra monetaria significa
   * nunca «sandbox + live». Para ver el otro ambiente hay que preguntar otra vez, y por eso vive
   * en la URL como el período.
   */
  readonly salesEnvironment?: SalesEnvironment | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  /**
   * Lo que se escribió en la URL, para volver a pintarlo en los campos de fecha aunque el backend
   * haya rechazado la consulta. Sin esto, un rango inválido se borraría al recargar y no habría
   * forma de ver qué se pidió.
   */
  readonly rawFrom: string;
  readonly rawTo: string;
};

function isPeriodKind(value: string | undefined): value is DashboardPeriodKind {
  return value !== undefined && (PERIOD_KINDS as readonly string[]).includes(value);
}

/**
 * Forma de una fecha de calendario: `YYYY-MM-DD`.
 *
 * Solo se comprueba la **forma**. Que el día exista, que el rango no esté invertido y que no sea
 * más largo del máximo lo decide el backend, y comprobarlo aquí sería una segunda implementación
 * que acabaría discrepando. Lo que sí se hace es no mandar basura: una cadena que ni siquiera
 * parece una fecha no gasta una llamada.
 */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

function calendarDay(value: string | undefined): string | undefined {
  return value !== undefined && CALENDAR_DAY.test(value) ? value : undefined;
}

/**
 * Traduce los parámetros de la URL a lo que se le pide al backend.
 *
 * Un `period` desconocido cae en el valor por defecto en lugar de viajar: el contrato lo rechazaría
 * con un `400`, y una URL escrita a mano no debería romper la pantalla. `from` y `to` solo se
 * conservan con `custom`, que es lo único que el contrato admite.
 */
export function readDashboardRequest(
  params: Readonly<Record<string, string | readonly string[] | undefined>>,
): DashboardRequest {
  const requested = firstValue(params.period);
  const period = isPeriodKind(requested) ? requested : DEFAULT_PERIOD;
  const rawFrom = firstValue(params.from) ?? '';
  const rawTo = firstValue(params.to) ?? '';

  const requestedEnvironment = firstValue(params.salesEnvironment);
  const salesEnvironment = (SALES_ENVIRONMENTS as readonly string[]).includes(
    requestedEnvironment ?? '',
  )
    ? (requestedEnvironment as SalesEnvironment)
    : undefined;

  if (period !== 'custom') {
    return { period, salesEnvironment, rawFrom: '', rawTo: '' };
  }

  return {
    period,
    salesEnvironment,
    from: calendarDay(rawFrom),
    to: calendarDay(rawTo),
    rawFrom,
    rawTo,
  };
}

/**
 * URL del mismo período con el otro ambiente financiero.
 *
 * Conserva el rango: cambiar de ambiente no debería devolver a nadie a «30 días» si estaba mirando
 * una semana concreta.
 */
export function environmentHref(request: DashboardRequest, environment: SalesEnvironment): string {
  const params = new URLSearchParams({ period: request.period, salesEnvironment: environment });

  if (request.period === 'custom') {
    if (request.rawFrom.length > 0) params.set('from', request.rawFrom);
    if (request.rawTo.length > 0) params.set('to', request.rawTo);
  }

  return `/panel?${params.toString()}`;
}

/**
 * URL de un período rápido. Se construye aquí para que los enlaces del selector y el destino de
 * «volver a 30 días» no puedan separarse.
 */
export function periodHref(kind: DashboardPeriodKind, request?: DashboardRequest): string {
  const params = new URLSearchParams({ period: kind });

  // El ambiente se conserva al cambiar de período: son dos preguntas distintas y cambiar una no
  // debería contestar la otra.
  if (request?.salesEnvironment !== undefined) {
    params.set('salesEnvironment', request.salesEnvironment);
  }

  return `/panel?${params.toString()}`;
}

/** A dónde lleva «Volver a 30 días» cuando la consulta no fue válida. */
export const DEFAULT_PERIOD_HREF = periodHref(DEFAULT_PERIOD);

/** ¿Esta petición es la que está activa ahora mismo? Sirve para marcar el botón del selector. */
export function isActivePeriod(request: DashboardRequest, kind: DashboardPeriodKind): boolean {
  return request.period === kind;
}
