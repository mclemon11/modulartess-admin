import styles from './catalog.module.css';

/**
 * Iconos de las secciones del panel.
 *
 * Son SVG inline de trazo, dibujados aquí y no importados: el repositorio no versiona un set de
 * iconos y añadir una librería entera para ocho glifos no se sostiene. Usan `currentColor`, así que
 * heredan el violeta de la marca o el gris del texto según dónde se pinten.
 *
 * Son **decorativos**: el título de la sección va al lado y lo lee el lector de pantalla, así que
 * cada `svg` es `aria-hidden`.
 */

export type IconName =
  | 'basica'
  | 'clasificacion'
  | 'detalles'
  | 'imagenes'
  | 'precio'
  | 'inventario'
  | 'contenido'
  | 'variantes'
  | 'estado'
  | 'vistaPrevia'
  | 'panel'
  | 'productos'
  | 'pedidos'
  | 'cliente'
  | 'direccion'
  | 'historial'
  | 'resumen'
  | 'envios'
  | 'wallet';

const PATHS: Readonly<Record<IconName, readonly string[]>> = {
  basica: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M9 12h6', 'M9 16h6'],
  // Carpeta: cómo se ordena el catálogo, no lo que se lee en la ficha.
  clasificacion: ['M3 6h5.5l2 2H21v11H3z', 'M3 6v13'],
  // Portapapeles con líneas: materiales, medidas, garantía y cuidados.
  detalles: ['M8 5H6v15h12V5h-2', 'M9 3h6v4H9z', 'M9 12h6', 'M9 16h4'],
  imagenes: ['M3 5h18v14H3z', 'M3 16l5-5 4 4 3-3 6 6'],
  precio: ['M20 12l-8 8-9-9V3h8z', 'M7.5 7.5h.01'],
  inventario: ['M3 7l9-4 9 4v10l-9 4-9-4z', 'M3 7l9 4 9-4', 'M12 11v10'],
  contenido: ['M4 5h16', 'M4 10h16', 'M4 15h10', 'M4 20h7'],
  variantes: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  estado: ['M12 3l8 4v6c0 5-3.5 7.5-8 8-4.5-.5-8-3-8-8V7z', 'M9 12l2 2 4-4'],
  vistaPrevia: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 9a3 3 0 100 6 3 3 0 000-6z'],
  panel: ['M3 11l9-8 9 8', 'M6 10v10h12V10'],
  productos: ['M3 7l9-4 9 4v10l-9 4-9-4z', 'M12 11v10', 'M3 7l9 4 9-4'],
  // Carrito de compra, como en las referencias de Pedidos.
  pedidos: ['M3 4h2l2.4 11.2a2 2 0 002 1.6h7.7a2 2 0 002-1.6L21 8H6', 'M9 21h.01', 'M18 21h.01'],
  cliente: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M4 21c0-3.9 3.6-6 8-6s8 2.1 8 6'],
  direccion: [
    'M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z',
    'M12 13a3 3 0 100-6 3 3 0 000 6z',
  ],
  historial: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 7v5l3 2'],
  resumen: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6', 'M9 12h6'],
  // Camión de reparto.
  envios: [
    'M3 7h11v9H3z',
    'M14 10h3.5l2.5 3v3h-6z',
    'M7 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
    'M17.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  ],
  // Cartera.
  wallet: ['M3 7a2 2 0 012-2h12v14H5a2 2 0 01-2-2z', 'M17 9h4v6h-4a3 3 0 010-6z', 'M18.5 12h.01'],
};

export function Icon({
  name,
  className,
}: {
  readonly name: IconName;
  readonly className?: string | undefined;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width="20"
    >
      {PATHS[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}

/**
 * Cabecera de una tarjeta: icono en su cuadro violeta, título y, si hace falta, una línea de apoyo.
 *
 * Las referencias repiten esta cabecera en todas las tarjetas del alta y del detalle; tenerla en un
 * componente evita que cada sección la reinvente con espaciados distintos.
 */
export function SectionHeading({
  icon,
  title,
  hint,
  level = 2,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly hint?: string | undefined;
  readonly level?: 2 | 3;
}) {
  const Title = level === 2 ? 'h2' : 'h3';

  return (
    <div className={styles.sectionHead}>
      <span className={styles.sectionIcon}>
        <Icon name={icon} />
      </span>
      <span className={styles.sectionHeadText}>
        <Title className={styles.sectionTitle}>{title}</Title>
        {hint === undefined ? null : <span className={styles.sectionHint}>{hint}</span>}
      </span>
    </div>
  );
}
