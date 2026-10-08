import 'server-only';

/**
 * `GET /api/admin/orders/catalog?q=&pageToken=`: productos para agregar a un pedido.
 *
 * La búsqueda del catálogo **en el servidor** (`GET /v1/admin/products?q=`, vista `current`),
 * recortada a lo que el selector necesita y **solo con lo publicado**. Precio y disponibilidad son
 * los del catálogo; el precio de la línea lo pone el backend al guardar.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { toOrderPickerProduct, type OrderPickerProduct } from '@/features/panel/order-edit';
import { handleQuery, queryError } from '@/features/session/query-route';
import { listProducts } from '@/lib/api/catalog';

const PAGE_SIZE = 20;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const pageToken = request.nextUrl.searchParams.get('pageToken') ?? '';

  if (q.length === 1 || q.length > 80 || pageToken.length > 512) {
    return queryError('invalid_request');
  }

  return handleQuery(request, async (sessionMaterial) => {
    const page = await listProducts(sessionMaterial, {
      view: 'current',
      pageSize: PAGE_SIZE,
      ...(q === '' ? {} : { q }),
      ...(pageToken === '' ? {} : { pageToken }),
    });

    return {
      items: page.items
        .map(toOrderPickerProduct)
        .filter((product): product is OrderPickerProduct => product !== null),
      nextPageToken: page.nextPageToken,
    };
  });
}
