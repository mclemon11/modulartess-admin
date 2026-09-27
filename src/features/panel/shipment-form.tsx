'use client';

import { useState } from 'react';

import catalog from './catalog.module.css';
import { parseShipmentInput } from './order-input';
import styles from './orders.module.css';

import type { OrderShipmentInput } from '@/lib/api/orders';

/**
 * Datos del envío que exige «Marcar enviado».
 *
 * El backend no admite `shipped` sin transportadora, número de guía y enlace de seguimiento, y el
 * correo de «enviado» se los muestra a quien compró. Aquí solo se comprueba la forma antes de
 * enviar; si el enlace es aceptable lo decide el backend.
 */
export function ShipmentForm({
  busy,
  onCancel,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (shipment: OrderShipmentInput) => void;
}) {
  const [carrierName, setCarrierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [invalid, setInvalid] = useState(false);

  return (
    <form
      aria-label="Datos del envío"
      className={styles.shipmentForm}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const shipment = parseShipmentInput({ carrierName, trackingNumber, trackingUrl });

        if (shipment === null) {
          setInvalid(true);
          return;
        }

        setInvalid(false);
        onSubmit(shipment);
      }}
    >
      <p className={catalog.hint}>
        Quien compró recibe estos datos en el correo de «Pedido enviado».
      </p>
      <label className={catalog.field}>
        <span className={catalog.label}>Transportadora</span>
        <input
          autoComplete="off"
          className={catalog.input}
          disabled={busy}
          maxLength={80}
          onChange={(event) => {
            setCarrierName(event.target.value);
          }}
          required
          value={carrierName}
        />
      </label>
      <label className={catalog.field}>
        <span className={catalog.label}>Número de guía</span>
        <input
          autoComplete="off"
          className={catalog.input}
          disabled={busy}
          maxLength={64}
          onChange={(event) => {
            setTrackingNumber(event.target.value);
          }}
          required
          value={trackingNumber}
        />
      </label>
      <label className={catalog.field}>
        <span className={catalog.label}>Enlace de seguimiento</span>
        <input
          autoComplete="off"
          className={catalog.input}
          disabled={busy}
          inputMode="url"
          maxLength={500}
          onChange={(event) => {
            setTrackingUrl(event.target.value);
          }}
          placeholder="https://"
          required
          type="url"
          value={trackingUrl}
        />
      </label>
      {invalid ? (
        <p className={catalog.fieldError} role="alert">
          Completa los tres campos. El enlace tiene que empezar por https://.
        </p>
      ) : null}
      <div className={styles.detailActions}>
        <button className={catalog.buttonPrimary} disabled={busy} type="submit">
          Confirmar envío
        </button>
        <button
          className={catalog.buttonSecondary}
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Volver
        </button>
      </div>
    </form>
  );
}
