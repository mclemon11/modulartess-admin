import catalog from './catalog.module.css';
import { formatDateTime } from './format';
import { formatCop } from './money';
import {
  describeDeliveryMode,
  describeNotificationAudience,
  describeNotificationError,
  describeNotificationEvent,
  describeNotificationStatus,
  notificationNote,
  notificationTone,
} from './notification-labels';
import { buildOrderActivity } from './order-activity';
import { describeReasonCode, isSandbox } from './payment-status';
import { PaymentStatusBadge } from './payment-status-badge';
import styles from './orders.module.css';
import { SectionHeading } from './section-icon';

import type { AdminNotification, AdminOrder, AdminPaymentEvent, OrderLine } from '@/lib/api/orders';

/**
 * Las tarjetas de la ficha del pedido.
 *
 * Están juntas en un archivo porque son piezas de una sola pantalla y comparten el mismo material
 * —la instantánea del pedido— y los mismos estilos. Separarlas en nueve archivos de veinte líneas
 * añadiría rutas de importación sin hacer ninguna reutilizable: fuera de esta ficha no se usan.
 *
 * Todas pintan lo que trae el pedido y **nada más**. No se vuelve a leer el catálogo para
 * reconstruir una línea: si el producto cambió de nombre o de precio después de la compra, el
 * pedido tiene que seguir diciendo qué se vendió y por cuánto.
 */

