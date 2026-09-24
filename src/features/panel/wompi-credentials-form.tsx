'use client';

import { useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import catalog from './catalog.module.css';
import { CopyableValue } from './copyable-value';
import styles from './integrations.module.css';
import { updateWompiIntegration } from './integrations-client';
import { SandboxPaymentsToggle } from './wompi-operations';
import { ProductionPaymentsControl } from './wompi-production-payments';
import {
  checkCredentials,
  CREDENTIAL_FIELD_LABELS,
  credentialPrefix,
  describeSaveFailure,
  EMPTY_CREDENTIALS,
  ENVIRONMENT_LABELS,
  requiresReload,
  WOMPI_CREDENTIAL_FIELDS,
  WOMPI_ENVIRONMENTS,
  type CredentialCheck,
  type CredentialValues,
  type WompiCredentialEnvironment,
  type WompiCredentialField,
} from './wompi-credential-check';

import type { WompiEnvironmentConfig, WompiIntegration } from '@/lib/api/integrations';

/**
 * Configurar Wompi: ambiente, cuatro llaves, guardar.
 *
 * Es la pantalla del panel donde más fácil se filtra algo, así que las reglas son explícitas:
 *
 * - **Los cuatro campos nacen vacíos.** Nunca se precargan con un valor guardado, porque el
 *   backend no los devuelve y porque precargarlos los dejaría en el DOM.
 * - **Se vacían solo al guardar bien.** Si el guardado falla, lo escrito se conserva: pegar cuatro
 *   credenciales cuesta, y un fallo de red no es motivo para obligar a repetirlo.
 * - **Los valores viven en el estado de este componente y en ningún sitio más.** No hay estado
 *   global, no hay `localStorage`, no hay `sessionStorage`, no hay cookie y no hay query string.
 *   Al desmontarse la pantalla desaparecen.
 * - **Ningún valor entra en un mensaje de error.** Lo que se enseña es el código traducido que
 *   devolvió el BFF, o la comprobación local de prefijos, nunca lo que se escribió.
 * - **El navegador no habla con Wompi.** Guardar pasa por la ruta BFF del panel.
 *
 * La llave pública se escribe en un campo `type="password"` aunque no sea un secreto: se pega
 * junto a las otras tres, y un campo en claro en medio de tres ocultos invita a pegar la
 * equivocada en el visible.
 *
 * El **ambiente seleccionado decide qué conjunto se actualiza**, y antes de enviar se comprueba que
 * los prefijos correspondan. El panel de Wompi enseña las llaves de producción por omisión, así que
 * pegarlas con el selector en Pruebas es el error más frecuente: aquí se detecta y se dice qué
 * hacer en lugar de gastar una llamada y recibir un rechazo genérico.
 */
export function WompiCredentialsForm({
  integration,
  canManage,
}: {
  readonly integration: WompiIntegration;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [environment, setEnvironment] = useState<WompiCredentialEnvironment>('sandbox');
  const [values, setValues] = useState<CredentialValues>({ ...EMPTY_CREDENTIALS });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<readonly WompiCredentialField[]>([]);
  /** Texto que se pinta debajo de cada campo señalado. Nunca lleva el valor escrito. */
  const [fieldMessage, setFieldMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /*
   * Candado síncrono: se toma antes del primer `await`. `busy` es solo para la representación
   * visual, y el estado de React no llega a tiempo para excluir un segundo envío que guardaría dos
   * versiones del mismo secreto.
   */
  const running = useRef(false);
  /*
   * Los cuatro `input`, para poder llevar el foco al primero que falle.
   *
   * Es la diferencia entre un error que se lee y uno que se corrige: con cuatro campos ocultos,
   * un mensaje al pie no dice en cuál está el problema ni deja el cursor donde hay que escribir.
   */
  const inputs = useRef<Partial<Record<WompiCredentialField, HTMLInputElement | null>>>({});

  /** Señala los campos, lleva el foco al primero y no toca lo escrito. */
  function reject(check: Extract<CredentialCheck, { ok: false }>): void {
    setFailure(check.message);
    setInvalidFields(check.fields);
    setFieldMessage(check.fieldMessage);
    inputs.current[check.fields[0] ?? 'publicKey']?.focus();
  }

  const config = integration[environment];

  async function save(): Promise<void> {
    if (running.current) return;

    setFailure(null);
    setSaved(false);
    setFieldMessage(null);

    /*
     * Comprobación local **antes** de la llamada: recorte de extremos y ambiente de cada prefijo.
     * No sustituye al backend, que vuelve a validarlo todo; evita el viaje y permite decir qué
     * pasa en el sitio donde se pegó.
     */
    const checked = checkCredentials(environment, values);

    if (!checked.ok) {
      reject(checked);
      return;
    }

    running.current = true;
    setBusy(true);
    setInvalidFields([]);
    setFieldMessage(null);

    const result = await updateWompiIntegration({
      expectedVersion: integration.version,
      environment,
      publicKey: checked.values.publicKey,
      privateKey: checked.values.privateKey,
      eventsSecret: checked.values.eventsSecret,
      integritySecret: checked.values.integritySecret,
    });

    if (result.ok) {
      /*
       * Los campos se vacían **solo aquí**. Ya están guardados, así que conservarlos dejaría
       * cuatro credenciales en el DOM sin ninguna razón.
       */
      setValues({ ...EMPTY_CREDENTIALS });
      setSaved(true);
      // El estado autoritativo llega recargando el Server Component: la pantalla no guarda copia.
      router.refresh();
    } else {
      setFailure(describeSaveFailure(result.code));
      // Un conflicto de versión se resuelve releyendo; lo escrito se conserva para reintentar.
      if (requiresReload(result.code)) router.refresh();
    }

    running.current = false;
    setBusy(false);
  }

  /*
   * El `<form>` envuelve **solo** las llaves. El selector y los interruptores de cobro quedan
   * fuera: la confirmación de cobros reales es un formulario propio, y anidarla aquí haría que
   * pulsar Intro en ella enviara las llaves —además de ser HTML inválido—.
   */
  return (
    <div className={styles.form}>
      <div className={styles.environmentRow}>
        <div className={styles.filterField}>
          <label className={styles.fieldLabel} htmlFor="wompi-environment">
            Ambiente
          </label>
          <select
            className={styles.select}
            disabled={!canManage || busy}
            id="wompi-environment"
            name="wompi-environment"
            onChange={(event) => {
              setEnvironment(event.target.value as WompiCredentialEnvironment);
              setFailure(null);
              setInvalidFields([]);
              setFieldMessage(null);
              setSaved(false);
            }}
            value={environment}
          >
            {WOMPI_ENVIRONMENTS.map((value) => (
              <option key={value} value={value}>
                {ENVIRONMENT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <ConfiguredBadge config={config} />
      </div>

      {/*
        Debajo del estado de credenciales, no junto a «Guardar llaves».
        Guardar y activar son dos decisiones, y el sitio lo dice.
        Cada ambiente tiene su control, con su ambiente escrito: ninguno lo toma del selector.
      */}
      {environment === 'sandbox' ? (
        <SandboxPaymentsToggle canManage={canManage} integration={integration} />
      ) : (
        <ProductionPaymentsControl canManage={canManage} integration={integration} />
      )}

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className={styles.fields}>
          {WOMPI_CREDENTIAL_FIELDS.map((field) => (
            <CredentialField
              disabled={!canManage || busy}
              environment={environment}
              error={invalidFields.includes(field) ? fieldMessage : null}
              field={field}
              key={field}
              onChange={(value) => {
                setValues((current) => ({ ...current, [field]: value }));
              }}
              register={(element) => {
                inputs.current[field] = element;
              }}
              value={values[field]}
            />
          ))}
        </div>

        {canManage ? (
          <div className={styles.formActions}>
            <button className={catalog.buttonPrimary} disabled={busy} type="submit">
              {busy ? 'Guardando…' : 'Guardar llaves'}
            </button>
          </div>
        ) : (
          <p className={catalog.hint}>
            Tu rol puede consultar el estado de la integración, pero no editar sus llaves.
          </p>
        )}

        <p aria-live="polite" className={styles.formStatus}>
          {saved ? 'Las llaves de Wompi quedaron guardadas correctamente.' : ''}
        </p>

        {failure === null ? null : (
          <p className={catalog.error} role="alert">
            {failure}
          </p>
        )}
      </form>

      <AdvancedSettings config={config} environment={environment} />
    </div>
  );
}

/** `Sin configurar` o `Configurado`, del ambiente que está seleccionado. */
function ConfiguredBadge({ config }: { readonly config: WompiEnvironmentConfig }) {
  return (
    <span
      className={config.configured ? styles.stateConfigured : styles.statePending}
      data-state={config.configured ? 'configured' : 'pending'}
    >
      {config.configured ? 'Configurado' : 'Sin configurar'}
    </span>
  );
}

/**
 * Un campo de llave.
 *
 * `type="password"` en los cuatro, `autoComplete="off"` para que el navegador no ofrezca
 * rellenarlo ni guardarlo, y `spellCheck` apagado: un corrector ortográfico sobre una credencial
 * la manda a un servicio de terceros en algunos navegadores.
 *
 * La ayuda dice el prefijo que toca **según el ambiente seleccionado**, así que cambiar el selector
 * cambia lo que la pantalla pide.
 */
function CredentialField({
  field,
  environment,
  value,
  onChange,
  disabled,
  error,
  register,
}: {
  readonly field: WompiCredentialField;
  readonly environment: WompiCredentialEnvironment;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
  /** Qué le pasa a **este** campo. `null` si no le pasa nada. */
  readonly error: string | null;
  readonly register: (element: HTMLInputElement | null) => void;
}) {
  const inputId = `wompi-${field}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={inputId}>
        {CREDENTIAL_FIELD_LABELS[field]}
      </label>
      <input
        // La ayuda y el error se anuncian los dos: el error primero, que es lo que hay que
        // corregir, y la ayuda después, que dice con qué prefijo se corrige.
        aria-describedby={error === null ? hintId : `${errorId} ${hintId}`}
        aria-invalid={error !== null}
        /*
         * `new-password`, no `off`.
         *
         * Los navegadores ignoran `off` en campos de contraseña desde hace años y ofrecen
         * autocompletar de todas formas; `new-password` es la señal que sí respetan para no
         * rellenar ni guardar. Es lo que evita que un gestor de contraseñas se quede una llave
         * privada de la pasarela.
         */
        autoComplete="new-password"
        className={error === null ? styles.input : styles.inputInvalid}
        data-1p-ignore=""
        disabled={disabled}
        id={inputId}
        name={inputId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        ref={register}
        spellCheck={false}
        type="password"
        value={value}
      />
      {error === null ? null : (
        <p className={styles.fieldError} id={errorId} role="alert">
          {error}
        </p>
      )}
      <p className={styles.fieldHint} id={hintId}>
        Empieza por {credentialPrefix(environment, field)}
      </p>
    </div>
  );
}

/**
 * Lo que no hace falta para configurar, pero sí para terminar en el panel de Wompi.
 *
 * Wompi pide la URL de eventos **por ambiente**, en su propia configuración, así que tiene que
 * poder copiarse desde aquí. Va plegada porque no se toca cada vez, y no en una columna propia
 * porque no compite con las llaves.
 *
 * La URL la deriva el backend de su propia configuración. **No se construye aquí**: componerla con
 * el origen del navegador la ataría a desde dónde se abrió el panel, y un panel abierto por un
 * túnel local acabaría configurando en Wompi una URL que no existe fuera de esa máquina.
 */
function AdvancedSettings({
  config,
  environment,
}: {
  readonly config: WompiEnvironmentConfig;
  readonly environment: WompiCredentialEnvironment;
}) {
  return (
    <details className={styles.advanced}>
      <summary className={styles.advancedSummary}>Configuración avanzada</summary>
      <div className={styles.advancedBody}>
        <CopyableValue
          hint={`Solo lectura: la deriva el backend. Pégala en Wompi, en la configuración de eventos de ${ENVIRONMENT_LABELS[environment]}.`}
          label="URL de eventos"
          value={config.webhookUrl}
        />
        <CopyableValue
          hint="A donde el proveedor devuelve el navegador al terminar. También la deriva el backend."
          label="URL de retorno"
          value={config.redirectUrl}
        />
      </div>
    </details>
  );
}
