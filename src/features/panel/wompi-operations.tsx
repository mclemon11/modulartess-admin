'use client';

import { useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import catalog from './catalog.module.css';
import { formatDateTime } from './format';
import styles from './integrations.module.css';
import { describeOrderFailure, offersReload } from './order-errors';
import { testWompiConnection, updateWompiIntegration } from './integrations-client';

import type { WompiConnectionTest, WompiIntegration } from '@/lib/api/integrations';

/**
 * Las tres acciones sobre la integración: encender, probar y revocar.
 *
 * Viven juntas porque comparten el mismo candado y la misma forma de contar un fallo, y separadas
 * de las credenciales porque ninguna de las tres las toca.
 */

/**
 * Encender o apagar los checkouts de prueba.
 *
 * Apagar **no borra nada**, y el texto lo dice: ni pedidos, ni intentos, ni eventos, ni secretos.
 * El webhook sigue cerrando los pagos que ya estaban en vuelo, que es justo lo que haría falta si
 * alguien apagara la integración con una transacción a medias. Es la diferencia entre «quitar
 * Wompi» y «dejar de abrir checkouts nuevos», y solo la segunda es reversible.
 */
export function WompiEnableToggle({
  integration,
  canManage,
}: {
  readonly integration: WompiIntegration;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef(false);

  const enabled = integration.sandbox.enabledForNewPayments;
  const configured = integration.sandbox.configured;

  async function toggle(): Promise<void> {
    if (running.current) return;

    running.current = true;
    setBusy(true);
    setFailure(null);

    const result = await updateWompiIntegration({
      expectedVersion: integration.version,
      environment: 'sandbox',
      enabledForNewPayments: !enabled,
    });

    if (result.ok) {
      router.refresh();
    } else {
      setFailure(result.code);
    }

    running.current = false;
    setBusy(false);
  }

  if (!canManage) return null;

  return (
    <div className={styles.formActions}>
      <button
        className={enabled ? catalog.buttonSecondary : catalog.buttonPrimary}
        // Encender sin las cuatro credenciales lo rechaza el backend. Deshabilitar el botón evita
        // gastar una llamada para que diga lo que la pantalla ya sabe.
        disabled={busy || (!enabled && !configured)}
        onClick={() => void toggle()}
        type="button"
      >
        {enabled ? 'Deshabilitar checkouts de prueba' : 'Habilitar checkouts de prueba'}
      </button>
      {!enabled && !configured ? (
        <span className={catalog.hint}>Faltan credenciales para poder habilitarlo.</span>
      ) : null}
      {failure === null ? null : (
        <p className={catalog.error} role="alert">
          {describeOrderFailure(failure)}
        </p>
      )}
    </div>
  );
}

/**
 * Prueba de configuración.
 *
 * Lo que puede probar es **una sola cosa**, y la pantalla lo dice: que el proveedor responde a la
 * llave pública. De las otras tres credenciales solo informa si hay una versión guardada, porque
 * Wompi no ofrece ninguna operación segura para verificarlas —verificar la de Integridad exigiría
 * un pago y la de Eventos, un evento real—.
 *
 * Presentar las cuatro como «verificadas» sería la mentira cómoda de esta pantalla: haría creer
 * que la integración está lista cuando el primer cobro puede fallar igual.
 */
export function WompiConnectionTester({ canManage }: { readonly canManage: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WompiConnectionTest | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef(false);

  async function run(): Promise<void> {
    if (running.current) return;

    running.current = true;
    setBusy(true);
    setFailure(null);

    const response = await testWompiConnection();

    if (response.ok) {
      setResult(response.data);
    } else {
      setResult(null);
      setFailure(response.code);
    }

    running.current = false;
    setBusy(false);
  }

  if (!canManage) {
    return (
      <p className={catalog.hint}>
        Probar la conexión hace una llamada saliente al proveedor, así que requiere permiso de
        administración de integraciones.
      </p>
    );
  }

  return (
    <>
      <div className={styles.formActions}>
        <button
          className={catalog.buttonSecondary}
          disabled={busy}
          onClick={() => void run()}
          type="button"
        >
          {busy ? 'Probando…' : 'Probar configuración'}
        </button>
        <span aria-live="polite" className={catalog.hint}>
          {busy ? 'Consultando al proveedor…' : ''}
        </span>
      </div>

      {result === null ? null : (
        <dl className={styles.facts}>
          <TestFact
            hint="Es lo único que una prueba puede demostrar sin mover dinero."
            label="Llave pública"
            value={
              result.publicKeyVerified ? 'El proveedor respondió' : 'El proveedor no respondió'
            }
          />
          <TestFact
            hint="Hay una versión guardada. No se comprobó que sea correcta."
            label="Llave privada"
            value={result.privateKeyConfigured ? 'Configurada' : 'Sin configurar'}
          />
          <TestFact
            hint="Verificarlo exigiría un evento real del proveedor."
            label="Secreto de Eventos"
            value={result.eventsSecretConfigured ? 'Configurado' : 'Sin configurar'}
          />
          <TestFact
            hint="Verificarlo exigiría un pago real."
            label="Secreto de Integridad"
            value={result.integritySecretConfigured ? 'Configurado' : 'Sin configurar'}
          />
          <TestFact label="Ambiente probado" value="Pruebas (sandbox)" />
          <TestFact label="Fecha de la prueba" value={formatDateTime(result.testedAt)} />
        </dl>
      )}

      {result?.errorCode == null ? null : (
        <p className={catalog.error} role="alert">
          La prueba no pudo completarse. El panel no muestra la respuesta del proveedor, solo que el
          intento falló.
        </p>
      )}

      {failure === null ? null : (
        <p className={catalog.error} role="alert">
          {describeOrderFailure(failure)}
        </p>
      )}
    </>
  );
}

function TestFact({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string | undefined;
}) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
      {hint === undefined ? null : <dd className={styles.factHint}>{hint}</dd>}
    </div>
  );
}

/**
 * Revocación inmediata de los secretos de Eventos retirados.
 *
 * Es la acción peligrosa de esta pantalla, y el contrato explica por qué existe el periodo de
 * gracia que corta: el proveedor reintenta durante horas, así que una rotación rutinaria que
 * invalidara el secreto anterior perdería desenlaces de pago reales. La gracia es lo que evita eso.
 *
 * Y también explica cuándo hay que cortarla: si el secreto se filtró, esa misma gracia es una
 * ventana en la que quien lo tenga puede seguir firmando eventos que aceptaríamos.
 *
 * Por eso va en su propia caja, con confirmación que dice el precio con todas las letras. La
 * confirmación es un bloque en la pantalla y no un `confirm()` del navegador, que bloquea el
 * documento y no deja leer.
 */
export function WompiRevokeRetiredSecrets({
  integration,
  canManage,
}: {
  readonly integration: WompiIntegration;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef(false);

  const retired = integration.sandbox.retiredEventsSecretCount;

  async function revoke(): Promise<void> {
    if (running.current) return;

    running.current = true;
    setBusy(true);
    setFailure(null);
    setConfirming(false);

    const result = await updateWompiIntegration({
      expectedVersion: integration.version,
      environment: 'sandbox',
      revokeRetiredEventsSecrets: true,
    });

    if (result.ok) {
      router.refresh();
    } else {
      setFailure(result.code);
    }

    running.current = false;
    setBusy(false);
  }

  if (!canManage) return null;

  return (
    <div className={styles.danger}>
      <h3 className={styles.dangerTitle}>Revocación inmediata</h3>
      <p className={styles.dangerText}>
        Hay {retired} versión{retired === 1 ? '' : 'es'} del secreto de Eventos retirada
        {retired === 1 ? '' : 's'} que todavía se aceptan durante{' '}
        {integration.sandbox.eventsSecretGraceHours} horas. Esa gracia existe para no perder los
        reintentos que el proveedor firmó antes de la rotación.
      </p>

      {confirming ? (
        <div className={styles.confirm}>
          <h4 className={styles.confirmTitle}>Cortar el periodo de gracia</h4>
          <p className={styles.confirmText}>
            A partir de ahora se rechazarán los eventos firmados con las versiones anteriores,
            incluidos los que el proveedor siga reintentando. Esos pagos tendrán que cerrarse por
            reconciliación. Es lo correcto justo después de una filtración y es un error como
            rutina.
          </p>
          <div className={styles.confirmActions}>
            <button
              className={catalog.buttonDanger}
              disabled={busy}
              onClick={() => void revoke()}
              type="button"
            >
              Revocar ahora
            </button>
            <button
              className={catalog.buttonSecondary}
              disabled={busy}
              onClick={() => {
                setConfirming(false);
              }}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.formActions}>
          <button
            className={catalog.buttonDanger}
            disabled={busy || retired === 0}
            onClick={() => {
              setConfirming(true);
            }}
            type="button"
          >
            Revocar versiones retiradas
          </button>
          {retired === 0 ? (
            <span className={catalog.hint}>No hay versiones retiradas que revocar.</span>
          ) : null}
        </div>
      )}

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
                Recargar
              </button>
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}
