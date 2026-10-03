import { redirect } from 'next/navigation';

import styles from '@/features/panel/catalog.module.css';
import { loadCategoryCatalog } from '@/features/panel/category-catalog';
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

  // Las activas se ofrecen; las archivadas se leen para reconocerlas, nunca para ofrecerlas.
  const categories = await loadCategoryCatalog(session.session.sessionMaterial);

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
        <CreateProductForm
          canCreateCategory={can(session.session.role, 'products.update')}
          canPublish={can(session.session.role, 'products.publish')}
          categories={categories.options}
          categoryComplete={categories.complete}
          categoryProblem={categories.problem}
        />
        {can(session.session.role, 'shipping.read') ? (
          <section aria-labelledby="cobertura-envio" className={styles.card}>
            <div className={styles.cardPad}>
              <h2 className={styles.sectionTitle} id="cobertura-envio">
                Cobertura y envío
              </h2>
              <p className={styles.hint}>
                Las zonas de envío se asignan cuando el producto ya existe: guárdalo y, desde su
                ficha, asígnalo a una regla de productos o deja que lo alcance su categoría o una
                regla para todos. Se gestiona aparte del precio, el inventario y las variantes.
              </p>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
