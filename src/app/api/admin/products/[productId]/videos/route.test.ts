import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';
import { VIDEO_MAX_BYTES } from '@/lib/api/video-limits';

/**
 * Subida de video a través del BFF (ADR 0026 del backend): origen, sesión, clave de idempotencia,
 * tamaño y título se comprueban aquí; el contenedor real lo inspecciona el backend.
 */

const uploadProductVideo = vi.fn();

vi.mock('@/lib/api/catalog', () => ({
  uploadProductVideo: (...args: unknown[]) => uploadProductVideo(...args),
}));

const { POST } = await import('./route');

const ALLOWED_ORIGIN = 'https://panel.example.invalid';
const context = { params: Promise.resolve({ productId: 'prd_abc' }) };

function request(options?: {
  readonly origin?: string | null;
  readonly key?: string | null;
  readonly file?: File | null;
  readonly title?: string;
  readonly contentLength?: string;
}): NextRequest {
  const form = new FormData();
  const file =
    options?.file === undefined
      ? new File([new Uint8Array(64)], 'demo.mp4', { type: 'video/mp4' })
      : options.file;

  if (file !== null) form.set('file', file, file.name);
  form.set('title', options?.title ?? 'Tocador en uso');
  form.set('expectedVersion', '4');
  form.set('extra', 'no debe viajar');

  const headers = new Headers();

  if (options?.origin !== null) headers.set('origin', options?.origin ?? ALLOWED_ORIGIN);
  if (options?.key !== null) headers.set('x-idempotency-key', options?.key ?? 'clave-video-123');

  const built = new NextRequest('https://panel.example.invalid/api/admin/products/prd_abc/videos', {
    method: 'POST',
    headers,
    body: form,
  });

  if (options?.contentLength !== undefined) {
    built.headers.set('content-length', options.contentLength);
  }

  built.cookies.set(SESSION_COOKIE_NAME, 'material-de-sesion');

  return built;
}

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ALLOWED_ORIGIN;
  uploadProductVideo.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

describe('subida de video por el BFF', () => {
  it('reenvía solo los campos del contrato con la clave de idempotencia', async () => {
    uploadProductVideo.mockResolvedValue({ product: { id: 'prd_abc' }, replayed: false });

    const response = await POST(request(), context);

    expect(response.status).toBe(201);
    const [, productId, key, form] = uploadProductVideo.mock.calls[0] as [
      string,
      string,
      string,
      FormData,
    ];
    expect(productId).toBe('prd_abc');
    expect(key).toBe('clave-video-123');
    expect([...form.keys()].sort()).toEqual(['expectedVersion', 'file', 'title']);
    expect(form.get('title')).toBe('Tocador en uso');
  });

  it('rechaza otro origen, la falta de clave o de título sin llamar al backend', async () => {
    expect((await POST(request({ origin: 'https://otro.example.invalid' }), context)).status).toBe(
      403,
    );
    expect((await POST(request({ key: null }), context)).status).toBe(400);
    expect((await POST(request({ title: '   ' }), context)).status).toBe(400);
    expect(uploadProductVideo).not.toHaveBeenCalled();
  });

  it('un archivo ausente o grande se rechaza con su motivo, antes del backend', async () => {
    const missing = await POST(request({ file: null }), context);
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({
      code: 'video_invalid',
      reference: 'video_empty',
    });

    const declared = await POST(request({ contentLength: String(VIDEO_MAX_BYTES * 2) }), context);
    expect(declared.status).toBe(400);
    await expect(declared.json()).resolves.toMatchObject({
      code: 'video_invalid',
      reference: 'video_too_large',
    });
    expect(uploadProductVideo).not.toHaveBeenCalled();
  });

  it('el motivo del backend llega al panel como referencia', async () => {
    uploadProductVideo.mockRejectedValue(
      new BackendFailure('backend_product_video_invalid', 'video_format_unsupported'),
    );

    const response = await POST(request(), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'video_invalid',
      reference: 'video_format_unsupported',
    });
  });
});
