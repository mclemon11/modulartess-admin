# 0006 — Activar los cobros reales de Wompi: control propio y confirmación escrita

Fecha: 2026-09-23
Estado: aceptada. Complementa la
[0005](./0005-wompi-environment-configuration.md), que dejaba Producción sin interruptor.

## Contexto

La 0005 dejó Producción con formulario de llaves y **sin interruptor**: el backend bloqueaba
`enabledForNewPayments: true` en producción y un botón que solo podía devolver
`wompi_live_payments_not_enabled` habría prometido algo que no iba a ocurrir.

El backend levantó ese bloqueo en su despliegue (`LIVE_PAYMENTS_ENABLED=true`) y ahora responde
`livePaymentsEnabled: true`. Levantarlo **no cobra nada**: `production.enabledForNewPayments` sigue
en `false`. Empezar a cobrar quedó como una segunda decisión, explícita, que se toma desde el panel.

El contrato no cambió de forma: el mismo `PATCH /v1/admin/integrations/wompi`, con
`environment: "production"` y `enabledForNewPayments`, deja de rechazarse cuando el despliegue lo
permite. Apagar Producción se admite siempre.

## Decisión

### 1. Producción tiene un control propio, con cuatro estados

`ProductionPaymentsControl` se pinta con Producción seleccionada y el de Pruebas con Pruebas. Cada
uno lleva su ambiente **escrito**; ninguno lo toma del selector. El estado sale entero de la
respuesta del backend (`wompi-live-payments.ts`, puro):

| Estado         | Cuándo                                                  | Qué se pinta                                                               |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| Sin configurar | Faltan llaves de Producción                             | **Nada**: solo el formulario de llaves.                                    |
| Bloqueado      | Llaves guardadas y `livePaymentsEnabled=false`          | Una línea: el despliegue todavía bloquea los cobros. Sin botón.            |
| Desactivado    | Llaves, `livePaymentsEnabled=true`, interruptor apagado | «Cobros reales desactivados» y el botón visible **Activar cobros reales**. |
| Activo         | `production.enabledForNewPayments=true`                 | «Cobros reales activos» y **Desactivar cobros reales**.                    |

«Activo» se evalúa primero: si Producción cobra, lo único que importa es poder apagarla, aunque el
despliegue haya vuelto a bloquear o falte una llave.

### 2. Activar exige escribir `ACTIVAR PRODUCCIÓN`

El botón visible solo abre una confirmación. Esta dice que **desde ese momento cada checkout nuevo
cobrará dinero real** y pide escribir `ACTIVAR PRODUCCIÓN`. Una casilla se marca sin leer; escribir
la frase obliga a leer lo que se va a hacer.

Se compara la frase tal cual —mayúsculas y tilde—. Solo se perdonan los espacios de los extremos y
la codificación de la «Ó» (se normaliza a `NFC`), que no son decisiones de quien escribe.

La confirmación es un `<form>` propio, así que el formulario de llaves pasó a envolver **solo** las
llaves: anidados, pulsar Intro en la frase habría enviado las cuatro llaves, además de ser HTML
inválido. El `submit` vuelve a comprobar la frase, porque un botón deshabilitado no impide que Intro
envíe.

**Desactivar no pide confirmación.** Parar de cobrar no borra nada y los pagos en vuelo se siguen
cerrando; ponerle fricción solo haría más lenta la reacción ante un problema.

### 3. El cuerpo es mínimo

```json
{ "expectedVersion": 7, "environment": "production", "enabledForNewPayments": true }
```

Ni una credencial ni un campo vacío. `expectedVersion` viaja porque el contrato la exige para el
control optimista.

### 4. Después de responder, se relee

- Éxito: se cierra la confirmación, se vacía la frase y `router.refresh()` relee el estado. Lo que
  se ve después —«Cobros reales activos»— es lo que respondió el backend, no algo adelantado.
- La frase **se vacía tras cualquier intento**, bien o mal: la siguiente activación se vuelve a
  escribir.
- Conflicto de versión y `live_payments_not_enabled` releen: el primero porque otra persona cambió
  la configuración, el segundo porque significa que `livePaymentsEnabled` ya no vale lo que la
  pantalla creía, y releer hace que deje de ofrecer el botón.
- Los mensajes son propios de esta operación —permisos, conflicto, bloqueo— y todos dicen que no se
  cambió nada. No se reutilizan los de «Guardar llaves», que hablan de guardarlas.

### 5. El ambiente activo lo dice el backend

Si Producción está encendida y el backend sigue informando `activeEnvironment` distinto de
`production`, se dice debajo del estado. Con Pruebas activo, la documentación del backend indica que
Sandbox conserva su precedencia; el panel no lo deduce, lee el campo derivado.

### 6. La tarjeta de Integraciones deja de decir «Habilitados»

Decía «Habilitados» en cuanto el despliegue permitía cobrar, y se leía como dinero real en marcha.
Ahora dice **Bloqueados**, **Sin llaves de Producción**, **Desactivados** o **Activos**.

## Consecuencias

- El contrato comiteado no cambió: la parte de Wompi es idéntica a la publicada.
- La activación real **no** se hizo durante este trabajo. Queda para que la confirme una persona
  desde el panel.
- Las pruebas cubren los cuatro estados, la frase exacta y sus variantes rechazadas, el cuerpo
  exacto, que el BFF lo reenvía sin cambios, la relectura y que ninguna llave aparece en el HTML.

## Alternativas descartadas

- **Una casilla de «entiendo»**: se marca sin leer.
- **Confirmar con `window.confirm`**: bloquea la página, no se puede probar y se acepta con Intro.
- **Pedir la frase también para desactivar**: frena justo la reacción que tiene que ser rápida.
- **Reutilizar el interruptor de Pruebas tomando el ambiente del selector**: es el error que la 0005
  ya evitó; con Producción elegida, un clic de un botón de pruebas cobraría dinero real.
