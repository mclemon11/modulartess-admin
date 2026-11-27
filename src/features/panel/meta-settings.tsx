'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import catalog from './catalog.module.css';
import { CopyableValue } from './copyable-value';
import { formatDateTime } from './format';
import { Fact } from './integration-cards';
import styles from './integrations.module.css';
import {
  setMetaActivation,
  testMetaConnection,
  updateMetaIntegration,
} from './integrations-client';
import {
  buildMetaUpdate,
  describeMetaError,
  describeMetaFailure,
  describeMetaToken,
  isMetaConfirmation,
  META_CONFIRMATION_PHRASE,
  metaActivationBlocker,
  metaActivationRequest,
  metaHealth,
  normalizeMetaTestCode,
} from './meta-integration';

import type { MetaIntegration } from '@/lib/api/integrations';

/** Texto de un fallo del BFF. Nunca el mensaje del backend ni lo escrito. */
const failureText = describeMetaFailure;

/**
 * Configurar Meta: píxel de la tienda y compras enviadas desde el servidor (API de conversiones).
 *
 * - **Configuración**: el ID del conjunto de datos (público) se precarga; el token de la API de
 *   conversiones nace vacío, nunca se precarga y se vacía al guardar bien. Del guardado solo se ve
 *   la pista del backend.
 * - **Prueba**: el backend envía una compra de prueba con el código de «Probar eventos».
 * - **Activar**: otra operación, con confirmación escrita. Guardar nunca activa.
 */
export function MetaSettings({
  integration,
  canManage,
}: {
  readonly integration: MetaIntegration;
  readonly canManage: boolean;
}) {
  return (
    <div className={styles.form}>
      <MetaStatus integration={integration} />
      <MetaActivationControl canManage={canManage} integration={integration} />
      <MetaConfigurationForm canManage={canManage} integration={integration} />
      <MetaConnectionTest canManage={canManage} integration={integration} />
      <details className={styles.advanced} open>
        <summary className={styles.advancedSummary}>Catálogo de productos</summary>
        <div className={styles.advancedBody}>
          <CopyableValue
            hint="Es el feed del catálogo de Meta «Modulartess Web», que ya lo lee cada hora (Administrador de ventas → Catálogo → Orígenes de datos). Solo hace falta pegarla si se crea otro catálogo."
            label="URL del feed del catálogo «Modulartess Web»"
            value={integration.feedUrl}
          />
        </div>
      </details>
    </div>
  );
}

function MetaStatus({ integration }: { readonly integration: MetaIntegration }) {
  const error = describeMetaError(integration.lastErrorCode);

  return (
    <dl className={styles.facts}>
      <Fact
        hint="Solo activa carga el píxel en la tienda —con consentimiento de publicidad— y envía compras."
        label="Estado"
        value={metaHealth(integration).label}
      />
      <Fact label="Token de la API de conversiones" value={describeMetaToken(integration)} />
      <Fact label="Última compra enviada" value={dateOrNever(integration.lastEventAt)} />
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
    </dl>
  );
}

function dateOrNever(value: string | null): string {
  return value === null ? 'Nunca' : formatDateTime(value);
}

