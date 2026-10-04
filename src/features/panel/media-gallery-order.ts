/**
 * Orden de la galería multimedia, tal como lo publica el backend en `product.gallery`.
 *
 * Módulo puro. El panel no decide el orden: lo lee y, al mover un elemento, manda la lista entera
 * al backend (`PUT /media/order`), que exige exactamente los medios activos.
 */

import type { AdminProduct, AdminProductImage, AdminProductVideo } from '@/lib/api/catalog';

export type GalleryItem =
  | {
      readonly kind: 'image';
      readonly id: string;
      readonly label: string;
      readonly image: AdminProductImage;
    }
  | {
      readonly kind: 'video';
      readonly id: string;
      readonly label: string;
      readonly video: AdminProductVideo;
    };

/**
 * Los elementos de la galería en su orden. Una entrada que no se encuentre entre las imágenes o
 * los videos activos se omite: es un producto leído a medias, no algo que pintar.
 */
export function galleryItems(
  product: Pick<AdminProduct, 'gallery' | 'images' | 'videos'>,
): GalleryItem[] {
  const images = new Map(
    product.images.filter((image) => image.status === 'active').map((image) => [image.id, image]),
  );
  const videos = new Map(
    product.videos.filter((video) => video.status === 'active').map((video) => [video.id, video]),
  );
  const items: GalleryItem[] = [];

  for (const entry of product.gallery) {
    if (entry.mediaType === 'image') {
      const image = images.get(entry.id);
      if (image !== undefined) {
        items.push({ kind: 'image', id: image.id, label: image.altText, image });
      }
    } else {
      const video = videos.get(entry.id);
      if (video !== undefined)
        items.push({ kind: 'video', id: video.id, label: video.title, video });
    }
  }

  return items;
}

/** La lista de identificadores tras mover uno, o `null` si no se puede mover más allá. */
export function moveMedia(
  items: readonly Pick<GalleryItem, 'id'>[],
  id: string,
  delta: -1 | 1,
): string[] | null {
  const ids = items.map((item) => item.id);
  const from = ids.indexOf(id);
  const to = from + delta;

  if (from === -1 || to < 0 || to >= ids.length) return null;

  [ids[from], ids[to]] = [ids[to] as string, ids[from] as string];

  return ids;
}
