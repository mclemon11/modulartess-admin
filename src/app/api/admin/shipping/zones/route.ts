import 'server-only';

/**
 * `GET /api/admin/shipping/zones?view=&…`: una página de zonas con los filtros del contrato.
 * `POST /api/admin/shipping/zones`: crear una zona, siempre en borrador (`shipping.manage`).
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseZoneCreate, parseZoneQuery } from '@/features/shipping/shipping-input';
import { handleMutation } from '@/features/session/mutation-route';
import { handleQuery, queryError } from '@/features/session/query-route';
import { createZone, listZones } from '@/lib/api/shipping';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = parseZoneQuery(request.nextUrl.searchParams);

  if (query === null) return queryError('invalid_request');

  return handleQuery(request, (sessionMaterial) => listZones(sessionMaterial, query));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseZoneCreate, createZone, 201);
}
