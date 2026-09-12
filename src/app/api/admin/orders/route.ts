import 'server-only';

/**
 * Listado de pedidos a través del BFF.
 *
 * El navegador nunca llama al backend: no conoce su URL, no tiene identidad IAM y no puede leer la
 * cookie de sesión. Esta ruta traduce la cookie al encabezado interno y devuelve la página tal como
 * la responde el backend.
 *
 * Solo se propagan `pageToken` y `pageSize`, que es lo único que admite el contrato: no hay
 * búsqueda ni filtros que reenviar.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { handleQuery } from '@/features/session/query-route';
import { listOrders } from '@/lib/api/orders';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const pageToken = request.nextUrl.searchParams.get('pageToken');

  return handleQuery(request, (sessionMaterial) =>
    listOrders(sessionMaterial, pageToken === null || pageToken === '' ? {} : { pageToken }),
  );
}
