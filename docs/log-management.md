# Log Management

> **Nota para quien mergee esto:** este contenido vive acá porque no había un checkout local del
> repo de docs públicas (`docs.dokploy.com`) disponible al escribir esta feature. Migrar este
> archivo a ese repo (sección "Core" o similar, junto a Registry/Monitoring) y borrarlo de acá.

## Qué es

Dokploy puede shippear los logs de los containers de un server a un proveedor externo de log
management — hoy: **Grafana Loki**, **Datadog Logs**, **Better Stack** (ex-Logtail),
**Elasticsearch / OpenSearch**, **Splunk (HTTP Event Collector)** y **AWS CloudWatch Logs**. Antes de
esta feature, la única forma de ver logs era el stream en vivo por WebSocket en el dashboard, sin
historial ni persistencia. Esta feature no reemplaza ese viewer en vivo — sigue funcionando igual
— agrega la posibilidad de mandar una copia de los logs a un sistema externo para
retención/búsqueda/alerting.

Por debajo corre [Vector](https://vector.dev) (Apache-2.0), un único binario, como un agente por
server registrado. Dokploy no implementa clientes HTTP para cada proveedor — solo traduce
credenciales guardadas en el dashboard a un bloque de configuración de Vector (un "sink").

## Cómo activarla

Hacen falta **dos cosas**, ambas apagadas por default:

1. **Al menos un log provider configurado**, en Settings → Log Management. Elegís el tipo
   (Loki/Datadog/Better Stack/Elasticsearch/OpenSearch/Splunk/AWS CloudWatch), completás las
   credenciales que pida ese tipo, y podés probar la
   conexión antes de guardar.
2. **El toggle "Log Management" prendido** en cada lugar donde quieras shippear logs:
   - Por server registrado: en el diálogo de acciones del server ("Server Actions"), al lado del
     toggle de Docker Cleanup.
   - **En la máquina donde corre Dokploy** (self-hosted únicamente — no existe en Dokploy Cloud,
     donde esa máquina es infraestructura de Dokploy, no del cliente): en Settings → Web Server,
     al lado del toggle de Docker Cleanup local. La primera organización que lo prende "reclama"
     ese host — otra organización de la misma instancia no puede prenderlo hasta que la primera lo
     apague (rechazo explícito, no se pisan silenciosamente).

Si cualquiera de las dos condiciones no se cumple, el agente Vector **no corre en absoluto** en
ese host — no consume CPU/memoria/disco, y nada más del dashboard se ve afectado (el streaming en
vivo de logs sigue funcionando igual).

**Host local en una instancia self-hosted multi-organización:** Vector lee el socket de Docker
completo, sin distinguir de qué organización es cada container — pero solo el agente local (el
registrado por `server` siempre pertenece a una sola organización, sin este problema). Para
evitar que le lleguen logs de otra organización a los providers del dueño del host, el pipeline
del agente local descarta todo evento que no matchee una app de la organización dueña (filtro
`dokploy_scope_local_only` en `vector-setup.ts`) antes de que llegue a cualquier sink — esto
también implica que, a diferencia del agente por-server, containers de terceros (no gestionados
por Dokploy) corriendo en la misma máquina ya no shippean via el agente local.

Un log provider es a nivel de organización: si tenés varios servers con el toggle prendido, todos
ellos shippean a todos los providers habilitados. No hay (todavía) una asociación
provider-por-server — es una mejora futura posible si hace falta más granularidad.

### Scoping por proyecto/entorno/aplicación

Aunque Vector ve **todos** los containers del host (no solo los de Dokploy), cada evento que sí
corresponde a una app gestionada por Dokploy llega taggeado con:

- `dokploy_organization` — siempre presente.
- `dokploy_project` / `dokploy_project_id`
- `dokploy_environment` / `dokploy_environment_id`
- `dokploy_application` / `dokploy_application_id`

Un container de terceros (no gestionado por Dokploy) corriendo en el mismo host sigue
shippeando igual, simplemente sin esos 6 campos.

Esta tabla de scoping se recalcula cada vez que se toca algo de log management (activar/crear/
editar un provider, prender el toggle de un server) y además cada 15 minutos como red de
seguridad, para que una app creada después de la configuración inicial no quede sin estos tags
indefinidamente.

## Cómo agregar un provider nuevo (guía para contribuidores)

Toda la lógica de un provider vive en un solo archivo:
`packages/server/src/services/log-management/providers/<nombre>.ts`, implementando la interfaz
`LogProviderAdapter` (`packages/server/src/services/log-management/types.ts`). **No hace falta
tocar el router tRPC ni la UI** — la UI (`logProvider.availableTypes`) lista los providers
disponibles dinámicamente a partir del registry de adapters, y el orquestador de Vector
(`packages/server/src/setup/vector-setup.ts`) resuelve el resto de forma genérica.

Hay dos caminos, según si Vector ya tiene un sink nativo para tu backend:

### Camino 1: tu backend ya tiene un sink en Vector

Es el caso de Loki, Datadog, Elasticsearch/OpenSearch, Splunk HEC y AWS CloudWatch Logs. Mirá la
[lista de sinks de Vector](https://vector.dev/docs/reference/configuration/sinks/)
— si tu backend está ahí, este es tu camino.

1. Agregar el tipo al enum de Drizzle: `logProviderType` en
   `packages/server/src/db/schema/log-provider.ts`, + correr
   `pnpm --filter dokploy migration:generate` y commitear el SQL generado.
2. Ampliar el union `LogProviderType` en `services/log-management/types.ts`.
3. Crear `providers/<nombre>.ts`:
   - `credentialFields`: qué campos pedirle al usuario. `key` tiene que ser exactamente
     `"endpoint"` | `"apiKey"` | `"apiSecret"` (las 3 únicas columnas con espacio propio en la
     tabla) o, si tu backend necesita algo que no encaja en esas 3, cualquier otro nombre — ese
     valor termina en `extraConfig` (jsonb). **Este `key` no es solo para mostrar en la UI: la UI
     genérica lo usa para decidir dónde guardar el valor** (columna directa vs. `extraConfig`) —
     ver `providers/loki.ts` para el caso simple (`endpoint`) y `providers/betterstack.ts` para
     el comentario completo sobre este punto (ahí hubo un bug real por esto durante el desarrollo:
     usar un `key` "bonito" que no coincidía con la columna real).
   - `toVectorSink(config, sinkId, inputId)`: devolvé el bloque de sink de Vector con tus
     credenciales mapeadas. **Siempre incluir `buffer: { type: "disk", max_size, when_full }`**
     (ver `DEFAULT_DISK_BUFFER` en `types.ts` para el default) — el default de Vector es buffer
     en memoria, que no protege contra un backend caído.
   - `testConnection(config)` (opcional pero recomendado): un ping barato para validar
     credenciales antes de guardar.
4. Registrar en `providers/registry.ts` (`logProviderAdapters`) — una línea.
5. Tests unitarios junto a los de `loki`/`datadog`/`betterstack`
   (`apps/dokploy/__test__/log-management/log-provider-adapters.test.ts`) verificando la forma
   del sink generado.

### Camino 2: tu backend NO tiene sink nativo en Vector

Es el caso de Better Stack — usar `providers/betterstack.ts` como plantilla. Mismos pasos que
arriba, con dos diferencias:

- El sink usa el genérico `http` (o `socket`/`file` si tu backend expone algo distinto a HTTP).
- Si tu backend espera el evento en una forma distinta a la que produce el scoping (ej. un
  nombre de campo distinto para el timestamp), implementar `toVectorTransform(config,
  transformId, scopeTransformId)` — un paso VRL intermedio entre el scoping y tu sink. El
  orquestador (`vector-setup.ts`) ya sabe encadenar `scope → tu transform → tu sink` cuando este
  método existe, y `scope → sink` directo cuando no — no hay que tocar el orquestador.

## Decisiones y límites conocidos

- **Un server = un nodo Swarm de un solo nodo, típicamente.** Dokploy no modela clusters Swarm
  multi-nodo (cada `server` registrado es una máquina SSH independiente). Si tu server participa
  de un swarm con workers que no están registrados como su propio `server` en Dokploy, el agente
  Vector puede terminar programado en un nodo sin la config — fuera de alcance del MVP actual.
- **No hay viewer de logs históricos embebido en el dashboard** — esta feature es solo shipping.
  Para ver los logs, usar la UI del provider externo (Grafana, Datadog, Better Stack, Kibana/
  OpenSearch Dashboards, Splunk, CloudWatch Logs Insights).
- **`logProvider` es free tier**, no enterprise-only — a diferencia de `registry`/`server`/
  `domain`/`monitoring`, disponible para cualquier organización sin importar el plan.
- **Deployment en la misma máquina de Dokploy**: soportado self-hosted (Settings → Web Server),
  nunca en Dokploy Cloud — ver "Cómo activarla" arriba para el caveat multi-organización.
