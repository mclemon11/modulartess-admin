/**
 * Límites de imagen que publica el contrato.
 *
 * Viven aparte de `./catalog` a propósito: ese módulo es `server-only`, y estas constantes las
 * necesita también el formulario del navegador para validar antes de subir. Importarlas desde
 * `catalog` arrastraría el cliente del backend —y con él `google-auth-library`— al bundle cliente.
 *
 * Módulo puro: solo datos del contrato.
 */

export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** `AdminProductImageDto.sizeBytes.maximum`. */
export const IMAGE_MAX_BYTES = 10_485_760;

/** `AdminProductImageDto.altText.maxLength`. */
export const IMAGE_ALT_MAX_LENGTH = 200;

/** Máximo de imágenes activas por producto, según la descripción de la operación de subida. */
export const IMAGE_MAX_ACTIVE = 10;
