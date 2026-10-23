import 'server-only';

/**
 * Exportación CSV del listado de pedidos, a través del BFF.
 *
 * El backend compone el archivo entero —todas las páginas del filtro, con sus columnas y su
 * protección contra fórmulas— y exige la sesión y `orders.read`. Esta ruta solo traduce la cookie
 * al encabezado interno y reenvía los bytes tal cual, sin leerlos ni registrarlos: el contenido
 * lleva datos personales de quien compra.
 *
 * Solo se propaga `status`; uno mal formado se rechaza con 400 en lugar de exportarlo todo, y uno
 * con forma de estado que no existe lo rechaza el backend. Sin coincidencias responde `204` sin
 * cuerpo, para que la pantalla avise en lugar de descargar un archivo vacío. El archivo va siempre
 * como descarga, con `nosniff` y sin caché.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { exportFilenameFromDisposition } from '@/features/panel/order-export';
import { readOrderStatusFilter } from '@/features/panel/order-pagination';
import { sessionErrorFromBackendFailure } from '@/features/session/api-errors';
import { queryError } from '@/features/session/query-route';
import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { isBackendFailure } from '@/lib/api/errors';
import { exportOrders } from '@/lib/api/orders';

const COUNT_SHAPE = /^[0-9]{1,6}$/;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionMaterial = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (sessionMaterial === undefined || sessionMaterial.length === 0) {
    return queryError('session_required');
  }

  const rawStatus = request.nextUrl.searchParams.get('status');
  const status = readOrderStatusFilter(rawStatus);

  // En el listado, un estado ilegible vuelve a «Todos». Aquí no: exportaría todos los pedidos
  // cuando alguien pidió unos pocos.
  if (rawStatus !== null && rawStatus !== '' && status === null) {
    return queryError('invalid_request');
  }

  try {
    const result = await exportOrders(sessionMaterial, status);

    if (result.kind === 'empty') {
      return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'text/csv; charset=utf-8',
      // El nombre se reescribe desde una forma cerrada: nunca se reenvía un encabezado ajeno tal cual.
      'Content-Disposition': `attachment; filename="${exportFilenameFromDisposition(result.contentDisposition, status)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    };

    if (result.count !== null && COUNT_SHAPE.test(result.count)) {
      headers['X-Order-Export-Count'] = result.count;
    }

    return new NextResponse(result.bytes, { status: 200, headers });
  } catch (error) {
    return isBackendFailure(error)
      ? queryError(sessionErrorFromBackendFailure(error.code), error.reference)
      : queryError('internal_error');
  }
}
