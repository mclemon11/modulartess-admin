import type { NextConfig } from 'next';

/**
 * Entrada del panel.
 *
 * `/` no es una pantalla: es la puerta. Se resuelve como redirección HTTP **antes** del sistema de
 * archivos y antes de renderizar nada (`redirects` se comprueba primero, según la documentación de
 * Next), así que el navegador recibe un `307` y nunca llega a pintarse una página intermedia.
 *
 * No verifica la sesión, y eso es deliberado: quien decide es `/panel`, que ya lee la cookie con
 * `resolvePanelSession`. Repetir aquí esa comprobación duplicaría la única frontera de sesión que
 * tiene el panel y abriría la puerta a que las dos dejaran de decir lo mismo.
 *
 * Temporal (`permanent: false`, `307`) a propósito: un `308` se cachea en el navegador de forma
 * indefinida y dejaría `/` secuestrado si algún día tuviera contenido propio.
 */
const ROOT_REDIRECT = {
  source: '/',
  destination: '/panel',
  permanent: false,
} as const;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Salida autocontenida para la imagen de contenedor: Next.js emite en `.next/standalone` un
   * `server.js` con solo las dependencias que el runtime alcanza de verdad. Sin esto habría que
   * copiar `node_modules` entero a la imagen final.
   */
  output: 'standalone',
  redirects: () => Promise.resolve([ROOT_REDIRECT]),
};

export default nextConfig;
