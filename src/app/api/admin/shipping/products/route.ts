import 'server-only';

/**
 * `GET /api/admin/shipping/products?q=&pageToken=`: productos para los selectores de envíos.
 *
 * Es la búsqueda del catálogo **en el servidor** (`GET /v1/admin/products?q=`, vista `all`) por
 * nombre, SKU y slug, con su cursor, **recortada** a lo que el selector necesita: nombre, SKU,
 * estado, categoría y variantes activas. Los archivados vienen marcados para que la interfaz los
 * identifique y no los seleccione por defecto. Nada se descarga en bloque.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { toPickerProduct } from '@/features/shipping/shipping-projections';
import { handleQuery, queryError } from '@/features/session/query-route';
import { listProducts } from '@/lib/api/catalog';

const PAGE_SIZE = 25;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const pageToken = request.nextUrl.searchParams.get('pageToken') ?? '';

  if (q.length === 1 || q.length > 80 || pageToken.length > 512)
    return queryError('invalid_request');

  return handleQuery(request, async (sessionMaterial) => {
    const page = await listProducts(sessionMaterial, {
      view: 'all',
      pageSize: PAGE_SIZE,
      ...(q === '' ? {} : { q }),
      ...(pageToken === '' ? {} : { pageToken }),
    });

    return { items: page.items.map(toPickerProduct), nextPageToken: page.nextPageToken };
  });
}
