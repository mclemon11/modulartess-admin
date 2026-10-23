'use client';

import { useId, useRef, useState } from 'react';

import catalog from './catalog.module.css';
import {
  exportDoneMessage,
  exportEmptyMessage,
  requestOrderExport,
  saveFile,
} from './order-export';
import styles from './orders-toolbar.module.css';

import type { AdminOrderStatusOption } from '@/lib/api/orders';

type Notice = { readonly tone: 'info' | 'error'; readonly text: string };

/**
 * Filtro por estado y exportación del listado de pedidos.
 *
 * Las opciones del selector son las que publica el backend en `statusOptions`, con su etiqueta: el
 * panel no mantiene otra lista. Elegir un estado lo cambia en la URL y vuelve a la página 1; quien
 * llama decide cómo.
 *
 * «Exportar CSV» pide al BFF **todos** los pedidos del filtro activo, no la página visible, y no
 * toca la URL, la página ni el filtro. Un candado síncrono se toma antes del primer `await`, así que
 * un doble clic no lanza dos descargas; `exporting` es solo para pintar «Exportando…».
 */
export function OrdersToolbar({
  options,
  status,
  onStatusChange,
}: {
  readonly options: readonly AdminOrderStatusOption[];
  readonly status: string | null;
  readonly onStatusChange: (status: string | null) => void;
}) {
  const selectId = useId();
  const lock = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function exportCsv() {
    if (lock.current) return;
    lock.current = true;
    setExporting(true);
    setNotice(null);

    // El filtro de este momento: cambiarlo mientras se exporta no cambia lo que se descarga.
    const filter = status;
    try {
      const outcome = await requestOrderExport(filter);
      if (outcome.kind === 'file') {
        saveFile(outcome.blob, outcome.filename);
        setNotice({ tone: 'info', text: exportDoneMessage(outcome.count) });
      } else if (outcome.kind === 'empty') {
        setNotice({ tone: 'info', text: exportEmptyMessage(filter !== null) });
      } else {
        setNotice({ tone: 'error', text: outcome.message });
      }
    } finally {
      lock.current = false;
      setExporting(false);
    }
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.filter}>
        <label className={styles.label} htmlFor={selectId}>
          Estado
        </label>
        <select
          className={styles.select}
          id={selectId}
          onChange={(event) => {
            onStatusChange(event.target.value === '' ? null : event.target.value);
          }}
          value={status ?? ''}
        >
          <option value="">Todos</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {status !== null ? (
          <button
            className={catalog.buttonSecondary}
            onClick={() => onStatusChange(null)}
            type="button"
          >
            Ver todos
          </button>
        ) : null}
      </div>

      <div className={styles.export}>
        <button
          aria-busy={exporting}
          className={catalog.buttonSecondary}
          disabled={exporting}
          onClick={() => void exportCsv()}
          type="button"
        >
          {exporting ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </div>

      {/* Siempre presente, para que el lector de pantalla anuncie el cambio al llegar. */}
      <p
        aria-live={notice?.tone === 'error' ? 'assertive' : 'polite'}
        className={
          notice?.tone === 'error' ? `${styles.notice} ${styles.noticeError}` : styles.notice
        }
        role={notice?.tone === 'error' ? 'alert' : 'status'}
      >
        {exporting ? 'Exportando pedidos…' : (notice?.text ?? '')}
      </p>
    </div>
  );
}
