import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AdminProduct } from '@/lib/api/catalog';

import { IMAGE_ANCHORS } from './product-anchors';
import { ProductMediaGallery } from './product-media-gallery';

/**
 * Galería multimedia: una sola lista con imágenes y videos en el orden de la tienda, y las
 * tarjetas de video con su póster, su estado y su eliminación confirmada.
 */

const noop = () => undefined;

function product(withVideo: boolean, withPoster = false): AdminProduct {
  return {
    id: 'prd_1',
    version: 5,
    images: [
      {
        mediaType: 'image',
        id: 'img_a',
        status: 'active',
        isPrimary: true,
        position: 0,
        altText: 'Frente del tocador',
        publicUrl: 'https://cdn.example/img_a.jpg',
      },
    ],
    videos: withVideo
      ? [
          {
            mediaType: 'video',
            id: 'vid_1',
            status: 'active',
            title: 'Tocador en uso',
            publicUrl: 'https://cdn.example/vid_1.mp4',
            sizeBytes: 5 * 1024 * 1024,
            durationSeconds: 12.3,
            poster: withPoster
              ? { publicUrl: 'https://cdn.example/vid_1-poster.jpg', contentType: 'image/jpeg' }
              : null,
            posterState: withPoster ? 'ready' : 'pending',
            storageState: 'stored',
            version: 1,
          },
        ]
      : [],
    gallery: withVideo
      ? [
          { mediaType: 'video', id: 'vid_1' },
          { mediaType: 'image', id: 'img_a' },
        ]
      : [{ mediaType: 'image', id: 'img_a' }],
    variants: [],
  } as unknown as AdminProduct;
}

function html(value: AdminProduct, canEdit = true, canArchive = true): string {
  return renderToStaticMarkup(
    <ProductMediaGallery
      canArchive={canArchive}
      canEdit={canEdit}
      onProduct={noop}
      product={value}
    />,
  );
}

describe('Galería multimedia', () => {
  it('tiene su ancla y su título', () => {
    const markup = html(product(false));
    expect(markup).toContain(`id="${IMAGE_ANCHORS.multimedia}"`);
    expect(markup).toContain('Galería multimedia');
  });

  it('pinta imágenes y videos en el orden del backend, con tipo y posición', () => {
    const markup = html(product(true));
    expect(markup).toContain('aria-label="Orden de la galería"');
    expect(markup.indexOf('Tocador en uso')).toBeLessThan(markup.indexOf('Frente del tocador'));
    expect(markup).toContain('Posición 1 de 2');
    expect(markup).toContain('5,0 MB · 0:12 · Póster pendiente');
    expect(markup).toContain('Posición 2 de 2 · Portada');
  });

  it('reordenar tiene nombres accesibles y respeta los extremos', () => {
    const markup = html(product(true));
    expect(markup).toContain('aria-label="Mover «Tocador en uso» antes"');
    expect(markup).toContain('aria-label="Mover «Frente del tocador» después"');
    expect(markup).toMatch(/<button aria-label="Mover «Tocador en uso» antes"[^>]*disabled/);
  });

  it('un video sin póster no tiene miniatura inventada y lo dice', () => {
    const markup = html(product(true));
    expect(markup).toContain('Póster pendiente');
    expect(markup).toContain('el video no se publica hasta que lo subas');
    expect(markup).not.toContain('vid_1-poster.jpg');
  });

  it('con póster, la miniatura y la vista previa lo usan; sin reproducción automática', () => {
    const markup = html(product(true, true));
    expect(markup).toContain('src="https://cdn.example/vid_1-poster.jpg"');
    expect(markup).toMatch(/<video[^>]*controls/);
    expect(markup).toMatch(/<video[^>]*preload="metadata"/);
    expect(markup).not.toMatch(/<video[^>]*autoplay/i);
    expect(markup).not.toMatch(/<video[^>]*loop/);
  });

  it('el selector de archivos acepta solo MP4 y el de póster solo imágenes', () => {
    const markup = html(product(true));
    expect(markup).toContain('accept="video/mp4,.mp4"');
    expect(markup).toContain('accept="image/jpeg,image/png,image/webp"');
  });

  it('eliminar pide confirmación en un diálogo nativo con nombre y descripción', () => {
    const markup = html(product(true));
    expect(markup).toMatch(/<dialog[^>]*aria-labelledby="[^"]+"/);
    expect(markup).toContain('¿Eliminar el video «Tocador en uso»?');
    expect(markup).toContain('No se puede deshacer');
  });

  it('sin permisos no hay subida, ni orden, ni eliminación', () => {
    const markup = html(product(true), false, false);
    expect(markup).toContain('Tu rol no permite subir videos.');
    expect(markup).not.toContain('Mover «');
    expect(markup).not.toContain('Eliminar video');
  });

  it('un producto sin videos muestra solo sus imágenes', () => {
    const markup = html(product(false));
    expect(markup).toContain('Videos (0 de 3)');
    expect(markup).not.toContain('<video');
  });
});
