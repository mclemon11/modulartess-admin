# 0004 — Catálogo enriquecido y variantes en el panel

- Fecha: 2026-09-11
- Estado: Aceptada
- Relacionadas: [`0001`](./0001-admin-application-boundary.md) ·
  [`0003`](./0003-admin-session-bff.md)

## Contexto

El backend publicó una versión nueva del contrato. Sobre las diez operaciones de catálogo que ya
existían, `/v1/admin/products` pasa a publicar quince, y `AdminProductDto` crece con
clasificación y contenido enriquecido:

- `category` y `productType`, ambos `ProductTaxonomyDto` (`slug` + `name`) y **anulables**;
- `featured`, `features` (máximo 20) y `specifications` (`materials`, `measurements`, `warranty`,
  `care`, 2000 caracteres cada uno);
- `attributes`: hasta **6** ejes de variación, cada uno `key` + `label`;
- `variants`: activas y archivadas, **72 activas como máximo**.

Y cinco operaciones nuevas: `GET` y `POST /v1/admin/products/{productId}/variants`, `PATCH` y
`POST .../variants/{variantId}/archive`, y
`POST .../variants/{variantId}/inventory-adjustments`.

Tres detalles del contrato condicionan todo lo demás:

1. **`POST /v1/admin/products` no admite ninguno de los campos nuevos.** Solo SKU, slug, nombre,
   descripciones, precio e inventario. La clasificación, el contenido y los ejes se envían con el
   `PATCH`.
2. **La colección de variantes es parte del producto.** Cada operación de variante lleva la
   `expectedVersion` del **producto** y devuelve el producto completo con su versión nueva.
3. **Crear una variante no lleva `Idempotency-Key`.** Lo que evita duplicados es el SKU, reservado
   globalmente y para siempre, y la combinación, única entre las variantes activas.

## Decisión

### 1. El orden del alta lo impone el contrato

Un solo clic desencadena la secuencia completa, y en este orden:

```
crear (POST)  →  enriquecer (PATCH)  →  imágenes (en serie)  →  principal  →  variantes (en serie)
```

Los ejes se declaran **antes** que las variantes porque el backend exige que cada variante lleve
exactamente los ejes declarados: al revés, las rechazaría. Y nada va en paralelo: dos operaciones
simultáneas partirían de la misma versión y la segunda chocaría con un `409`.

El `PATCH` de enriquecimiento se omite cuando no hay nada que enviar. Gastar una llamada para no
cambiar nada solo añadiría una versión más y una oportunidad más de fallar.

### 2. Reanudación: nada de lo guardado se vuelve a enviar

`runCreateFlow` recibe el progreso previo y continúa desde donde se quedó. Un reintento no vuelve a
crear el producto, no repite el `PATCH`, no resube una imagen ya subida y no recrea una variante que
ya existe —su SKU quedaría reservado y el alta sería un conflicto—.

Lo que ya llegó al backend deja de ser editable en la pantalla de alta: los campos base, el bloque
de clasificación, las imágenes subidas y las variantes creadas se muestran bloqueados, con un enlace
al detalle. Dejarlos editables sugeriría que el reintento los guardaría, y no los reenvía.

El producto **nunca** se publica automáticamente.

### 3. Categoría y tipo: campos, no selector

No existe todavía un catálogo independiente de categorías: el contrato no publica ningún endpoint
del que sacar una lista. Así que el panel no pinta un desplegable. Se escriben el nombre y el slug;
el slug se **propone** desde el nombre y se puede corregir antes de guardar, y deja de proponerse en
cuanto alguien lo toca a mano —el slug es parte de una URL pública y no debe cambiar solo—.

Inventar una lista de categorías sería pintar datos que no existen, que es justamente lo que
prohíbe `AGENTS.md`.

En la edición, **omitir no es lo mismo que enviar `null`**: omitir deja el campo como está y `null`
lo borra. En el alta se omite lo vacío; en la edición, vaciar el campo lo borra.

### 4. Ejes extensibles, nunca un enum cerrado

Un eje es `key` + `label`. El contrato no publica ningún enum de ejes, así que el panel no cierra la
lista: `finish`, `size` y `mirror` se ofrecen como **atajo** porque son los que hoy usa la tienda, y
cualquier otra clave se puede escribir.

