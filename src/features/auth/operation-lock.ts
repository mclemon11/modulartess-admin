/**
 * Candado **síncrono** para operaciones de autenticación.
 *
 * El estado de React no sirve para esto: `busy` solo cambia en el siguiente render, así que dos
 * envíos disparados en el mismo tick leen `busy === false` y pasan los dos. Este candado se toma
 * de forma síncrona, antes del primer `await`, y por eso el segundo intento se rechaza sin haber
 * llegado a ningún render.
 *
 * Se modela como un objeto mutable, no como un hook, para poder comprobar la exclusión sin
 * renderizar nada. En el componente vive dentro de un `useRef`, que es lo que le da identidad
 * estable entre renders. `busy` se conserva aparte, solo para la representación visual.
 */

export type OperationLock = {
  /** Hay una operación en curso. */
  busy: boolean;
  /** La operación ya no puede repetirse nunca más, ni siquiera tras un fallo posterior. */
  sealed: boolean;
};

export function createOperationLock(): OperationLock {
  return { busy: false, sealed: false };
}

/**
 * Intenta tomar el candado. Devuelve `false` —y no cambia nada— si ya está tomado o sellado.
 * Debe llamarse **antes** del primer `await` de la operación.
 */
export function acquire(lock: OperationLock): boolean {
  if (lock.busy || lock.sealed) {
    return false;
  }

  lock.busy = true;

  return true;
}

/**
 * Libera el candado para permitir un reintento explícito. No tiene efecto sobre un candado
 * sellado: una vez sellado, ninguna salida puede reabrirlo.
 */
export function release(lock: OperationLock): void {
  if (lock.sealed) {
    return;
  }

  lock.busy = false;
}

/**
 * Cierra el candado de forma definitiva.
 *
 * Se usa en el punto de no retorno: cuando la operación ya produjo un efecto externo que no debe
 * repetirse (un correo de verificación enviado), aunque un paso posterior falle.
 */
export function seal(lock: OperationLock): void {
  lock.sealed = true;
  lock.busy = false;
}
