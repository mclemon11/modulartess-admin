/**
 * Cómo navegar después de tocar la sesión cliente de Firebase.
 *
 * El problema que resuelve: `inMemoryPersistence` guarda la sesión en memoria del **documento**,
 * no de la pestaña ni del origen. Una navegación SPA (`router.push`) no destruye el documento, así
 * que si `signOut` falla, Firebase sigue autenticado en la misma página después de «salir». Un
 * `signOut` fallido **no es inocuo**, y tratarlo como tal era el fallo.
 *
 * La garantía real es esta:
 *
 * - `signOut` correcto → navegación SPA normal.
 * - `signOut` fallido → **navegación completa**, que descarta el documento y con él el estado en
 *   memoria de Firebase. Es el único mecanismo que no depende de que el SDK coopere.
 *
 * Módulo puro: decide, no navega. Así la garantía se comprueba sin renderizar ni tocar
 * `window.location`.
 */

/** Parámetro con el que se comunica un estado tras una navegación completa. */
export const SESSION_STATE_PARAM = 'estado';

/**
 * Códigos **fijos** admitidos en la URL. Son constantes del código, nunca datos: aquí no entran el
 * correo, el UID, un token ni la contraseña.
 */
export const SESSION_STATE_CODES = {
  /** La sesión cliente no pudo cerrarse y se descartó recargando el documento. */
  clientSessionNotClosed: 'sesion-cliente-reiniciada',
} as const;

export type SessionStateCode = (typeof SESSION_STATE_CODES)[keyof typeof SESSION_STATE_CODES];

const ALLOWED_CODES: ReadonlySet<string> = new Set(Object.values(SESSION_STATE_CODES));

/** Destino seguro cuando el solicitado no es una ruta interna admisible. */
export const FALLBACK_DESTINATION = '/iniciar-sesion';

export type NavigationPlan = {
  /**
   * `spa` conserva el documento; `hard` lo destruye. `hard` es la defensa cuando `signOut` falla.
   */
  readonly kind: 'spa' | 'hard';
  readonly url: string;
};

export type NavigationInput = {
  /** Ruta interna de destino. Debe empezar por `/` y no ser protocol-relative. */
  readonly destination: string;
  /** `true` solo si `signOut` confirmó el cierre. */
  readonly clientSessionClosed: boolean;
  /** Código fijo opcional a comunicar tras la navegación. */
  readonly code?: SessionStateCode;
};

/**
 * Una ruta interna: empieza por `/`, no es protocol-relative (`//host`) y no lleva consulta ni
 * fragmento propios. Evita que un destino inesperado se convierta en una redirección abierta.
 */
function isInternalPath(destination: string): boolean {
  return (
    destination.startsWith('/') &&
    !destination.startsWith('//') &&
    !destination.includes('?') &&
    !destination.includes('#') &&
    !destination.includes('\\')
  );
}

/**
 * Decide la navegación posterior a un intento de cierre de sesión.
 *
 * Cuando `clientSessionClosed` es `false` el resultado es **siempre** `hard`, con independencia
 * del destino: una navegación SPA no puede ser la única defensa si el SDK sigue autenticado.
 */
export function planPostAuthNavigation(input: NavigationInput): NavigationPlan {
  const destination = isInternalPath(input.destination) ? input.destination : FALLBACK_DESTINATION;

  // Si el cierre no se pudo confirmar, se anuncia el reinicio con un código fijo.
  const code =
    input.code ??
    (input.clientSessionClosed ? undefined : SESSION_STATE_CODES.clientSessionNotClosed);

  const url =
    code === undefined || !ALLOWED_CODES.has(code)
      ? destination
      : `${destination}?${SESSION_STATE_PARAM}=${encodeURIComponent(code)}`;

  return { kind: input.clientSessionClosed ? 'spa' : 'hard', url };
}

export type NavigationTargets = {
  /** Navegación del enrutador; conserva el documento. */
  readonly spa: (url: string) => void;
  /** Navegación completa; descarta el documento y el estado en memoria de Firebase. */
  readonly hard: (url: string) => void;
};

/** Lo que se necesita del enrutador de Next.js. */
export type SpaRouter = {
  readonly push: (url: string) => void;
};

/**
 * Lo que se necesita de `window.location`.
 *
 * Declara **solo** `replace` a propósito: si el adaptador tuviera `assign` a mano, sería fácil
 * volver a usarlo por descuido.
 */
export type FullPageLocation = {
  readonly replace: (url: string) => void;
};

/**
 * Conecta la decisión con el navegador real.
 *
 * El camino `hard` usa `location.replace`, **nunca** `location.assign`. La diferencia importa aquí:
 * `assign` deja la página anterior en el historial, y al pulsar Atrás el navegador puede restaurar
 * ese documento desde la BFCache **con su memoria intacta**, incluida la sesión de Firebase que no
 * se pudo cerrar. `replace` sustituye la entrada, así que no queda a dónde volver.
 *
 * Recibe el enrutador y la ubicación por parámetro para que el cableado real se pueda comprobar
 * sin renderizar el componente ni tocar `window`.
 */
export function createNavigationTargets(
  router: SpaRouter,
  location: FullPageLocation,
): NavigationTargets {
  return {
    spa: (url) => router.push(url),
    hard: (url) => location.replace(url),
  };
}

/** Ejecuta el plan. Separado de la decisión para poder comprobar cada parte por su cuenta. */
export function runNavigationPlan(plan: NavigationPlan, targets: NavigationTargets): void {
  if (plan.kind === 'spa') {
    targets.spa(plan.url);

    return;
  }

  targets.hard(plan.url);
}

/** Lee el código fijo de una URL, descartando cualquier valor que no esté en la lista. */
export function readSessionStateCode(value: string | null | undefined): SessionStateCode | null {
  return typeof value === 'string' && ALLOWED_CODES.has(value) ? (value as SessionStateCode) : null;
}
