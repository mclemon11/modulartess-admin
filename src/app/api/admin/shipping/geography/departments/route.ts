import 'server-only';

/** `GET /api/admin/shipping/geography/departments`: los departamentos DIVIPOLA oficiales. */

import type { NextRequest, NextResponse } from 'next/server';

import { handleQuery } from '@/features/session/query-route';
import { listDepartments } from '@/lib/api/shipping';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleQuery(request, () => listDepartments());
}
