import { describe, expect, it } from 'vitest';

import {
  describeImageRemovalFailure,
  IMAGE_REMOVAL_BUSY_MESSAGE,
  LAST_IMAGE_WITH_VIDEOS_MESSAGE,
} from './image-removal';

/**
 * Mensajes del diálogo «Quitar imagen» cuando el backend no retira la foto.
 *
 * El diálogo es modal y tapa el aviso de la sección: lo que diga aquí es lo único que la persona
 * ve hasta cerrarlo, así que un fallo nunca puede sonar a éxito.
 */
describe('retirar una imagen: mensajes de fallo', () => {
  it('un 409 pide recargar y no anuncia ninguna retirada', () => {
    const message = describeImageRemovalFailure('version_conflict');

    expect(message).toContain('Recarga');
    // Una sola indicación de recargar, no dos frases que dicen lo mismo.
    expect(message.match(/Recarga/g)).toHaveLength(1);
    expect(message).not.toMatch(/retirad|quitad/i);
  });

  it('la última imagen con videos activos explica las dos salidas', () => {
    expect(describeImageRemovalFailure('video_invalid', 'image_required_with_videos')).toBe(
      LAST_IMAGE_WITH_VIDEOS_MESSAGE,
    );
    expect(LAST_IMAGE_WITH_VIDEOS_MESSAGE).toContain(
      'Agrega otra imagen o elimina primero los videos',
    );
  });

  it('otro motivo de video no se confunde con la regla de la última imagen', () => {
    expect(describeImageRemovalFailure('video_invalid', 'video_too_large')).not.toBe(
      LAST_IMAGE_WITH_VIDEOS_MESSAGE,
    );
  });

  it('una operación en curso tampoco se presenta como retirada', () => {
    expect(IMAGE_REMOVAL_BUSY_MESSAGE).not.toMatch(/retirad|quitad/i);
  });
});
