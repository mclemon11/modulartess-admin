# ADR 0014: conciliación manual del pago en «Editar pedido»

Fecha: 2026-10-09. Estado: aceptada e implementada, sin desplegar.

Consume el contrato de ADR 0029 del backend: el campo opcional `paymentReconciliation` de
`POST /v1/admin/orders/{orderId}/edit` y de su vista previa, `paymentReconciliation` en la ficha y
en cada fila del listado, y `paymentEditing.reconciliation`. Copiado con `pnpm api:update` y
regenerado con `pnpm api:generate`; una prueba fija su SHA-256.

## Contexto

Una persona empieza a pagar con Wompi, no lo completa y paga por Addi Marketplace, transferencia o
efectivo. ADR 0013 bloquea con razón el medio y los desenlaces manuales en cuanto se abre un
checkout de Wompi. Hace falta registrar el pago real **sin tocar** lo que reportó Wompi.

## Decisión

- El diálogo separa visualmente dos bloques:
  1. **«Intento de pago original»**, solo lectura: proveedor y estado del intento más reciente,
     número de intentos y si hay transacción. Sin controles, sin referencia ni transacción.
  2. **«Conciliación manual»**, editable solo con `payments.manage_manual` (`super_admin` y
     `master_admin`) y cuando el backend no la bloquea. Estado final (Pendiente de gestión, No
     pagado, Error / Fallido, Pagado), medio final (Wompi confirmado manualmente, Addi Marketplace,
     Transferencia bancaria, Efectivo), referencia externa y nota.
- Muestra siempre «Este cambio no modifica la transacción en Wompi» cuando hay un intento.
- La conciliación **se guarda sola**: mientras está activa, el resto del formulario queda
  deshabilitado y el panel rechaza mezclarla con otros cambios, igual que el backend.
- Nota y referencia se piden donde las pide el backend (`noteRequired`,
  `externalPaymentIdRequiredFor`), y conservar Wompi como medio final también exige nota.
- Flujo: revisar (vista previa del backend, con resumen y advertencias, incluidos el intento
  preservado, un intento de Wompi que aún podría aprobarse y un posible pago duplicado) →
  confirmar explícitamente → guardar con `confirmed: true`. La confirmación solo viaja al guardar.
- Errores: `400 order_reconciliation_invalid` llega al navegador con su motivo cerrado en
  `reference`, y los tres bloqueos nuevos de `order_edit_blocked` tienen su texto. Nunca el texto
  del backend.
- La tarjeta «Información de pago» enseña, separados, el intento original («Wompi: Pago
  rechazado») y el pago final («Pago final: Addi Marketplace» · «Pagado · Conciliado
  manualmente»), la referencia y quién y cuándo concilió. «Confirmado manualmente» con Wompi se
  dice «no por Wompi». «Revisión requerida» es una alerta con texto.
- El listado, en escritorio y en móvil, añade debajo del medio de pago una línea con el pago final
  o «Revisión requerida».
- Los textos de «Pago» que antes decían que no se podía registrar un pago manual con un checkout
  abierto ahora remiten a «Conciliación manual».

## Consecuencias

- Requiere el backend de ADR 0029 desplegado antes que este panel: el panel lee campos que solo
  publica esa versión del contrato.
- No guarda nada en el navegador y no habla con Wompi ni con Addi.
