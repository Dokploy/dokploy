## What is this PR about?

This PR extends the container filesystem browser (browse, download, and upload files inside a running container) from `application` services to every other service type: `postgres`, `mysql`, `mariadb`, `mongo`, `redis`, and `compose` (which also covers deployed templates, since a template becomes a regular `compose` entity once deployed).

Previously this feature (`packages/server/src/services/container-filesystem.ts`, the application-only `filesystemContainers`/`filesystemList`/`filesystemReadFile` procedures, and the `ShowContainerFileSystem` component) only worked from the Application service page. This PR:

- Adds `getComposeFilesystemContainers`/`getComposeFilesystemContainer` for compose's multi-container discovery, since compose containers are labeled differently depending on deploy mode (`com.docker.compose.project=<appName>` for plain `docker compose`, vs a `<appName>_<service>`-prefixed swarm service name for `docker stack deploy`) — unlike the other service types, which are always a single swarm service.
- Replaces the application-only `application-filesystem.ts` auth util with a generic `service-filesystem.ts` that dispatches to the right entity finder (`findApplicationById`, `findPostgresById`, etc.) based on a `serviceType`, while preserving the same per-service `containerFilesystem` permission check and `accessedServices` scoping.
- Introduces a single shared `filesystem` tRPC router (`{ serviceType, serviceId }` inputs) instead of duplicating the same three procedures across seven routers, and updates the `/api/filesystem/download` and `/api/filesystem/upload` routes to take `serviceType`/`serviceId` instead of being application-specific.
- Adds a `containerFilesystem` **write** permission (previously read-only) so uploads can be permission-gated separately, with owner/admin granted by default and an opt-in toggle for custom roles.
- Adds a "Files System" tab to the postgres, mysql, mariadb, mongo, redis, and compose dashboard pages, matching the existing tab pattern and permission gating already used on the Application page.
- Fixes an unrelated bug found along the way: browsing a directory whose recursive Docker archive exceeded the safety byte cap used to hang forever instead of erroring, because destroying the stream without an error never fired the `finish`/`error` listeners the code was waiting on. It now returns a partial, `truncated: true` listing instead.
- Defaults the file browser to the container's `WORKDIR` instead of `/` when a container is selected.
- The "Running" state badge in the container selector now renders green instead of the default gray/secondary style.

## Checklist

Before submitting this PR, please make sure that:

- [x] You created a dedicated branch based on the `canary` branch.
- [x] You have read the suggestions in the CONTRIBUTING.md file https://github.com/Dokploy/dokploy/blob/canary/CONTRIBUTING.md#pull-request
- [x] You have tested this PR in your local instance. If you have not tested it yet, please do so before submitting. This helps avoid wasting maintainers' time reviewing code that has not been verified by you.

## Issues related (if applicable)

<!-- closes #123 -->

## Screenshots (if applicable)

<!-- Add screenshots/video of the Files System tab on a postgres/mysql/mariadb/mongo/redis/compose service, and of an upload succeeding. -->
