'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isActive, NAVIGATION } from './navigation';
import styles from './panel-shell.module.css';

/**
 * Navegación lateral. Es el único componente cliente del shell: necesita la ruta actual para
 * marcar la sección activa, y eso solo se sabe en el navegador.
 */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones del panel" className={styles.nav}>
      <p className={styles.navLabel}>Secciones</p>
      {NAVIGATION.map((item) => {
        const active = isActive(item.href, pathname);

        return (
          <Link
            aria-current={active ? 'page' : undefined}
            className={active ? styles.navLinkActive : styles.navLink}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
