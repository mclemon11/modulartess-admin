import 'server-only';

/**
 * `GET /api/admin/shipping/assignable?q=&pageToken=`: una página de zonas vigentes y listas, con sus
 * reglas activas, para elegir dónde asignar productos. La busca y la pagina el backend.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { loadAssignableZones } from '@/features/shipping/shipping-server';
import { handleQuery, queryError } from '@/features/session/query-route';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const pageToken = request.nextUrl.searchParams.get('pageToken') ?? '';

  if (q.length === 1 || q.length > 80 || pageToken.length > 512)
    return queryError('invalid_request');

  return handleQuery(request, (sessionMaterial) =>
    loadAssignableZones(sessionMaterial, {
      ...(q === '' ? {} : { q }),
      ...(pageToken === '' ? {} : { pageToken }),
    }),
  );
}
