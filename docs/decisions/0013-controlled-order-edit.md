# ADR 0013: «Editar pedido» en la ficha

Fecha: 2026-10-07. Estado: aceptada e implementada, sin desplegar.

Consume el contrato de ADR 0028 del backend (`POST /v1/admin/orders/{orderId}/edit` y su vista
previa), copiado con `pnpm api:update` y regenerado con `pnpm api:generate`. Una prueba fija su
SHA-256.

## Decisión

- **Botón «Editar pedido»** en la cabecera de la ficha, solo con `orders.update_status`. Abre un
  `<dialog>` modal con nombre y descripción, y estos pasos:
  1. **Editar**: estado (el actual y el siguiente del flujo; despachar pide transportadora, guía y
     enlace), notas internas (2000 caracteres), productos y pago.
  2. **Revisar**: la vista previa del backend calcula precios, envío y total con las reglas reales;
     el resumen enseña esos importes, el medio y el estado del pago antes y después, los correos que
     recibirá el cliente (`customerNotifications`) y las advertencias, todo tal como lo devuelve el
     backend. «Guardar cambios» envía exactamente lo revisado con la versión que se leyó, y la ficha
     se sustituye con lo que devuelve el backend.
  3. **Confirmar pago manual**: solo cuando lo revisado confirma un pago. Repite pedido, importe y
     medio, dice que el pedido pasará a «Pagado» y qué correo saldrá, y exige «Sí, confirmar pago».
- **Productos**: solo con `orders.edit_items` (`super_admin` y `master_admin`; nunca `moderator`) y
  cuando la ficha no muestra un bloqueo evidente (despachado, entregado, cancelado o pago en curso).
  Cantidades, retirar líneas y agregar desde el catálogo **publicado** con búsqueda en el servidor;
  si el producto tiene opciones, elegir una es obligatorio y las agotadas no se ofrecen. El
  subtotal del formulario es una **estimación** y se dice; el autoritativo llega en la revisión.
- **Estados**: carga («Calculando…», «Guardando…»), validación y bloqueos con el motivo del
  backend, conflicto de versión con «Recargar pedido», fallo ambiguo («no sabemos si se guardó») y
  éxito anunciado. Cancelar cierra sin guardar; Escape no cierra mientras hay una operación en curso;
  el foco vuelve al botón.
- **Pago**: sección propia con el medio y el estado actuales. Con `payments.manage_manual`
  (`super_admin` y `master_admin`; nunca `moderator`), un selector con Transferencia bancaria,
  Efectivo, Addi y Wompi, habilitado mientras el backend lo permita (`paymentEditing.methodLocked`),
  y, en un medio manual, el estado del pago con solo los desenlaces que admite ahora
  (`paymentEditing.manualEvents`, o los de un pago pendiente al pasar de Wompi a un medio manual).
  Con Wompi no hay selector de estado: «El estado de Wompi se actualiza automáticamente». Cada
  bloqueo dice su motivo. Ni referencias, ni transacciones, ni ambiente, ni ningún dato técnico.
  Un desenlace de pago no se combina con un cambio de estado o de productos: el panel lo explica
  antes de llamar al backend, que lo rechaza igual.
- **Ficha**: con un medio manual, la tarjeta de pago enseña el medio y su estado («Pagado por
  Efectivo», «Pago por Transferencia bancaria: pendiente») en lugar de «Pago no iniciado», y el
  listado dice «Pago manual» sin «Medio no informado».
- **Notas internas**: tarjeta propia en la ficha, porque el contrato las publica.
- **Correos**: un cambio de estado escribe los mismos correos que el botón de estado de siempre
  (`preparing`, `ready_to_ship`, `shipped` y `delivered`: uno al cliente y uno al equipo);
  confirmar un pago manual, «Pago confirmado». Notas, productos, medio y los demás desenlaces no
  escriben ninguno. El panel lo enseña en la revisión y en el aviso de éxito, con lo que devuelve el
  backend.

## Frontera

El BFF solo valida la forma (claves cerradas, cantidades, identificadores) y traduce los rechazos a
códigos estables: `order_edit_blocked` con su motivo, `order_line_rejected` con el código del
catálogo, `order_transition_invalid` y `version_conflict`. Los medios y desenlaces de pago se
validan contra sus listas cerradas, que una prueba contrasta con el contrato. Ningún texto del backend viaja. La
búsqueda de productos reutiliza `GET /v1/admin/products?q=` y recorta cada producto a nombre, SKU,
precio, variantes activas y disponibilidad resuelta por el backend.
