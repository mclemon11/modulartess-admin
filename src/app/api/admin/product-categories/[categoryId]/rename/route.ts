import 'server-only';

/**
 * Renombrar una categoría. Cambia **solo el nombre**: el slug no cambia nunca, y los productos que
 * ya la usan conservan su copia hasta que se editen. Exige `expectedVersion`; el permiso
 * (`products.update`) lo vuelve a exigir el backend.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseRenameCategory } from '@/features/panel/category-input';
import { handleMutation } from '@/features/session/mutation-route';
import { renameCategory } from '@/lib/api/categories';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly categoryId: string }> },
): Promise<NextResponse> {
  const { categoryId } = await context.params;

  return handleMutation(request, parseRenameCategory, (sessionMaterial, body) =>
    renameCategory(sessionMaterial, categoryId, body),
  );
}
