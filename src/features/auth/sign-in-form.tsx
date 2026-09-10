'use client';

import { useId, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { applyAdminAuthLanguage } from '@/lib/firebase/auth-language';
import { readFirebaseConfigFromEnv } from '@/lib/firebase/config';

import { describeSignInError, describeVerificationEmailError } from './auth-errors';
import { acquire, createOperationLock, release, seal } from './operation-lock';
import { decideSignInOutcome } from './sign-in-flow';
import styles from './sign-in-form.module.css';

/**
 * Formulario de inicio de sesión del panel.
 *
 * No existe registro público: esta pantalla solo autentica cuentas creadas fuera del panel. Por
 * eso no hay enlace de «Crear cuenta», ni recuperación de contraseña, ni proveedores externos.
 *
 * Nada de lo que se escribe aquí sale del estado de React: ni el correo, ni la contraseña, ni el
 * usuario de Firebase se escriben en `localStorage`, `sessionStorage`, cookies, la URL o la
 * consola. La persistencia de Firebase es `inMemoryPersistence` (ver `@/lib/firebase/client`).
 *
 * La exclusión de operaciones no se apoya en `busy`: el estado de React solo cambia en el
 * siguiente render, así que dos disparos en el mismo tick lo verían igual a `false`. Se usan dos
 * candados síncronos en `useRef` (ver `./operation-lock`), y `busy` queda únicamente para la
 * representación visual.
 */

/**
 * `User` del SDK, reducido a lo que este componente necesita. Se declara aquí para no importar el
 * tipo del SDK en el módulo de la página y mantener la carga de Firebase realmente diferida.
 */
type PendingUser = {
  readonly emailVerified: boolean;
};

type Stage =
  | { readonly kind: 'credentials' }
  | { readonly kind: 'config-missing'; readonly missing: readonly string[] }
  | { readonly kind: 'verification-required' }
  | { readonly kind: 'verification-sent' }
  | { readonly kind: 'verified' };

export function SignInForm() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const feedbackId = useId();

  const [stage, setStage] = useState<Stage>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  /**
   * El usuario autenticado pero sin verificar se conserva **solo en memoria**, y solo hasta que se
   * envía el correo de verificación. Va en una ref, no en el estado, para no formar parte de
   * ningún render ni de ninguna serialización.
   */
  const pendingUser = useRef<unknown>(null);

  /** Candado del envío del formulario. Se libera en cada salida que permite reintentar. */
  const signInLock = useRef(createOperationLock());

  /**
   * Candado del envío del correo de verificación. Se **sella** en cuanto Firebase confirma el
   * envío: a partir de ahí no se concede otra operación, aunque falle un paso posterior.
   */
  const verificationLock = useRef(createOperationLock());

  function clearCredentials() {
    setEmail('');
    setPassword('');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Candado tomado de forma síncrona, antes de cualquier `await`: un segundo submit disparado en
    // el mismo tick se rechaza aquí, sin esperar a que `busy` llegue a un render.
    if (!acquire(signInLock.current)) {
      return;
    }

    try {
      const configResult = readFirebaseConfigFromEnv();

      if (!configResult.ok) {
        setError(null);
        setStatus('');
        clearCredentials();
        setStage({ kind: 'config-missing', missing: configResult.missing });
        return;
      }

      setBusy(true);
      setError(null);
      setStatus('Comprobando las credenciales…');

      const [{ getAdminAuth }, { signInWithEmailAndPassword }] = await Promise.all([
        import('@/lib/firebase/client'),
        import('firebase/auth'),
      ]);

      const auth = await getAdminAuth(configResult.config);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const user: PendingUser = credential.user;

      // La contraseña deja de existir en el estado en cuanto Firebase responde.
      clearCredentials();
      setStatus('');

      if (decideSignInOutcome(user) === 'verified-session-pending') {
        pendingUser.current = null;
        const { signOut } = await import('firebase/auth');
        await signOut(auth);
        setStage({ kind: 'verified' });
        return;
      }

      pendingUser.current = credential.user;
      verificationLock.current = createOperationLock();
      setStage({ kind: 'verification-required' });
    } catch (signInError) {
      // El error no se registra: llevaría el correo introducido a los logs del navegador.
      setPassword('');
      setStatus('');
      setError(describeSignInError(signInError));
    } finally {
      // Todas las salidas de esta operación admiten reintento: o se vuelve al formulario, o se
      // pasa a una etapa que ya no lo muestra.
      release(signInLock.current);
      setBusy(false);
    }
  }

  async function handleSendVerification() {
    // Igual que en el submit: síncrono y antes del primer `await`. Además, un candado ya sellado
    // rechaza el intento, así que el correo no puede salir dos veces.
    if (!acquire(verificationLock.current)) {
      return;
    }

    const configResult = readFirebaseConfigFromEnv();
    const user = pendingUser.current;

    if (!configResult.ok || user === null) {
      release(verificationLock.current);
      setError(
        'La sesión temporal ya no está disponible. Vuelve a iniciar sesión para pedir el correo de verificación.',
      );
      return;
    }

    setBusy(true);
    setError(null);
    setStatus('Enviando el correo de verificación…');

    try {
      const [{ getAdminAuth }, { sendEmailVerification, signOut }] = await Promise.all([
        import('@/lib/firebase/client'),
        import('firebase/auth'),
      ]);

      const auth = await getAdminAuth(configResult.config);

      // `getAdminAuth` ya fija el idioma al crear la instancia. Se reafirma aquí, inmediatamente
      // antes del envío, para que el correo salga en español aunque algo hubiera tocado
      // `languageCode` entretanto. Nunca se usa el idioma del navegador.
      applyAdminAuthLanguage(auth);

      // Sin `actionCodeSettings`: no se construye ninguna URL con el correo, el UID ni un token.
      // El enlace lo genera Firebase con la URL de acción configurada en el proyecto.
      await sendEmailVerification(user as Parameters<typeof sendEmailVerification>[0]);

      // Punto de no retorno: el correo ya salió. Se sella el candado y se suelta la referencia al
      // usuario, de modo que ningún fallo posterior habilite un segundo envío.
      seal(verificationLock.current);
      pendingUser.current = null;
      setStatus('');
      setStage({ kind: 'verification-sent' });

      // Un fallo al cerrar sesión no debe reabrir el envío ni ocultar que el correo salió. La
      // sesión no se persiste, así que se descarta con la pestaña de todos modos.
      try {
        await signOut(auth);
      } catch {
        // Sin acción: el candado sellado y la etapa ya reflejan el resultado real.
      }

      setBusy(false);
      router.push('/verificar-correo');
    } catch (sendError) {
      if (verificationLock.current.sealed) {
        // El correo ya se había enviado; el fallo es de un paso posterior. No se reabre nada.
        setBusy(false);
        return;
      }

      // Sin reintento automático: el candado se libera y decide la persona.
      release(verificationLock.current);
      setStatus('');
      setError(describeVerificationEmailError(sendError));
      setBusy(false);
    }
  }

  if (stage.kind === 'config-missing') {
    return (
      <div className={styles.panel}>
        <p className={styles.error} role="alert">
          El panel no tiene configurado el acceso a Firebase Authentication en este entorno, así que
          el inicio de sesión no está disponible.
        </p>
        <p className={styles.panelText}>
          Faltan estas variables de entorno. Sus valores se definen en <code>.env</code> o{' '}
          <code>.env.local</code>, que no forman parte del repositorio:
        </p>
        <ul className={styles.varList}>
          {stage.missing.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (stage.kind === 'verification-required') {
    return (
      <div className={styles.panel}>
        <p className={styles.notice}>
          Tu cuenta existe, pero el correo todavía no está verificado. No se envía ningún mensaje
          hasta que lo pidas.
        </p>
        <p className={styles.panelText}>
          Al pulsar el botón, Firebase enviará un enlace de verificación en español a la dirección
          de la cuenta. Después se cerrará esta sesión temporal.
        </p>
        {error === null ? null : (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button
          className={styles.secondary}
          disabled={busy}
          onClick={() => void handleSendVerification()}
          type="button"
        >
          {busy ? 'Enviando…' : 'Enviar correo de verificación'}
        </button>
        <p aria-live="polite" className={styles.status}>
          {status}
        </p>
      </div>
    );
  }

  if (stage.kind === 'verification-sent') {
    return (
      <div className={styles.panel}>
        <p className={styles.notice}>
          El correo de verificación salió hacia la dirección de la cuenta. No se enviará otro en
          esta pantalla.
        </p>
        <p className={styles.panelText}>
          Abre el enlace del mensaje y vuelve a iniciar sesión después.
        </p>
      </div>
    );
  }

  if (stage.kind === 'verified') {
    return (
      <div className={styles.panel}>
        <p className={styles.notice}>
          Tu correo está verificado. La sesión se cerró de inmediato: el panel todavía no habilita
          el acceso administrativo.
        </p>
        <p className={styles.panelText}>
          El intercambio de sesión con el backend y la autorización por roles llegan en la siguiente
          fase. Hasta entonces no hay ninguna pantalla operativa a la que entrar.
        </p>
      </div>
    );
  }

  return (
    <form aria-busy={busy} className={styles.form} noValidate={false} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={emailId}>
          Correo electrónico
        </label>
        <input
          autoComplete="username"
          className={styles.input}
          disabled={busy}
          id={emailId}
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
          {...(error === null ? {} : { 'aria-describedby': feedbackId })}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={passwordId}>
          Contraseña
        </label>
        <input
          autoComplete="current-password"
          className={styles.input}
          disabled={busy}
          id={passwordId}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
          {...(error === null ? {} : { 'aria-describedby': feedbackId })}
        />
      </div>

      <div aria-live="assertive" id={feedbackId}>
        {error === null ? null : <p className={styles.error}>{error}</p>}
      </div>

      <button className={styles.submit} disabled={busy} type="submit">
        {busy ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </button>

      <p aria-live="polite" className={styles.status}>
        {status}
      </p>
    </form>
  );
}
