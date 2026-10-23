import 'server-only';

/**
 * Listado de pedidos a través del BFF.
 *
 * El navegador nunca llama al backend: no conoce su URL, no tiene identidad IAM y no puede leer la
 * cookie de sesión. Esta ruta traduce la cookie al encabezado interno y devuelve la página tal como
 * la responde el backend, con su total.
 *
 * Solo se propagan `page`, `pageSize` y el filtro `status`. Lo que no se reconoce vuelve a la
 * página 1 con 20 por página y sin filtro, igual que en la pantalla: los límites y los estados
 * válidos los decide el backend.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { readOrderListPosition, readOrderStatusFilter } from '@/features/panel/order-pagination';
import { handleQuery } from '@/features/session/query-route';
import { listOrders } from '@/lib/api/orders';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const position = readOrderListPosition({
    page: request.nextUrl.searchParams.get('page'),
    pageSize: request.nextUrl.searchParams.get('pageSize'),
  });

  const status = readOrderStatusFilter(request.nextUrl.searchParams.get('status'));

  return handleQuery(request, (sessionMaterial) =>
    listOrders(sessionMaterial, status === null ? position : { ...position, status }),
  );
}
