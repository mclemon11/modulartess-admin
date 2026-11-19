'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import catalog from './catalog.module.css';
import { CopyableValue } from './copyable-value';
import { formatDateTime } from './format';
import { Fact } from './integration-cards';
import styles from './integrations.module.css';
import {
  setTikTokActivation,
  testTikTokConnection,
  updateTikTokIntegration,
} from './integrations-client';
import {
  buildTikTokUpdate,
  describeTikTokError,
  describeTikTokFailure,
  describeTikTokToken,
  isTikTokConfirmation,
  TIKTOK_CONFIRMATION_PHRASE,
  tiktokActivationBlocker,
  tiktokActivationRequest,
  tiktokHealth,
} from './tiktok-integration';

import type { TikTokIntegration } from '@/lib/api/integrations';

/** Texto de un fallo del BFF. Nunca el mensaje del backend ni lo escrito. */
const failureText = describeTikTokFailure;

/**
 * Configurar TikTok: píxel de la tienda y compras enviadas desde el servidor.
 *
 * - **Configuración**: el Pixel ID (público) se precarga; el token de Events API nace vacío, nunca
 *   se precarga y se vacía al guardar bien. Del guardado solo se ve la pista del backend.
 * - **Prueba**: el backend envía una compra de prueba con el código de «Eventos de prueba».
 * - **Activar**: otra operación, con confirmación escrita. Guardar nunca activa.
 */
export function TikTokSettings({
  integration,
  canManage,
}: {
  readonly integration: TikTokIntegration;
  readonly canManage: boolean;
}) {
  return (
    <div className={styles.form}>
      <TikTokStatus integration={integration} />
      <TikTokActivationControl canManage={canManage} integration={integration} />
      <TikTokConfigurationForm canManage={canManage} integration={integration} />
      <TikTokConnectionTest canManage={canManage} integration={integration} />
      <details className={styles.advanced} open>
        <summary className={styles.advancedSummary}>Catálogo de productos</summary>
        <div className={styles.advancedBody}>
          <CopyableValue
            hint="Pégala en TikTok → Catálogo Modulartess → Productos → Subir feed → Carga programada (CSV)."
            label="URL del feed de productos"
            value={integration.feedUrl}
          />
        </div>
      </details>
    </div>
  );
}

