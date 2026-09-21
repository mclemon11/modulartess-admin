import { redirect } from 'next/navigation';

import styles from '@/features/panel/catalog.module.css';
import { CreateProductForm } from '@/features/panel/create-product-form';
import { ProductGuide } from '@/features/panel/product-guide';
import { PanelHeader } from '@/features/panel/panel-header';
import { resolvePanelSession } from '@/features/panel/session-context';
import { can } from '@/features/session/permissions';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') {
    return null;
  }

  // El backend también lo rechazaría; esto evita mostrar un formulario que no se puede enviar.
  if (!can(session.session.role, 'products.create')) {
    redirect('/panel/productos');
  }

  return (
    <>
      <PanelHeader
        trail={[
          { href: '/panel', label: 'Panel' },
          { href: '/panel/productos', label: 'Productos' },
          { label: 'Nuevo' },
        ]}
      />
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <div className={styles.pageHeadText}>
            <h1 className={styles.pageTitle}>Nuevo producto</h1>
            <p className={styles.pageLead}>Crea y administra la información de tu producto.</p>
          </div>
          {/* La guía se abre solo si se pide. No se abre sola ni recuerda si ya se vio. */}
          <div className={styles.pageHeadActions}>
            <ProductGuide mode="create" />
          </div>
        </div>
        {/* El formulario ya son tarjetas: envolverlo en otra crearía un marco dentro de un marco. */}
        <CreateProductForm canPublish={can(session.session.role, 'products.publish')} />
      </div>
    </>
  );
}
