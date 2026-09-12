import styles from '@/features/panel/catalog.module.css';
import { ComingSoon } from '@/features/panel/coming-soon';
import { PanelHeader } from '@/features/panel/panel-header';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Wallet' };

/**
 * Wallet.
 *
 * Será el resumen de lo vendido y lo cancelado. Hoy no hay nada que resumir: el backend no publica
 * agregaciones, así que aquí no se pinta ningún importe —tampoco un cero, que se leería como un
 * saldo— ni movimientos de ejemplo.
 */
export default function WalletPage() {
  return (
    <>
      <PanelHeader trail={[{ href: '/panel', label: 'Panel' }, { label: 'Wallet' }]} />
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <div className={styles.pageHeadText}>
            <h1 className={styles.pageTitle}>Wallet</h1>
            <p className={styles.pageLead}>
              El resumen de lo vendido y lo cancelado vivirá aquí cuando el backend publique sus
              agregaciones.
            </p>
          </div>
        </div>

        <ComingSoon
          bullets={[
            'Total vendido en el periodo que elijas.',
            'Total cancelado y su efecto sobre el vendido.',
            'Detalle por pedido de lo que compone cada cifra.',
          ]}
          icon="wallet"
          title="El resumen económico todavía no está conectado"
        >
          No se muestran importes provisionales: una cifra inventada en un panel administrativo se
          toma por buena, y el contrato todavía no publica ninguna.
        </ComingSoon>
      </div>
    </>
  );
}
