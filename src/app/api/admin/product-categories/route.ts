import 'server-only';

/**
 * Crear una categoría de producto.
 *
 * El navegador llama aquí y a ninguna otra parte. Se valida la forma del cuerpo, se recupera la
 * sesión de la cookie `__Host-` y se invoca el endpoint publicado. El permiso lo vuelve a exigir el
 * backend (`products.update`): ocultar el botón es usabilidad, no autoridad.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseCreateCategory } from '@/features/panel/category-input';
import { handleMutation } from '@/features/session/mutation-route';
import { createCategory } from '@/lib/api/categories';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseCreateCategory, (sessionMaterial, body) =>
    createCategory(sessionMaterial, body),
  );
}
