# ADR 0011: galería multimedia con videos MP4 en el panel

Fecha: 2026-10-03. Estado: aceptada e implementada, sin desplegar.

Consume el contrato del ADR 0026 del backend (videos MP4 en la galería de producto), copiado de la
rama `feat/product-gallery-videos` del backend con `pnpm api:update` y regenerado con
`pnpm api:generate`. Una prueba fija su SHA-256.

## Decisión

- **Sección «Galería multimedia»** en la ficha, debajo de «Portada» y «Galería de imágenes» (antes
  «Galería»). Es una sola lista ordenada con imágenes y videos —miniatura, tipo, posición, tamaño,
  duración y estado del póster— y botones «Antes»/«Después» con nombre accesible. Cada movimiento
  manda el orden completo a `PUT /media/order` con `expectedVersion`. La portada sigue siendo una
  imagen y se marca en la lista; las imágenes se siguen subiendo con el flujo de siempre.
- **Videos**: selector `accept="video/mp4,.mp4"`, título obligatorio y comprobación previa en el
  navegador (extensión, tipo y 20 MB). El backend inspecciona el contenedor real. Una subida
  rechazada conserva archivo, título y `Idempotency-Key`, y pinta el motivo concreto junto al
  formulario. Cada video tiene vista previa con `controls` y `preload="metadata"` (sin
  reproducción automática), su póster (JPG, PNG o WebP, 10 MB), su título y «Eliminar video» con
  confirmación en un `<dialog>` nativo, que atrapa el foco y se cierra con Escape. Un video sin
  póster dice «Póster pendiente» y no tiene miniatura inventada.
- **Colores**: el selector de una opción de color lista también los videos activos (con su póster o
  un hueco), porque el contrato acepta identificadores de video en `imageIds`.
- **Requisitos de publicación**: `image_with_videos` y `video_posters`, en la sección Imágenes.
- **BFF**: rutas `videos`, `videos/[videoId]`, `videos/[videoId]/poster`,
  `videos/[videoId]/delete` y `media/order`. Las multipart comparten
  `features/session/multipart-route.ts`: origen, sesión, `Content-Length` declarado comprobado antes
  de leer el cuerpo, formulario reconstruido con los campos del contrato. El motivo de
  `product_video_invalid` viaja como `reference` validada (`snake_case`), nunca como texto libre.
- Ni el navegador ni el BFF hablan con Cloud Storage.

## Consecuencias

- Despliegue después del backend y antes de la web; rollback en orden inverso.
- Pendiente: subtítulos (WebVTT) cuando el backend los admita.
