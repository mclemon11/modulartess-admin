'use client';

import { useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import catalog from './catalog.module.css';
import { describeOrderFailure } from './order-errors';
import styles from './integrations.module.css';
import { CREDENTIAL_LABELS } from './integration-labels';
import { updateWompiIntegration } from './integrations-client';

import type { WompiEnvironmentConfig, WompiIntegration } from '@/lib/api/integrations';

/**
 * Formulario de credenciales de Wompi.
 *
 * Es la pantalla del panel donde más fácil se filtra algo, así que las reglas son explícitas:
 *
 * - **Los cuatro campos nacen vacíos y vuelven a vaciarse al guardar.** Nunca se precargan con un
 *   valor guardado, porque el backend no los devuelve y porque precargarlos los dejaría en el DOM.
 * - **Un campo vacío no borra nada**: significa «conserva la actual», que es la semántica que
 *   declara el contrato para los campos `writeOnly`. El texto de ayuda lo dice con esas palabras.
 * - **Los valores viven en el estado de este componente y en ningún sitio más.** No hay estado
 *   global, no hay `localStorage`, no hay query string y no hay cookie. Al desmontarse la pantalla
 *   desaparecen.
 * - **Ningún valor entra en un mensaje de error.** Lo que se enseña es el código traducido que
 *   devolvió el BFF, nunca lo que se escribió ni lo que respondió el proveedor.
 *
 * La llave pública se trata igual que los secretos al escribirla —`type="password"`— aunque no lo
 * sea: se escribe pegándola junto a las otras tres, y un campo en claro en medio de tres ocultos
 * invita a pegar la equivocada en el visible.
 */

type CredentialKey = 'publicKey' | 'privateKey' | 'eventsSecret' | 'integritySecret';

const CREDENTIAL_FIELDS: readonly {
  readonly key: CredentialKey;
  readonly hint: string;
}[] = [
  { key: 'publicKey', hint: 'Empieza por pub_test_ en pruebas.' },
  { key: 'privateKey', hint: 'Empieza por prv_test_. Se guarda cifrada y no vuelve nunca.' },
  { key: 'eventsSecret', hint: 'Empieza por test_events_. Verifica la firma de cada evento.' },
  { key: 'integritySecret', hint: 'Empieza por test_integrity_. Firma el checkout.' },
];

const EMPTY: Readonly<Record<CredentialKey, string>> = {
  publicKey: '',
  privateKey: '',
  eventsSecret: '',
  integritySecret: '',
};

export function WompiCredentialsForm({
  integration,
  canManage,
}: {
  readonly integration: WompiIntegration;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<CredentialKey, string>>({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /*
   * Candado síncrono: se toma antes del primer `await`. `busy` es solo para la representación
   * visual, y el estado de React no llega a tiempo para excluir un segundo envío que guardaría dos
   * versiones del mismo secreto.
   */
  const running = useRef(false);

  const config = integration.sandbox;

  async function save(): Promise<void> {
    if (running.current) return;

    running.current = true;
    setBusy(true);
    setFailure(null);
    setSaved(false);

    /*
     * Solo viajan los campos que se escribieron. Mandar los vacíos guardaría una versión sin valor
     * en el almacén de secretos, que es peor que no guardar nada: la configuración parecería
     * completa y el checkout fallaría al firmar.
     */
    const result = await updateWompiIntegration({
      expectedVersion: integration.version,
      environment: 'sandbox',
      ...(values.publicKey.length > 0 ? { publicKey: values.publicKey } : {}),
      ...(values.privateKey.length > 0 ? { privateKey: values.privateKey } : {}),
      ...(values.eventsSecret.length > 0 ? { eventsSecret: values.eventsSecret } : {}),
      ...(values.integritySecret.length > 0 ? { integritySecret: values.integritySecret } : {}),
    });

    /*
     * Los campos se vacían **pasara lo que pasara**, incluso con error.
     *
     * Conservarlos para «no perder lo escrito» dejaría cuatro credenciales en el DOM hasta que
     * alguien cambiara de pantalla, y un error de red no es motivo suficiente para eso. Volver a
     * pegarlas cuesta segundos.
     */
    setValues({ ...EMPTY });

    if (result.ok) {
      setSaved(true);
      // La respuesta autoritativa llega recargando el Server Component: la pantalla no guarda una
      // copia propia de la configuración.
      router.refresh();
    } else {
      setFailure(result.code);
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
        {CREDENTIAL_FIELDS.map((field) => (
          <CredentialField
            config={config}
            disabled={!canManage || busy}
            field={field}
            key={field.key}
            onChange={(value) => {
              setValues((current) => ({ ...current, [field.key]: value }));
            }}
            value={values[field.key]}
          />
        ))}
      </div>

      <p className={catalog.hint} id="wompi-credentials-help">
        Deja un campo vacío para conservar el valor actual. Guardar una credencial crea una versión
        nueva y no borra la anterior. Ninguna se devuelve después de guardarse: si necesitas
        comprobar una, vuelve a pegarla.
      </p>

      {canManage ? (
        <div className={styles.formActions}>
          <button className={catalog.buttonPrimary} disabled={busy} type="submit">
            {busy ? 'Guardando…' : 'Guardar credenciales'}
          </button>
          {saved ? (
            <span aria-live="polite" className={catalog.hint}>
              Credenciales guardadas. Los campos se vaciaron.
            </span>
          ) : null}
        </div>
      ) : (
        <p className={catalog.hint}>
          Tu rol puede consultar el estado de la integración, pero no editar sus credenciales.
        </p>
      )}

      {failure === null ? null : (
        <p className={catalog.error} role="alert">
          {describeOrderFailure(failure)}
        </p>
      )}
    </form>
  );
}

/**
 * Un campo de credencial.
 *
 * `type="password"` en los cuatro, `autoComplete="new-password"` para que el navegador no ofrezca
 * rellenarlo con nada, y `spellCheck` apagado: un corrector ortográfico sobre una credencial la
 * manda a un servicio de terceros en algunos navegadores.
 *
 * El estado actual se enseña **al lado de la etiqueta** y sale del contrato: la llave pública,
 * enmascarada; las otras tres, solo si hay una versión guardada. «Configurado» no dice
 * «verificado», y el texto lo respeta.
 */
function CredentialField({
  field,
  value,
  onChange,
  disabled,
  config,
}: {
  readonly field: { readonly key: CredentialKey; readonly hint: string };
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
  readonly config: WompiEnvironmentConfig;
}) {
  const inputId = `wompi-${field.key}`;
  const hintId = `${inputId}-hint`;

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={inputId}>
        {CREDENTIAL_LABELS[field.key]}{' '}
        <span className={styles.fieldState}>{currentState(field.key, config)}</span>
      </label>
      <input
        aria-describedby={hintId}
        autoComplete="new-password"
        className={styles.input}
        disabled={disabled}
        id={inputId}
        name={inputId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder="Sin cambios"
        spellCheck={false}
        type="password"
        value={value}
      />
      <p className={styles.fieldHint} id={hintId}>
        {field.hint}
      </p>
    </div>
  );
}

/**
 * Qué sabe el panel del valor guardado.
 *
 * De la llave pública, su versión enmascarada —es lo único que el contrato devuelve—. De las otras
 * tres, **solo si hay una versión guardada**: el contrato es explícito en que eso no significa que
 * sea correcta, y el texto dice «Configurado» y no «Verificado» por esa razón exacta.
 */
function currentState(key: CredentialKey, config: WompiEnvironmentConfig): string {
  if (key === 'publicKey') {
    return config.publicKeyMasked === null ? '· Sin configurar' : `· ${config.publicKeyMasked}`;
  }

  const configured =
    key === 'privateKey'
      ? config.privateKeyConfigured
      : key === 'eventsSecret'
        ? config.eventsSecretConfigured
        : config.integritySecretConfigured;

  return configured ? '· Configurado' : '· Sin configurar';
}
