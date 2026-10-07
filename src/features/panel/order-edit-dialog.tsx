'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';
import { can } from '@/features/session/permissions';
import type { AdminOrder, EditOrderRequest, EditOrderResult } from '@/lib/api/orders';

import catalog from './catalog.module.css';
import {
  changeSummary,
  emailNotice,
  describeEditFailure,
  describeWarnings,
  draftLinesOf,
  draftProblem,
  editableStatuses,
  editRequestOf,
  estimatedSubtotal,
  formatCop,
  isManualMethod,
  itemsEditableFromDetail,
  manualEventsOffered,
  methodLockReason,
  ORDER_LINE_QUANTITY_MAX,
  ORDER_NOTES_MAX,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  paymentMethodLabel,
  statusLabel,
  statusLockReason,
  WOMPI_AUTOMATIC,
  type ChangeRow,
  type DraftLine,
  type ManualPaymentEvent,
  type OrderPaymentMethod,
  type OrderPickerProduct,
} from './order-edit';
import { describePaymentStatus } from './payment-status';
import styles from './order-edit.module.css';
import { previewOrderEdit, saveOrderEdit, searchOrderProducts } from './orders-client';

/**
 * «Editar pedido»: estado, notas internas, productos y pago (ADR 0013 del panel).
 *
 * Pasos dentro de un `<dialog>` modal: **editar**, **revisar** y, solo al confirmar un pago manual,
 * **confirmar**. Revisar llama a la vista previa del backend, que aplica todas las reglas y calcula
 * precios, envío y total; el resumen enseña esos importes, el pago antes y después y los correos que
 * recibirá el cliente, tal como los devuelve el backend. Guardar envía exactamente lo revisado, con
 * la versión que se leyó, y la ficha se sustituye con lo que devuelve el backend.
 *
 * Cancelar cierra sin guardar. Un cambio de estado escribe los mismos correos que el botón de
 * estado de siempre; confirmar un pago manual, el de «Pago confirmado».
 */
export function OrderEditControl({
  order,
  role,
  onUpdated,
}: {
  readonly order: AdminOrder;
  readonly role: string;
  readonly onUpdated: (order: AdminOrder) => void;
}) {
  const opener = useRef<HTMLButtonElement>(null);
  // Cada apertura es una sesión de edición nueva: el formulario nace del pedido que se ve ahora.
  const [session, setSession] = useState(0);
  const [notice, setNotice] = useState<{
    readonly text: string;
    readonly reminder: boolean;
  } | null>(null);

  if (!can(role, 'orders.update_status')) return null;

  // Fragmento: el botón y el aviso son elementos de la fila de acciones de la cabecera, y el aviso
  // ocupa su propia línea al final de esa fila.
  return (
    <>
      <button
        className={catalog.buttonSecondary}
        onClick={() => {
          setNotice(null);
          setSession((value) => value + 1);
        }}
        ref={opener}
        type="button"
      >
        Editar pedido
      </button>
      <p aria-live="polite" className={styles.liveRegion}>
        {notice === null ? null : (
          <>
            <span className={catalog.success}>Pedido actualizado.</span>{' '}
            <span className={notice.reminder ? styles.infoInline : catalog.success}>
              {notice.text}
            </span>
          </>
        )}
      </p>
      {session === 0 ? null : (
        <OrderEditDialog
          canEditItems={can(role, 'orders.edit_items')}
          canManagePayments={can(role, 'payments.manage_manual')}
          key={session}
          onClosed={() => opener.current?.focus()}
          onSaved={(next, saved) => {
            onUpdated(next);
            setNotice(emailNotice(saved));
          }}
          order={order}
        />
      )}
    </>
  );
}

type Review = {
  readonly request: EditOrderRequest;
  readonly rows: readonly ChangeRow[];
  readonly total: number;
  /** Lo que se dice de los correos: el resumen o, si se programa, el aviso del recordatorio. */
  readonly emails: { readonly text: string; readonly reminder: boolean };
  readonly warnings: readonly string[];
};

type Step =
  | { readonly kind: 'edit' }
  | ({ readonly kind: 'review' } & Review)
  // Confirmación explícita de un pago manual, antes de enviarlo.
  | ({ readonly kind: 'confirm' } & Review);

type Failure = { readonly message: string; readonly conflict: boolean };

