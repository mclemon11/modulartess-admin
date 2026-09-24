# 0007 — Catálogo de categorías, conflictos del catálogo y editor de producto

Fecha: 2026-09-24
Estado: aceptada. Sustituye, en lo que toca a las categorías, la frase de AGENTS.md §6 que decía
que no había catálogo de categorías.

## Contexto

Tres problemas llegaron juntos:

1. **Conflictos falsos.** El cliente del catálogo traducía todo `409` con `failureCodeFromStatus`, y
   todo `409` acababa en «Alguien modificó este producto mientras lo editabas». Un SKU repetido al
   crear —un producto que ni siquiera existe— decía que alguien lo había modificado y mandaba a
   recargar. El backend ya devolvía códigos distintos: `product_sku_conflict`,
   `product_slug_conflict` y `product_version_conflict`.
2. **Categorías escritas a mano.** No había catálogo, así que cada producto llevaba un nombre y un
   slug escritos. El backend publicó ahora `/v1/admin/product-categories`: listar (con filtro de
   estado y cursor), crear, renombrar, archivar y reactivar.
3. **Un formulario disperso.** El alta tenía una columna alta de vista previa permanente, secciones
   repartidas en dos rejillas distintas según el ancho y las acciones en una barra aparte.

La primera versión del contrato de categorías (`a7b446…1dcf`) no declaraba `categoryId` como
parámetro de ruta en renombrar, archivar y reactivar, así que `openapi-fetch` no podía
sustituirlo. No se compensó en el panel (AGENTS.md §3): el backend lo corrigió (`95a882a`,
contrato `8b7b71…88af`) y el panel usa `params.path` como en el resto del cliente.

## Decisión

### 1. Los conflictos se traducen uno a uno

`catalogFailure` lee el `code` del cuerpo —nunca el `message`— y lo traduce con una tabla cerrada.
Solo `product_version_conflict` y `product_category_version_conflict` son conflictos de versión, y
solo ellos ofrecen recargar. Un `409` que el panel no reconoce **no** se convierte en conflicto de
versión: viaja como `conflict_unrecognized` con su código como `reference`, validado como
identificador (`^[a-z][a-z0-9_]{0,63}$`) en el BFF y otra vez en el navegador, y la pantalla lo
muestra para diagnóstico.

| Código del backend         | Qué ve la persona                                | Campo | Recargar |
| -------------------------- | ------------------------------------------------ | ----- | -------- |
| `product_sku_conflict`     | SKU reservado, también por un producto archivado | SKU   | No       |
| `product_slug_conflict`    | URL reservada, también por un producto archivado | URL   | No       |
| `product_version_conflict` | Edición concurrente                              | —     | Sí       |

### 2. La categoría se elige del catálogo

El producto sigue guardando la categoría como **copia** `{ slug, name }`: el contrato no la
referencia por id. El selector la rellena desde la categoría elegida; ya no se escriben nombre ni
slug. Reglas:

- Solo se ofrecen categorías **activas**. «Sin categoría» es una opción: el contrato admite `null`.
- La categoría que un producto **ya tenía** se reconoce por slug. Si está archivada se enseña
  «Archivada»; si el catálogo no la conoce, «No está en el catálogo». En ningún caso se cambia
  sola, y en la edición **no se reenvía**: solo viaja si alguien elige otra.
- «Crear categoría» abre un alta en línea con el nombre escrito y un slug propuesto que se revisa
  antes de crear, porque después es inmutable. La creada se elige automáticamente.
- `product_category_not_found` y `product_category_archived` se marcan en el propio selector. El
  segundo no está en el contrato del producto: se traduce por si el backend lo devuelve.

### 3. Gestión en `/panel/productos/categorias`

Entrada «Categorías» junto a «Nuevo producto». El contrato no publica un buscador, así que la
pantalla lee el catálogo **entero** —hasta 10 páginas de 100, avisando si se alcanza— y busca,
filtra y pagina sobre ese conjunto. Filtrar una sola página del cursor diría «no hay ninguna»
cuando está en la siguiente. Los contadores `null` se pintan «No disponible», nunca cero. Archivar
pide confirmación con lo que pasa de verdad: deja de ofrecerse, no toca los productos que ya la
tienen, no borra nada. Crear y renombrar exigen `products.update`; archivar y reactivar,
`products.archive`.

### 4. Editor con la jerarquía de un editor de comercio

Nombre arriba, con SKU y URL debajo. Área principal: «Descripción» y una tarjeta «Datos del
producto» con pestañas —General, Inventario, Clasificación, Variantes, Detalles—. Barra lateral de
21rem: estado y acciones, preparación, categoría e imágenes; se fija solo a partir de 64rem de
ancho y 46rem de alto, y desplaza por dentro si es más alta que la ventana. La vista previa es un
botón que abre un `<dialog>` modal. El alta y la edición comparten la estructura.

Las pestañas no desmontan sus paneles, así que lo escrito no se pierde al cambiar, y los enlaces del
checklist (`#seccion-…`) abren la pestaña correspondiente. Tras un error, el foco va al primer campo
con problema, abriendo antes su pestaña.

En la edición, el `<form>` envuelve solo el nombre; «Actualizar» vive en la barra lateral con el
atributo `form`. Inventario, imágenes y variantes siguen con sus propias rutas y claves.

### 5. Recuperación del alta

`runCreateFlow` ya era reanudable. Lo nuevo es cómo se cuenta: «El producto fue creado como
borrador», qué paso falló por su nombre —la imagen por su archivo, la variante por su SKU—, «Abrir
producto» y «Reintentar lo pendiente», que reanuda con el id y la última versión sin repetir el
`POST`. Si falla el propio `POST`, no hay producto y no se ofrece nada de eso. Un
`product_version_conflict` en un paso posterior relee el producto por un `GET` nuevo del BFF y no
reintenta solo.

## Consecuencias

- Rutas BFF nuevas: `POST /api/admin/product-categories`, `POST …/{categoryId}/rename`,
  `…/archive` y `…/reactivate`, y `GET /api/admin/products/{productId}`.
- El tipo de producto sigue siendo nombre y slug escritos: no hay catálogo de tipos.
- `publicationReadiness`: la descripción corta lleva a «Descripción» y la categoría a su sección
  propia.

## Alternativas descartadas

- **Buscar sobre una página del cursor.** Miente en cuanto hay más de una página.
- **Reenviar siempre la categoría actual al editar.** Un guardado de la descripción chocaría con
  una categoría archivada que nadie tocó.
- **Sustituir `{categoryId}` a mano mientras el contrato no lo declaraba.** Compensar en el panel un
  fallo del contrato; se corrigió en el backend.
- **Vista previa como columna o panel lateral fijo.** Es lo que ocupaba sitio sin uso.