Cada eje lleva además sus valores posibles, que no viajan solos al backend: son el material con el
que se generan las combinaciones. El valor normalizado se propone desde la etiqueta plegando los
acentos —el contrato lo describe como «accent-folded», y es lo que toma el filtro público— y también
se puede corregir.

### 5. Las variantes no son obligatorias

Un producto sin variantes se sigue vendiendo por su propio SKU, precio e inventario, y su formulario
no cambia. Cuando obtiene su **primera variante activa**:

- se explica que el precio y el inventario pasan a gestionarse por variante;
- el ajuste de inventario base se deshabilita, con el motivo escrito;
- los valores base **no se borran ni se transforman**: dejan de ser lo que se vende, nada más.

### 6. Lo que se comprueba antes de enviar

En el navegador se replica la forma que publica el contrato, no la regla de negocio: cada variante
lleva exactamente los ejes declarados, no hay dos combinaciones iguales ni dos SKU iguales, el
precio son pesos enteros mayores que cero, el inventario un entero no negativo y las activas no
pasan de 72 contando las que ya existen. Una variante archivada no ocupa sitio en el límite, pero
**su SKU sigue reservado para siempre**.

La autoridad definitiva sigue siendo el backend. Esto evita gastar una llamada y un identity token
en un cuerpo que ya se sabe inválido, y avisa en el momento de escribirlo.

La **disponibilidad no se calcula en el panel**: el contrato la deriva en la proyección pública y
aquí solo se muestran el inventario y el estado que devuelve el backend. En admin el stock exacto sí
se ve; la vista previa no lo enseña, porque la tienda tampoco.

### 7. Frontera BFF: cuatro rutas nuevas, ninguna lectura nueva

Se añaden cuatro Route Handlers, uno por mutación, con la misma frontera que los cinco anteriores:
`Origin` exacto contra la variable server-only, cookie `__Host-` leída en el servidor, `no-store`,
temporizador y traducción a los estados que el contrato distingue —400, 401, 403, 404, 409 y 503—
sin filtrar ni un mensaje interno.

`GET /v1/admin/products/{productId}/variants` **no** recibe Route Handler. No es un olvido: la
colección completa —activas y archivadas— viaja dentro del producto en cada lectura y en la
respuesta de cada mutación, así que una segunda vía de lectura sería una superficie sin ningún
llamante. Cuando haga falta (por ejemplo, una pantalla que solo liste variantes), se añade.

Ningún Client Component conoce la URL del backend ni puede llamarlo: lo comprueba de forma estática
`src/lib/api/server-boundary.test.ts`, que además exige ahora que **toda** ruta de `src/app/api`
esté en la lista de módulos `server-only`.

### 8. Permisos: los que ya exige el contrato, sin inventar ninguno

| Acción                  | Permiso            | `moderator` |
| ----------------------- | ------------------ | ----------- |
| Crear variante          | `products.create`  | Sí          |
| Editar atributos/precio | `products.update`  | Sí          |
| Ajustar inventario      | `inventory.adjust` | Sí          |
| Archivar variante       | `products.archive` | **No**      |

Archivar es una transición de estado, no una edición: por eso va con `products.archive` y
`moderator` no la ve. La matriz sigue siendo explícita, sin jerarquía numérica. Ocultar un botón es
usabilidad; la autoridad es el backend, que rechaza cualquier petición fabricada.

### 9. Conflictos

Tras cada mutación, el estado local se **reemplaza** con la respuesta autoritativa: el backend
devuelve el producto completo, con su versión y su colección de variantes. El panel nunca calcula
cómo quedó.

Un `409` no se reintenta en silencio. Se dice «Los datos cambiaron» y se ofrece recargar:
reintentar con la misma `expectedVersion` volvería a fallar, y con la nueva pisaría el cambio ajeno.

## Consecuencias

- El alta gasta más llamadas que antes: una de creación, una de contenido, una por imagen, una por
  variante y, a veces, una para la principal. Es el coste de un contrato que valida cada paso.
- Un alta con 72 variantes son 72 llamadas en serie. Es lento y se ve así en la pantalla; agruparlas
  exigiría un endpoint por lotes que el contrato no publica.
- Los ejes se declaran en la sección de variantes, no en el formulario de datos. Enviarlos desde dos
  formularios distintos invitaría a pisarlos sin querer, porque el `PATCH` los **sustituye** enteros.
