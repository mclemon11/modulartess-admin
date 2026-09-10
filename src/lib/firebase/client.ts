'use client';

/**
 * Inicialización diferida del SDK cliente de Firebase.
 *
 * Reglas que este módulo hace cumplir:
 *
 * - Solo se usa **Firebase Authentication**. No se importan Firestore, Storage ni Analytics.
 * - La app se crea con un **nombre explícito**, no con la app por defecto, para que dos importes
 *   o un Fast Refresh no provoquen una inicialización duplicada.
 * - La inicialización es **diferida**: nada ocurre al importar el módulo. Así `next build` no
 *   depende de que exista `.env` ni `.env.local`.
 * - La persistencia se fija a `inMemoryPersistence` **antes** de autenticar: la sesión de Firebase
 *   no se escribe en `localStorage`, `sessionStorage`, IndexedDB ni cookies.
 * - El idioma se fija **explícitamente a español**, también antes de autenticar, para que los
 *   correos que envíe Firebase no dependan del idioma del navegador.
 */

import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { type Auth, getAuth, inMemoryPersistence, setPersistence } from 'firebase/auth';

import { applyAdminAuthLanguage } from './auth-language';
import type { FirebaseClientConfig } from './config';

/** Nombre explícito de la app; evita colisionar con la app por defecto de Firebase. */
export const FIREBASE_APP_NAME = 'modulartess-admin';

let authPromise: Promise<Auth> | null = null;

function resolveApp(config: FirebaseClientConfig): FirebaseApp {
  const existing = getApps().find((app) => app.name === FIREBASE_APP_NAME);

  return existing ?? initializeApp(config, FIREBASE_APP_NAME);
}

async function createAuth(config: FirebaseClientConfig): Promise<Auth> {
  const auth = getAuth(resolveApp(config));

  // Español fijo, nunca el idioma del navegador. Se aplica aquí para que cualquier correo que
  // Firebase envíe después salga localizado, sin depender del equipo desde el que se accede.
  applyAdminAuthLanguage(auth);

  // Antes de cualquier autenticación: nada de la sesión debe sobrevivir a la pestaña.
  await setPersistence(auth, inMemoryPersistence);

  return auth;
}

/**
 * Devuelve la instancia de `Auth` del panel, creándola la primera vez.
 *
 * Si la creación falla se descarta la promesa memorizada, de modo que un reintento explícito del
 * usuario vuelva a intentarlo en lugar de quedar atrapado en el mismo error.
 */
export async function getAdminAuth(config: FirebaseClientConfig): Promise<Auth> {
  if (typeof window === 'undefined') {
    throw new Error('El SDK cliente de Firebase solo puede inicializarse en el navegador.');
  }

  authPromise ??= createAuth(config);

  try {
    return await authPromise;
  } catch (error) {
    authPromise = null;
    throw error;
  }
}
