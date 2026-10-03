import 'server-only';

/** `GET /api/admin/shipping/analysis`: solapamientos, empates y municipios sin cobertura activa. */

import type { NextRequest, NextResponse } from 'next/server';

import { handleQuery } from '@/features/session/query-route';
import { getAnalysis } from '@/lib/api/shipping';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleQuery(request, getAnalysis);
}
