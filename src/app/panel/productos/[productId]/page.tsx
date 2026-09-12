import Link from 'next/link';

import styles from '@/features/panel/catalog.module.css';
import { describeBackendFailure } from '@/features/panel/catalog-errors';
import { PanelHeader } from '@/features/panel/panel-header';
import { ProductDetailClient } from '@/features/panel/product-detail-client';
import { detailPermissions } from '@/features/panel/product-permissions';
import { resolvePanelSession } from '@/features/panel/session-context';
import { getProduct } from '@/lib/api/catalog';
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
        <div className={styles.cardPad}>
          <p className={styles.error} role="alert">
            {message}
          </p>
          <Link className={styles.buttonSecondary} href="/panel/productos">
            Volver al catálogo
          </Link>
        </div>
      </>
    );
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
      <div className={styles.cardPad}>
        <h1 className={styles.pageTitle}>{product.name}</h1>
        <p className={styles.pageLead}>
          Los cambios se envían con la versión que estás viendo. Si alguien la modifica antes, el
          backend lo rechaza y podrás recargar. Las variantes se crean una detrás de otra, cada una
          con la versión que devolvió la anterior.
        </p>
        <ProductDetailClient initial={product} permissions={detailPermissions(role)} role={role} />
      </div>
    </>
  );
}
