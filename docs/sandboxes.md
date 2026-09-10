# Sandboxes

A sandbox is an ephemeral, resource-limited Docker container that lives inside a
Dokploy environment and is driven entirely through the API: create it, run
commands, read and write files, and kill it. It is meant for AI agents and
backends (SDK / REST / MCP), not for hosting services: it has no domain, no
published ports and no persistent volumes.

Sandboxes run on the Dokploy server or on any remote server registered in
Dokploy (the container is created through the existing SSH Docker connection).

## Lifecycle

```
create  ─►  running  ─►  killed
  │                       ▲
  └──── error ────────────┘   (reaper / reconcile / failed command)
```

- `create` pulls the image if missing, creates the container, starts it and
  returns the record with `status: "running"` and `expiresAt`.
- Every operation refreshes `lastActivityAt` and pushes `expiresAt` to
  `now + timeoutMs`. An idle sandbox is killed by the reaper (runs every 15 s)
  once `expiresAt` passes.
- `kill` stops the container (2 s grace, then SIGKILL) and removes it. The row
  is kept with `status: "killed"` for history; `remove` deletes the row.
- On startup Dokploy reconciles every server: containers labelled
  `dokploy.sandbox=true` without a running row are removed, and rows marked
  running whose container is gone are set to `error`.

## Templates

| template | image (placeholder until `dokploy/sandbox-*` is published) | user      | workdir      |
| -------- | ---------------------------------------------------------- | --------- | ------------ |
| `base`   | `ubuntu:24.04`                                             | 1000:1000 | `/home/user` |
| `python` | `python:3.12-slim`                                         | 1000:1000 | `/home/user` |
| `node`   | `node:22-slim`                                             | 1000:1000 | `/home/user` |

A custom `image` can be used instead of a template. It must contain a POSIX
`sh` and `tail`; it runs as the image's default user.

## REST API

All procedures of the `sandbox` tRPC router are exposed through the OpenAPI
layer at `/api/sandbox.<procedure>` (queries are `GET` with query-string
parameters, mutations are `POST` with a JSON body). Authenticate with an API
key from *Settings → API Keys*:

```bash
export DOKPLOY_URL=https://dokploy.example.com
export DOKPLOY_KEY=xxxxxxxx
```

### Create

```bash
curl -s -X POST "$DOKPLOY_URL/api/sandbox.create" \
  -H "x-api-key: $DOKPLOY_KEY" -H "content-type: application/json" \
  -d '{
    "environmentId": "ENV_ID",
    "template": "python",
    "name": "agent-run-42",
    "cpu": 1,
    "memoryMb": 512,
    "timeoutMs": 300000,
    "networkMode": "isolated",
    "envVars": "OPENAI_API_KEY=sk-..."
  }'
```

Optional fields: `image` (instead of `template`), `serverId` (omit for the
Dokploy server), `pidsLimit`, `workdir`. The response is the sandbox record
(`sandboxId`, `status`, `containerId`, `expiresAt`, …). `envVars` is never
returned.

### Run a command

```bash
curl -s -X POST "$DOKPLOY_URL/api/sandbox.exec" \
  -H "x-api-key: $DOKPLOY_KEY" -H "content-type: application/json" \
  -d '{"sandboxId": "SANDBOX_ID", "cmd": "python3 -c \"print(1+1)\"", "timeoutMs": 60000}'
# {"stdout":"2\n","stderr":"","exitCode":0,"timedOut":false,"truncated":false}
```

`cmd` runs through `sh -c` in `cwd` (defaults to the sandbox workdir) with the
optional `env` object merged in. When the per-command `timeoutMs` (default
60 s, max 10 min) elapses the process tree is killed and `exitCode` is `124`.
`stdout`/`stderr` are capped at 1 MiB each (`truncated: true` when cut).

### Write and read files

```bash
# utf8 content
curl -s -X POST "$DOKPLOY_URL/api/sandbox.writeFile" \
  -H "x-api-key: $DOKPLOY_KEY" -H "content-type: application/json" \
  -d '{"sandboxId": "SANDBOX_ID", "path": "/home/user/app/main.py", "content": "print(\"hi\")\n"}'

# binary content
curl -s -X POST "$DOKPLOY_URL/api/sandbox.writeFile" \
  -H "x-api-key: $DOKPLOY_KEY" -H "content-type: application/json" \
  -d "{\"sandboxId\": \"SANDBOX_ID\", \"path\": \"/home/user/data.bin\", \"encoding\": \"base64\", \"content\": \"$(base64 < data.bin)\"}"

curl -s "$DOKPLOY_URL/api/sandbox.readFile?sandboxId=SANDBOX_ID&path=/home/user/app/main.py" \
  -H "x-api-key: $DOKPLOY_KEY"
# {"path":"/home/user/app/main.py","size":12,"encoding":"utf8","content":"print(\"hi\")\n"}

curl -s "$DOKPLOY_URL/api/sandbox.listFiles?sandboxId=SANDBOX_ID&path=/home/user/app" \
  -H "x-api-key: $DOKPLOY_KEY"
# {"path":"/home/user/app","entries":[{"name":"main.py","type":"file","size":12,"mode":"644","modifiedAt":"..."}]}
```

