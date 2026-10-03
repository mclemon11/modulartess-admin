import Link from 'next/link';

import styles from '@/features/panel/catalog.module.css';
import { loadCategoryCatalog } from '@/features/panel/category-catalog';
import { describeBackendFailure } from '@/features/panel/catalog-errors';
import { ErrorState } from '@/features/panel/panel-states';
import { PanelHeader } from '@/features/panel/panel-header';
import { ProductDetailClient } from '@/features/panel/product-detail-client';
import { ProductGuide } from '@/features/panel/product-guide';
import { detailPermissions } from '@/features/panel/product-permissions';
import { resolvePanelSession } from '@/features/panel/session-context';
import { sessionErrorFromBackendFailure } from '@/features/session/api-errors';
import { can } from '@/features/session/permissions';
import { ProductShippingSection } from '@/features/shipping/product-shipping-section';
import { describeShippingFailure } from '@/features/shipping/shipping-errors';
import { getProduct } from '@/lib/api/catalog';
import { listProductRelations, type ShippingProductRelationPage } from '@/lib/api/shipping';
import { isBackendFailure } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type PageProps = {
  readonly params: Promise<{ readonly productId: string }>;
};

export default async function ProductDetailPage({ params }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') {
    return null;
  }

  const { productId } = await params;
  const { role } = session.session;

  let product;

  try {
    product = await getProduct(session.session.sessionMaterial, productId);
  } catch (error) {
    const message = isBackendFailure(error)
      ? describeBackendFailure(error.code)
      : 'No pudimos cargar el producto.';

    return (
      <>
        <PanelHeader
          trail={[
            { href: '/panel', label: 'Panel' },
            { href: '/panel/productos', label: 'Productos' },
            { label: 'Producto' },
          ]}
        />
        <div className={styles.page}>
          <ErrorState
            action={
              <Link className={styles.buttonSecondary} href="/panel/productos">
                Volver al catálogo
              </Link>
            }
            message={message}
            title="No pudimos cargar el producto"
          />
        </div>
      </>
    );
  }

  // Las dos listas de estado: la categoría de un producto histórico puede estar archivada.
  const categories = await loadCategoryCatalog(session.session.sessionMaterial);

  // Cobertura y envío: aparte del formulario del producto, y solo con `shipping.read`.
  const canReadShipping = can(role, 'shipping.read');
  let shippingRelations: ShippingProductRelationPage | null = null;
  let shippingProblem: string | null = null;

  if (canReadShipping) {
    try {
      // Endpoint inverso del contrato: la primera página; las siguientes, desde la sección.
      shippingRelations = await listProductRelations(session.session.sessionMaterial, product.id);
    } catch (error) {
      shippingProblem = isBackendFailure(error)
        ? describeShippingFailure(sessionErrorFromBackendFailure(error.code))
        : 'No pudimos leer las zonas de envío de este producto.';
    }
  }

  return (
    <>
      <PanelHeader
        trail={[
          { href: '/panel', label: 'Panel' },
          { href: '/panel/productos', label: 'Productos' },
          { label: product.name },
        ]}
      />
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <div className={styles.pageHeadText}>
            <h1 className={styles.pageTitle}>{product.name}</h1>
            <p className={styles.pageLead}>
              Los cambios se envían con la versión que estás viendo. Si alguien la modifica antes,
              el backend lo rechaza y podrás recargar. Las variantes se crean una detrás de otra,
              cada una con la versión que devolvió la anterior.
            </p>
          </div>
          <div className={styles.pageHeadActions}>
            <ProductGuide mode="edit" />
          </div>
        </div>
        {/*
          `key` con la versión: «Recargar datos» tras un conflicto llama a `router.refresh()`, que
          trae la versión nueva del servidor, pero React conservaría el estado del formulario en
          la versión vieja y el siguiente guardado volvería a chocar. Con la versión en la clave,
          recargar monta la ficha otra vez sobre lo que el backend tiene ahora.
        */}
        <ProductDetailClient
          key={`${product.id}:${product.version}`}
          categories={categories.options}
          categoryComplete={categories.complete}
          categoryProblem={categories.problem}
          initial={product}
          permissions={detailPermissions(role)}
          role={role}
        />
        {canReadShipping ? (
          <ProductShippingSection
            canManage={can(role, 'shipping.manage')}
            initial={shippingRelations}
            problem={shippingProblem}
            product={{ id: product.id, name: product.name }}
          />
        ) : null}
      </div>
    </>
  );
}
