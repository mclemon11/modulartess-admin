# Estado actual

Última actualización: 2026-09-08.

## Fase

Fase 0 — base técnica. El objetivo era disponer de un repositorio mínimo, limpio y compilable, sin
funcionalidad de negocio.

## Implementado

| Área                | Estado | Detalle                                                         |
| ------------------- | ------ | --------------------------------------------------------------- |
| Repositorio         | Listo  | Independiente, sin relación de monorepo con los otros repos.    |
| Gestor de paquetes  | Listo  | pnpm 11.19.0, Node >=22.0.0.                                    |
| Next.js App Router  | Listo  | Next.js 16.3.4, React 19.2.8.                                   |
| TypeScript estricto | Listo  | `strict` más comprobaciones adicionales; `tsc --noEmit` limpio. |
| Estilos             | Listo  | CSS Modules y tokens en `globals.css`. Sin framework de CSS.    |
| Calidad             | Listo  | ESLint y Prettier con scripts de verificación.                  |
| Página inicial      | Listo  | Server Component; «Panel administrativo en configuración».      |
| Documentación       | Listo  | `AGENTS.md`, arquitectura y primera decisión registrada.        |

## Previsto, todavía no implementado

Elementos que forman parte del diseño acordado, pero que aún no existen en el repositorio.

| Área                           | Estado    | Detalle                                                        |
| ------------------------------ | --------- | -------------------------------------------------------------- |
| Firebase Auth (navegador)      | Previsto  | SDK cliente de Firebase solo para autenticación. Sin instalar. |
| Frontera BFF (servidor Next)   | Pendiente | El servidor invocará el backend en Cloud Run. Sin implementar. |
| Integración OpenAPI            | Pendiente | Copia versionada del contrato y tipos generados desde ella.    |
| ADR de identidad BFF ↔ backend | Pendiente | Mecanismo de transporte y verificación aún sin decidir.        |
| Autorización por roles         | Pendiente | Se resuelve en el backend, no en el panel.                     |
| Pruebas y CI                   | Pendiente | Sin suite ni pipeline.                                         |
| Despliegue                     | Pendiente | Sin estrategia definida para el panel privado.                 |

Sobre Firebase Auth: es la **única excepción futura permitida** al uso de Firebase dentro del
navegador. Está previsto incorporar el SDK cliente de Firebase exclusivamente para autenticación.
Todavía no está instalado y no se añade por anticipación.

Sobre el mecanismo de identidad: el flujo acordado es navegador → Firebase Auth para la identidad,
navegador → servidor Next.js, servidor Next.js (BFF) → backend de Cloud Run con su identidad de
ejecución, y verificación de la identidad administrativa en el backend. El mecanismo exacto para
transportar y verificar la identidad Firebase entre el BFF y el backend **sigue pendiente de una
ADR específica**; hasta entonces no se define ningún encabezado, cookie, endpoint ni esquema de
tokens.

## Excluido de forma permanente

No son fases pendientes: son restricciones arquitectónicas que no cambian.

- Acceso directo del panel a Firestore o Cloud Storage.
- SDK cliente de Firestore y SDK cliente de Cloud Storage en el panel.
- `firebase-admin` en el panel.
- Credenciales de cuentas de servicio en el repositorio o en el entorno del panel.
- Cualquier variable `NEXT_PUBLIC_*` con la URL del backend, y cualquier otra vía que la entregue
  al navegador (configuración de cliente o bundle). El backend es un servicio de Cloud Run
  protegido por IAM: su URL es direccionable por internet y no es un secreto, pero rechaza la
  invocación anónima. La futura variable con esa URL será exclusivamente server-side, en el BFF.
- Llamadas directas del navegador del panel al backend: pasan siempre por el servidor Next.js.
- Reglas comerciales en el panel.
- Secretos o credenciales en el repositorio.
- Importar código fuente del backend, dependencias `file:`, symlinks, workspaces compartidos o
  dependencias de rutas locales de otro repositorio en build o en runtime.

## Descartado

- **WooCommerce**: descartado como dependencia objetivo. El panel no se construye contra
  WooCommerce ni contra su API REST, y no se considera una fuente de datos de destino. Ver
  `../decisions/0001-admin-application-boundary.md`.

## Estado de los datos

No existen datos de ejemplo de productos, precios, inventario, pedidos ni clientes, ni acciones de
interfaz que no hagan nada. No hay autenticación real ni simulada.

## Siguiente fase propuesta

1. Registrar la ADR del mecanismo de identidad entre el BFF y el backend.
2. Fijar el procedimiento explícito para obtener y actualizar la copia versionada del contrato
   OpenAPI dentro de este repositorio.
3. Implementar Firebase Auth en el navegador, solo para autenticación.
4. Introducir la frontera BFF y el cliente HTTP tipado con su manejo de errores, una vez exista el
   contrato.
5. Construir el layout de la aplicación autenticada.
