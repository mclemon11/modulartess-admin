'use client';

import { useEffect, useId, useRef } from 'react';

import styles from './catalog.module.css';

export type ProductDataTab = {
  readonly key: string;
  readonly label: string;
  /**
   * El ancla del panel. Es la misma que usa el checklist de publicación (`SECTION_IDS`), así que un
   * enlace a `#seccion-inventario` abre la pestaña Inventario en lugar de no hacer nada.
   */
  readonly anchor: string;
  /** Hay algo en este panel que impide guardar. Se marca en la propia pestaña. */
  readonly hasProblem?: boolean;
  readonly content: React.ReactNode;
};

/** La pestaña siguiente con las flechas, dando la vuelta. Inicio y Fin van a los extremos. Pura. */
export function nextTabIndex(current: number, key: string, count: number): number {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (current + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return current;
  }
}

/** La pestaña que contiene un ancla, o `null` si ninguna la tiene. Pura. */
export function tabForAnchor(tabs: readonly ProductDataTab[], hash: string): string | null {
  const anchor = hash.startsWith('#') ? hash.slice(1) : hash;

  return tabs.find((tab) => tab.anchor === anchor)?.key ?? null;
}

/**
 * «Datos del producto»: una tarjeta compacta con pestañas.
 *
 * Patrón ARIA de pestañas con **tabindex itinerante**: solo la pestaña activa está en el orden de
 * tabulación y las flechas mueven entre ellas, activándolas. En pantallas estrechas la lista se
 * desplaza en horizontal **dentro** de la tarjeta, nunca la página.
 *
 * **Todos los paneles están en el DOM**, los inactivos con `hidden`. No se desmontan: lo escrito en
 * una pestaña sigue ahí al volver, y el envío no depende de qué pestaña esté abierta.
 *
 * Controlada: quien la usa decide cuál está abierta, para poder llevar a la que tiene un error.
 */
export function ProductDataTabs({
  tabs,
  active,
  onChange,
  title = 'Datos del producto',
}: {
  readonly tabs: readonly ProductDataTab[];
  readonly active: string;
  readonly onChange: (key: string) => void;
  readonly title?: string;
}) {
  const id = useId();
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === active),
  );

  /*
   * Los enlaces del checklist apuntan a las anclas de los paneles. Un panel oculto no recibe el
   * salto del navegador, así que aquí se abre su pestaña y se lleva la vista a la tarjeta.
   */
  useEffect(() => {
    function follow() {
      const key = tabForAnchor(tabs, window.location.hash);

      if (key !== null) {
        onChange(key);
        requestAnimationFrame(() =>
          document.getElementById(`${id}-card`)?.scrollIntoView({ block: 'start' }),
        );
      }
    }

    follow();
    window.addEventListener('hashchange', follow);

    return () => window.removeEventListener('hashchange', follow);
  }, [tabs, onChange, id]);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const next = nextTabIndex(activeIndex, event.key, tabs.length);

    if (next === activeIndex) return;

    event.preventDefault();

    const tab = tabs[next];

    if (tab === undefined) return;

    onChange(tab.key);
    buttons.current[tab.key]?.focus();
  }

  return (
    <section aria-labelledby={`${id}-title`} className={styles.card} id={`${id}-card`}>
      <div className={styles.dataTabsHead}>
        <h2 className={styles.dataTabsTitle} id={`${id}-title`}>
          {title}
        </h2>
        <div aria-labelledby={`${id}-title`} className={styles.dataTabList} role="tablist">
          {tabs.map((tab) => {
            const selected = tab.key === tabs[activeIndex]?.key;

            return (
              <button
                aria-controls={tab.anchor}
                aria-selected={selected}
                className={selected ? styles.dataTabActive : styles.dataTab}
                id={`${id}-tab-${tab.key}`}
                key={tab.key}
                onClick={() => onChange(tab.key)}
                onKeyDown={onKeyDown}
                ref={(element) => {
                  buttons.current[tab.key] = element;
                }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                {tab.label}
                {tab.hasProblem === true ? (
                  <span className={styles.dataTabProblem}>
                    <span aria-hidden="true">●</span>
                    <span className="sr-only"> (hay algo por corregir)</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      {tabs.map((tab) => (
        <div
          aria-labelledby={`${id}-tab-${tab.key}`}
          className={`${styles.cardPad} ${styles.dataTabPanel}`}
          hidden={tab.key !== tabs[activeIndex]?.key}
          id={tab.anchor}
          key={tab.key}
          role="tabpanel"
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </section>
  );
}
