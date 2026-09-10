import type { Metadata } from 'next';

import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { shouldClearSessionCookie } from '@/features/session/api-errors';
import styles from '@/features/session/panel.module.css';
import { describeRole } from '@/features/session/role-labels';
import { SessionCleanup } from '@/features/session/session-cleanup';
import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { SignOutButton } from '@/features/session/sign-out-button';
import { verifyAdminSession } from '@/lib/api/backend-client';
import { isBackendFailure } from '@/lib/api/errors';

export const metadata: Metadata = {
  title: 'Panel',
  description: 'Sesión administrativa verificada de Modulartess.',
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * La página lee la cookie y verifica la sesión en cada visita: nunca puede prerrenderizarse.
 */
export const dynamic = 'force-dynamic';

/**
 * Prueba protegida de la frontera BFF.
 *
 * No es el dashboard. Su única función es demostrar que la cookie `__Host-` llega al servidor, que
 * el BFF la convierte en el encabezado interno y que el backend devuelve un principal verificado.
 *
 * Aquí **no** hay datos comerciales, ni reales ni ficticios. Tampoco se muestra el UID ni el
 * correo: el rol es lo único que la persona necesita ver para saber que la sesión funciona.
 */
export default async function PanelPage() {
  const cookieStore = await cookies();
  const material = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (material === undefined || material.length === 0) {
    redirect('/iniciar-sesion');
  }

  let role: string;

  try {
    // La verificación es autoritativa y ocurre en el backend, con comprobación de revocación.
    const principal = await verifyAdminSession(material);

    role = principal.role;
  } catch (error) {
    if (isBackendFailure(error)) {
      // Sesión inválida o sin rol: la cookie ya no sirve, pero borrarla es una **mutación** y este
      // es un Server Component. Se delega en una frontera cliente, que llama al `DELETE` del BFF y
      // solo entonces navega al login. Redirigir aquí dejaría la cookie muerta en el navegador.
      if (shouldClearSessionCookie(error.code)) {
        return <SessionCleanup />;
      }

      // El backend no responde o su superficie administrativa está desactivada. No se redirige:
      // la sesión puede seguir siendo buena y expulsar a la persona sería incorrecto.
      return <PanelUnavailable />;
    }

    throw error;
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <span aria-hidden="true" className={styles.brandMark} />
          <p className={styles.brandName}>
            Modulartess <span>Admin</span>
          </p>
        </div>
        <h1 className={styles.title}>Sesión administrativa activa</h1>
        <p className={styles.lead}>
          El backend verificó la sesión y devolvió un principal administrativo. Esta pantalla solo
          comprueba la frontera; todavía no hay operaciones de catálogo, pedidos ni clientes.
        </p>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Rol administrativo</span>
          <span className={styles.rowValue}>{describeRole(role)}</span>
        </div>
        <p className={styles.notice}>
          La sesión no se renueva de forma silenciosa: cuando caduque habrá que volver a iniciar
          sesión. El navegador no recibe el material de sesión en ningún momento.
        </p>
        <SignOutButton />
      </section>
    </main>
  );
}

/** Estado controlado cuando el backend no está disponible. Sin ningún dato sensible. */
function PanelUnavailable() {
  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <span aria-hidden="true" className={styles.brandMark} />
          <p className={styles.brandName}>
            Modulartess <span>Admin</span>
          </p>
        </div>
        <h1 className={styles.title}>No pudimos verificar la sesión</h1>
        <p className={styles.warning}>
          El servicio administrativo no responde ahora mismo, así que la sesión no se puede
          confirmar. No se ha cerrado: vuelve a intentarlo en unos momentos.
        </p>
        <p className={styles.lead}>
          Si el problema persiste, cierra la sesión y vuelve a iniciarla.
        </p>
        <SignOutButton />
        <p className={styles.notice}>
          <Link className={styles.link} href="/panel">
            Reintentar la verificación
          </Link>
        </p>
      </section>
    </main>
  );
}
