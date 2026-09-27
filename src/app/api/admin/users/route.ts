import 'server-only';

/**
 * `POST /api/admin/users`: invitar una cuenta administrativa.
 *
 * El navegador manda solo correo, nombre, rol y la clave de idempotencia que generó. El BFF pasa
 * la clave al encabezado `Idempotency-Key` y el resto al cuerpo cerrado del contrato. Ni una
 * contraseña ni un enlace de invitación viajan por aquí, en ninguna dirección.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { handleMutation } from '@/features/session/mutation-route';
import { parseCreateUser } from '@/features/users/user-input';
import { createAdminUser } from '@/lib/api/admin-users';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMutation(
    request,
    parseCreateUser,
    (sessionMaterial, input) =>
      createAdminUser(sessionMaterial, input.idempotencyKey, {
        email: input.email,
        displayName: input.displayName,
        role: input.role,
      }),
    201,
  );
}
