'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { describeRole } from '@/features/session/role-labels';
import { SignOutButton } from '@/features/session/sign-out-button';

import { BrandLogo } from './brand-logo';
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
  /**
   * Rol verificado de la sesión.
   *
   * Viaja por contexto porque la cabecera la pinta cada página, y ninguna recibe el rol: quien lo
   * tiene es el shell. Es el rol y nada más: ni UID ni correo salen del servidor.
   */
  readonly role: string;
};

const Drawer = createContext<DrawerContext>({
  open: false,
  toggle: () => {},
  close: () => {},
  role: '',
});

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
  const sidebar = useRef<HTMLElement>(null);

  /*
   * Escape cierra el cajón.
   *
   * Es lo que espera cualquiera que lo abra con teclado, y sin esto la única salida era llegar
   * hasta un enlace o tocar el fondo, que con teclado no se puede. Solo se escucha mientras está
   * abierto: un oyente permanente interceptaría Escape en el resto de la pantalla.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  /* Al abrirlo, el foco entra en el cajón: si no, el tabulador seguiría detrás del velo. */
  useEffect(() => {
    if (open) {
      sidebar.current?.focus();
    }
  }, [open]);

  const context: DrawerContext = {
    open,
    toggle: () => setOpen((value) => !value),
    close: () => setOpen(false),
    role,
  };

  return (
    <Drawer.Provider value={context}>
      <div className={styles.shell}>
        <div className={open ? styles.layoutOpen : styles.layout}>
          {/*
            Fondo que cierra el cajón al tocar fuera. Solo existe en móvil.

            Siempre `aria-hidden`: es un atajo de puntero, no un control con significado propio.
            Antes se anunciaba como un botón sin nombre en cuanto el cajón se abría. Con teclado la
            salida es Escape, que sí existe.
          */}
          <button
            aria-hidden="true"
            className={styles.scrim}
            onClick={context.close}
            tabIndex={-1}
            type="button"
          />

          {/*
            `tabIndex={-1}` para poder enfocarlo al abrirlo; no entra en el orden del tabulador.

            Que el cajón cerrado desaparezca del orden de foco lo resuelve la hoja de estilos con
            `visibility`, y no un atributo aquí: la barra solo es un cajón por debajo de 60 rem, y
            en escritorio `open` no gobierna nada visible. Una condición en el JSX apagaría también
            la barra de escritorio, donde siempre está a la vista.
          */}
          <aside className={styles.sidebar} id="panel-sidebar" ref={sidebar} tabIndex={-1}>
            <div className={styles.brand}>
              <BrandLogo className={styles.brandLogo} height={34} />
            </div>
            <p className={styles.brandCaption}>MODULARTESS Admin</p>

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
              <div className={styles.sidebarUser}>
                <span aria-hidden="true" className={styles.avatar}>
                  <Icon name="cliente" />
                </span>
                <span className={styles.sidebarUserText}>
                  <span className={styles.roleLabel}>Sesión</span>
                  <span className={styles.roleValue}>{describeRole(role)}</span>
                </span>
              </div>
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
