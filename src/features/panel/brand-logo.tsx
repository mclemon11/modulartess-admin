import Image from 'next/image';

import styles from './panel-shell.module.css';

/**
 * Marca de Modulartess.
 *
 * Es el archivo real que entrega la marca (`public/assets/`), servido con `next/image`. No se
 * redibuja con CSS: un cuadrado en degradado era un marcador provisional, y la identidad no se
 * aproxima, se usa.
 *
 * Va `unoptimized` a propósito: el archivo es un SVG y el optimizador de imágenes de Next no
 * procesa SVG sin abrir `dangerouslyAllowSVG`, que relajaría la configuración para todo el
 * proyecto. Servirlo tal cual no cuesta nada: pesa lo mismo en origen.
 */

/** Ruta pública del logotipo. Sin espacios: ni hay que codificarla ni se puede escribir mal. */
export const LOGO_SRC = '/assets/modulartess-logo.svg';

/** Proporción del archivo original (874 × 369), para no deformarlo en ningún tamaño. */
const RATIO = 874 / 369;

export function BrandLogo({
  height,
  className,
  priority = false,
}: {
  readonly height: number;
  readonly className?: string | undefined;
  /** Solo en el inicio de sesión, donde es lo primero que se ve. */
  readonly priority?: boolean;
}) {
  return (
    <Image
      alt="Modulartess"
      className={className ?? styles.logo}
      height={height}
      priority={priority}
      src={LOGO_SRC}
      unoptimized
      width={Math.round(height * RATIO)}
    />
  );
}
