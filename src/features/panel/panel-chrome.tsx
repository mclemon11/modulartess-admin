'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { describeRole } from '@/features/session/role-labels';
import { SignOutButton } from '@/features/session/sign-out-button';

import { isActive, NAVIGATION } from './navigation';
import styles from './panel-shell.module.css';
import { Icon } from './section-icon';

/**
 * Estructura del panel: barra lateral y área principal.
 *
 * En escritorio la barra es fija. Por debajo de 60rem se convierte en un cajón que se abre desde
 * la cabecera, como en las referencias móviles. El estado del cajón se comparte por contexto
 * porque el botón que lo abre vive en la cabecera, que renderiza cada página.
 *
 * Lo que las referencias muestran y aquí **no** está: el buscador global, la campana de
 * notificaciones y el contador de avisos. Ninguno tiene endpoint en OpenAPI, y un buscador que no
 * busca o un contador fijo serían funcionalidad aparentada.
 */

type DrawerContext = {
  readonly open: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
};

const Drawer = createContext<DrawerContext>({ open: false, toggle: () => {}, close: () => {} });

export function useDrawer(): DrawerContext {
  return useContext(Drawer);
}

export function PanelChrome({
  role,
  children,
}: {
  readonly role: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const context: DrawerContext = {
    open,
    toggle: () => setOpen((value) => !value),
    close: () => setOpen(false),
  };

  return (
    <Drawer.Provider value={context}>
      <div className={styles.shell}>
        <div className={open ? styles.layoutOpen : styles.layout}>
          {/* Fondo que cierra el cajón al tocar fuera. Solo existe en móvil. */}
          <button
            aria-hidden={!open}
            className={styles.scrim}
            onClick={context.close}
            tabIndex={-1}
            type="button"
          />

          <aside className={styles.sidebar} id="panel-sidebar">
            <div className={styles.brand}>
              <span aria-hidden="true" className={styles.brandMark} />
              <span className={styles.brandText}>
                <span className={styles.brandName}>MODULARTESS</span>
                <span className={styles.brandTag}>Admin</span>
              </span>
            </div>
            <p className={styles.brandCaption}>Panel administrativo</p>

            <nav aria-label="Secciones del panel" className={styles.nav}>
              {NAVIGATION.map((item) => {
                const active = isActive(item.href, pathname);

                return (
                  <Link
                    aria-current={active ? 'page' : undefined}
                    className={active ? styles.navLinkActive : styles.navLink}
                    href={item.href}
                    key={item.href}
                    onClick={context.close}
                  >
                    <Icon className={styles.navIcon} name={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className={styles.sidebarFooter}>
              {/* La persona se identifica por su rol y nada más: el UID y el correo no se pintan
                  en ninguna pantalla del panel. */}
              <p className={styles.roleLabel}>Sesión administrativa</p>
              <p className={styles.roleValue}>{describeRole(role)}</p>
              <div className={styles.sidebarSignOut}>
                <SignOutButton />
              </div>
            </div>
          </aside>

          <div className={styles.main}>{children}</div>
        </div>
      </div>
    </Drawer.Provider>
  );
}
