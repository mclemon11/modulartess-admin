import 'server-only';

/**
 * `GET /api/admin/shipping/geography/departments/{code}/municipalities`: los municipios de **un**
 * departamento. El selector los pide al desplegar ese departamento, nunca los 1.122 a la vez.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { isDepartmentCode } from '@/features/shipping/coverage-model';
import { handleQuery, queryError } from '@/features/session/query-route';
import { listMunicipalities } from '@/lib/api/shipping';

export async function GET(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly departmentCode: string }> },
): Promise<NextResponse> {
  const { departmentCode } = await context.params;

  if (!isDepartmentCode(departmentCode)) return queryError('geography_department_not_found');

  return handleQuery(request, () => listMunicipalities(departmentCode));
}
