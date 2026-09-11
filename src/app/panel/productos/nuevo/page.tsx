import { redirect } from 'next/navigation';

import styles from '@/features/panel/catalog.module.css';
import { CreateProductForm } from '@/features/panel/create-product-form';
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
      <div className={styles.cardPad}>
        <h1 className={styles.pageTitle}>Crear producto</h1>
        <p className={styles.pageLead}>
          SKU y slug quedan fijos al crear: el backend los vuelve inmutables. Todo lo demás se puede
          editar después.
        </p>
        <section className={styles.card}>
          <CreateProductForm />
        </section>
      </div>
    </>
  );
}
