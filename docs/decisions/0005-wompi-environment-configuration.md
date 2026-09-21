# 0005 — Configurar Wompi: ambiente explícito y pantalla de una sola tarea

Fecha: 2026-09-20
Estado: aceptada

## Contexto

La pantalla **Configuración → Integraciones → Wompi** mandaba siempre `environment: "sandbox"`. El
panel de Wompi, en cambio, enseña las llaves de **Producción** por omisión: son las que un
administrador tiene delante al entrar en «Desarrolladores».

El resultado era el peor posible. Pegar esas llaves —lo más natural del mundo— producía un
`payment_integration_invalid` genérico que no decía ni que las llaves eran de producción, ni que
producción estuviera bloqueada, ni qué hacer al respecto. Y no había ninguna casilla alternativa
donde ponerlas: el backend rechazaba entera cualquier petición con `environment: "production"`,
aunque solo pretendiera guardar credenciales.

La pantalla, además, explicaba la arquitectura completa: resumen operativo, tres relojes, versión de
la configuración, secretos retirados, rotación, prueba de conexión y una tarjeta grande sobre
producción. Todo cierto, todo documentado, y todo por delante de lo único que alguien viene a hacer
aquí.

## Decisión

### 1. El ambiente lo elige quien configura

Un selector con **Pruebas (Sandbox)** y **Producción** decide qué conjunto se actualiza. No se
deduce del prefijo de lo pegado: deducirlo convertiría el error más caro —llaves de producción donde
van las de pruebas— en un cambio silencioso de ambiente, que es justo lo que la validación de
prefijos existe para atrapar.

### 2. Los prefijos se comprueban antes de enviar

`wompi-credential-check.ts` es puro, no registra nada y conoce los ocho prefijos oficiales. Si el
ambiente de lo pegado no coincide con el seleccionado, lo dice donde se pegó y no gasta la llamada:

> Estas llaves son de Producción. Cambia el ambiente a Producción para guardarlas.

Es **ayuda, no autoridad**. El backend vuelve a validarlo todo, y una petición fabricada a mano la
sigue juzgando él. Los ocho prefijos están duplicados en el panel a propósito: son un dato público y
estable del proveedor, no una regla de negocio.

### 3. `trim()` en los extremos, nunca dentro

Copiar una llave del panel de Wompi arrastra un espacio o un salto de línea constantemente.
Rechazarla por eso manda a buscar una errata que no existe. El interior no se toca: un espacio en
medio es otra cadena, no un descuido del portapapeles.

### 4. Guardar no habilita

El backend separó las dos operaciones, y el panel lo refleja. Guardar llaves —de cualquiera de los
dos ambientes— escribe versiones en el almacén de secretos y no mueve dinero. Habilitar cobros es
otra decisión, vive en «Configuración avanzada» y en producción no se ofrece mientras el bloqueo
siga puesto.

**Guardar llaves de Producción es válido y la pantalla nunca afirma que los cobros reales quedaran
habilitados.**

### 5. La pantalla hace una cosa

Título, una línea de instrucciones, selector, cuatro campos, un botón y un estado de dos palabras.
Lo demás se retiró: el resumen operativo, los relojes, los contadores, la versión, la rotación, la
prueba de conexión, la tarjeta de producción y los textos sobre API Gateway y reconciliación.

La URL de eventos se queda, plegada en «Configuración avanzada», porque Wompi la pide **por
ambiente** en su propio panel y hay que poder copiarla desde algún sitio.

### 6. Lo escrito se conserva cuando falla

Los campos se vacían **solo** al guardar correctamente. Antes se vaciaban pasara lo que pasara, con
el argumento de no dejar credenciales en el DOM; el precio era volver a pegar cuatro llaves tras un
fallo de red. La regla nueva conserva el mismo objetivo —no dejarlas ahí una vez guardadas— sin
castigar el error ajeno.

## Consecuencias

- El contrato publica tres códigos nuevos que el BFF traduce:
  `wompi_credentials_environment_mismatch`, `wompi_credential_prefix_invalid` y
  `wompi_credentials_incomplete`. Ninguno lleva un valor, un fragmento ni una longitud.
- `WompiConnectionTester` y `WompiRevokeRetiredSecrets` se retiraron de la vista. La ruta BFF de la
  prueba de conexión y el endpoint del backend siguen existiendo.
- **Rotar un solo secreto ya no se puede desde esta pantalla**: exige las cuatro llaves del
  ambiente. El contrato sigue admitiendo el `PATCH` parcial, así que una pantalla de rotación fina
  se puede añadir aparte el día que haga falta; lo que no se quiere es que este formulario acepte
  tres llaves y deje una configuración que parece guardada y no abre ningún checkout.
- El panel sigue sin hablar con Wompi, con Firestore o con Secret Manager desde el navegador.

## Alternativas descartadas

- **Deducir el ambiente del prefijo pegado.** Silencia el error que importa.
- **Quitar la validación de prefijos.** Es lo único que permite saber a qué ambiente pertenece una
  llave antes de usarla; sin ella el error se descubre con el primer cobro.
- **Dejar la pantalla como estaba y solo añadir el selector.** El selector se habría perdido entre
  seis secciones, que es lo que ya pasaba con el formulario.
- **Quitar también el interruptor de habilitar cobros.** Era la única forma de encender Sandbox
  desde el panel; retirarlo habría dejado la integración configurable y no utilizable.
- **Vaciar los campos también al fallar.** Obliga a repetir cuatro pegados por un error de red.
