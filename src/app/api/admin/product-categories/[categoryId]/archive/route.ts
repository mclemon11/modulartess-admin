import 'server-only';

/**
 * Archivar una categoría. Deja de admitir **nuevas** asignaciones y nada más: los productos que ya
 * la usan la conservan y la tienda los sigue leyendo. No se borra nada y el slug no se libera.
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
    transitionCategory(sessionMaterial, categoryId, 'archive', body.expectedVersion),
  );
}
