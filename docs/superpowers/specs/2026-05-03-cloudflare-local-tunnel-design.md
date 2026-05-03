# Cloudflare Local Tunnel — Design Spec

**Date:** 2026-05-03
**Branch:** `Bl4ckBl1zZ/cf-local-tunnel`
**Builds on:** `2026-05-03-cloudflare-multi-account-design.md`

## Problem

The Cloudflare integration works for Remote Servers but does not support the Dokploy Server (panel host) itself. Services deployed on the panel host (`serverId === null`) cannot use Cloudflare-managed domains: the orchestrator's `findServerForDomain` throws "Domain is not attached to a remote server" and the domain is silently left in `pending` status. The hostname never resolves externally because no CNAME is pushed and no tunnel ingress is configured.

We need to extend the integration so apps and compose services running on the panel host can use Cloudflare-managed domains, with the same UX as Remote Servers, while coexisting with any pre-existing manual `cloudflared.service` the operator already runs on the host.

## Goals

- Apps/compose with `serverId === null` can have Cloudflare-managed domains.
- A local tunnel is provisioned and managed by Dokploy from Settings → Cloudflare.
- The local tunnel binding lives in a per-org table so multi-org installs work.
- Pre-existing manual `cloudflared.service` on the host is untouched. Dokploy installs and manages its own tunnel only.
- When a domain's hostname already has a CNAME pointing at a different tunnel, the swap is atomic (`PATCH`, not `DELETE+CREATE`).
- Missing local tunnel surfaces as a typed tRPC error so the Add Domain dialog can show inline guidance.

## Non-goals (v1)

- A "Migrate to local tunnel" button on existing `Manual` domains. Deferred — the manual override path during Add/Edit Domain already covers the user's primary migration case.
- The panel host appearing in the Remote Servers list with a "Local" badge. Per the request, `kind: "local"` stays distinct.
- A non-Docker installer (systemd directly on host, SSH-to-localhost, etc.). Not needed: dokploy already has dockerode access on the panel host.
- Cloud (`IS_CLOUD === true`) support. The CF integration is self-hosted only and this feature follows the same gate.

## Key decisions

### Installer: cloudflared as a Docker container

Dokploy already speaks to the host Docker socket via `dockerode` (see `packages/server/src/constants/index.ts` socket auto-detection). The local tunnel installer pulls `cloudflare/cloudflared:latest` and runs it as a container named `dokploy-tunnel` with `--token <TOKEN>`, `restart: unless-stopped`, and `network_mode: host` so it can reach Traefik on `localhost:80/443`.

Why not systemd / SSH-to-localhost / direct `child_process`:
- Standard Dokploy deploys run the panel inside a container. The container can't write `/etc/systemd/system/` or run `systemctl` against the host.
- SSH-to-localhost requires the operator to provision an extra key pair, complicates Docker-Compose installs, and reuses code that's overkill for a same-machine install.
- A container coexists with the operator's manual `cloudflared.service` (different process, different namespace) without conflict.
- Cloudflare officially supports running cloudflared from `cloudflare/cloudflared` image.

Container name `dokploy-tunnel` cannot collide with the operator's manual systemd unit (`cloudflared.service`); they are different process spaces.

### Schema: new `localServer` table per org

A new Drizzle table `localServer` with one row per `organizationId`:

```text
localServerId          text PK
organizationId         text FK → organization.id  (unique)
tunnelStatus           enum (disabled|provisioning|installing|registering|healthy|error)
tunnelId               text
tunnelToken            text
tunnelAccountId        text
tunnelError            text
tunnelCheckedAt        text
createdAt              text
```

A row is created lazily on first "Setup Local Tunnel" click. No row = "Not configured".

Rejected alternatives:
- **Extend `webServerSettings`:** singleton — doesn't scale to multi-org and conflates installation-level identity with org-level resources.
- **Extend `organization`:** pollutes the better-auth schema with infra concerns.
- **Add `kind: "local"` row to `server` table:** would need fake SSH credentials to itself (explicitly out per the request).

### Orchestrator abstraction: `TunnelHost`

Refactor the orchestrator's "find tunnel for service" to return a tagged union:

```ts
type TunnelHost =
  | { kind: "remote"; server: Server }
  | { kind: "local"; localServer: LocalServer };
```

`findTunnelHostForService(service)` consults `service.serverId`:
- If set: load the `Server` row.
- If null: load the org's `localServer` row. If absent or `tunnelStatus !== "healthy"`, throw `TRPCError({ code: "FAILED_PRECONDITION", message: "LOCAL_TUNNEL_NOT_CONFIGURED" })`.

All call sites that previously read `server.tunnelId` / `server.tunnelAccountId` go through small accessors on `TunnelHost` so the call sites don't branch.

### CNAME override: PATCH semantics

