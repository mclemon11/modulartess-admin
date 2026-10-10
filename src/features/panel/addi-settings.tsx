'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  ADDI_CONFIRMATION_PHRASE,
  ADDI_FIELD_LABELS,
  ADDI_SECRET_FIELDS,
  addiActivationBlocker,
  addiActivationRequest,
  buildAddiUpdate,
  describeAddiCredential,
  describeAddiError,
  describeAddiFailure,
  describeAddiIncidents,
  EMPTY_ADDI_SECRETS,
  isAddiConfirmation,
  replacing,
  type AddiSecretField,
} from './addi-integration';
import catalog from './catalog.module.css';
import { CopyableValue } from './copyable-value';
import { formatDateTime } from './format';
import { Fact } from './integration-cards';
import styles from './integrations.module.css';
import {
  setAddiActivation,
  testAddiConnection,
  updateAddiIntegration,
} from './integrations-client';

import type { AddiIntegration } from '@/lib/api/integrations';

/** Texto de un fallo del BFF. Nunca el mensaje del backend ni lo escrito. */
const failureText = describeAddiFailure;

const NO_REPLACE: Readonly<Record<AddiSecretField, boolean>> = {
  clientId: false,
  clientSecret: false,
  callbackUsername: false,
  callbackSecret: false,
};

/**
 * Configurar Addi (ADR 0015): Producción.
 *
 * - **Credenciales**: nacen vacías, nunca se precargan y se vacían al guardar bien. Las guardadas
 *   se ven como «Guardado» —con la pista del backend si la hay— y se conservan salvo que se marque
 *   «Reemplazar». Los valores viven solo en el estado de este componente.
 * - **Prueba**: pide un JWT a Addi a través del backend. Nada más.
 * - **Activar**: otra operación, con confirmación escrita. Guardar nunca activa.
 */
export function AddiSettings({
  integration,
  canManage,
}: {
  readonly integration: AddiIntegration;
  readonly canManage: boolean;
}) {
  return (
    <div className={styles.form}>
      <AddiStatus integration={integration} />
      <AddiActivationControl canManage={canManage} integration={integration} />
      <AddiCredentialsForm canManage={canManage} integration={integration} />
      <AddiConnectionTest canManage={canManage} integration={integration} />
      <details className={styles.advanced} open>
        <summary className={styles.advancedSummary}>URL de notificación</summary>
        <div className={styles.advancedBody}>
          <CopyableValue
            hint="Solo lectura: la deriva el backend de su configuración. Es la callbackUrl de cada solicitud."
            label="URL del webhook"
            value={integration.webhookUrl}
          />
          <CopyableValue
            hint="Página de la tienda a la que Addi devuelve a quien compra. No confirma ningún pago."
            label="URL de resultado"
            value={integration.resultBaseUrl}
          />
        </div>
      </details>
    </div>
  );
}

function AddiStatus({ integration }: { readonly integration: AddiIntegration }) {
  const error = describeAddiError(integration.lastErrorCode);

  return (
    <dl className={styles.facts}>
      <Fact label="Ambiente" value="Producción" />
      <Fact
        hint="Guardia del despliegue ADDI_LIVE_PAYMENTS_ENABLED. No se cambia desde el panel."
        label="Despliegue"
        value={
          integration.livePaymentsEnabled ? 'Permite pagos con Addi' : 'Bloquea pagos con Addi'
        }
      />
      <Fact label="Último intento" value={dateOrNever(integration.lastAttemptAt)} />
      <Fact label="Último callback válido" value={dateOrNever(integration.lastVerifiedWebhookAt)} />
      <Fact
        label="Último callback recibido"
        value={dateOrNever(integration.lastWebhookAttemptAt)}
      />
      <Fact
        label="Última prueba"
        value={
          integration.lastTestedAt === null
            ? 'Nunca'
            : `${formatDateTime(integration.lastTestedAt)} · ${integration.lastTestStatus === 'passed' ? 'superada' : 'fallida'}`
        }
      />
      <Fact
        label="Último error"
        value={
          error === null
            ? 'Ninguno'
            : `${error}${integration.lastErrorAt === null ? '' : ` (${formatDateTime(integration.lastErrorAt)})`}`
        }
      />
      <Fact label="Incidencias abiertas" value={describeAddiIncidents(integration.openIncidents)} />
    </dl>
  );
}

function dateOrNever(value: string | null): string {
  return value === null ? 'Nunca' : formatDateTime(value);
}

