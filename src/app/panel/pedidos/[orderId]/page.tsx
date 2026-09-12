import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import { describeBackendFailure } from '@/features/panel/catalog-errors';
import { OrderDetailView } from '@/features/panel/order-detail-view';
import { ErrorState } from '@/features/panel/panel-states';
import { PanelHeader } from '@/features/panel/panel-header';
import { resolvePanelSession } from '@/features/panel/session-context';
import { getOrder } from '@/lib/api/orders';
import { isBackendFailure } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type PageProps = {
  readonly params: Promise<{ readonly orderId: string }>;
};

/**
 * Ficha de un pedido.
 *
 * El servidor lee el pedido con la sesión de la persona y se lo entrega al detalle, que a partir de
 * ahí sustituye su estado con lo que devuelva cada mutación. El navegador no conoce la URL del
 * backend ni puede leer la cookie.
 */
export default async function OrderDetailPage({ params }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') {
    return null;
  }

  const { orderId } = await params;
  const trail = [
    { href: '/panel', label: 'Panel' },
    { href: '/panel/pedidos', label: 'Pedidos' },
    { label: 'Pedido' },
  ];

  let order;

  try {
    order = await getOrder(session.session.sessionMaterial, orderId);
  } catch (error) {
    const message = isBackendFailure(error)
      ? describeBackendFailure(error.code)
      : 'No pudimos cargar el pedido.';

    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <ErrorState
            action={
              <Link className={catalog.buttonSecondary} href="/panel/pedidos">
                Volver a pedidos
              </Link>
            }
            message={message}
            title="No pudimos cargar el pedido"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader
        trail={[
          { href: '/panel', label: 'Panel' },
          { href: '/panel/pedidos', label: 'Pedidos' },
          { label: order.publicId },
        ]}
      />
      {/*
       * La `key` incluye la versión autoritativa a propósito.
       *
       * «Recargar pedido» ejecuta `router.refresh()`, que vuelve a renderizar el Server Component
       * pero **conserva el estado** del Client Component: sin esto, el pedido recién leído llegaría
       * como `initialOrder` y `useState` seguiría devolviendo la instantánea obsoleta, que es
       * justamente la que provocó el conflicto de versión. Al cambiar la versión cambia la `key`,
       * React desmonta y vuelve a montar, y el estado local nace de la lectura nueva.
       */}
      <OrderDetailView
        initialOrder={order}
        key={`${order.id}:${order.version}`}
        role={session.session.role}
      />
    </>
  );
}
