# Modulartess Admin

Panel administrativo privado de Modulartess.

## Propósito

Interfaz interna para que el equipo de Modulartess gestione la operación de la tienda: catálogo,
pedidos, inventario y clientes. No es un sitio público y no está pensado para ser indexado.

Este repositorio es **independiente** del frontend público (`modulartess-web`) y del backend
(`modulartess-backend`). No forma parte de un monorepo y no comparte código con ellos. El único
intercambio permitido con el backend es una copia versionada de su contrato OpenAPI, descrita más
abajo.

## Límites de responsabilidad

El panel es una capa de presentación con una frontera BFF en su propio servidor:

- Renderiza vistas y formularios administrativos.
- Su servidor Next.js realiza llamadas HTTP tipadas al backend NestJS protegido por IAM.

El panel **no**:

- Accede directamente a Firestore ni a Cloud Storage.
- Usa el SDK cliente de Firestore ni el SDK cliente de Cloud Storage.
- Usa `firebase-admin`.
- Incluye credenciales de cuentas de servicio.
- Contiene reglas comerciales (precios, impuestos, disponibilidad, estados de pedido).
- Almacena secretos, credenciales ni claves privadas.

Todo lo anterior está excluido de forma **permanente**, no pendiente de una fase futura.

El backend NestJS es la **autoridad** sobre los datos y las reglas de negocio. **OpenAPI es el
único contrato** entre ambos.

Las reglas permanentes del repositorio están en [`AGENTS.md`](./AGENTS.md).

## Firebase Authentication: la única excepción futura en el navegador

En una fase posterior el panel **sí podrá** usar el SDK cliente de Firebase, y exclusivamente para
**Firebase Authentication**. Es la única excepción permitida al uso de Firebase dentro del
navegador: no habilita el SDK cliente de Firestore, ni el de Cloud Storage, ni `firebase-admin`, ni
el acceso directo a los datos.

Firebase **todavía no está instalado** y no se añade por anticipación.

## Flujo de autenticación previsto

El backend NestJS está desplegado como un **servicio de Cloud Run protegido por IAM**. Su endpoint
tiene una URL canónica direccionable por internet, pero no permite la invocación anónima: esas
solicitudes se rechazan con `403`. La URL no es un secreto.

Aun así, no se entrega al navegador del panel: no viaja en ninguna variable `NEXT_PUBLIC_*`, ni en
la configuración de cliente, ni en el bundle. El navegador no llama directamente al backend; dentro
del flujo administrativo, las llamadas pasan por el servidor Next.js (frontera BFF).

El flujo previsto es:

1. El navegador se autentica mediante Firebase Auth.
2. El navegador se comunica con el servidor Next.js del panel.
3. El servidor Next.js actúa como frontera BFF.
4. El servidor Next.js invoca el backend en Cloud Run con su identidad de ejecución.
5. El backend verifica la identidad administrativa y aplica autorización y reglas de negocio.

El mecanismo exacto para transportar y verificar la identidad Firebase entre el BFF y el backend
**sigue pendiente de una ADR específica**. Hasta que se registre, el repositorio no define
encabezados, cookies, endpoints ni mecanismos de tokens.

## Contrato OpenAPI

- El backend publica la especificación OpenAPI; el panel guardará dentro de este repositorio una
  **copia versionada** de esa especificación.
- Los tipos del cliente HTTP se generarán a partir de esa copia local.
- La copia se actualiza mediante un procedimiento explícito y verificable, cuyo resultado se revisa
  en el diff.
- No se importa código fuente del backend, ni se usan dependencias `file:`, symlinks, workspaces
  compartidos ni rutas locales de otro repositorio en build o en runtime. Los módulos internos del
  backend no son un contrato.

## Requisitos

- Node.js `>=22.0.0`
- pnpm `11.19.0`

## Comandos locales

```bash
pnpm install        # Instalar dependencias
pnpm dev            # Servidor de desarrollo en http://localhost:3000
pnpm build          # Compilación de producción
pnpm start          # Servir la compilación de producción
pnpm lint           # ESLint
pnpm typecheck      # Comprobación de tipos (tsc --noEmit)
pnpm format         # Formatear con Prettier
pnpm format:check   # Verificar formato sin escribir
```

## Variables de entorno

En esta fase el panel no consume ningún servicio externo, por lo que **no existe ninguna variable
de entorno necesaria**. [`.env.example`](./.env.example) lo documenta explícitamente y recoge las
reglas para cuando se añada la primera. Los archivos `.env*` reales nunca se comitean.

No habrá ninguna variable `NEXT_PUBLIC_` con la URL del backend. El backend es un servicio de
Cloud Run protegido por IAM: su URL es direccionable por internet y no es un secreto, pero rechaza
la invocación anónima. En una fase posterior el BFF tendrá una variable **exclusivamente
server-side** con esa URL e invocará Cloud Run usando su identidad de ejecución.

## Estado actual

Base técnica mínima, limpia y compilable. En concreto, el repositorio contiene:

- Aplicación Next.js con App Router y TypeScript estricto.
- Layout raíz con los metadatos de Modulartess Admin e indexación desactivada.
- Una única página inicial renderizada en el servidor con el mensaje
  «Panel administrativo en configuración».
- Estilos sobrios y responsive mediante CSS Modules, sin componentes copiados del storefront.
- Configuración de ESLint, Prettier y scripts de verificación.
- Documentación de arquitectura y la primera decisión registrada.

No hay funcionalidad operativa, ni acciones simuladas, ni datos de ejemplo. El detalle está en
[`docs/architecture/current-status.md`](./docs/architecture/current-status.md).

## Funcionalidades pendientes

- ADR del mecanismo de identidad entre el BFF y el backend.
- Autenticación con Firebase Auth en el navegador (SDK aún no instalado).
- Frontera BFF en el servidor Next.js hacia el backend protegido por IAM.
- Autorización por roles administrativos, verificada en el backend.
- Copia versionada del contrato OpenAPI y cliente HTTP tipado generado desde ella.
- Layout de aplicación autenticada (navegación, cabecera, estados de carga y error).
- Gestión de catálogo y de inventario.
- Gestión de pedidos.
- Gestión de clientes.
- Subida de medios delegada al backend (el panel nunca escribe en Cloud Storage).
- Pruebas automatizadas y pipeline de integración continua.
- Estrategia de despliegue del panel privado.
