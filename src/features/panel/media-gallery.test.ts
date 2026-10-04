import { describe, expect, it } from 'vitest';

import type { AdminProduct } from '@/lib/api/catalog';
import { catalogFailure } from '@/lib/api/errors';
import {
  VIDEO_MAX_BYTES,
  checkVideoFile,
  formatBytes,
  formatDuration,
} from '@/lib/api/video-limits';

import { describeCatalogFailure } from './catalog-errors';
import { galleryItems, moveMedia } from './media-gallery-order';
import { parseReorderMedia, parseUpdateProductVideo } from './product-input';

const product = {
  images: [
    { id: 'img_a', status: 'active', altText: 'Frente', isPrimary: true },
    { id: 'img_b', status: 'active', altText: 'Lado', isPrimary: false },
    { id: 'img_old', status: 'archived', altText: 'Vieja', isPrimary: false },
  ],
  videos: [
    { id: 'vid_1', status: 'active', title: 'En uso', poster: null, posterState: 'pending' },
    { id: 'vid_x', status: 'archived', title: 'Borrado', poster: null, posterState: 'pending' },
  ],
  gallery: [
    { mediaType: 'video', id: 'vid_1' },
    { mediaType: 'image', id: 'img_a' },
    { mediaType: 'image', id: 'img_b' },
    { mediaType: 'video', id: 'vid_x' },
  ],
} as unknown as AdminProduct;

describe('orden de la galería multimedia', () => {
  it('sigue el orden del backend y omite lo que no está activo', () => {
    expect(galleryItems(product).map((item) => [item.kind, item.id, item.label])).toEqual([
      ['video', 'vid_1', 'En uso'],
      ['image', 'img_a', 'Frente'],
      ['image', 'img_b', 'Lado'],
    ]);
  });

  it('mover produce la lista completa, y no más allá de los extremos', () => {
    const items = galleryItems(product);
    expect(moveMedia(items, 'vid_1', 1)).toEqual(['img_a', 'vid_1', 'img_b']);
    expect(moveMedia(items, 'img_b', -1)).toEqual(['vid_1', 'img_b', 'img_a']);
    expect(moveMedia(items, 'vid_1', -1)).toBeNull();
    expect(moveMedia(items, 'img_b', 1)).toBeNull();
  });

  it('un producto sin videos es su lista de imágenes', () => {
    const plain = {
      ...product,
      videos: [],
      gallery: [
        { mediaType: 'image', id: 'img_a' },
        { mediaType: 'image', id: 'img_b' },
      ],
    } as unknown as AdminProduct;
    expect(galleryItems(plain).map((item) => item.kind)).toEqual(['image', 'image']);
  });
});

describe('comprobación previa del archivo de video', () => {
  const mp4 = { name: 'demo.mp4', type: 'video/mp4', size: 1024 };

  it('acepta un MP4 dentro del límite', () => {
    expect(checkVideoFile(mp4)).toBeNull();
    expect(checkVideoFile({ ...mp4, name: 'DEMO.MP4' })).toBeNull();
    expect(checkVideoFile({ ...mp4, size: VIDEO_MAX_BYTES })).toBeNull();
  });

  it('rechaza vacío, grande, otra extensión u otro tipo', () => {
    expect(checkVideoFile({ ...mp4, size: 0 })).toBe('video_empty');
    expect(checkVideoFile({ ...mp4, size: VIDEO_MAX_BYTES + 1 })).toBe('video_too_large');
    expect(checkVideoFile({ ...mp4, name: 'demo.mov' })).toBe('video_extension_mismatch');
    expect(checkVideoFile({ ...mp4, name: 'demo.gif', type: 'image/gif' })).toBe(
      'video_extension_mismatch',
    );
    expect(checkVideoFile({ ...mp4, type: 'video/quicktime' })).toBe('video_content_type_mismatch');
  });

  it('formatea tamaño y duración sin inventar', () => {
    expect(formatBytes(VIDEO_MAX_BYTES)).toBe('20,0 MB');
    expect(formatDuration(12.3)).toBe('0:12');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(null)).toBe('duración desconocida');
  });
});

describe('errores de video', () => {
  it('el motivo del backend viaja como referencia validada', () => {
    const failure = catalogFailure(400, {
      code: 'product_video_invalid',
      reason: 'video_too_large',
    });
    expect(failure.code).toBe('backend_product_video_invalid');
    expect(failure.reference).toBe('video_too_large');

    const unsafe = catalogFailure(400, {
      code: 'product_video_invalid',
      reason: 'contiene <script> y espacios',
    });
    expect(unsafe.reference).toBeNull();
    expect(catalogFailure(409, { code: 'product_video_limit' }).code).toBe(
      'backend_product_video_limit',
    );
  });

  it('cada motivo tiene un mensaje concreto en español', () => {
    expect(describeCatalogFailure('video_invalid', 'video_too_large')).toContain('20 MB');
    expect(describeCatalogFailure('video_invalid', 'video_format_unsupported')).toContain(
      'no es un MP4',
    );
    expect(describeCatalogFailure('video_invalid', 'poster_invalid')).toContain('póster');
    expect(describeCatalogFailure('video_invalid', 'otro_motivo')).toContain('video');
    expect(describeCatalogFailure('video_limit')).toContain('3 videos');
  });
});

describe('validación de las rutas JSON de video', () => {
  it('título o posición, al menos uno', () => {
    expect(parseUpdateProductVideo({ expectedVersion: 3, title: '  Nuevo ' })).toEqual({
      expectedVersion: 3,
      title: 'Nuevo',
    });
    expect(parseUpdateProductVideo({ expectedVersion: 3, position: 0 })).toEqual({
      expectedVersion: 3,
      position: 0,
    });
    expect(parseUpdateProductVideo({ expectedVersion: 3 })).toBeNull();
    expect(parseUpdateProductVideo({ expectedVersion: 3, title: '' })).toBeNull();
    expect(parseUpdateProductVideo({ expectedVersion: 0, title: 'x' })).toBeNull();
  });

  it('el orden exige identificadores únicos y con forma', () => {
    expect(parseReorderMedia({ expectedVersion: 2, mediaIds: ['img_a', 'vid_1'] })).toEqual({
      expectedVersion: 2,
      mediaIds: ['img_a', 'vid_1'],
    });
    expect(parseReorderMedia({ expectedVersion: 2, mediaIds: ['img_a', 'img_a'] })).toBeNull();
    expect(parseReorderMedia({ expectedVersion: 2, mediaIds: ['../x'] })).toBeNull();
    expect(parseReorderMedia({ expectedVersion: 2, mediaIds: [] })).toBeNull();
  });
});
