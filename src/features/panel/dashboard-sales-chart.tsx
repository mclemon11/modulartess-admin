import catalog from './catalog.module.css';
import styles from './dashboard.module.css';
import {
  buildChartGeometry,
  seriesApprovedOrders,
  seriesCreatedOrders,
  visibleTickIndexes,
} from './dashboard-chart';
import { formatCop, groupCop } from './money';
import { SectionHeading } from './section-icon';

import type { DashboardSeriesPoint } from '@/lib/api/dashboard';

/**
 * Evolución de las ventas aprobadas.
 *
 * Un SVG dibujado a mano, sin librería de gráficas: lo que hace falta —un área, una línea y unas
 * etiquetas— cabe en cincuenta líneas, y una dependencia entera para eso traería su propio modelo
 * de datos, su tema y su manera de romperse.
 *
 * Es un **Server Component**: no hay interacción. En particular no hay tooltip, y no es un olvido:
 * un tooltip que solo aparece al pasar el ratón deja fuera a quien navega con teclado y a quien usa
 * una pantalla táctil. La lectura exacta vive en la tabla de abajo, que está a la vista de todo el
 * mundo.
 *
 * La geometría la calcula `dashboard-chart.ts`, que es puro y tiene sus propias pruebas: ahí está
 * lo que puede salir mal —una división por cero con la serie en cero, un punto fuera del lienzo, un
 * solo día—.
 */

const DAY_SHORT = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Bogota',
});

const DAY_LONG = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeZone: 'America/Bogota',
});

/**
 * Los días llegan como `YYYY-MM-DD`. Se formatean al mediodía UTC: con `T00:00:00Z` el desfase de
 * Bogotá los devolvería al día anterior.
 */
function formatDay(value: string, format: Intl.DateTimeFormat): string {
  const parsed = new Date(`${value}T12:00:00Z`);

  return Number.isNaN(parsed.getTime()) ? value : format.format(parsed);
}

export function DashboardSalesChart({
  series,
  totalApprovedCop,
}: {
  readonly series: readonly DashboardSeriesPoint[];
  /** El total del período, que viene de `commerce`. No se suma la serie para obtenerlo. */
  readonly totalApprovedCop: number;
}) {
  const geometry = buildChartGeometry(series);
  const ticks = visibleTickIndexes(geometry.points.length);
  const approvedOrders = seriesApprovedOrders(series);
  const createdOrders = seriesCreatedOrders(series);

  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading
        hint="Por fecha de aprobación del pago, no de creación del pedido."
        icon="resumen"
        title="Ventas aprobadas"
      />

      <div className={styles.chartHead}>
        <p className={styles.chartTotal}>{formatCop(totalApprovedCop)}</p>
        {/*
         * Contexto secundario en texto, no como una segunda serie: `approvedOrders` y
         * `createdOrders` son conteos, y el eje de este gráfico es de pesos. Dibujarlos encima
         * invitaría a comparar dos magnitudes que no se comparan.
         */}
        <p className={styles.chartLegend}>
          <span className={styles.chartLegendItem}>
            <span aria-hidden="true" className={styles.chartSwatch} />
            {groupCop(approvedOrders)} pedido{approvedOrders === 1 ? '' : 's'} pagado
            {approvedOrders === 1 ? '' : 's'}
          </span>
          <span className={styles.chartLegendItem}>
            <span aria-hidden="true" className={styles.chartSwatchMuted} />
            {groupCop(createdOrders)} creado{createdOrders === 1 ? '' : 's'}
          </span>
        </p>
      </div>

      {geometry.points.length === 0 ? (
        <p className={styles.chartEmpty}>
          El período no tiene días con datos. Elige otro rango para ver la evolución.
        </p>
      ) : (
        <>
          <svg
            aria-label={`Ventas aprobadas por día, del ${formatDay(
              geometry.points[0]?.date ?? '',
              DAY_LONG,
            )} al ${formatDay(geometry.points[geometry.points.length - 1]?.date ?? '', DAY_LONG)}. Máximo diario ${formatCop(geometry.maxAmountCop)}.`}
            className={styles.chartCanvas}
            preserveAspectRatio="none"
            role="img"
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          >
            {/* El suelo del gráfico: da referencia cuando la serie está entera en cero. */}
            <line
              className={styles.chartBaseline}
              x1="0"
              x2={geometry.width}
              y1={geometry.height - 8}
              y2={geometry.height - 8}
            />
            {geometry.empty ? null : (
              <polygon className={styles.chartArea} points={geometry.areaPath} />
            )}
            <polyline
              className={styles.chartLine}
              points={geometry.linePath}
              vectorEffect="non-scaling-stroke"
            />
            {/*
             * Los puntos se dibujan solo cuando son pocos: con noventa días se convierten en una
             * banda continua que estorba en vez de informar. La línea sigue llevando los noventa.
             */}
            {geometry.points.length <= 31
              ? geometry.points.map((point) => (
                  <circle
                    className={styles.chartDot}
                    cx={point.x}
                    cy={point.y}
                    key={point.date}
                    r="2.5"
                  />
                ))
              : null}
          </svg>

          {/*
           * Etiquetas reducidas, datos completos. Con 92 días no caben 92 fechas bajo el eje: se
           * escriben seis, siempre con la primera y la última, y ningún punto se pierde por ello.
           */}
          <ul className={styles.chartTicks}>
            {ticks.map((index) => (
              <li key={geometry.points[index]?.date ?? index}>
                {formatDay(geometry.points[index]?.date ?? '', DAY_SHORT)}
              </li>
            ))}
          </ul>

          {geometry.empty ? (
            <p className={styles.chartEmpty}>
              No hubo ventas aprobadas en este período. La línea se apoya en cero: es lo que
              ocurrió, no un fallo de carga.
            </p>
          ) : null}

          {/*
           * La alternativa al gráfico, abierta a todo el mundo.
           *
           * No es un `sr-only`: es la única forma de leer una cifra exacta sin apuntar con un
           * ratón, y esconderla la haría inútil para la mitad de quienes la necesitan.
           */}
          <details className={styles.chartDetails}>
            <summary className={styles.chartSummary}>Ver los valores por día</summary>
            <div className={styles.chartTableScroll}>
              <table className={styles.chartTable}>
                <caption className="sr-only">
                  Ventas aprobadas, pedidos pagados y pedidos creados por día
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Día</th>
                    <th scope="col">Ventas aprobadas</th>
                    <th scope="col">Pagados</th>
                    <th scope="col">Creados</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((point) => (
                    <tr key={point.date}>
                      <th scope="row">{formatDay(point.date, DAY_LONG)}</th>
                      <td>{formatCop(point.approvedAmountCop)}</td>
                      <td>{groupCop(point.approvedOrders)}</td>
                      <td>{groupCop(point.createdOrders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
