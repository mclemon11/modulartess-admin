import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Salida autocontenida para la imagen de contenedor: Next.js emite en `.next/standalone` un
   * `server.js` con solo las dependencias que el runtime alcanza de verdad. Sin esto habría que
   * copiar `node_modules` entero a la imagen final.
   */
  output: 'standalone',
};

export default nextConfig;
