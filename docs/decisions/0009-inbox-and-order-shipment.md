# ADR 0009: bandeja de entrada y datos del envío

Fecha: 2026-09-27. Estado: aceptada e implementada.

Consume el contrato que publica el ADR 0020 del backend: la superficie
`/v1/admin/communications/*` y el envío del pedido. No cambia ninguna regla de sesión de
[`ADR 0002`](0002-firebase-auth-closed-sign-in.md) ni de [`ADR 0003`](0003-admin-session-bff.md).

## Decisión

### Envío del pedido

- «Marcar enviado» ya no dispara la transición: abre un formulario con **transportadora, número de
  guía y enlace de seguimiento**. El backend rechaza `shipped` sin los tres
  (`400 order_shipment_invalid` → `shipment_invalid`), y el correo de «Pedido enviado» los muestra.
- El BFF solo comprueba la forma: tres claves exactas, longitudes del contrato, sin controles y un
  enlace que empieza por `https://`. Si el enlace es aceptable lo decide el backend.
- La ficha del pedido pinta una tarjeta «Envío» cuando existe; el enlace se abre fuera del panel con
  `noopener noreferrer`.

### Bandeja

- **Ruta** `/panel/bandeja`, en la navegación con `communications.read` y un contador de no leídos
  que viene del resumen del backend. La ven `super_admin` y `master_admin`; `moderator` no, y la
  página se lo dice si escribe la URL.
- **Pestañas por cola** (Pedidos, Envíos, Soporte, Reclamos, Información) y «Revisión» solo con
  `communications.review_unclassified` (`super_admin`). Los filtros —estado, asignación, solo no
  leídas— son un formulario `GET`: la URL es el filtro, y lo aplica el backend.
- **Conversación**: el hilo en texto plano (React lo escapa, `white-space: pre-wrap`); nunca se pinta
  HTML del correo ni se cargan recursos remotos. Estado, asignación («Asignarme» / «Quitar
  asignación»), enlace informativo a un pedido y, en revisión, reclasificar.
- **El navegador no conoce ningún UID.** Para asignarse, pide `assignee: "me"` y el BFF resuelve el
  UID de la sesión verificada. «Asignada a ti» se decide en el servidor.
- **Responder**: sale del alias de la cola hacia el remitente del hilo; ni el remitente ni el
  destinatario viajan desde el navegador. Candado síncrono, `Idempotency-Key` atada al texto y a la
  versión, y tras enviar se dice lo que el backend confirmó —en cola o aceptada—, nunca «entregada».
- **Adjuntos**: solo los guardados enlazan, y siempre a la ruta BFF, que pide los bytes al backend y
  los entrega como descarga con `nosniff`, `no-store` y una CSP `sandbox`. El tipo solo pasa si es
  uno de los admitidos; lo demás viaja como binario opaco.
- Abrir una conversación la marca como leída una vez por visita.

## Consecuencias

- El navegador nunca habla con Resend, Firestore ni Cloud Storage: todo pasa por el BFF.
- El despliegue del panel tiene que seguir **inmediatamente** al del backend: con el backend nuevo,
  el panel anterior no puede marcar un pedido como enviado.
- Sin clave de envío `.com` en el backend, responder da `503 reply_unavailable` y lo dice.
