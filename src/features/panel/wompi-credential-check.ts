/**
 * Comprobación de llaves de Wompi **antes** de enviarlas.
 *
 * No duplica la autoridad: quien decide si una credencial es válida es el backend, que es quien la
 * guarda. Lo que se hace aquí es evitar el viaje cuando ya se sabe que va a fallar, y —sobre todo—
 * poder decir **por qué** en el sitio donde se pegó.
 *
 * El error que motiva este módulo es uno concreto: el panel de Wompi enseña las llaves de
 * **Producción** por omisión, así que lo más fácil del mundo es pegarlas con el selector en
 * Pruebas. Antes eso producía un error de prefijo que no explicaba nada. Ahora se detecta el
 * ambiente de lo pegado y se dice qué hacer: cambiar el selector.
 *
 * Los ocho prefijos son los que publica Wompi en «Ambientes y llaves» y coinciden con los que
 * valida el backend. Están duplicados a propósito y de forma consciente: son un dato público y
 * estable del proveedor, no una regla de negocio, y sin ellos esta pantalla no puede decir nada
 * antes de enviar.
 *
 * Módulo puro y **sin efectos**. No registra nada: sus parámetros son las cuatro credenciales en
 * claro.
 */

export const WOMPI_ENVIRONMENTS = ['sandbox', 'production'] as const;
export type WompiCredentialEnvironment = (typeof WOMPI_ENVIRONMENTS)[number];

export const WOMPI_CREDENTIAL_FIELDS = [
  'publicKey',
  'privateKey',
  'eventsSecret',
  'integritySecret',
] as const;
export type WompiCredentialField = (typeof WOMPI_CREDENTIAL_FIELDS)[number];

export const ENVIRONMENT_LABELS: Readonly<Record<WompiCredentialEnvironment, string>> = {
  sandbox: 'Pruebas (Sandbox)',
  production: 'Producción',
};

export const CREDENTIAL_FIELD_LABELS: Readonly<Record<WompiCredentialField, string>> = {
  publicKey: 'Llave pública',
  privateKey: 'Llave privada',
  eventsSecret: 'Secreto de Eventos',
  integritySecret: 'Secreto de Integridad',
};

const PREFIXES: Readonly<
  Record<WompiCredentialEnvironment, Readonly<Record<WompiCredentialField, string>>>
> = {
  sandbox: {
    publicKey: 'pub_test_',
    privateKey: 'prv_test_',
    eventsSecret: 'test_events_',
    integritySecret: 'test_integrity_',
  },
  production: {
    publicKey: 'pub_prod_',
    privateKey: 'prv_prod_',
    eventsSecret: 'prod_events_',
    integritySecret: 'prod_integrity_',
  },
};

export function credentialPrefix(
  environment: WompiCredentialEnvironment,
  field: WompiCredentialField,
): string {
  return PREFIXES[environment][field];
}

/** ¿De qué ambiente es lo que se pegó? `null` si no es una llave de Wompi. */
export function detectCredentialEnvironment(
  field: WompiCredentialField,
  value: string,
): WompiCredentialEnvironment | null {
  const trimmed = value.trim();

  for (const environment of WOMPI_ENVIRONMENTS) {
    if (trimmed.startsWith(PREFIXES[environment][field])) return environment;
  }

  return null;
}

export type CredentialValues = Readonly<Record<WompiCredentialField, string>>;

export const EMPTY_CREDENTIALS: CredentialValues = {
  publicKey: '',
  privateKey: '',
  eventsSecret: '',
  integritySecret: '',
};

export type CredentialCheck =
  | { readonly ok: true; readonly values: Readonly<Record<WompiCredentialField, string>> }
  | {
      readonly ok: false;
      /** Resumen, debajo del formulario. Dice qué pasa y qué hacer. */
      readonly message: string;
      /** Campos señalados. El primero recibe el foco. */
      readonly fields: readonly WompiCredentialField[];
      /** Texto corto que se pinta **debajo de cada campo señalado**. */
      readonly fieldMessage: string;
    };

/**
 * Las cuatro llaves, recortadas y comprobadas contra el ambiente elegido.
 *
 * `trim()` solo en los extremos, como el backend: copiar del panel de Wompi arrastra un espacio o
 * un salto de línea constantemente. El interior **no se toca**, y si queda espacio después de
 * recortar es que estaba en medio, que ya no es un descuido del portapapeles.
 *
 * Se exigen las cuatro. El contrato admite mandar solo algunas —omitir una conserva la actual—,
 * pero esta pantalla existe para pegar el juego completo de un ambiente, y aceptar tres dejaría
 * una configuración a medias que no abre ningún checkout y parece guardada.
 */