Today `syncDomain` calls `createDnsRecord`. When a CNAME already exists on the same name (e.g., user's `reg.8u9yhy8fewf.org` pointing at a hand-managed tunnel UUID), creation fails. The new behavior:

1. Look up existing record by name.
2. PUT tunnel ingress to the new tunnel BEFORE the swap (so traffic flips when DNS lands).
3. If a record exists with different content: `PATCH` it (`content` -> `<newTunnelId>.cfargotunnel.com`, `comment` -> `"Managed by Dokploy"`, `proxied` true).
4. If no record exists: `POST` (existing behavior).
5. On failure between steps 2-4: leave the existing record intact (no destructive cleanup).

The existing `renameDomainHost` brief-overlap rename already works for hostname changes; only the existing-CNAME-on-same-name case needs the new PATCH path.

### UI: new "Local Tunnel" section

New `<LocalTunnelSection />` rendered inside `show-cloudflare.tsx` next to the zone list:

- Status badge mirroring `<TunnelStatusBadge />`: `Not configured` / `Provisioning` / `Healthy` / `Error`.
- "Setup Local Tunnel" button when not configured. On click: open small dialog with optional account picker (auto-selected when zones disambiguate it) and confirm.
- When configured: show tunnel name + account name + Reinstall / Reconcile / Disable.
- Account picker reuses the `pickTunnelAccount` derivation helper added in the multi-account work (`packages/server/src/utils/cloudflare/pick-tunnel-account.ts`).

Rejected alternative: surface the panel host in Remote Servers list with "Local" badge. Per request, keeping `kind: "local"` distinct, and Settings → Cloudflare is the natural home since this is CF-integration plumbing.

### Domain dialog: typed error

`createDomain` and `updateDomain` mutations propagate `LOCAL_TUNNEL_NOT_CONFIGURED` as a typed error code. The Add Domain dialog catches it and renders inline:

> Cloudflare-managed domains for services on this panel host need a local tunnel. Set one up in **Settings → Cloudflare → Local Tunnel**.

This replaces the silent `pending` state.

## Components affected

| Layer | File | Change |
|---|---|---|
| schema | `packages/server/src/db/schema/local-server.ts` (new) | new table + Zod schemas |
| schema | `packages/server/src/db/schema/index.ts` | export |
| services | `packages/server/src/services/local-server.ts` (new) | CRUD + status helpers |
| installer | `packages/server/src/setup/cloudflare-local-tunnel-setup.ts` (new) | dockerode-based install/uninstall |
| orchestrator | `packages/server/src/services/cloudflare/orchestrator.ts` | TunnelHost abstraction, local path, PATCH override |
| router | `apps/dokploy/server/api/routers/cloudflare.ts` | `getLocalTunnel`, `provisionLocalTunnel`, `reconcileLocalTunnel`, `deprovisionLocalTunnel` |
| router | `apps/dokploy/server/api/routers/domain.ts` | propagate typed error |
| ui | `apps/dokploy/components/dashboard/settings/cloudflare/local-tunnel-section.tsx` (new) | section component |
| ui | `apps/dokploy/components/dashboard/settings/cloudflare/show-cloudflare.tsx` | mount new section |
| ui | `apps/dokploy/components/dashboard/application/domains/handle-domain.tsx` (or equivalent) | inline error |

## Testing

- **Unit:** `findTunnelHostForService` returns `{kind:"local", localServer}` when `serverId === null` and a healthy local tunnel exists; throws `LOCAL_TUNNEL_NOT_CONFIGURED` otherwise; returns `{kind:"remote", server}` when `serverId` is set.
- **Unit:** `pickTunnelAccount` integration with local tunnel provisioning (existing helper, just verify call sites).
- **Integration:** sync a CF-managed domain on a panel-host service → asserts CF API called with the local tunnel ID, CNAME POSTed, ingress PUT.
- **Integration:** sync a domain whose CNAME already exists with a different content → asserts PATCH (not DELETE+CREATE), old tunnel UUID is gone from the record after the call.
- **Integration:** no local tunnel → tRPC mutation returns `FAILED_PRECONDITION` with message `LOCAL_TUNNEL_NOT_CONFIGURED`.
- **Manual E2E (operator checklist in PR description):**
  1. Configure CF token + zone (multi-account).
  2. Setup Local Tunnel from CF settings.
  3. Verify tunnel landed in correct account (matches zone).
  4. Add CF-managed domain `regtest.<zone>` (port 5000) on Docker Registry compose service → external HTTPS hit returns registry response (HTTP 401 on `/v2/` is the up-signal).
  5. Switch existing manual `reg.<zone>` to CF-managed (override-conflict prompt) → CNAME swaps atomically → external HTTPS still returns registry response without a noticeable error window.

## Risks / open questions

- **Container `network_mode: host` on macOS / Docker Desktop:** behaves differently than Linux. Self-hosted production targets are Linux, so we accept this. Document in the PR.
- **`cloudflared` image pull on first run** can be slow on cold hosts. Stream pull progress through the same channel as the existing remote installer's `onData` callback.
- **Multi-org systemd-style isolation:** when multiple orgs install local tunnels on the same panel host, they each get their own container (`dokploy-tunnel-<orgSlug>` if an org slug is available; otherwise `dokploy-tunnel-<localServerId-prefix>`). v1 ships with a single `dokploy-tunnel` container per panel — multi-org panels are vanishingly rare in self-hosted; revisit if it comes up.
- **Token rotation:** if the tunnel token changes (e.g., user clicks Reinstall), the installer recreates the container with the new token. This is destructive (brief downtime) but expected.
