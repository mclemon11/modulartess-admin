import styles from '@/features/panel/catalog.module.css';
import { ComingSoon } from '@/features/panel/coming-soon';
import { PanelHeader } from '@/features/panel/panel-header';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Envíos' };

/**
 * Envíos.
 *
 * La pantalla existe para que la entrada de la barra lateral lleve a un sitio real en vez de a un
 * 404. No hay gestión de despachos: el contrato no publica ninguna operación de envío, y el panel
 * no inventa transportadoras, guías ni estados de entrega.
 */
export default function ShippingPage() {
  return (
    <>
      <PanelHeader trail={[{ href: '/panel', label: 'Panel' }, { label: 'Envíos' }]} />
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <div className={styles.pageHeadText}>
            <h1 className={styles.pageTitle}>Envíos</h1>
            <p className={styles.pageLead}>
              El despacho de los pedidos se gestionará desde aquí cuando el backend publique su
              contrato.
            </p>
          </div>
        </div>

        <ComingSoon
          bullets={[
            'Preparación y despacho de los pedidos confirmados.',
            'Seguimiento de cada envío hasta la entrega.',
            'Datos de la transportadora que atiende cada pedido.',
          ]}
          icon="envios"
          title="La gestión de despachos todavía no está conectada"
        >
          Mientras tanto, el avance de un pedido se mueve desde su ficha en Pedidos: ahí están las
          transiciones de estado que el backend sí publica, incluida la de enviado.
        </ComingSoon>
      </div>
    </>
  );
}
