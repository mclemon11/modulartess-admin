/**
 * Sustituto de `server-only` para las pruebas.
 *
 * El paquete real lanza al importarse fuera de la condición `react-server`, que no existe en el
 * ejecutor de pruebas. La barrera de servidor se comprueba de forma estática en
 * `src/lib/api/server-boundary.test.ts`.
 */
export {};
