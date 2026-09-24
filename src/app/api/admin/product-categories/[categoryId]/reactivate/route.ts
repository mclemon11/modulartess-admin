import 'server-only';

/**
 * Reactivar una categoría archivada: vuelve a admitir asignaciones nuevas.
 *
 * Exige `expectedVersion`; el permiso (`products.archive`) lo vuelve a exigir el backend.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseCategoryTransition } from '@/features/panel/category-input';
import { handleMutation } from '@/features/session/mutation-route';
import { transitionCategory } from '@/lib/api/categories';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly categoryId: string }> },
): Promise<NextResponse> {
  const { categoryId } = await context.params;

  return handleMutation(request, parseCategoryTransition, (sessionMaterial, body) =>
    transitionCategory(sessionMaterial, categoryId, 'reactivate', body.expectedVersion),
  );
}
