import type { Metadata } from 'next';

import Link from 'next/link';

import { AuthShell } from '@/features/auth/auth-shell';

import styles from '@/features/auth/sign-in-form.module.css';

export const metadata: Metadata = {
  title: 'Verifica tu correo',
  description: 'Instrucciones para verificar el correo de una cuenta administrativa.',
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Pantalla estática.
 *
 * No recibe el correo, el UID ni ningún token por query string, y no consulta el estado de la
 * cuenta: por eso tampoco afirma que la verificación ya se haya completado.
 */
export default function VerifyEmailPage() {
  return (
    <AuthShell
      subtitle="Si el envío se completó, Firebase te mandó un mensaje con un enlace de verificación."
      title="Revisa tu correo"
    >
      <div className={styles.panel}>
        <p className={styles.panelText}>
          Abre ese enlace desde el mismo correo de la cuenta administrativa. Puede tardar unos
          minutos en llegar y, a veces, aparece en la carpeta de correo no deseado.
        </p>
        <p className={styles.panelText}>
          Cuando lo hayas abierto, vuelve a iniciar sesión. Esta página no comprueba el estado de la
          cuenta, así que no puede confirmar por sí sola si la verificación ya se completó.
        </p>
        <p className={styles.panelText}>
          <Link className={styles.link} href="/iniciar-sesion">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
