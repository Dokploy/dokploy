# Railway canvas compatibility

Maps Railway's project-canvas workflow to this fork's canvas
(`ProjectCanvas`, `RailwayServicePanel`) and to Dokploy's existing APIs.

Status values:

- **Done** — the flow exists and is reachable from the canvas.
- **Done (this pass)** — closed while writing this document.
- **Divergent** — Dokploy behaves differently on purpose; see the note.
- **Open** — still missing.

## Project canvas

| Railway workflow | Dokploy implementation | Status |
| --- | --- | --- |
| Canvas as the default project view | `ShowProjects` / `ProjectCanvas` | Done |
| Create a service from the canvas | Application, Compose, database, template and import dialogs | Done |
| Open a service in a side panel | URL-addressable panel via `serviceId` / `tab` | Done |
| Move services, keep layout | Versioned browser storage per project/environment | Divergent |
| Select several services and move them together | Shift-click extends the selection, dragging a selected node moves the whole set | Done (this pass) |
| Undo/redo | Buttons and `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z` | Done |
| Command palette | `Cmd/Ctrl+K` — services, canvas actions, and actions for the open service | Done (this pass) |
| `.` creates a service | Opens the creation menu | Done |
| `?` lists keyboard shortcuts | Shortcut dialog | Done (this pass) |
| Switch project without leaving the canvas | Project dropdown in the topbar | Done (this pass) |
| Switch environment | Environment dropdown in the topbar | Done (this pass) |
| Create / rename / delete environment | `AdvancedEnvironmentSelector` reused with canvas routing | Done (this pass) |
| Duplicate environment | `environment.duplicate` | Done (this pass) |
| Project shared variables | `ProjectEnvironment` from the project menu | Done (this pass) |
| Environment shared variables | `EnvironmentVariables` from the project menu | Done (this pass) |
| Drag between nodes to create a variable reference | Edges are derived from service types, not user-drawn | Open |
| Project activity feed | Topbar activity button is inert | Open |

Layout is stored per user per browser rather than on the project, so a moved
service does not follow the user to another device. Persisting it needs a
schema change and is deliberately out of this pass.

Connections on the canvas are inferred from the app/database mix in the
environment. Railway derives them from real variable references, so the edges
here are indicative, not authoritative.

## Service navigation

| Railway workflow | Dokploy implementation | Status |
| --- | --- | --- |
| Deployments / Variables / Metrics / Settings tabs | `PANEL_TABS` | Done |
| Console | Docker terminal (Dokploy extension) | Done |
| Right-click a node for its actions | Context menu opens the side panel instead of leaving the canvas | Done (this pass) |
| Open the full service page | "Open Full Page" in the context menu and the panel header | Done (this pass) |
| `G` then `D/V/M/S` | Panel tab shortcuts | Done |
| Escape closes the service view | Panel and URL state clear together; Escape also clears the canvas selection | Done |
| Deep links and browser navigation | `serviceId` and `tab` query parameters | Done |

## Runtime and deployment actions

| Railway action | Dokploy API | Status |
| --- | --- | --- |
| Deploy latest | Application/Compose deploy | Done |
| Restart | Application reload, Compose redeploy, database reload | Done (this pass) |
| Start / stop | Service start/stop endpoints | Done |
| Redeploy | Application/Compose redeploy | Divergent |
| Rollback | Rollback settings and rollback API | Done (this pass) |
| Abort a running build | `killBuild` | Done (this pass) |
| Cancel queued deployments | `cancelQueues` | Done (this pass) |
| Clear deployment history | `clearDeployments` | Done (this pass) |
| Deploy trigger / webhook URL | Deploy webhook URL plus token rotation | Done (this pass) |
| Runtime logs | Docker container/service logs | Done |
| Deployment logs | Deployment log APIs | Done |
| Remove service | Delete APIs with a canvas confirmation dialog | Done |

The panel header exposed Deploy, Restart, Start/Stop, Open App, rename and the
live status badge, but a CSS rule hid every control except Close. The rule is
gone, so those actions are reachable again.

Redeploy stays divergent: Railway can redeploy an arbitrary historical
deployment with that deployment's exact code and configuration, while Dokploy's
redeploy uses the service's current persisted configuration. Historical
restoration is only offered where a Dokploy rollback record exists.

## Service configuration

The Settings tab reuses Dokploy's own components rather than introducing a
parallel configuration model. It previously exposed only general settings,
domains and schedules; it now covers the same ground as the full service page:

- **Application** — source and build, service icon, domains, ports, redirects,
  security, Traefik config, start command, cluster/replicas, build server,
  resources, volumes, networks, preview deployments, rollbacks, schedules,
  volume backups, patches, danger zone.
- **Compose** — source and compose file, service icon, domains, networks,
  command, volumes, imports, isolated deployment, backups, schedules, volume
  backups, patches, danger zone.
- **Databases** — general settings, internal/external credentials, backups and
  `ShowDatabaseAdvancedSettings` (custom command, cluster, volumes, networks,
  resources), danger zone.

Infrastructure sections follow the same permission gate as the full service
page and only render for members who can create services.

## Railway concepts intentionally not emulated

- Staged infrastructure changes: Dokploy mutations apply immediately.
- Railway billing and usage semantics.
- Railway-specific regions, replicas and private-domain variables.
- Railway deployment approvals and image-retention rules.
- Railway's project-wide customizable observability widgets.

## Official Railway references

- https://docs.railway.com/projects
- https://docs.railway.com/services
- https://docs.railway.com/deployments/deployment-actions
- https://docs.railway.com/variables
- https://docs.railway.com/observability/logs
- https://docs.railway.com/observability/metrics
- https://docs.railway.com/overview/keyboard-shortcuts