function MetaConfigurationForm({
  integration,
  canManage,
}: {
  readonly integration: MetaIntegration;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [pixelId, setPixelId] = useState(integration.pixelId ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<readonly string[]>([]);
  const [saved, setSaved] = useState(false);
  // Candado síncrono: dos envíos guardarían dos versiones del mismo token.
  const running = useRef(false);

  async function save(): Promise<void> {
    if (running.current) return;

    setFailure(null);
    setSaved(false);

    const built = buildMetaUpdate(integration, { pixelId, accessToken });

    if (!built.ok) {
      setFailure(built.message);
      setInvalid(built.fields);
      return;
    }

    running.current = true;
    setBusy(true);
    setInvalid([]);

    const result = await updateMetaIntegration(built.body);

    if (result.ok) {
      // Solo aquí se vacía: ya está guardado y no hay motivo para dejarlo en el DOM.
      setAccessToken('');
      setSaved(true);
      router.refresh();
    } else {
      setFailure(failureText(result.code));
      if (result.code === 'integration_conflict') router.refresh();
    }

    running.current = false;
    setBusy(false);
  }

  const stored = describeMetaToken(integration);

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
          <label className={styles.fieldLabel} htmlFor="meta-pixel-id">
            ID del conjunto de datos (píxel)
          </label>
          <input
            aria-invalid={invalid.includes('pixelId')}
            autoComplete="off"
            className={invalid.includes('pixelId') ? styles.inputInvalid : styles.input}
            disabled={!canManage || busy}
            id="meta-pixel-id"
            inputMode="numeric"
            name="meta-pixel-id"
            onChange={(event) => {
              setPixelId(event.target.value);
            }}
            spellCheck={false}
            type="text"
            value={pixelId}
          />
          <p className={styles.fieldHint}>
            Identificador del conjunto de datos en el Administrador de eventos (solo números). No es
            un secreto: la tienda lo incrusta para cargar el píxel.
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="meta-access-token">
            Token de la API de conversiones
          </label>
          <p className={styles.fieldHint} id="meta-access-token-stored">
            {stored}
          </p>
          {canManage ? (
            <>
              <input
                aria-describedby="meta-access-token-stored meta-access-token-hint"
                aria-invalid={invalid.includes('accessToken')}
                autoComplete="new-password"
                className={invalid.includes('accessToken') ? styles.inputInvalid : styles.input}
                data-1p-ignore=""
                disabled={busy}
                id="meta-access-token"
                name="meta-access-token"
                onChange={(event) => {
                  setAccessToken(event.target.value);
                }}
                spellCheck={false}
                type="password"
                value={accessToken}
              />
              <p className={styles.fieldHint} id="meta-access-token-hint">
                Administrador de eventos → tu conjunto de datos → Configuración → API de
                conversiones → Generar token de acceso.{' '}
                {integration.accessTokenConfigured
                  ? 'Déjalo vacío para conservar el actual. Nunca vuelve a mostrarse.'
                  : 'Se guarda cifrado y nunca vuelve a mostrarse.'}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <div className={styles.formActions}>
          <button className={catalog.buttonPrimary} disabled={busy} type="submit">
            {busy ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      ) : (
        <p className={catalog.hint}>
          Tu rol puede consultar el estado de Meta, pero no editar su configuración.
        </p>
      )}

      <p aria-live="polite" className={styles.formStatus}>
        {saved
          ? 'Configuración guardada. Guardar no activa nada: envía una compra de prueba y actívala aparte.'
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

function MetaConnectionTest({
  integration,
  canManage,
}: {
  readonly integration: MetaIntegration;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const running = useRef(false);

  if (!canManage) return null;

  const ready = integration.pixelId !== null && integration.accessTokenConfigured;

  async function run(): Promise<void> {
    if (running.current) return;

    if (code.trim() === '') {
      setMessage('Escribe el código de eventos de prueba.');
      return;
    }

    const testEventCode = normalizeMetaTestCode(code);

    if (testEventCode === null) {
      setMessage(
        'El código solo lleva letras y números (de 3 a 32), como TEST12345. Cópialo de nuevo.',
      );
      return;
    }

    running.current = true;
    setBusy(true);
    setMessage(null);

    const result = await testMetaConnection({ testEventCode });

    if (result.ok) {
      setMessage(
        result.data.accepted
          ? 'Meta aceptó la compra de prueba. Revísala en «Probar eventos»; no cuenta como conversión.'
          : `Meta rechazó la compra de prueba: ${describeMetaError(result.data.errorCode) ?? 'motivo desconocido'}.`,
      );
      router.refresh();
    } else {
      setMessage(failureText(result.code));
    }

    running.current = false;
    setBusy(false);
  }

  return (
    <form
      className={styles.paymentsToggle}
      onSubmit={(event) => {
        event.preventDefault();
        void run();
      }}
    >
      <div className={styles.paymentsState}>
        <span className={styles.statePending}>Probar</span>
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="meta-test-event-code">
          Código de eventos de prueba
        </label>
        <input
          aria-describedby="meta-test-event-code-hint"
          autoComplete="off"
          className={styles.input}
          disabled={busy || !ready}
          id="meta-test-event-code"
          maxLength={32}
          name="meta-test-event-code"
          onChange={(event) => {
            setCode(event.target.value);
          }}
          spellCheck={false}
          type="text"
          value={code}
        />
        <p className={styles.fieldHint} id="meta-test-event-code-hint">
          El código TEST… de la pestaña «Probar eventos» del Administrador de eventos. La compra de
          prueba no cuenta como conversión.
        </p>
      </div>
      <div className={styles.formActions}>
        <button
          className={catalog.buttonSecondary}
          disabled={busy || !ready || code.trim() === ''}
          type="submit"
        >
          {busy ? 'Enviando…' : 'Enviar compra de prueba'}
        </button>
      </div>
      {ready ? null : (
        <p className={catalog.hint}>
          Guarda el ID del conjunto de datos y el token antes de probar.
        </p>
      )}
      <p aria-live="polite" className={styles.formStatus}>
        {message ?? ''}
      </p>
    </form>
  );
}

function MetaActivationControl({
  integration,
  canManage,
}: {
  readonly integration: MetaIntegration;
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

  const enabled = integration.enabled;
  const blocker = metaActivationBlocker(integration);

  async function apply(enable: boolean): Promise<void> {
    if (running.current) return;

    running.current = true;
    setBusy(true);
    setFailure(null);

    const result = await setMetaActivation(metaActivationRequest(integration.version, enable));

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
    <div className={styles.paymentsToggle} data-meta-state={enabled ? 'enabled' : 'disabled'}>
      <div className={styles.paymentsState}>
        {integration.active ? (
          <span className={styles.stateActive}>Meta activa</span>
        ) : (
          <span className={styles.statePending}>
            {enabled ? 'Encendida, pero incompleta' : 'Meta apagada'}
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
            Desactivar Meta
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
            Activar Meta
          </button>
        )}
      </div>

      <p className={catalog.hint}>
        {enabled
          ? 'Desactivar deja de cargar el píxel en la tienda y de enviar compras. No borra la configuración.'
          : (blocker ??
            'Todo listo. Activar carga el píxel en la tienda —solo con consentimiento de publicidad— y envía a Meta las compras aprobadas, con el correo y el teléfono cifrados (SHA-256).')}
      </p>

      {canManage && confirming ? (
        <form
          aria-labelledby="meta-confirm-title"
          className={styles.liveConfirm}
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            if (enabled) void apply(false);
            else if (isMetaConfirmation(phrase)) void apply(true);
          }}
        >
          <p className={styles.liveConfirmTitle} id="meta-confirm-title">
            {enabled ? 'Vas a desactivar Meta' : 'Vas a activar Meta'}
          </p>
          {enabled ? (
            <p className={styles.liveConfirmText}>
              La tienda dejará de cargar el píxel y el backend dejará de enviar compras. ¿Confirmas?
            </p>
          ) : (
            <>
              <p className={styles.liveConfirmText}>
                Desde que confirmes, la tienda cargará el píxel a quien acepte las cookies de
                publicidad y cada compra aprobada se enviará a Meta desde el servidor, con el correo
                y el teléfono cifrados (SHA-256).
              </p>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="meta-confirmation">
                  Escribe <strong>{META_CONFIRMATION_PHRASE}</strong> para confirmar
                </label>
                <input
                  autoComplete="off"
                  className={styles.input}
                  disabled={busy}
                  id="meta-confirmation"
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
              disabled={busy || (!enabled && !isMetaConfirmation(phrase))}
              type="submit"
            >
              {busy ? 'Aplicando…' : enabled ? 'Sí, desactivar' : 'Activar Meta'}
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