function OrderEditDialog({
  order,
  canEditItems,
  canManagePayments,
  onSaved,
  onClosed,
}: {
  readonly order: AdminOrder;
  readonly canEditItems: boolean;
  readonly canManagePayments: boolean;
  readonly onSaved: (
    order: AdminOrder,
    saved: Pick<EditOrderResult, 'customerNotifications' | 'warnings'>,
  ) => void;
  readonly onClosed: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  // Se abre al montarse: cada sesión de edición es un diálogo nuevo con el pedido actual.
  useEffect(() => {
    const element = dialog.current;

    if (element !== null && !element.open) element.showModal();
  }, []);
  const router = useRouter();
  const id = useId();
  const lock = useRef(createOperationLock());
  const [step, setStep] = useState<Step>({ kind: 'edit' });
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [status, setStatus] = useState<string>(order.status);
  const [carrierName, setCarrierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [notes, setNotes] = useState(order.internalNotes ?? '');
  const [lines, setLines] = useState<DraftLine[]>(() => draftLinesOf(order));
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>(
    order.paymentEditing.method,
  );
  const [paymentStatus, setPaymentStatus] = useState<ManualPaymentEvent | null>(null);
  const itemsEditable = canEditItems && itemsEditableFromDetail(order);

  function close() {
    dialog.current?.close();
  }

  function draftRequest(): EditOrderRequest | null {
    return editRequestOf(
      order,
      {
        status,
        shipment:
          status === 'shipped'
            ? {
                carrierName: carrierName.trim(),
                trackingNumber: trackingNumber.trim(),
                trackingUrl: trackingUrl.trim(),
              }
            : null,
        internalNotes: notes,
        lines,
        paymentMethod,
        paymentStatus,
      },
      { canEditItems: itemsEditable, canManagePayments },
    );
  }

  async function review() {
    const request = draftRequest();

    if (request === null) {
      setFailure({ message: 'No hay cambios para guardar.', conflict: false });
      return;
    }
    const problem = draftProblem(request);

    if (problem !== null) {
      setFailure({ message: problem, conflict: false });
      return;
    }
    if (!acquire(lock.current)) return;
    setBusy('preview');
    setFailure(null);

    const result = await previewOrderEdit(order.id, request);

    release(lock.current);
    setBusy(null);

    if (!result.ok) {
      setFailure({
        message: describeEditFailure(result.code, result.reference),
        conflict: result.code === 'version_conflict',
      });
      return;
    }
    setStep({
      kind: 'review',
      request,
      rows: changeSummary(order, result.data),
      total: result.data.order.totalCop,
      emails: emailNotice(result.data),
      warnings: describeWarnings(result.data.warnings),
    });
  }

  async function save(request: EditOrderRequest) {
    if (!acquire(lock.current)) return;
    setBusy('save');
    setFailure(null);

    const result = await saveOrderEdit(order.id, request);

    release(lock.current);
    setBusy(null);

    if (!result.ok) {
      setFailure({
        message: result.ambiguous
          ? 'No sabemos si los cambios se guardaron. Recarga el pedido antes de volver a intentarlo.'
          : describeEditFailure(result.code, result.reference),
        conflict: result.code === 'version_conflict' || result.ambiguous,
      });
      return;
    }
    close();
    onSaved(result.data.order, result.data);
  }

  const titleId = `${id}-title`;
  const leadId = `${id}-lead`;
  const title = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  // Al pasar de editar a revisar —o volver— el botón pulsado desaparece: el foco va al título del
  // paso nuevo en lugar de perderse en el documento.
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    title.current?.focus();
  }, [step.kind]);

  return (
    <dialog
      aria-describedby={leadId}
      aria-labelledby={titleId}
      className={`${catalog.previewDialog} ${styles.dialog}`}
      onCancel={(event) => {
        // Escape no cierra mientras se calcula o se guarda: el resultado tiene que verse aquí.
        if (busy !== null) event.preventDefault();
      }}
      // El foco vuelve al botón que abrió el diálogo, como en cualquier modal accesible.
      onClose={onClosed}
      ref={dialog}
    >
      <div className={styles.body}>
        <header className={styles.head}>
          <h2 className={catalog.sectionTitle} id={titleId} ref={title} tabIndex={-1}>
            {step.kind === 'edit'
              ? `Editar pedido ${order.publicId}`
              : step.kind === 'review'
                ? 'Revisa los cambios'
                : 'Confirmar pago manual'}
          </h2>
          <p className={catalog.hint} id={leadId}>
            {step.kind === 'edit'
              ? 'Se pueden cambiar el estado, las notas internas, los productos y el pago. Cliente y dirección no se editan aquí.'
              : step.kind === 'review'
                ? 'Los importes y el pago los calculó el servidor con las reglas vigentes.'
                : 'Confirma solo si verificaste que el dinero llegó. Queda registrado con tu nombre y la fecha.'}
          </p>
        </header>

        {step.kind === 'edit' ? (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void review();
            }}
          >
            <fieldset className={styles.fieldset}>
              <legend className={catalog.label}>Estado</legend>
              <div className={catalog.field}>
                <label className={catalog.label} htmlFor={`${id}-status`}>
                  Estado del pedido
                </label>
                <select
                  className={catalog.input}
                  disabled={busy !== null}
                  id={`${id}-status`}
                  onChange={(event) => setStatus(event.target.value)}
                  value={status}
                >
                  {editableStatuses(order.status).map((value) => (
                    <option key={value} value={value}>
                      {value === order.status
                        ? `${statusLabel(value)} (actual)`
                        : statusLabel(value)}
                    </option>
                  ))}
                </select>
                {editableStatuses(order.status).length === 1 ? (
                  <p className={catalog.hint}>
                    Desde este estado no hay un siguiente paso disponible en el panel.
                  </p>
                ) : null}
              </div>
              {status === 'shipped' ? (
                <div className={styles.shipment}>
                  <TextField
                    disabled={busy !== null}
                    id={`${id}-carrier`}
                    label="Transportadora"
                    onChange={setCarrierName}
                    value={carrierName}
                  />
                  <TextField
                    disabled={busy !== null}
                    id={`${id}-tracking`}
                    label="Número de guía"
                    onChange={setTrackingNumber}
                    value={trackingNumber}
                  />
                  <TextField
                    disabled={busy !== null}
                    id={`${id}-tracking-url`}
                    inputMode="url"
                    label="Enlace de seguimiento (https)"
                    onChange={setTrackingUrl}
                    value={trackingUrl}
                  />
                </div>
              ) : null}
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className={catalog.label}>Notas internas</legend>
              <div className={catalog.field}>
                <label className={catalog.label} htmlFor={`${id}-notes`}>
                  Notas para el equipo
                </label>
                <textarea
                  aria-describedby={`${id}-notes-hint`}
                  className={catalog.textarea}
                  disabled={busy !== null}
                  id={`${id}-notes`}
                  maxLength={ORDER_NOTES_MAX}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  value={notes}
                />
                <p className={catalog.hint} id={`${id}-notes-hint`}>
                  Solo las ve el equipo en el panel; nunca salen a la tienda ni a un correo.{' '}
                  {notes.length} de {ORDER_NOTES_MAX}.
                </p>
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className={catalog.label}>Productos</legend>
              {itemsEditable ? (
                <LinesEditor busy={busy !== null} idPrefix={id} lines={lines} onChange={setLines} />
              ) : (
                <>
                  <ul className={styles.readonlyLines}>
                    {order.items.map((line, index) => (
                      <li key={`${line.productId}-${line.variantId ?? ''}-${index}`}>
                        {line.quantity} × {line.name}
                        {line.attributes.length === 0
                          ? ''
                          : ` (${line.attributes.map((attribute) => attribute.label).join(' · ')})`}
                      </li>
                    ))}
                  </ul>
                  <p className={catalog.hint}>
                    {!canEditItems
                      ? 'Tu rol no permite cambiar los productos de un pedido.'
                      : order.payment.status === 'processing'
                        ? 'Hay un pago en curso: los productos no se pueden cambiar ahora.'
                        : 'Los productos de un pedido despachado, entregado o cancelado no se pueden cambiar.'}
                  </p>
                </>
              )}
            </fieldset>

            <PaymentFieldset
              busy={busy !== null}
              canManage={canManagePayments}
              idPrefix={id}
              method={paymentMethod}
              onMethodChange={(value) => {
                setPaymentMethod(value);
                // Otro medio, otros desenlaces: el elegido antes podría no existir para este.
                setPaymentStatus(null);
              }}
              onStatusChange={setPaymentStatus}
              order={order}
              status={paymentStatus}
            />

            <FailureMessage failure={failure} onReload={() => router.refresh()} />

            <div className={styles.footer}>
              <button
                className={catalog.buttonSecondary}
                disabled={busy !== null}
                onClick={close}
                type="button"
              >
                Cancelar
              </button>
              <button className={catalog.buttonPrimary} disabled={busy !== null} type="submit">
                {busy === 'preview' ? 'Calculando…' : 'Revisar cambios'}
              </button>
            </div>
          </form>
        ) : step.kind === 'confirm' ? (
          <div className={styles.form}>
            <div className={styles.confirmBox}>
              <p>
                Vas a registrar como <strong>pagado</strong> el pedido {order.publicId} por{' '}
                <strong>{formatCop(step.total)}</strong> con{' '}
                <strong>
                  {paymentMethodLabel(step.request.paymentMethod ?? order.paymentEditing.method)}
                </strong>
                .
              </p>
              <p className={catalog.hint}>
                El pedido pasará a «Pagado». {step.emails.text} No se crea ningún cobro, transacción
                ni referencia.
              </p>
            </div>

            <FailureMessage failure={failure} onReload={() => router.refresh()} />

            <div className={styles.footer}>
              <button
                className={catalog.buttonSecondary}
                disabled={busy !== null}
                onClick={() => {
                  setFailure(null);
                  setStep({ ...step, kind: 'review' });
                }}
                type="button"
              >
                Volver
              </button>
              <button
                className={catalog.buttonPrimary}
                disabled={busy !== null}
                onClick={() => void save(step.request)}
                type="button"
              >
                {busy === 'save' ? 'Guardando…' : 'Sí, confirmar pago'}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.form}>
            {/* Tabla propia: la del catálogo se oculta por debajo de 60rem, donde los listados pasan a
                tarjetas, y el resumen tiene que leerse en cualquier ancho. */}
            <div className={styles.summaryWrap}>
              <table
                aria-describedby={step.emails.reminder ? `${id}-reminder` : undefined}
                className={styles.summary}
              >
                <caption className={styles.caption}>Cambios que se guardarán</caption>
                <thead>
                  <tr>
                    <th scope="col">Campo</th>
                    <th scope="col">Antes</th>
                    <th scope="col">Después</th>
                  </tr>
                </thead>
                <tbody>
                  {step.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td>{row.before}</td>
                      <td>{row.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Junto al cambio de medio: informativo, no un error. Sustituye al resumen de correos. */}
            {step.emails.reminder ? (
              <p className={styles.info} id={`${id}-reminder`} role="note">
                {step.emails.text}
              </p>
            ) : null}
            <p className={catalog.hint}>
              Total del pedido después de guardar: {formatCop(step.total)}.
            </p>
            {step.emails.reminder ? null : <p className={styles.emails}>{step.emails.text}</p>}
            {step.warnings.length === 0 ? null : (
              <ul aria-label="Advertencias" className={styles.warnings}>
                {step.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}

            <FailureMessage failure={failure} onReload={() => router.refresh()} />

            <div className={styles.footer}>
              <button
                className={catalog.buttonSecondary}
                disabled={busy !== null}
                onClick={close}
                type="button"
              >
                Cancelar
              </button>
              <button
                className={catalog.buttonSecondary}
                disabled={busy !== null}
                onClick={() => {
                  setFailure(null);
                  setStep({ kind: 'edit' });
                }}
                type="button"
              >
                Volver a editar
              </button>
              <button
                className={catalog.buttonPrimary}
                disabled={busy !== null}
                onClick={() => {
                  // Confirmar un pago manual pasa siempre por una confirmación explícita.
                  if (step.request.paymentStatus === 'approved') {
                    setFailure(null);
                    setStep({ ...step, kind: 'confirm' });
                    return;
                  }
                  void save(step.request);
                }}
                type="button"
              >
                {busy === 'save'
                  ? 'Guardando…'
                  : step.request.paymentStatus === 'approved'
                    ? 'Continuar'
                    : 'Guardar cambios'}
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

/**
 * «Pago»: medio y estado actuales, el selector de los cuatro medios y, en un medio manual, el
 * desenlace que admite ahora. Wompi se ve como automático y nunca es editable. Sin referencias,
 * transacciones ni ningún dato técnico del pago.
 */
function PaymentFieldset({
  order,
  canManage,
  method,
  status,
  onMethodChange,
  onStatusChange,
  busy,
  idPrefix,
}: {
  readonly order: AdminOrder;
  readonly canManage: boolean;
  readonly method: OrderPaymentMethod;
  readonly status: ManualPaymentEvent | null;
  readonly onMethodChange: (method: OrderPaymentMethod) => void;
  readonly onStatusChange: (status: ManualPaymentEvent | null) => void;
  readonly busy: boolean;
  readonly idPrefix: string;
}) {
  const editing = order.paymentEditing;
  const methodLocked = methodLockReason(editing);
  const events = manualEventsOffered(editing, method);
  const statusLocked = statusLockReason(editing, method);
  const methodId = `${idPrefix}-payment-method`;
  const statusId = `${idPrefix}-payment-status`;

  return (
    <fieldset className={styles.fieldset}>
      <legend className={catalog.label}>Pago</legend>
      <dl className={styles.paymentNow}>
        <div>
          <dt>Medio actual</dt>
          <dd>{paymentMethodLabel(editing.method)}</dd>
        </div>
        <div>
          <dt>Estado del pago</dt>
          {/* La etiqueta autoritativa del backend, la misma de la insignia de la ficha. */}
          <dd>{order.payment.statusLabel}</dd>
        </div>
      </dl>

      {canManage ? (
        <>
          <div className={catalog.field}>
            <label className={catalog.label} htmlFor={methodId}>
              Medio de pago
            </label>
            <select
              aria-describedby={methodLocked === null ? undefined : `${methodId}-hint`}
              className={catalog.input}
              disabled={busy || methodLocked !== null}
              id={methodId}
              onChange={(event) => onMethodChange(event.target.value as OrderPaymentMethod)}
              value={method}
            >
              {PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {value === editing.method
                    ? `${PAYMENT_METHOD_LABELS[value]} (actual)`
                    : PAYMENT_METHOD_LABELS[value]}
                </option>
              ))}
            </select>
            {methodLocked === null ? null : (
              <p className={catalog.hint} id={`${methodId}-hint`}>
                {methodLocked}
              </p>
            )}
          </div>

          {!isManualMethod(method) ? (
            <p className={styles.automatic}>{WOMPI_AUTOMATIC}.</p>
          ) : (
            <div className={catalog.field}>
              <label className={catalog.label} htmlFor={statusId}>
                Estado del pago
              </label>
              <select
                aria-describedby={statusLocked === null ? undefined : `${statusId}-hint`}
                className={catalog.input}
                disabled={busy || events.length === 0}
                id={statusId}
                onChange={(event) =>
                  onStatusChange(
                    event.target.value === '' ? null : (event.target.value as ManualPaymentEvent),
                  )
                }
                value={status ?? ''}
              >
                <option value="">Sin cambios ({order.payment.statusLabel})</option>
                {events.map((event) => (
                  <option key={event} value={event}>
                    {describePaymentStatus(event)}
                  </option>
                ))}
              </select>
              {statusLocked === null ? null : (
                <p className={catalog.hint} id={`${statusId}-hint`}>
                  {statusLocked}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {!isManualMethod(editing.method) ? (
            <p className={styles.automatic}>{WOMPI_AUTOMATIC}.</p>
          ) : null}
          <p className={catalog.hint}>Tu rol no permite cambiar el medio ni el estado del pago.</p>
        </>
      )}
    </fieldset>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  disabled,
  inputMode,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
  readonly inputMode?: 'url';
}) {
  return (
    <div className={catalog.field}>
      <label className={catalog.label} htmlFor={id}>
        {label}
      </label>
      <input
        className={catalog.input}
        disabled={disabled}
        id={id}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

function FailureMessage({
  failure,
  onReload,
}: {
  readonly failure: Failure | null;
  readonly onReload: () => void;
}) {
  const message = useRef<HTMLParagraphElement>(null);

  // El botón que provocó el fallo estuvo deshabilitado mientras esperaba: el foco va al mensaje,
  // que además se anuncia, para que el teclado siga dentro del diálogo.
  useEffect(() => {
    if (failure !== null) message.current?.focus();
  }, [failure]);

  return (
    <div aria-live="assertive">
      {failure === null ? null : (
        <p className={catalog.error} ref={message} role="alert" tabIndex={-1}>
          {failure.message}{' '}
          {failure.conflict ? (
            <button className={catalog.buttonSecondary} onClick={onReload} type="button">
              Recargar pedido
            </button>
          ) : null}
        </p>
      )}
    </div>
  );
}

/** Líneas del borrador: cantidades, retirar y agregar desde el catálogo. */
function LinesEditor({
  lines,
  onChange,
  busy,
  idPrefix,
}: {
  readonly lines: readonly DraftLine[];
  readonly onChange: (lines: DraftLine[]) => void;
  readonly busy: boolean;
  readonly idPrefix: string;
}) {
  const subtotal = estimatedSubtotal(lines);

  return (
    <div className={styles.lines}>
      <ul className={styles.lineList}>
        {lines.map((line, index) => {
          const quantityId = `${idPrefix}-qty-${index}`;

          return (
            <li className={styles.lineRow} key={line.key}>
              <div className={styles.lineInfo}>
                <span className={styles.lineName}>{line.name}</span>
                <span className={catalog.hint}>
                  {line.optionLabel === null ? '' : `${line.optionLabel} · `}SKU {line.sku} ·{' '}
                  {formatCop(line.referenceUnitPriceCop)} c/u
                </span>
              </div>
              <div className={styles.lineControls}>
                <label className={styles.qtyLabel} htmlFor={quantityId}>
                  Cantidad
                </label>
                <input
                  className={`${catalog.input} ${styles.qty}`}
                  disabled={busy}
                  id={quantityId}
                  max={ORDER_LINE_QUANTITY_MAX}
                  min={1}
                  onChange={(event) => {
                    const value = Math.trunc(Number(event.target.value));

                    if (!Number.isFinite(value)) return;
                    const quantity = Math.min(ORDER_LINE_QUANTITY_MAX, Math.max(1, value));

                    onChange(
                      lines.map((entry, at) => (at === index ? { ...entry, quantity } : entry)),
                    );
                  }}
                  type="number"
                  value={line.quantity}
                />
                <button
                  aria-label={`Quitar ${line.name}${line.optionLabel === null ? '' : ` (${line.optionLabel})`}`}
                  className={catalog.buttonDanger}
                  disabled={busy || lines.length === 1}
                  onClick={() => onChange(lines.filter((_, at) => at !== index))}
                  type="button"
                >
                  Quitar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {lines.length === 1 ? (
        <p className={catalog.hint}>Un pedido necesita al menos un producto.</p>
      ) : null}
      <p className={styles.estimate}>
        Subtotal estimado: <strong>{formatCop(subtotal)}</strong>
        <span className={catalog.hint}>
          {' '}
          Estimación con precios de referencia. El servidor calcula el subtotal, el envío y el total
          al revisar.
        </span>
      </p>
      <ProductAdder
        busy={busy}
        idPrefix={idPrefix}
        onAdd={(line) => {
          const existing = lines.findIndex(
            (entry) => entry.productId === line.productId && entry.variantId === line.variantId,
          );

          onChange(
            existing === -1
              ? [...lines, line]
              : lines.map((entry, at) =>
                  at === existing
                    ? {
                        ...entry,
                        quantity: Math.min(ORDER_LINE_QUANTITY_MAX, entry.quantity + line.quantity),
                      }
                    : entry,
                ),
          );
        }}
      />
    </div>
  );
}

/** Buscar un producto publicado, elegir su variante cuando la tiene y agregarlo. */
function ProductAdder({
  onAdd,
  busy,
  idPrefix,
}: {
  readonly onAdd: (line: DraftLine) => void;
  readonly busy: boolean;
  readonly idPrefix: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly OrderPickerProduct[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OrderPickerProduct | null>(null);
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [addError, setAddError] = useState<string | null>(null);
  const searchId = `${idPrefix}-search`;
  const variantFieldId = `${idPrefix}-variant`;
  const addQtyId = `${idPrefix}-add-qty`;

  async function search() {
    const text = query.trim();

    if (text.length === 1) {
      setSearchError(
        'Escribe al menos dos caracteres, o deja la búsqueda vacía para ver los recientes.',
      );
      return;
    }
    setSearching(true);
    setSearchError(null);
    const result = await searchOrderProducts(text);

    setSearching(false);
    if (!result.ok) {
      setSearchError('No pudimos buscar en el catálogo. Inténtalo de nuevo.');
      return;
    }
    setResults(result.items);
    setSelected(null);
    setVariantId('');
  }

  function add() {
    if (selected === null) return;
    const variant = selected.variants.find((entry) => entry.id === variantId) ?? null;

    if (selected.variants.length > 0 && variant === null) {
      setAddError('Elige una opción del producto antes de agregarlo.');
      return;
    }
    if ((variant ?? selected).availability === 'out_of_stock') {
      setAddError('Esa opción está agotada.');
      return;
    }
    onAdd({
      key: `new-${selected.id}-${variant?.id ?? ''}-${Date.now()}`,
      productId: selected.id,
      variantId: variant?.id ?? null,
      name: selected.name,
      sku: variant?.sku ?? selected.sku,
      optionLabel: variant?.label ?? null,
      quantity,
      referenceUnitPriceCop: variant?.priceCop ?? selected.priceCop,
    });
    setSelected(null);
    setVariantId('');
    setQuantity(1);
    setAddError(null);
  }

  return (
    <div className={styles.adder}>
      <div className={styles.searchRow}>
        <div className={catalog.field}>
          <label className={catalog.label} htmlFor={searchId}>
            Agregar producto
          </label>
          <input
            className={catalog.input}
            disabled={busy || searching}
            id={searchId}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter busca aquí en lugar de enviar el formulario entero.
              if (event.key === 'Enter') {
                event.preventDefault();
                void search();
              }
            }}
            placeholder="Nombre o SKU"
            type="search"
            value={query}
          />
        </div>
        <button
          className={catalog.buttonSecondary}
          disabled={busy || searching}
          onClick={() => void search()}
          type="button"
        >
          {searching ? 'Buscando…' : 'Buscar'}
        </button>
      </div>
      {searchError === null ? null : (
        <p className={catalog.error} role="alert">
          {searchError}
        </p>
      )}

      {results === null ? null : results.length === 0 ? (
        <p className={catalog.hint}>No hay productos publicados que coincidan.</p>
      ) : (
        <ul aria-label="Resultados del catálogo" className={styles.results}>
          {results.map((product) => (
            <li key={product.id}>
              <button
                aria-pressed={selected?.id === product.id}
                className={`${styles.result} ${selected?.id === product.id ? styles.resultActive : ''}`}
                disabled={busy}
                onClick={() => {
                  setSelected(product);
                  setVariantId('');
                  setAddError(null);
                }}
                type="button"
              >
                <span className={styles.lineName}>{product.name}</span>
                <span className={catalog.hint}>
                  SKU {product.sku} ·{' '}
                  {product.variants.length > 0
                    ? `${product.variants.length} opciones`
                    : `${formatCop(product.priceCop)}${product.availability === 'out_of_stock' ? ' · agotado' : ''}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected === null ? null : (
        <div className={styles.selection}>
          <p className={styles.lineName}>{selected.name}</p>
          {selected.variants.length > 0 ? (
            <div className={catalog.field}>
              <label className={catalog.label} htmlFor={variantFieldId}>
                Opción (obligatoria)
              </label>
              <select
                className={catalog.input}
                disabled={busy}
                id={variantFieldId}
                onChange={(event) => {
                  setVariantId(event.target.value);
                  setAddError(null);
                }}
                value={variantId}
              >
                <option value="">Elige una opción</option>
                {selected.variants.map((variant) => (
                  <option
                    disabled={variant.availability === 'out_of_stock'}
                    key={variant.id}
                    value={variant.id}
                  >
                    {variant.label} · {formatCop(variant.priceCop)}
                    {variant.availability === 'out_of_stock' ? ' · agotado' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className={styles.selectionActions}>
            <div className={catalog.field}>
              <label className={catalog.label} htmlFor={addQtyId}>
                Cantidad
              </label>
              <input
                className={`${catalog.input} ${styles.qty}`}
                disabled={busy}
                id={addQtyId}
                max={ORDER_LINE_QUANTITY_MAX}
                min={1}
                onChange={(event) => {
                  const value = Math.trunc(Number(event.target.value));

                  if (Number.isFinite(value)) {
                    setQuantity(Math.min(ORDER_LINE_QUANTITY_MAX, Math.max(1, value)));
                  }
                }}
                type="number"
                value={quantity}
              />
            </div>
            <button className={catalog.buttonPrimary} disabled={busy} onClick={add} type="button">
              Agregar al pedido
            </button>
          </div>
          {addError === null ? null : (
            <p className={catalog.error} role="alert">
              {addError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