export function checkCredentials(
  environment: WompiCredentialEnvironment,
  raw: CredentialValues,
): CredentialCheck {
  const values = {} as Record<WompiCredentialField, string>;
  const missing: WompiCredentialField[] = [];
  const foreign: WompiCredentialField[] = [];
  const unknown: WompiCredentialField[] = [];

  for (const field of WOMPI_CREDENTIAL_FIELDS) {
    const value = raw[field].trim();
    values[field] = value;

    if (value.length === 0) {
      missing.push(field);
      continue;
    }

    const owner = detectCredentialEnvironment(field, value);
    if (owner === null) unknown.push(field);
    else if (owner !== environment) foreign.push(field);
  }

  /*
   * Mezclar los dos ambientes se informa **antes que nada**.
   *
   * Es el único caso en el que cambiar el selector no arregla nada: con dos llaves de Pruebas y
   * dos de Producción, cualquier ambiente que se elija deja dos fuera. Decir «cambia a Producción»
   * ahí mandaría a alguien a dar vueltas, así que se dice lo que de verdad pasa.
   */
  const pasted = new Set(
    WOMPI_CREDENTIAL_FIELDS.map((field) =>
      values[field].length === 0 ? null : detectCredentialEnvironment(field, values[field]),
    ).filter((owner): owner is WompiCredentialEnvironment => owner !== null),
  );

  if (pasted.size > 1) {
    return {
      ok: false,
      fields: [...foreign, ...unknown],
      message: 'Las cuatro llaves deben pertenecer al mismo ambiente.',
      fieldMessage: 'Esta llave no es del mismo ambiente que las demás.',
    };
  }

  /*
   * El ambiente equivocado se informa antes que las que faltan: es el caso frecuente y el
   * accionable de un clic. Decir «faltan llaves» a quien acaba de pegar cuatro de producción lo
   * mandaría a buscar una quinta.
   */
  if (foreign.length > 0) {
    const owner = detectCredentialEnvironment(
      foreign[0] as WompiCredentialField,
      values[foreign[0] as WompiCredentialField],
    );
    const other: WompiCredentialEnvironment =
      owner ?? (environment === 'sandbox' ? 'production' : 'sandbox');
    const label = other === 'sandbox' ? 'Pruebas' : 'Producción';

    return {
      ok: false,
      fields: foreign,
      message: `Estas llaves son de ${label}. Cambia el ambiente a ${label} para guardarlas.`,
      fieldMessage: `Es una llave de ${ENVIRONMENT_LABELS[other]}.`,
    };
  }

  if (unknown.length > 0) {
    return {
      ok: false,
      fields: unknown,
      message: 'Estos valores no parecen llaves de Wompi. Cópialos de nuevo desde Wompi.',
      fieldMessage: 'No parece una llave de Wompi.',
    };
  }

  if (missing.length > 0) {
    return {
      ok: false,
      fields: missing,
      message: `Faltan llaves: ${missing
        .map((field) => CREDENTIAL_FIELD_LABELS[field])
        .join(', ')}. Hacen falta las cuatro del ambiente seleccionado.`,
      fieldMessage: 'Esta llave es obligatoria.',
    };
  }

  return { ok: true, values };
}

/**
 * Mensaje para un fallo del BFF, en español y sin ningún valor.
 *
 * El conflicto de versión tiene el suyo porque lleva a una acción distinta —recargar y volver a
 * guardar—, y el bloqueo de producción también: no hay ninguna casilla que marcar.
 */
const SAVE_MESSAGES: Readonly<Record<string, string>> = {
  credentials_environment_mismatch:
    'Estas llaves son del otro ambiente. Cambia el ambiente y vuelve a guardarlas.',
  credential_prefix_invalid:
    'Estos valores no parecen llaves de Wompi. Cópialos de nuevo desde Wompi.',
  credentials_incomplete: 'Faltan llaves. Hacen falta las cuatro del ambiente seleccionado.',
  integration_invalid: 'La pasarela rechazó estas llaves. Revísalas y vuelve a intentarlo.',
  integration_conflict: 'La configuración cambió. Revisa el estado y vuelve a guardar.',
  version_conflict: 'La configuración cambió. Revisa el estado y vuelve a guardar.',
  live_payments_not_enabled:
    'Los cobros reales siguen bloqueados en este despliegue. Las llaves sí quedan guardadas; habilitarlos no depende del panel.',
  invalid_request: 'La petición no tiene el formato esperado.',
  session_required: 'Tu sesión administrativa caducó. Vuelve a iniciar sesión.',
  admin_role_required: 'Tu rol no puede editar las llaves de la pasarela.',
  provider_unavailable: 'No se pudo escribir el almacén de secretos. Inténtalo de nuevo.',
  too_many_requests: 'Demasiados intentos seguidos. Espera unos segundos.',
  service_unavailable: 'El servicio no responde ahora mismo.',
};

export const SAVE_GENERIC_MESSAGE =
  'No pudimos guardar las llaves. Inténtalo de nuevo en unos momentos.';

export function describeSaveFailure(code: string): string {
  return SAVE_MESSAGES[code] ?? SAVE_GENERIC_MESSAGE;
}

/** ¿Este fallo se arregla releyendo la configuración? Solo el conflicto de versión. */
export function requiresReload(code: string): boolean {
  return code === 'integration_conflict' || code === 'version_conflict';
}
