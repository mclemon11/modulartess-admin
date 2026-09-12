import Link from 'next/link';

import styles from '@/features/panel/catalog.module.css';
import { PanelHeader } from '@/features/panel/panel-header';
import { Icon, type IconName } from '@/features/panel/section-icon';
import { resolvePanelSession } from '@/features/panel/session-context';
import { can } from '@/features/session/permissions';
import { describeRole } from '@/features/session/role-labels';

export const dynamic = 'force-dynamic';

/**
 * Portada del panel.
 *
 * Mantiene la composición de la referencia —encabezado grande y una cuadrícula de tarjetas— con lo
 * único que se puede afirmar: qué secciones hay y en qué punto está cada una. El backend no publica
 * ninguna agregación, así que aquí no hay ventas, ni pedidos recientes, ni productos más vendidos,
 * ni porcentajes. Un número inventado en un panel administrativo se toma por bueno.
 */
export default async function PanelPage() {
  const result = await resolvePanelSession();
  const role = result.kind === 'active' ? result.session.role : '';

  return (
    <>
      <PanelHeader trail={[{ label: 'Dashboard' }]} />
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <div className={styles.pageHeadText}>
            <h1 className={styles.pageTitle}>Panel de administración</h1>
            <p className={styles.pageLead}>
              Resumen de tu tienda · sesión con rol <strong>{describeRole(role)}</strong>. Cada
              acción se verifica en el backend: el panel solo oculta lo que tu rol no puede hacer.
            </p>
          </div>
        </div>

        <div className={styles.dashboardGrid}>
          <DashboardCard
            description="Consulta las compras que llegan desde la tienda y mueve su estado a medida que avanzan. No se crean desde el panel: un pedido nace cuando alguien compra."
            href="/panel/pedidos"
            icon="pedidos"
            linkLabel="Ver pedidos"
            title="Pedidos"
          />

          <DashboardCard
            description="Crea y edita productos, sube sus imágenes, ajusta inventario y gestiona variantes. Publicar es una acción aparte, y el backend decide cuándo un producto está listo."
            href="/panel/productos"
            icon="productos"
            linkLabel="Abrir catálogo"
            secondary={
              can(role, 'products.create')
                ? { href: '/panel/productos/nuevo', label: 'Crear producto' }
                : undefined
            }
            title="Productos"
          />

          <DashboardCard
            description="El despacho de los pedidos confirmados y su seguimiento hasta la entrega. Se conectará cuando el backend publique su contrato."
            href="/panel/envios"
            icon="envios"
            linkLabel="Ver sección"
            pending
            title="Envíos"
          />

          <DashboardCard
            description="El resumen de lo vendido y lo cancelado. Se conectará cuando el backend publique sus agregaciones; hasta entonces no se muestra ningún importe."
            href="/panel/wallet"
            icon="wallet"
            linkLabel="Ver sección"
            pending
            title="Wallet"
          />
        </div>
      </div>
    </>
  );
}

/**
 * Tarjeta grande de una sección.
 *
 * Las que ya funcionan llevan su acción principal; las que esperan contrato lo dicen con un
 * distintivo y enlazan a su pantalla, que lo explica. Ninguna enseña cifras.
 */
function DashboardCard({
  icon,
  title,
  description,
  href,
  linkLabel,
  secondary,
  pending = false,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly linkLabel: string;
  readonly secondary?: { readonly href: string; readonly label: string } | undefined;
  readonly pending?: boolean;
}) {
  return (
    <section className={styles.dashboardCard}>
      <div className={styles.dashboardCardHead}>
        <span aria-hidden="true" className={styles.dashboardIcon}>
          <Icon name={icon} />
        </span>
        {pending ? <span className={styles.pendingPill}>Próximamente</span> : null}
      </div>
      <h2 className={styles.dashboardCardTitle}>{title}</h2>
      <p className={styles.dashboardCardText}>{description}</p>
      <div className={styles.dashboardCardActions}>
        <Link className={pending ? styles.buttonSecondary : styles.buttonPrimary} href={href}>
          {linkLabel}
        </Link>
        {secondary === undefined ? null : (
          <Link className={styles.buttonSecondary} href={secondary.href}>
            {secondary.label}
          </Link>
        )}
      </div>
    </section>
  );
}
