import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import { formatDateTime } from '@/features/panel/format';
import type { ShippingCopyOperation } from '@/lib/api/shipping';

import { describeCopyFailure, describeProgress } from './copy-operation-model';
import { COPY_STATE_LABELS } from './shipping-labels';
import styles from './shipping.module.css';
import { CopyBadge } from './zone-badges';

/**
 * Una operación de copia, pintada **solo** con los campos que publica `ShippingCopyOperationDto`.
 *
 * - `copying`: fase siguiente y contadores de progreso.
 * - `ready`: la zona resultante, enlazada.
 * - `failed`: el motivo a partir de `failureCode` —estable— y el propio código; `message` se enseña
 *   como texto informativo y no decide nada.
 * - `discarded`: estado final.
 *
 * Nunca hay clave de idempotencia, huella, mapa de reglas, actor ni trazas: el contrato no los
 * publica y este componente no tiene de dónde sacarlos.
 */
export function CopyOperationView({
  operation,
  sourceName,
}: {
  readonly operation: ShippingCopyOperation;
  /** Nombre de la zona original, leído aparte; `null` si ya no se puede leer. */
  readonly sourceName: string | null;
}) {
  const failure = operation.state === 'failed' ? describeCopyFailure(operation.failureCode) : null;

  return (
    <section aria-labelledby="copia-estado" className={`${catalog.card} ${catalog.cardPad}`}>
      <h2 className={catalog.sectionTitle} id="copia-estado">
        Estado: {COPY_STATE_LABELS[operation.state]}{' '}
        <CopyBadge
          copy={{
            state: operation.state,
            error: operation.failureCode,
            operationId: operation.copyOperationId,
            sourceZoneId: operation.sourceZoneId,
          }}
        />
      </h2>

      {operation.state === 'copying' ? (
        <p className={catalog.notice} role="status">
          La copia está en curso. Se puede consultar de nuevo, reanudar si no avanza o descartar.
        </p>
      ) : null}
      {operation.state === 'ready' && operation.zone !== null ? (
        <p className={styles.ok} role="status">
          Copia terminada.{' '}
          <Link href={`/panel/envios/${encodeURIComponent(operation.zone.id)}`}>
            Abrir «{operation.zone.name}»
          </Link>
          : es un borrador nuevo, versión {operation.zone.version}.
        </p>
      ) : null}
      {operation.state === 'failed' ? (
        <div className={catalog.error} role="alert">
          <p>
            La copia se detuvo y guardó su progreso. {failure}
            {operation.failureCode === null ? null : (
              <>
                {' '}
                Código: <span className={catalog.mono}>{operation.failureCode}</span>.
              </>
            )}
          </p>
        </div>
      ) : null}
      {operation.state === 'discarded' ? (
        <p className={catalog.notice} role="status">
          Copia descartada: lo copiado se borró y la copia quedó archivada como rastro. Es un estado
          final; la zona original no cambió.
        </p>
      ) : null}

      <dl className={styles.definitionGrid}>
        <dt>Zona original</dt>
        <dd>
          <Link href={`/panel/envios/${encodeURIComponent(operation.sourceZoneId)}`}>
            {sourceName ?? 'Ver zona original'}
          </Link>{' '}
          · copiada desde su versión {operation.sourceVersion}
        </dd>
        <dt>Zona resultante</dt>
        <dd>
          {operation.zone !== null
            ? `${operation.zone.name} (borrador)`
            : operation.targetZoneId === null
              ? 'Todavía no creada'
              : 'No utilizable hasta que la copia termine'}
        </dd>
        <dt>Progreso</dt>
        <dd>{describeProgress(operation)}</dd>
        <dt>Resumen</dt>
        <dd>{operation.message}</dd>
        <dt>Iniciada</dt>
        <dd>{formatDateTime(operation.createdAt)}</dd>
        <dt>Última actividad</dt>
        <dd>{formatDateTime(operation.updatedAt)}</dd>
      </dl>
    </section>
  );
}
