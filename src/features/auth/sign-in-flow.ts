/**
 * Decisión del flujo posterior a un inicio de sesión correcto.
 *
 * Se aísla en un módulo puro para poder probar la bifurcación sin red, sin Firebase y sin
 * credenciales reales. El componente de formulario solo ejecuta lo que esta función decide.
 */

export type SignInOutcome =
  /** El correo no está verificado: la persona debe pedir el envío del correo de verificación. */
  | 'email-verification-required'
  /**
   * El correo está verificado. Aun así **no** hay sesión administrativa: el intercambio de sesión
   * con el backend llega en una fase posterior. El flujo cierra sesión y muestra un estado
   * informativo.
   */
  | 'verified-session-pending';

/** Forma mínima que necesita la decisión; evita depender del tipo `User` del SDK. */
export type SignedInIdentity = {
  readonly emailVerified: boolean;
};

export function decideSignInOutcome(identity: SignedInIdentity): SignInOutcome {
  return identity.emailVerified ? 'verified-session-pending' : 'email-verification-required';
}