function AddiCredentialsForm({
  integration,
  canManage,
}: {
  readonly integration: AddiIntegration;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [allySlug, setAllySlug] = useState(integration.allySlug ?? '');
  const [values, setValues] = useState<Record<AddiSecretField, string>>({ ...EMPTY_ADDI_SECRETS });
  const [replace, setReplace] = useState<Record<AddiSecretField, boolean>>({ ...NO_REPLACE });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<readonly string[]>([]);
  const [saved, setSaved] = useState(false);
  // Candado síncrono: dos envíos guardarían dos versiones del mismo secreto.
  const running = useRef(false);

  async function save(): Promise<void> {
    if (running.current) return;

    setFailure(null);
    setSaved(false);

    const built = buildAddiUpdate(integration, { allySlug, replace, values });

    if (!built.ok) {
      setFailure(built.message);
      setInvalid(built.fields);
      return;
    }

    running.current = true;
    setBusy(true);
    setInvalid([]);

    const result = await updateAddiIntegration(built.body);

    if (result.ok) {
      // Solo aquí se vacían: ya están guardados y no hay motivo para dejarlos en el DOM.
      setValues({ ...EMPTY_ADDI_SECRETS });
      setReplace({ ...NO_REPLACE });
      setSaved(true);
      router.refresh();
    } else {
      setFailure(failureText(result.code));
      if (result.code === 'integration_conflict') router.refresh();
    }

    running.current = false;
    setBusy(false);
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className={styles.fields}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="addi-ally-slug">
            Identificador del comercio (allySlug)
          </label>
          <input
            aria-invalid={invalid.includes('allySlug')}
            autoComplete="off"
            className={invalid.includes('allySlug') ? styles.inputInvalid : styles.input}
            disabled={!canManage || busy}
            id="addi-ally-slug"
            name="addi-ally-slug"
            onChange={(event) => {
              setAllySlug(event.target.value);
            }}
            spellCheck={false}
            type="text"
            value={allySlug}
          />
          <p className={styles.fieldHint}>
            No es un secreto: es el nombre público del comercio en Addi.
          </p>
        </div>

        {ADDI_SECRET_FIELDS.map((field) => {
          const editing = replacing(integration, { replace }, field);
          const inputId = `addi-${field}`;
          const stored = describeAddiCredential(integration, field);
          const configured = stored !== 'Sin configurar';

          return (
            <div className={styles.field} key={field}>
              <label className={styles.fieldLabel} htmlFor={inputId}>
                {ADDI_FIELD_LABELS[field]}
              </label>
              <p className={styles.fieldHint} id={`${inputId}-stored`}>
                {stored}
              </p>
              {configured && canManage ? (
                <label className={styles.fieldHint}>
                  <input
                    checked={replace[field]}
                    disabled={busy}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setReplace((current) => ({ ...current, [field]: checked }));
                      if (!checked) setValues((current) => ({ ...current, [field]: '' }));
                    }}
                    type="checkbox"
                  />{' '}
                  Reemplazar (si no, se conserva el guardado)
                </label>
              ) : null}
              {editing ? (
                <input
                  aria-describedby={`${inputId}-stored`}
                  aria-invalid={invalid.includes(field)}
                  autoComplete="new-password"
                  className={invalid.includes(field) ? styles.inputInvalid : styles.input}
                  data-1p-ignore=""
                  disabled={!canManage || busy}
                  id={inputId}
                  name={inputId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setValues((current) => ({ ...current, [field]: value }));
                  }}
                  spellCheck={false}
                  type="password"
                  value={values[field]}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {canManage ? (
        <div className={styles.formActions}>
          <button className={catalog.buttonPrimary} disabled={busy} type="submit">
            {busy ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      ) : (
        <p className={catalog.hint}>
          Tu rol puede consultar el estado de Addi, pero no editar sus credenciales.
        </p>
      )}

      <p aria-live="polite" className={styles.formStatus}>
        {saved
          ? 'Configuración guardada. Guardar no activa pagos: ejecuta la prueba y actívalos aparte.'
          : ''}
      </p>

      {failure === null ? null : (
        <p className={catalog.error} role="alert">
          {failure}
        </p>
      )}
    </form>
  );
}

function AddiConnectionTest({
  integration,
  canManage,
}: {
  readonly integration: AddiIntegration;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const running = useRef(false);

  if (!canManage) return null;

  async function run(): Promise<void> {
    if (running.current) return;

    running.current = true;
    setBusy(true);
    setMessage(null);

    const result = await testAddiConnection();

    if (result.ok) {
      setMessage(
        result.data.authenticated
          ? 'Addi emitió un token con las credenciales guardadas. No se creó ninguna solicitud.'
          : `La autenticación falló: ${describeAddiError(result.data.errorCode) ?? 'motivo desconocido'}.`,
      );
      router.refresh();
    } else {
      setMessage(failureText(result.code));
    }

    running.current = false;
    setBusy(false);
  }

  return (
    <div className={styles.paymentsToggle}>
      <div className={styles.paymentsState}>
        <span className={styles.statePending}>Prueba de autenticación</span>
        <button
          className={catalog.buttonSecondary}
          disabled={busy || !integration.clientIdConfigured || !integration.clientSecretConfigured}
          onClick={() => void run()}
          type="button"
        >
          {busy ? 'Probando…' : 'Probar autenticación'}
        </button>
      </div>
      <p className={catalog.hint}>
        Solo solicita un JWT a Addi con el Client ID y el Client Secret guardados. No mueve dinero.
      </p>
      <p aria-live="polite" className={styles.formStatus}>
        {message ?? ''}
      </p>
    </div>
  );
}

function AddiActivationControl({
  integration,
  canManage,
}: {
  readonly integration: AddiIntegration;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef(false);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (confirming) input.current?.focus();
  }, [confirming]);

  const enabled = integration.enabledForNewPayments;
  const blocker = addiActivationBlocker(integration);

  async function apply(enable: boolean): Promise<void> {
    if (running.current) return;

    running.current = true;
    setBusy(true);
    setFailure(null);

    const result = await setAddiActivation(addiActivationRequest(integration.version, enable));

    setPhrase('');

    if (result.ok) {
      setConfirming(false);
      router.refresh();
    } else {
      setFailure(failureText(result.code));
      if (result.code === 'integration_conflict') router.refresh();
    }

    running.current = false;
    setBusy(false);
  }

  return (
    <div className={styles.paymentsToggle} data-addi-state={enabled ? 'enabled' : 'disabled'}>
      <div className={styles.paymentsState}>
        {integration.acceptingNewPayments ? (
          <span className={styles.stateActive}>Pagos con Addi activos</span>
        ) : (
          <span className={styles.statePending}>
            {enabled ? 'Activado, pero sin aceptar pagos' : 'Pagos con Addi desactivados'}
          </span>
        )}

        {!canManage || confirming ? null : enabled ? (
          <button
            className={catalog.buttonSecondary}
            disabled={busy}
            onClick={() => {
              setFailure(null);
              setConfirming(true);
            }}
            type="button"
          >
            Desactivar pagos con Addi
          </button>
        ) : (
          <button
            className={catalog.buttonPrimary}
            disabled={blocker !== null}
            onClick={() => {
              setFailure(null);
              setConfirming(true);
            }}
            type="button"
          >
            Activar pagos con Addi
          </button>
        )}
      </div>

      <p className={catalog.hint}>
        {enabled
          ? 'Desactivar detiene las solicitudes nuevas y no borra nada: los intentos abiertos siguen recibiendo su callback.'
          : (blocker ?? 'Todo listo. Activar ofrece Addi en la tienda para pedidos nuevos.')}
      </p>

      {canManage && confirming ? (
        <form
          aria-labelledby="addi-confirm-title"
          className={styles.liveConfirm}
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            if (enabled) void apply(false);
            else if (isAddiConfirmation(phrase)) void apply(true);
          }}
        >
          <p className={styles.liveConfirmTitle} id="addi-confirm-title">
            {enabled ? 'Vas a desactivar Addi' : 'Vas a activar pagos reales con Addi'}
          </p>
          {enabled ? (
            <p className={styles.liveConfirmText}>
              La tienda dejará de ofrecer Addi en pedidos nuevos. ¿Confirmas?
            </p>
          ) : (
            <>
              <p className={styles.liveConfirmText}>
                Desde que confirmes, quien compre podrá solicitar crédito real con Addi Producción
                en la tienda.
              </p>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="addi-confirmation">
                  Escribe <strong>{ADDI_CONFIRMATION_PHRASE}</strong> para confirmar
                </label>
                <input
                  autoComplete="off"
                  className={styles.input}
                  disabled={busy}
                  id="addi-confirmation"
                  onChange={(event) => {
                    setPhrase(event.target.value);
                  }}
                  ref={input}
                  spellCheck={false}
                  type="text"
                  value={phrase}
                />
              </div>
            </>
          )}
          <div className={styles.formActions}>
            <button
              className={enabled ? catalog.buttonSecondary : catalog.buttonPrimary}
              disabled={busy || (!enabled && !isAddiConfirmation(phrase))}
              type="submit"
            >
              {busy ? 'Aplicando…' : enabled ? 'Sí, desactivar' : 'Activar Addi'}
            </button>
            <button
              className={catalog.buttonSecondary}
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setPhrase('');
              }}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {!canManage ? (
        <p className={catalog.hint}>Tu rol puede ver este estado, pero no cambiarlo.</p>
      ) : null}

      <div aria-live="assertive">
        {failure === null ? null : (
          <p className={catalog.error} role="alert">
            {failure}
          </p>
        )}
      </div>
    </div>
  );
}
