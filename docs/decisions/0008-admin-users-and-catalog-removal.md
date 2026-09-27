# ADR 0008: pantalla de usuarios y «Eliminar del catálogo»

Fecha: 2026-09-27. Estado: aceptada e implementada.

Consume el contrato que publica el ADR 0019 del backend (administración de cuentas e invitaciones)
y el parámetro `view` del listado de productos. No cambia ninguna regla de sesión de
[`ADR 0002`](0002-firebase-auth-closed-sign-in.md) ni de [`ADR 0003`](0003-admin-session-bff.md).

## Contexto

Solo existía una cuenta, el `super_admin`, y crear más exigía Firebase Console. Además, archivar un
producto solo era posible desde su detalle, sin confirmación, con un nombre —«Archivar»— que quien
busca «borrar un producto» no encuentra, y el listado mezclaba lo archivado con lo vigente.

## Decisión

### Usuarios

- **Ruta** `/panel/usuarios`, en la navegación con el permiso `admin_users.read`. La ven
  `super_admin` y `master_admin`; `moderator` no, y si escribe la URL la página le dice que su rol no
  administra cuentas **sin llamar al backend**.
- **Permisos del contrato, sin inventar**: `admin_users.read`, `admin_users.manage_moderators`,
  `admin_users.manage_masters` y `admin_users.manage_super_admins`. Qué acciones se pintan sobre
  cada cuenta sale de una tabla literal por rol objetivo, sin jerarquía numérica. `master_admin` solo
  invita y administra `moderator`.
- **BFF**: `POST /api/admin/users`, `PATCH …/role`, `POST …/disable`, `…/reactivate` y
  `…/resend-invitation`. Todas pasan por `handleMutation` —`Origin` exacto, cookie `__Host-`,
  tamaño— y sus cuerpos son **cerrados**: una clave de más, incluida una contraseña, es un 400 que
  no llega al backend.
- **Ninguna contraseña en el panel.** No hay campo de contraseña ni contraseña temporal. La persona
  invitada establece la suya con el enlace que el backend le envía por correo, y ese enlace nunca
  pasa por el panel. Crear una cuenta solo existe como esta invitación administrativa: la pantalla de
  acceso sigue sin registro público.
- **Idempotencia**: el navegador genera la clave y la conserva mientras la operación no tenga
  desenlace. Un corte de red o `account_sync_pending` se reintentan con la **misma** clave, lo que
  termina la operación en el backend en lugar de lanzar otra.
- **Candado síncrono** (`useRef`) tomado antes del primer `await`; `busy` solo pinta. Cada acción
  sobre una cuenta existente lleva `expectedVersion` y pide confirmación en un `<dialog>`.
- **La fila propia** la decide el servidor con el UID verificado de la sesión, que no se pasa al
  cliente como dato: la pantalla no ofrece deshabilitarse ni cambiarse el rol. El backend lo rechaza
  igualmente (`account_self_change`).
- **Errores** traducidos uno a uno desde el código: `last_super_admin`, `account_self_change`,
  `account_email_taken`, `account_state_conflict`, `invitation_recently_sent`,
  `account_sync_pending` y el conflicto de versión, que ofrece recargar.
- **Sin búsqueda**: el contrato no la publica.

### Eliminar del catálogo

- Es el **archivado** del contrato (`POST /v1/admin/products/{id}/archive`) con el nombre que se
  busca. **No hay borrado físico** ni `DELETE`, y nunca se llama «eliminado permanentemente».
- Visible en la fila del listado, en la tarjeta móvil y en el detalle, **solo con
  `products.archive`**, para productos `draft` y `active`.
- Confirmación literal: «Este producto dejará de aparecer y de poder comprarse inmediatamente. Los
  pedidos anteriores, la auditoría, el SKU y el enlace interno se conservarán.»
- `expectedVersion`, candado síncrono, `router.refresh()` al terminar y el aviso «Producto eliminado
  del catálogo», que en el listado vive por encima de la tabla porque la fila desaparece al
  refrescar.
- **El listado normal oculta lo archivado**: pide `view=current`. La pestaña «Eliminados
  (archivados)» pide `view=archived`. El filtro lo aplica el backend antes de paginar; el panel no
  filtra páginas ya leídas.

## Consecuencias

- Hasta que exista `admin.modulartess.com`, **no se invita a nadie**: el enlace de regreso de la
  invitación sale del `ADMIN_APP_URL` del backend, hoy la URL temporal de Cloud Run.
- Un cambio de rol, una deshabilitación o una reactivación cierran las sesiones de la persona
  afectada. La pantalla lo dice antes de confirmar.
