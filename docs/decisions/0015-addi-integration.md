# ADR 0015: Addi en línea en el panel

Fecha: 2026-10-09. Estado: aceptada e implementada, sin desplegar.

Consume el contrato de ADR 0030 del backend: `GET`/`PATCH /v1/admin/integrations/addi`,
`POST /v1/admin/integrations/addi/activation`, `POST /v1/admin/integrations/addi/test`, el proveedor
`addi` en `AdminPaymentProviderDto` y `paymentEditing.checkoutPaymentMethod`. Copiado con
`pnpm api:update` y regenerado con `pnpm api:generate`; una prueba fija su SHA-256. Sustituye la
tarjeta «Pendiente de integración» de la fase 10.

## Contexto

Addi deja de ser solo un medio manual: el backend abre solicitudes en línea en Producción, recibe
su callback autenticado y lo aplica con la misma máquina de estados que Wompi. Addi Marketplace —el
pago externo que registra el equipo— sigue existiendo y no puede confundirse con un intento.

## Decisión

- **Tarjeta real** en Integraciones: Producción, estado (Activo, Desactivado, Bloqueado o Sin
  configurar; «Activo» solo con `acceptingNewPayments`), último intento, último callback válido,
  incidencias y último error traducido.
- **«Configurar Addi»**: slug del comercio y cuatro credenciales. Las guardadas se ven como
  «Guardado» —con los últimos cuatro del Client ID y del usuario, que publica el backend— y se
  conservan salvo marcar «Reemplazar». Los campos son `password`, nacen vacíos, viven solo en el
  estado del componente y se vacían al guardar bien. Lo omitido no viaja.
- **Prueba de autenticación**: el backend pide un JWT y lo descarta. No mueve dinero.
- **Activar es otra operación**, con su ruta BFF y `confirm: true`. Activar exige escribir
  «ACTIVAR ADDI»; desactivar pide confirmación y no borra nada. El panel explica qué bloquea:
  guardia de despliegue, configuración incompleta o prueba pendiente; el backend decide.
- **Permisos**: `integrations.read` para ver; `integrations.manage` para guardar, probar y activar.
  Ocultar es usabilidad: el backend vuelve a exigirlo.
- **Errores**: cuatro códigos propios (`addi_configuration_invalid`,
  `addi_configuration_incomplete`, `addi_connection_test_required`,
  `addi_live_payments_not_enabled`). Nunca el texto del backend ni el de Addi.
- **Pedidos**: un intento de Addi se presenta con su vocabulario (solicitud abierta, Addi
  validando, crédito aprobado, Addi rechazó, quien compra declinó, vencida, fallida). Un pedido
  «Addi (checkout web)» con intentos se cuenta por ellos; «Addi Marketplace» sigue siendo manual y
  la conciliación lo registra como hasta ahora.

## Consecuencias

- Con un backend anterior sin `checkoutPaymentMethod`, la ficha se comporta como antes.
- El panel no habla con Addi ni guarda nada en el navegador.

## Actualización: redirección sin verificar y origen provisional

El backend ya no cierra un intento cuando Addi responde sin `Location` o desde un origen todavía no
autorizado: lo conserva con la misma referencia. El panel muestra esos dos casos como último error
(`addi_redirect_missing` y `addi_redirect_unverified`) e indica que el intento se conserva. El origen
`https://originations.addi.com` es provisional: Addi se mantiene desactivado hasta confirmarlo.

## Corrección: las pruebas de conexión no llegaban a la imagen

`.gcloudignore` y `.dockerignore` tenían la regla `test` sin anclar. Con la sintaxis de `.gitignore`
excluía cualquier carpeta llamada `test`, también `src/app/api/admin/integrations/{wompi,addi}/test`,
así que «Probar autenticación» respondía 404 en el propio panel sin llegar al backend. La regla queda
anclada a la raíz (`/test`) y `deploy/deploy.test.ts` ya no admite ninguna excepción.