/** Productos comprados, con la instantánea de cada línea. */
export function OrderProductsCard({ order }: { readonly order: AdminOrder }) {
  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading
        hint="Nombre, SKU, atributos y precio tal como estaban al comprar."
        icon="productos"
        title={`Productos (${order.items.length})`}
      />
      <ul className={styles.lineList}>
        {order.items.map((line, index) => (
          <li key={`${line.productId}-${line.variantId ?? 'base'}-${index}`}>
            <OrderLineRow line={line} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function OrderLineRow({ line }: { readonly line: OrderLine }) {
  return (
    <article className={styles.line}>
      {line.primaryImageUrl === null ? (
        <span className={styles.lineThumbEmpty}>Sin imagen</span>
      ) : (
        // Imagen de la instantánea, servida por Cloud Storage. Se usa `img` y no `next/image`
        // porque el host es el del bucket y el panel no configura dominios remotos.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className={styles.lineThumb} src={line.primaryImageUrl} />
      )}
      <div className={styles.lineBody}>
        <h3 className={styles.lineName}>{line.name}</h3>
        <p className={styles.lineSku}>SKU: {line.sku}</p>
        {/*
         * Los atributos son los pares que trae la línea. La referencia los enseña como «Color» y
         * «Medida» porque su pedido de ejemplo los tenía; aquí se pintan los que existan y no se
         * reserva hueco para un color o una medida que esta línea nunca tuvo.
         */}
        {line.attributes.length === 0 ? null : (
          <ul className={styles.lineAttributes}>
            {line.attributes.map((attribute) => (
              <li className={styles.lineAttribute} key={attribute.key}>
                {attribute.label}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.lineAmounts}>
          <span>
            {line.quantity} × {formatCop(line.unitPriceCop)}
          </span>
          <span className={styles.lineTotal}>{formatCop(line.totalCop)}</span>
        </p>
      </div>
    </article>
  );
}

/** Datos de contacto de quien compró. */
export function OrderCustomerCard({ order }: { readonly order: AdminOrder }) {
  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading icon="cliente" title="Cliente" />
      <dl className={styles.facts}>
        <Fact label="Nombre" value={order.customer.fullName} />
        <Fact label="Correo" value={order.customer.email} />
        <Fact label="Teléfono" value={order.customer.phone} />
      </dl>
      {/* La referencia enlaza a «Ver perfil»: no existe entidad Cliente ni ruta que la muestre. */}
    </section>
  );
}

/** Dónde se entrega. */
export function OrderAddressCard({ order }: { readonly order: AdminOrder }) {
  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading icon="direccion" title="Dirección de entrega" />
      <dl className={styles.facts}>
        <Fact label="Dirección" value={order.shippingAddress.addressLine} />
        <Fact label="Ciudad" value={order.shippingAddress.city} />
        <Fact label="Departamento" value={order.shippingAddress.department} />
        <Fact
          label="Indicaciones"
          value={order.shippingAddress.instructions ?? 'Sin indicaciones'}
        />
      </dl>
      {/* Sin «Editar» ni «Ver en mapa»: el contrato no publica ninguna operación sobre la
          dirección, y un botón que no hace nada es peor que el hueco que deja. */}
    </section>
  );
}

/**
 * Importes del pedido.
 *
 * Subtotal, envío y total: los tres que publica el contrato. La referencia añade «Descuento» y un
 * canal de venta; ninguno está, y un descuento fijo en cero se leería como si el pedido no hubiera
 * tenido ninguno, que es una afirmación que el panel no puede hacer.
 */
export function OrderSummaryCard({ order }: { readonly order: AdminOrder }) {
  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading icon="resumen" title="Resumen del pedido" />
      <dl className={styles.facts}>
        <Fact label="Número de pedido" value={order.publicId} />
        <Fact label="Fecha de compra" value={formatDateTime(order.createdAt)} />
      </dl>
      <div className={styles.amounts}>
        <p className={styles.amountRow}>
          <span className={styles.amountLabel}>Subtotal</span>
          <span className={styles.amountValue}>{formatCop(order.subtotalCop)}</span>
        </p>
        <p className={styles.amountRow}>
          <span className={styles.amountLabel}>Envío</span>
          <span className={styles.amountValue}>{formatCop(order.shippingCop)}</span>
        </p>
        <p className={styles.amountTotal}>
          <span>Total</span>
          <span className={styles.amountValue}>{formatCop(order.totalCop)}</span>
        </p>
      </div>
      {/* El contrato fija el envío en cero mientras no exista la cotización. Decirlo evita que
          alguien lo lea como «envío gratis». */}
      {order.shippingCop === 0 ? (
        <p className={catalog.hint}>
          El envío todavía no se cotiza: el backend lo deja en cero en esta fase.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Información de pago.
 *
 * Lo que publica `OrderPaymentDto` y nada más: estado con su etiqueta autoritativa, entorno,
 * número de intentos y última actualización. **No hay método de pago**, ni tarjeta, ni cuatro
 * últimos dígitos, ni referencia bancaria, ni fecha de cobro real: el contrato no publica ninguna
 * de esas cosas, y en un panel administrativo un dato inventado se toma por bueno.
 *
 * Cuando el entorno es `sandbox` se dice con todas las letras que no hubo cobro. El contrato es
 * explícito —«sandbox means the outcome came from the staging simulator and NO real charge
 * happened»— y dejarlo implícito es exactamente cómo alguien acaba creyendo que un pedido está
 * cobrado.
 */
export function OrderPaymentCard({ order }: { readonly order: AdminOrder }) {
  const { payment } = order;
  const sandbox = isSandbox(payment.environment);

  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading icon="pago" title="Información de pago" />

      <div className={styles.paymentHead}>
        <PaymentStatusBadge label={payment.statusLabel} status={payment.status} />
        {sandbox ? <span className={styles.sandboxTag}>Simulación</span> : null}
      </div>

      <dl className={styles.facts}>
        <Fact label="Entorno" value={sandbox ? 'Pruebas (sandbox)' : 'Producción'} />
        <Fact
          label="Intentos de pago"
          value={payment.attemptNumber === 0 ? 'Ninguno' : String(payment.attemptNumber)}
        />
        <Fact label="Última actualización" value={formatDateTime(payment.updatedAt)} />
        {/*
         * La fecha real de la venta. El contrato dice que es lo que el dashboard usa para
         * atribuir ingresos —«an order placed on the 30th and paid on the 2nd is a sale of the
         * second month»—, así que la ficha la enseña en lugar de dejar que se deduzca de
         * `updatedAt`, que cambia con cualquier evento posterior. Los pedidos anteriores al modelo
         * de pago la reportan en `null` y aquí se dice, no se disimula.
         */}
        <Fact
          label="Pago aprobado el"
          value={payment.approvedAt === null ? 'Todavía no' : formatDateTime(payment.approvedAt)}
        />
      </dl>

      {sandbox ? (
        <p className={styles.sandboxNote}>Entorno de pruebas. No se realizó un cobro real.</p>
      ) : null}

      {payment.attemptNumber === 0 ? (
        <p className={catalog.hint}>Todavía no se ha iniciado un intento de pago.</p>
      ) : null}
    </section>
  );
}

/**
 * Historial de pago.
 *
 * Los eventos en orden cronológico, agrupados por intento: dos intentos distintos son dos historias
 * distintas, y aplanarlos haría leer un rechazo del primero como si fuera del segundo.
 *
 * De cada evento se muestra lo que se puede mostrar: la etiqueta que manda el backend, cuándo
 * ocurrió, su entorno, el `publicMessage` cuando existe —el contrato lo define como «safe sentence
 * that may be shown to the shopper»— y el motivo **solo** si el panel tiene una traducción cerrada
 * para ese código. No se enseña el `eventId`, ni el `source` técnico, ni ningún valor interno sin
 * traducir, ni payloads.
 */
export function OrderPaymentHistoryCard({ order }: { readonly order: AdminOrder }) {
  const attempts = groupByAttempt(order.paymentEvents);

  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading
        hint="Se añade una entrada por cada resultado y no se edita ninguna."
        icon="historial"
        title="Historial de pago"
      />

      {attempts.length === 0 ? (
        <p className={catalog.hint}>
          Todavía no hay eventos de pago: nadie ha iniciado un intento sobre este pedido.
        </p>
      ) : (
        <div className={styles.attempts}>
          {attempts.map((attempt) => (
            <section className={styles.attempt} key={attempt.number}>
              <h3 className={styles.attemptTitle}>Intento {attempt.number}</h3>
              <ol className={styles.paymentEvents}>
                {attempt.events.map((event, index) => (
                  <PaymentEventRow event={event} key={`${attempt.number}-${index}`} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

/** Los eventos repartidos por intento, cada grupo en orden cronológico. */
function groupByAttempt(
  events: readonly AdminPaymentEvent[],
): readonly { readonly number: number; readonly events: readonly AdminPaymentEvent[] }[] {
  const ordered = [...events].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const numbers = [...new Set(ordered.map((event) => event.attemptNumber))].sort((a, b) => a - b);

  return numbers.map((number) => ({
    number,
    events: ordered.filter((event) => event.attemptNumber === number),
  }));
}

function PaymentEventRow({ event }: { readonly event: AdminPaymentEvent }) {
  const reason = describeReasonCode(event.reasonCode);

  return (
    <li className={styles.paymentEvent}>
      <div className={styles.paymentEventHead}>
        <PaymentStatusBadge label={event.label} status={event.status} />
        {isSandbox(event.environment) ? (
          <span className={styles.sandboxTag}>Simulación</span>
        ) : null}
      </div>
      {event.publicMessage === null ? null : (
        <p className={styles.paymentEventMessage}>{event.publicMessage}</p>
      )}
      {reason === null ? null : <p className={styles.paymentEventMessage}>{reason}</p>}
      <p className={styles.activityAt}>{formatDateTime(event.occurredAt)}</p>
    </li>
  );
}

/**
 * Notificaciones del pedido. **Solo lectura.**
 *
 * No hay botones de vista previa, de reenvío ni de envío manual, y no es una omisión de diseño: el
 * contrato no publica ninguna de esas operaciones. Un botón que no llama a nada es peor que el
 * hueco que deja.
 *
 * Lo que se muestra es el estado del buzón. Lo que **no**: el destinatario, que el contrato
 * deliberadamente no publica —«Bodies and recipients are never returned»—, ni el asunto, ni el
 * cuerpo.
 *
 * Los tres estados que se prestan a confusión llevan su frase: `previewed` no es «enviado»,
 * `suppressed` no es un error, y un `failed` es del correo, no de la transición del pedido, que sí
 * se aplicó.
 */
export function OrderNotificationsCard({ order }: { readonly order: AdminOrder }) {
  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading
        hint="Registro de los avisos que el backend escribió. El panel no los envía."
        icon="notificaciones"
        title={`Notificaciones (${order.notifications.length})`}
      />

      {order.notifications.length === 0 ? (
        <p className={catalog.hint}>Este pedido todavía no ha generado ningún aviso.</p>
      ) : (
        <ul className={styles.notifications}>
          {order.notifications.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} />
          ))}
        </ul>
      )}
    </section>
  );
}

const NOTIFICATION_TONE_CLASS = {
  success: styles.notificationToneSuccess,
  danger: styles.notificationToneDanger,
  warning: styles.notificationToneWarning,
  info: styles.notificationToneInfo,
  neutral: styles.notificationToneNeutral,
} as const;

function NotificationRow({ notification }: { readonly notification: AdminNotification }) {
  const note = notificationNote(notification.status);
  const error = describeNotificationError(notification.lastErrorCode);

  return (
    <li className={styles.notification}>
      <div className={styles.notificationHead}>
        <h3 className={styles.notificationTitle}>
          {describeNotificationEvent(notification.eventKey)}
        </h3>
        <span
          className={`${styles.notificationStatus} ${NOTIFICATION_TONE_CLASS[notificationTone(notification.status)]}`}
        >
          {describeNotificationStatus(notification.status)}
        </span>
      </div>

      <p className={styles.notificationMeta}>
        <span>{describeNotificationAudience(notification.audience)}</span>
        <span>{describeDeliveryMode(notification.deliveryMode)}</span>
        <span>
          {notification.attempts === 1 ? '1 intento' : `${notification.attempts} intentos`}
        </span>
      </p>

      {note === null ? null : <p className={styles.notificationNote}>{note}</p>}

      <dl className={styles.notificationDates}>
        <NotificationDate label="Creado" value={notification.createdAt} />
        <NotificationDate label="Enviado" value={notification.sentAt} />
        <NotificationDate label="Próximo intento" value={notification.nextAttemptAt} />
      </dl>

      {error === null ? null : <p className={styles.notificationError}>{error}</p>}
    </li>
  );
}

function NotificationDate({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null;
}) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value === null ? '—' : formatDateTime(value)}</dd>
    </div>
  );
}

const ACTIVITY_TONE_CLASS = {
  brand: styles.activityDotBrand,
  success: styles.activityDotSuccess,
  danger: styles.activityDotDanger,
  warning: styles.activityDotWarning,
  info: styles.activityDotInfo,
  neutral: styles.activityDotNeutral,
} as const;

/**
 * Novedades del pedido.
 *
 * Una sola lectura de todo lo que le ha pasado. La arma `buildOrderActivity`, que combina el
 * historial del pedido, el del pago y el buzón de avisos, y devuelve la secuencia **cronológica**
 * con su desempate explícito —pago, pedido, aviso— para los que comparten marca de tiempo. La
 * tarjeta la invierte para pintar lo último arriba, que es como se lee un panel.
 *
 * Los títulos son los que publica el backend. El panel pone el color del punto y nada más.
 */
export function OrderActivityCard({ order }: { readonly order: AdminOrder }) {
  const activity = [...buildOrderActivity(order)].reverse();

  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading
        hint="Se añade una entrada por cada cambio y no se edita ninguna."
        icon="historial"
        title="Novedades"
      />
      <ol className={styles.activity}>
        {activity.map((entry) => (
          <li className={styles.activityItem} key={entry.id}>
            <span
              aria-hidden="true"
              className={`${styles.activityDot} ${ACTIVITY_TONE_CLASS[entry.tone]}`}
            />
            <div className={styles.activityBody}>
              <div className={styles.activityHead}>
                <h3 className={styles.activityTitle}>{entry.title}</h3>
              </div>
              <p className={styles.activityDetail}>{entry.detail}</p>
              <p className={styles.activityAt}>{formatDateTime(entry.at)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  );
}