function TikTokStatus({ integration }: { readonly integration: TikTokIntegration }) {
  const error = describeTikTokError(integration.lastErrorCode);

  return (
    <dl className={styles.facts}>
      <Fact
        hint="Solo activa carga el píxel en la tienda —con consentimiento de publicidad— y envía compras."
        label="Estado"
        value={tiktokHealth(integration).label}
      />
      <Fact label="Último evento enviado" value={dateOrNever(integration.lastEventAt)} />
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

function TikTokConfigurationForm({
  integration,
  canManage,
}: {
  readonly integration: TikTokIntegration;
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

    const built = buildTikTokUpdate(integration, { pixelId, accessToken });

    if (!built.ok) {
      setFailure(built.message);
      setInvalid(built.fields);
      return;
    }

    running.current = true;
    setBusy(true);
    setInvalid([]);

    const result = await updateTikTokIntegration(built.body);

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

  const stored = describeTikTokToken(integration);

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
          <label className={styles.fieldLabel} htmlFor="tiktok-pixel-id">
            Pixel ID
          </label>
          <input
            aria-invalid={invalid.includes('pixelId')}
            autoComplete="off"
            className={invalid.includes('pixelId') ? styles.inputInvalid : styles.input}
            disabled={!canManage || busy}
            id="tiktok-pixel-id"
            name="tiktok-pixel-id"
            onChange={(event) => {
              setPixelId(event.target.value);
            }}
            spellCheck={false}
            type="text"
            value={pixelId}
          />
          <p className={styles.fieldHint}>
            No es un secreto: la tienda lo incrusta para cargar el píxel.
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="tiktok-access-token">
            Token de Events API
          </label>
          <p className={styles.fieldHint} id="tiktok-access-token-stored">
            {stored}
          </p>
          {canManage ? (
            <>
              <input
                aria-describedby="tiktok-access-token-stored tiktok-access-token-hint"
                aria-invalid={invalid.includes('accessToken')}
                autoComplete="new-password"
                className={invalid.includes('accessToken') ? styles.inputInvalid : styles.input}
                data-1p-ignore=""
                disabled={busy}
                id="tiktok-access-token"
                name="tiktok-access-token"
                onChange={(event) => {
                  setAccessToken(event.target.value);
                }}
                spellCheck={false}
                type="password"
                value={accessToken}
              />
              <p className={styles.fieldHint} id="tiktok-access-token-hint">
                {integration.accessTokenConfigured
                  ? 'Déjalo vacío para conservar el guardado. Nunca vuelve a mostrarse.'
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
          Tu rol puede consultar el estado de TikTok, pero no editar su configuración.
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

function TikTokConnectionTest({
  integration,
  canManage,
}: {
  readonly integration: TikTokIntegration;
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

    const testEventCode = code.trim();

    if (testEventCode === '') {
      setMessage('Escribe el código de eventos de prueba.');
      return;
    }

    running.current = true;
    setBusy(true);
    setMessage(null);

    const result = await testTikTokConnection({ testEventCode });

    if (result.ok) {
      setMessage(
        result.data.accepted
          ? 'TikTok aceptó la compra de prueba. Revísala en Eventos de prueba; no cuenta como conversión.'
          : `TikTok rechazó la compra de prueba: ${describeTikTokError(result.data.errorCode) ?? 'motivo desconocido'}.`,
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
        <label className={styles.fieldLabel} htmlFor="tiktok-test-event-code">
          Código de eventos de prueba
        </label>
        <input
          aria-describedby="tiktok-test-event-code-hint"
          autoComplete="off"
          className={styles.input}
          disabled={busy || !ready}
          id="tiktok-test-event-code"
          maxLength={64}
          name="tiktok-test-event-code"
          onChange={(event) => {
            setCode(event.target.value);
          }}
          spellCheck={false}
          type="text"
          value={code}
        />
        <p className={styles.fieldHint} id="tiktok-test-event-code-hint">
          Lo encuentras en TikTok Ads Manager → Administrador de eventos → píxel Modulartess Web →
          Eventos de prueba. La compra de prueba no cuenta como conversión.
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
        <p className={catalog.hint}>Guarda el Pixel ID y el token antes de probar.</p>
      )}
      <p aria-live="polite" className={styles.formStatus}>
        {message ?? ''}
      </p>
    </form>
  );
}

function TikTokActivationControl({
  integration,
  canManage,
}: {
  readonly integration: TikTokIntegration;
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
  const blocker = tiktokActivationBlocker(integration);

  async function apply(enable: boolean): Promise<void> {
    if (running.current) return;

    running.current = true;
    setBusy(true);
    setFailure(null);

    const result = await setTikTokActivation(tiktokActivationRequest(integration.version, enable));

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
    <div className={styles.paymentsToggle} data-tiktok-state={enabled ? 'enabled' : 'disabled'}>
      <div className={styles.paymentsState}>
        {integration.active ? (
          <span className={styles.stateActive}>TikTok activa</span>
        ) : (
          <span className={styles.statePending}>
            {enabled ? 'Encendida, pero incompleta' : 'TikTok apagada'}
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
            Desactivar TikTok
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
            Activar TikTok
          </button>
        )}
      </div>

      <p className={catalog.hint}>
        {enabled
          ? 'Desactivar deja de cargar el píxel en la tienda y de enviar compras. No borra la configuración.'
          : (blocker ??
            'Todo listo. Activar carga el píxel en la tienda —solo con consentimiento de publicidad— y envía las compras desde el servidor.')}
      </p>

      {canManage && confirming ? (
        <form
          aria-labelledby="tiktok-confirm-title"
          className={styles.liveConfirm}
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            if (enabled) void apply(false);
            else if (isTikTokConfirmation(phrase)) void apply(true);
          }}
        >
          <p className={styles.liveConfirmTitle} id="tiktok-confirm-title">
            {enabled ? 'Vas a desactivar TikTok' : 'Vas a activar TikTok'}
          </p>
          {enabled ? (
            <p className={styles.liveConfirmText}>
              La tienda dejará de cargar el píxel y el backend dejará de enviar compras. ¿Confirmas?
            </p>
          ) : (
            <>
              <p className={styles.liveConfirmText}>
                Desde que confirmes, la tienda cargará el píxel a quien acepte las cookies de
                publicidad y cada compra pagada se enviará a TikTok desde el servidor.
              </p>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="tiktok-confirmation">
                  Escribe <strong>{TIKTOK_CONFIRMATION_PHRASE}</strong> para confirmar
                </label>
                <input
                  autoComplete="off"
                  className={styles.input}
                  disabled={busy}
                  id="tiktok-confirmation"
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
              disabled={busy || (!enabled && !isTikTokConfirmation(phrase))}
              type="submit"
            >
              {busy ? 'Aplicando…' : enabled ? 'Sí, desactivar' : 'Activar TikTok'}
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
