import { useSyncExternalStore } from 'react';

/**
 * El reloj de la ficha del pedido.
 *
 * Es el **único** sitio del panel donde la interfaz lee la hora. Los componentes reciben `now` por
 * props y los módulos de presentación lo reciben como argumento, así que las pruebas fijan la hora
 * sin tocar nada global.
 *
 * En el servidor y durante la hidratación devuelve `null` (`getServerSnapshot`): el HTML de servidor
 * y el primer render del cliente coinciden siempre, y la hora real llega en el render siguiente, ya
 * montado. Después avanza cada `TICK_MS` para que un checkout que vence con la ficha abierta pase a
 * «vencido» sin recargar.
 */

const TICK_MS = 30_000;

let current: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick(): void {
  current = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (timer === null) {
    current = Date.now();
    timer = setInterval(tick, TICK_MS);
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number | null {
  return current;
}

export function getServerSnapshot(): null {
  return null;
}

/** La hora actual en milisegundos, o `null` mientras no haya un cliente montado. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
