import Link from 'next/link';

import catalog from './catalog.module.css';
import styles from './dashboard.module.css';
import {
  describePeriod,
  describeSalesEnvironment,
  environmentHref,
  isActivePeriod,
  periodHref,
  QUICK_PERIODS,
  type DashboardRequest,
} from './dashboard-period';

import type { DashboardEnvironment, DashboardPeriod, SalesEnvironment } from '@/lib/api/dashboard';

/**
 * Selector de período.
 *
 * Son **enlaces**, no botones con estado: la URL es la que manda, así que cambiar de período
 * navega y vuelve a ejecutar el Server Component. Eso es lo que hace que el resultado se pueda
 * enlazar, que Atrás funcione y que «Actualizar» recargue exactamente lo que se estaba mirando.
 *
 * El activo se marca con `aria-current="true"`, que es lo que un lector de pantalla anuncia; el
 * estilo cuelga de ese atributo para que la marca visual y la accesible no puedan separarse.
 */
export function PeriodSelector({ request }: { readonly request: DashboardRequest }) {
  return (
    <nav aria-label="Período del resumen" className={styles.periodGroup}>
      {QUICK_PERIODS.map((kind) => (
        <Link
          aria-current={isActivePeriod(request, kind) ? 'true' : undefined}
          className={styles.periodLink}
          href={periodHref(kind, request)}
          key={kind}
        >
          {describePeriod(kind)}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Rango personalizado: un formulario `GET` de verdad.
 *
 * Al enviarlo el navegador construye `/panel?period=custom&from=…&to=…` y navega. Funciona sin
 * JavaScript, el resultado se puede enlazar y no hay ni un `useState` de por medio.
 *
 * Los campos conservan lo que se escribió aunque el backend haya rechazado la consulta: sin eso, un
 * rango inválido se borraría al recargar y no habría forma de ver qué se pidió.
 */
export function CustomRangeForm({ request }: { readonly request: DashboardRequest }) {
  return (
    <form action="/panel" className={styles.customForm} method="get">
      {/* El período viaja en el propio formulario: el contrato solo admite `from`/`to` con `custom`. */}
      <input name="period" type="hidden" value="custom" />
      <div className={styles.customField}>
        <label className={styles.customLabel} htmlFor="dashboard-from">
          Desde
        </label>
        <input
          className={styles.customInput}
          defaultValue={request.rawFrom}
          id="dashboard-from"
          name="from"
          type="date"
        />
      </div>
      <div className={styles.customField}>
        <label className={styles.customLabel} htmlFor="dashboard-to">
          Hasta
        </label>
        <input
          className={styles.customInput}
          defaultValue={request.rawTo}
          id="dashboard-to"
          name="to"
          type="date"
        />
      </div>
      {/*
       * El botón usa el secundario del panel, no la pastilla del selector: una pastilla sin fondo
       * aplicada a un `<button>` deja el fondo por defecto del navegador, que en este tema se ve
       * como un rectángulo gris con el texto ilegible. Se midió a 390 px.
       */}
      <button className={catalog.buttonSecondary} type="submit">
        Aplicar
      </button>
    </form>
  );
}

const DAY = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeZone: 'America/Bogota',
});

/**
 * Los días de calendario llegan como `YYYY-MM-DD`, sin hora.
 *
 * Se les añade el mediodía UTC antes de formatear: con `T00:00:00Z` el desfase de Bogotá (−05:00)
 * los devolvería al día anterior, que es exactamente el error que convierte «del 1 al 19» en «del
 * 31 al 18».
 */
function formatDay(value: string): string {
  const parsed = new Date(`${value}T12:00:00Z`);

  return Number.isNaN(parsed.getTime()) ? value : DAY.format(parsed);
}

/**
 * El rango que **resolvió el backend**, con su comparación.
 *
 * No se calcula aquí ni una fecha: son días de calendario colombianos, y derivarlos del reloj de
 * quien mira daría un día distinto según dónde esté. El contrato los publica en `period` y esto
 * solo los escribe.
 */
export function ResolvedPeriod({
  period,
  timezone,
}: {
  readonly period: DashboardPeriod;
  readonly timezone: string;
}) {
  return (
    <p className={styles.periodResolved}>
      Del {formatDay(period.from)} al {formatDay(period.to)} · se compara con{' '}
      {formatDay(period.previousFrom)} – {formatDay(period.previousTo)} · días de calendario de{' '}
      {timezone}
    </p>
  );
}

/**
 * Selector de ambiente financiero, y el aviso de que lo que se ve son pruebas.
 *
 * El contrato es tajante en un punto y la pantalla lo respeta: `salesEnvironment` es un **filtro**,
 * no una etiqueta. Ninguna cifra monetaria significa nunca «sandbox + live», y para ver el otro
 * ambiente hay que preguntar otra vez. Por eso no hay un total combinado en ningún sitio, y por eso
 * el selector navega en lugar de recalcular nada en el cliente.
 *
 * Con `sandbox`, `approvedSales` **no es ingreso**. El aviso va antes de las cifras, no se puede
 * cerrar y lo dice con esas palabras: un panel que enseñara ventas de prueba con el mismo aspecto
 * que las reales haría cerrar un mes con dinero que nadie pagó.
 */
export function SalesEnvironmentBanner({
  request,
  environment,
}: {
  readonly request: DashboardRequest;
  readonly environment: DashboardEnvironment;
}) {
  const showing = environment.salesEnvironment;
  const other: SalesEnvironment = showing === 'sandbox' ? 'live' : 'sandbox';
  const otherCount =
    other === 'sandbox' ? environment.sandboxApprovedOrders : environment.liveApprovedOrders;

  return (
    <div className={showing === 'sandbox' ? styles.testBanner : styles.liveBanner} role="status">
      <div className={styles.bannerBody}>
        <p className={styles.bannerTitle}>
          {showing === 'sandbox' ? 'Datos de prueba' : 'Ventas reales'}
        </p>
        <p className={styles.bannerText}>
          {showing === 'sandbox'
            ? 'Las ventas, la evolución y los productos más vendidos de este período son pagos de prueba. No son ingresos: nadie pagó.'
            : 'Las cifras de este período corresponden a cobros reales.'}
          {environment.livePaymentsEnabled
            ? ''
            : ' Los pagos reales están bloqueados en este despliegue, así que todo cobro aquí es una prueba.'}
        </p>
      </div>

      {/*
       * El enlace al otro ambiente dice **cuántos pedidos hay allí**. Sin ese número, «ver ventas
       * reales» parecería una pestaña vacía que no merece la pena abrir, y es justo lo contrario:
       * saber que hay cifras que no se están mirando es la mitad del aviso.
       */}
      <Link className={styles.bannerLink} href={environmentHref(request, other)}>
        Ver {describeSalesEnvironment(other).toLowerCase()} ({otherCount})
      </Link>
    </div>
  );
}
