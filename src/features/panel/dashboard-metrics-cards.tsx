import styles from './dashboard.module.css';
import { readChange, type ChangeTone } from './dashboard-metrics';
import { formatCop, groupCop } from './money';
import { Icon, type IconName } from './section-icon';

import type { DashboardCommerce } from '@/lib/api/dashboard';

/** Color del cambio porcentual. Va **encima** del texto, nunca en lugar de él. */
const CHANGE_CLASS = {
  up: styles.changeUp,
  down: styles.changeDown,
  flat: styles.changeFlat,
  unknown: styles.changeUnknown,
} as const satisfies Record<ChangeTone, unknown>;

function Metric({
  icon,
  title,
  value,
  changePercent,
  previous,
  hint,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly value: string;
  readonly changePercent: number | null;
  /** Qué había en el período anterior, dicho ya formateado. */
  readonly previous: string;
  readonly hint: string;
}) {
  const change = readChange(changePercent);

  return (
    <article className={styles.metric}>
      <div className={styles.metricHead}>
        <span aria-hidden="true" className={styles.metricIcon}>
          <Icon name={icon} />
        </span>
        <h3 className={styles.metricTitle}>{title}</h3>
      </div>
      <p className={styles.metricValue}>{value}</p>
      {/*
       * El cambio lleva su flecha y su signo **en el texto**; el color va encima de eso y nunca en
       * lugar de eso. La frase larga queda para el lector de pantalla, que no ve ni la flecha ni el
       * fondo de la pastilla.
       */}
      <p className={CHANGE_CLASS[change.tone]}>
        <span aria-hidden="true">{change.label}</span>
        <span className="sr-only">{change.description}</span>
      </p>
      <p className={styles.metricHint}>
        Período anterior: {previous}. {hint}
      </p>
    </article>
  );
}

/**
 * Las cinco métricas comerciales del período.
 *
 * Cada una viene entera del backend —valor actual, valor anterior y cambio— y aquí no se deriva
 * ninguna. En particular, **ventas aprobadas no es el total de pedidos creados**: el contrato las
 * define como la suma de los pedidos cuyo primer pago válido se aprobó dentro del período,
 * atribuida a la fecha de aprobación. Un pedido creado el 30 y pagado el 2 es una venta del mes
 * siguiente, y confundirlo haría que el panel informara de ventas que nadie cobró.
 *
 * Los importes se formatean con el helper monetario de siempre: `$ 1.450.000`, sin «COP».
 */
export function DashboardMetrics({ commerce }: { readonly commerce: DashboardCommerce }) {
  return (
    <div className={styles.metrics}>
      <Metric
        changePercent={commerce.approvedSales.changePercent}
        hint="Suma de los pedidos cuyo pago se aprobó dentro del período, por fecha de aprobación."
        icon="wallet"
        previous={formatCop(commerce.approvedSales.previousAmountCop)}
        title="Ventas aprobadas"
        value={formatCop(commerce.approvedSales.currentAmountCop)}
      />
      <Metric
        changePercent={commerce.createdOrders.changePercent}
        hint="Pedidos creados en el período. Son intenciones de compra, no ventas."
        icon="pedidos"
        previous={groupCop(commerce.createdOrders.previousCount)}
        title="Pedidos creados"
        value={groupCop(commerce.createdOrders.currentCount)}
      />
      <Metric
        changePercent={commerce.approvedOrders.changePercent}
        hint="Pedidos cuyo primer pago válido se aprobó dentro del período."
        icon="pago"
        previous={groupCop(commerce.approvedOrders.previousCount)}
        title="Pedidos pagados"
        value={groupCop(commerce.approvedOrders.currentCount)}
      />
      <Metric
        changePercent={commerce.unitsSold.changePercent}
        hint="Unidades de cada línea, no número de líneas."
        icon="inventario"
        previous={groupCop(commerce.unitsSold.previousCount)}
        title="Unidades vendidas"
        value={groupCop(commerce.unitsSold.currentCount)}
      />
      <Metric
        changePercent={commerce.averageOrderValue.changePercent}
        hint="Ventas aprobadas divididas entre pedidos pagados. Cero cuando no hubo ninguno."
        icon="resumen"
        previous={formatCop(commerce.averageOrderValue.previousAmountCop)}
        title="Ticket promedio"
        value={formatCop(commerce.averageOrderValue.currentAmountCop)}
      />
    </div>
  );
}

/**
 * Aviso de lectura truncada.
 *
 * Cuando el backend dice `truncated`, las cifras del período son un **mínimo**. El contrato explica
 * por qué se publica en vez de esconderse: «a partial sum presented as a total is a false figure».
 * Por eso el aviso no se puede cerrar, va **antes** de las tarjetas y no cambia ni una cifra: lo
 * que cambia es lo que se puede afirmar de ellas.
 */
export function TruncatedNotice() {
  return (
    <div className={styles.truncated} role="status">
      <span aria-hidden="true" className={styles.truncatedIcon}>
        <Icon name="estado" />
      </span>
      <div className={styles.truncatedBody}>
        <p className={styles.truncatedTitle}>Lectura parcial</p>
        <p className={styles.truncatedText}>
          La consulta alcanzó su límite de lectura. Las cifras mostradas son valores mínimos y
          pueden existir más movimientos.
        </p>
      </div>
    </div>
  );
}
