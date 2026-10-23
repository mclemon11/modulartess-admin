# ADR 0016: filtro por estado y exportación CSV del listado de pedidos

Fecha: 2026-10-23. Estado: aceptada e implementada.

Consume el contrato de la ADR 0034 del backend: `status` y `statusOptions` en
`GET /v1/admin/orders` y `GET /v1/admin/orders/export`. Copiado con `pnpm api:update` y regenerado
con `pnpm api:generate`; una prueba fija su SHA-256.

## Contexto

El equipo necesita ver los pedidos de un estado y llevarse a una hoja de cálculo todos los que
coinciden. Filtrar la página visible en el navegador mentiría sobre el total, y montar el archivo en
el panel exigiría descargar todos los pedidos con sus datos personales al navegador.

## Decisión

- El filtro lo aplica el backend y vive en la URL como `status`, junto a `page` y `pageSize`.
  `orderListSearch` ya conservaba cualquier otro parámetro, así que la paginación lo mantiene sin
  cambios; `orderStatusSearch` lo cambia y vuelve a la página 1.
- Las opciones del selector y sus etiquetas salen de `statusOptions`. El panel solo comprueba la
  forma del valor de la URL; qué estados existen lo decide el backend.
- La exportación la compone el backend. El BFF reenvía los bytes con un nombre de forma cerrada,
  `nosniff`, `no-store` y una CSP de `sandbox`; no los lee ni los registra. El navegador recibe un
  único archivo y lo entrega como descarga con un enlace temporal.
- `204` significa que no hay nada que exportar y se avisa sin descargar. El tope del backend
  (`422 order_export_too_large`) se traduce a un texto fijo que pide filtrar.

## Consecuencias

- El estado de un enlace con un valor bien formado pero inexistente lo rechaza el backend; la
  pantalla ofrece «Ver todos los pedidos».
- Las pruebas de la barra se hacen sobre el HTML estático (el entorno de pruebas es `node`): el
  candado y «Exportando…» se comprobaron en el navegador, no con una prueba unitaria.
