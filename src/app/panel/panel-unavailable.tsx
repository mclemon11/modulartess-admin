import styles from '@/features/session/panel.module.css';
import { SignOutButton } from '@/features/session/sign-out-button';

/**
 * Estado controlado cuando el backend no responde o su superficie administrativa está apagada.
 *
 * No redirige: la sesión puede seguir siendo válida y expulsar a alguien por una caída temporal
 * sería un error. Sin datos sensibles.
 */
export function PanelUnavailable() {
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
        <SignOutButton />
      </section>
    </main>
  );
}
