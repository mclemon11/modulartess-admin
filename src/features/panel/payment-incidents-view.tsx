'use client';

import { useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import catalog from './catalog.module.css';
import { formatDateTime } from './format';
import styles from './integrations.module.css';
import {
  describeIncidentReason,
  describeIncidentStatus,
  describeResolutionCode,
  incidentReasonHint,
  RESOLUTION_CODES,
} from './integration-labels';
import { resolvePaymentIncident } from './integrations-client';
import { describeOrderFailure, offersReload } from './order-errors';

import type { PaymentIncident, PaymentIncidentPage } from '@/lib/api/payment-incidents';

/**
 * Bandeja de incidencias de pago.
 *
 * Una incidencia es un evento **con firma válida** cuyos datos comerciales no cuadran. Lo que se
 * pinta es exactamente la proyección del contrato: códigos cerrados e identificadores técnicos.
 * **No hay payload del proveedor, ni firma, ni correo, ni dirección, ni monto recibido**, y no es
 * una omisión de pantalla: el contrato no los publica precisamente para que no acaben aquí.
 *
 * Es un Client Component porque resolver una incidencia cambia su estado y hay que confirmarlo.
 * Los filtros y la paginación, en cambio, viven en la URL y los resuelve el Server Component: son
 * estado navegable, no estado de React.
 */
export function PaymentIncidentsView({
  page,
  canManage,
}: {
  readonly page: PaymentIncidentPage;
  readonly canManage: boolean;
}) {
  if (page.items.length === 0) {
    return (
      <p className={catalog.hint}>
        No hay incidencias con estos filtros. Una bandeja vacía en «Abiertas» significa que todo lo
        que llegó firmado cuadraba con lo que esperábamos.
      </p>
    );
  }

  return (
    <>
      <div className={styles.incidentTable}>
        <div className={catalog.tableScroll}>
          <table className={catalog.table}>
            <caption className="sr-only">Incidencias de pago</caption>
            <thead>
              <tr>
                <th scope="col">Motivo</th>
                <th scope="col">Ambiente</th>
                <th scope="col">Transacción</th>
                <th scope="col">Pedido</th>
                <th scope="col">Ocurrencias</th>
                <th scope="col">Primera</th>
                <th scope="col">Última</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((incident) => (
                <IncidentRow canManage={canManage} incident={incident} key={incident.id} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className={styles.incidentCards}>
        {page.items.map((incident) => (
          <li key={incident.id}>
            <IncidentCard canManage={canManage} incident={incident} />
          </li>
        ))}
      </ul>
    </>
  );
}

function StatusBadge({ incident }: { readonly incident: PaymentIncident }) {
  return (
    <span className={incident.status === 'open' ? styles.incidentOpen : styles.incidentResolved}>
      {describeIncidentStatus(incident.status)}
    </span>
  );
}

function IncidentRow({
  incident,
  canManage,
}: {
  readonly incident: PaymentIncident;
  readonly canManage: boolean;
}) {
  return (
    <tr>
      <td>{describeIncidentReason(incident.reason)}</td>
      <td>{incident.environment === 'sandbox' ? 'Pruebas' : 'Producción'}</td>
      <td className={styles.mono}>{incident.providerTransactionId}</td>
      <td>
        {/*
         * El identificador **interno** del pedido, que es lo único que el contrato publica: nunca
         * el `publicId` ni el cliente. Enlaza al detalle porque la ruta lo acepta.
         */}
        {incident.orderId === null ? (
          <span className={catalog.hint}>Sin identificar</span>
        ) : (
          <Link className={catalog.rowAction} href={`/panel/pedidos/${incident.orderId}`}>
            Ver pedido
          </Link>
        )}
      </td>
      <td className={catalog.numeric}>{incident.occurrences}</td>
      <td className={catalog.timestamp}>{formatDateTime(incident.firstSeenAt)}</td>
      <td className={catalog.timestamp}>{formatDateTime(incident.lastSeenAt)}</td>
      <td>
        <StatusBadge incident={incident} />
      </td>
      <td className={catalog.actionCell}>
        <IncidentResolution canManage={canManage} incident={incident} />
      </td>
    </tr>
  );
}

function IncidentCard({
  incident,
  canManage,
}: {
  readonly incident: PaymentIncident;
  readonly canManage: boolean;
}) {
  const hint = incidentReasonHint(incident.reason);

  return (
    <article className={styles.incidentCard}>
      <div className={styles.incidentCardHead}>
        <h3 className={styles.incidentReason}>{describeIncidentReason(incident.reason)}</h3>
        <StatusBadge incident={incident} />
      </div>
      {hint === null ? null : <p className={styles.incidentHint}>{hint}</p>}
      <p className={styles.incidentMeta}>
        <span>{incident.environment === 'sandbox' ? 'Pruebas' : 'Producción'}</span>
        <span>
          {incident.occurrences} ocurrencia{incident.occurrences === 1 ? '' : 's'}
        </span>
        <span>Última: {formatDateTime(incident.lastSeenAt)}</span>
      </p>
      <p className={styles.mono}>{incident.providerTransactionId}</p>
      {incident.orderId === null ? null : (
        <Link className={catalog.rowAction} href={`/panel/pedidos/${incident.orderId}`}>
          Ver pedido <span aria-hidden="true">→</span>
        </Link>
      )}
      <IncidentResolution canManage={canManage} incident={incident} />
    </article>
  );
}

/**
 * Cerrar una incidencia.
 *
 * Tres cosas que no son de estilo:
 *
 * - El motivo sale de un **selector cerrado** con los cinco códigos del contrato. No hay campo de
 *   texto, y no es una carencia: una nota acabaría guardando el correo de quien pagó.
 * - `expectedVersion` viaja siempre. Dos administradores mirando la misma bandeja podrían cerrarla
 *   con motivos distintos, y sin la versión el segundo pisaría al primero.
 * - Una incidencia resuelta **puede reabrirse**. El contrato lo dice: si el mismo hecho vuelve a
 *   ocurrir, el backend la reabre y le sube la versión. Por eso la pantalla no la trata como
 *   definitiva ni la esconde, y una resuelta sigue enseñando su motivo de cierre.
 */
function IncidentResolution({
  incident,
  canManage,
}: {
  readonly incident: PaymentIncident;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string>(RESOLUTION_CODES[0].code);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef(false);

  const selectId = `resolution-${incident.id}`;

  if (incident.status === 'resolved') {
    const resolution = describeResolutionCode(incident.resolutionCode);

    return (
      <p className={catalog.hint}>
        {resolution === null ? 'Resuelta' : `Resuelta: ${resolution}`}
        {incident.resolvedAt === null ? '' : ` · ${formatDateTime(incident.resolvedAt)}`}
        {/*
         * Se dice que puede volver: dar por definitivo un cierre escondería algo que sigue
         * ocurriendo, que es exactamente lo que el backend evita reabriéndola.
         */}
        . Si el mismo hecho vuelve a ocurrir, se reabre sola.
      </p>
    );
  }

  if (!canManage) {
    return <span className={catalog.hint}>Tu rol no permite cerrar incidencias.</span>;
  }

  async function resolve(): Promise<void> {
    if (running.current) return;

    running.current = true;
    setBusy(true);
    setFailure(null);

    const result = await resolvePaymentIncident(incident.id, {
      expectedVersion: incident.version,
      resolutionCode: code as (typeof RESOLUTION_CODES)[number]['code'],
    });

    if (result.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setFailure(result.code);
    }

    running.current = false;
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        className={catalog.rowAction}
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        Resolver
      </button>
    );
  }

  return (
    <div className={styles.confirm} role="group">
      <h4 className={styles.confirmTitle}>Cerrar esta incidencia</h4>
      <p className={styles.confirmText}>
        Cerrarla es afirmar que ya se revisó. Si el mismo hecho vuelve a ocurrir, el backend la
        reabre.
      </p>

      <div className={styles.filterField}>
        <label className={styles.fieldLabel} htmlFor={selectId}>
          Motivo del cierre
        </label>
        <select
          className={styles.select}
          id={selectId}
          onChange={(event) => {
            setCode(event.target.value);
          }}
          value={code}
        >
          {RESOLUTION_CODES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.label}
            </option>
          ))}
        </select>
        <p className={styles.fieldHint}>
          {RESOLUTION_CODES.find((entry) => entry.code === code)?.hint}
        </p>
      </div>

      <div className={styles.confirmActions}>
        <button
          className={catalog.buttonPrimary}
          disabled={busy}
          onClick={() => void resolve()}
          type="button"
        >
          {busy ? 'Cerrando…' : 'Confirmar cierre'}
        </button>
        <button
          className={catalog.buttonSecondary}
          disabled={busy}
          onClick={() => {
            setOpen(false);
          }}
          type="button"
        >
          Cancelar
        </button>
      </div>

      {failure === null ? null : (
        <p className={catalog.error} role="alert">
          {describeOrderFailure(failure)}
          {offersReload(failure) ? (
            <span className={styles.confirmActions}>
              <button
                className={catalog.buttonSecondary}
                onClick={() => {
                  router.refresh();
                }}
                type="button"
              >
                Recargar bandeja
              </button>
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}