Parent directories are created with `mkdir -p`; files are owned by the sandbox
user. Files are capped at 10 MiB in both directions. `listFiles` falls back to
a name-only listing (`size`/`mode`/`modifiedAt` are `null`) on images whose
`find` has no `-printf` (busybox).

### Timeout, list, kill

```bash
curl -s -X POST "$DOKPLOY_URL/api/sandbox.setTimeout" \
  -H "x-api-key: $DOKPLOY_KEY" -H "content-type: application/json" \
  -d '{"sandboxId": "SANDBOX_ID", "timeoutMs": 900000}'

curl -s "$DOKPLOY_URL/api/sandbox.list?environmentId=ENV_ID" -H "x-api-key: $DOKPLOY_KEY"
curl -s "$DOKPLOY_URL/api/sandbox.list?projectId=PROJECT_ID" -H "x-api-key: $DOKPLOY_KEY"
curl -s "$DOKPLOY_URL/api/sandbox.one?sandboxId=SANDBOX_ID" -H "x-api-key: $DOKPLOY_KEY"

curl -s -X POST "$DOKPLOY_URL/api/sandbox.kill" \
  -H "x-api-key: $DOKPLOY_KEY" -H "content-type: application/json" \
  -d '{"sandboxId": "SANDBOX_ID"}'
```

`sandbox.remove` deletes the record (killing the container first if needed).
`sandbox.templates` lists the built-in templates.

### MCP

The MCP server is generated from `openapi.json`, so the tools are named after
the operation ids: `sandbox-create`, `sandbox-exec`, `sandbox-writeFile`,
`sandbox-readFile`, `sandbox-listFiles`, `sandbox-setTimeout`, `sandbox-kill`,
`sandbox-remove`, `sandbox-list`, `sandbox-one`, `sandbox-templates`.

## Streaming exec (WebSocket)

Long-running commands can stream their output over the WebSocket endpoint
`/sandbox-exec?sandboxId=SANDBOX_ID` (same origin as the dashboard, session
cookie or `x-api-key` header). Messages are JSON, one command at a time per
connection:

| direction | message |
| --------- | ------- |
| server → client | `{"type":"ready","sandboxId":"..."}` once authorized |
| client → server | `{"type":"exec","cmd":"...","cwd"?:"...","env"?:{...},"timeoutMs"?:60000}` |
| server → client | `{"type":"stdout","data":"..."}` / `{"type":"stderr","data":"..."}` chunks |
| server → client | `{"type":"exit","exitCode":0,"timedOut":false}` when the command finishes |
| server → client | `{"type":"error","message":"..."}` on validation / runtime errors |

The dashboard console on the sandbox page uses this protocol.

## Permissions

- `create` requires `service:create` on the project (same as creating any
  service); the creator is granted access to the new sandbox.
- `one`, `list`, `readFile`, `listFiles` require `service:read` on the sandbox.
- `exec`, `writeFile`, `setTimeout`, `kill` and the WebSocket require
  `deployment:create` on the sandbox (the same permission used to start/stop
  services).
- `remove` requires `service:delete`.
- Every operation also checks the sandbox belongs to the caller's active
  organization and, on creation, that the caller can access the target server.

## Security model

Each sandbox container is created with:

- `CapDrop: ["ALL"]` and `SecurityOpt: ["no-new-privileges"]`.
- `Init: true` (docker-init/tini as PID 1) so processes orphaned by a killed
  command are reaped instead of lingering as zombies.
- CPU (`NanoCpus`), memory (`Memory` = `MemorySwap`, so no swap) and
  `PidsLimit` quotas; `RestartPolicy: no`; JSON log capped at 10 MiB.
- A non-root user for the built-in templates (`1000:1000`); the workdir is
  created and owned by that user through the Docker archive API, so no
  capability is needed inside the container.
- A dedicated bridge network per server: `dokploy-sandboxes-isolated`
  (`internal: true`, no egress) for `networkMode: "isolated"` (default) or
  `dokploy-sandboxes` for `networkMode: "internet"`. Sandboxes are never
  attached to `dokploy-network` or to any application network, and nothing is
  published through Traefik.
- Labels `dokploy.sandbox=true`, `dokploy.sandboxId`, `dokploy.projectId` and
  `dokploy.environmentId` so the reaper/reconcile can find orphans.
- Commands run through `docker exec` with a per-command timeout; on timeout the
  whole process tree started by that exec is killed (matched by a marker env
  var, no `procps` needed), falling back to killing the container, in which
  case the sandbox is marked `error`.

Environment variables passed at creation are stored encrypted at rest and are
never returned by the API.

## Current limitations

- No in-container agent: everything goes through `docker exec`, `putArchive`
  and `getArchive`. There is no PTY / interactive shell, no stdin, and no
  process management beyond the per-command timeout.
- Plain Docker runtime only (`runtime` column reserved for gVisor/Kata later).
- No snapshots, pause/resume, warm pools, or billing.
- No public domains or exposed ports.
- Remote servers reuse the existing Dokploy SSH Docker client, which opens an
  SSH session per Docker API request (same behaviour as the rest of Dokploy);
  a pooled connection would make bursts of small operations faster.
- `listFiles` needs GNU `find` for metadata; busybox images get names only.
- Output of a single command is capped at 1 MiB per stream, files at 10 MiB.
- Sandboxes are not shown in the environment services grid; they live in the
  *Sandboxes* view of the environment.
