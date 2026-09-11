import 'server-only';

/**
 * Creación de productos a través del BFF.
 *
 * El navegador nunca llama al backend: no conoce su URL, no tiene identidad IAM y no puede leer la
 * cookie de sesión. Esta ruta valida `Origin`, traduce la cookie al encabezado interno y devuelve
 * el producto autoritativo que responde el backend.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseCreateProduct } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { createProduct } from '@/lib/api/catalog';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMutation(
    request,
    parseCreateProduct,
    (sessionMaterial, body) => createProduct(sessionMaterial, body),
    201,
  );
}
