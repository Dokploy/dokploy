# Cloudflare multi-account integration

**Date:** 2026-05-03
**Status:** Approved (ready for implementation plan)

## Problem

Today, the Cloudflare integration assumes one Cloudflare account per API token. When a token has access to multiple accounts (e.g. a personal account + a business account), `verifyToken` reads only the first account from `/accounts` and stores it as `cloudflare_config.accountId`. Tunnels are then created in that single account, regardless of which account a zone belongs to.

When a user adds a zone from account B but the tunnel was created in account A, the resulting CNAME `<host> → <tunnelId>.cfargotunnel.com` is rejected by Cloudflare with HTTP 530 / error 1033, because `cfargotunnel.com` only resolves when the zone and the tunnel share an account.

## Goal

Make the integration account-aware end-to-end so the orchestrator never creates a tunnel in the wrong account, and so domain creation fails fast (with a useful message) when a zone-to-tunnel mismatch is unavoidable.

## Non-goals

- **Auto-repair of already-broken tunnels.** This spec detects and surfaces the mismatch in the UI; the actual swap (recreate tunnel in the correct account, repoint CNAMEs, delete orphan) is a follow-up PR.
- **Per-Domain DNS health check (post-sync HEAD probe surfacing 1033/530).** Separate PR.
- **Two-way reconcile** (compare CF actual state vs DB and push the diff). This spec renames the misleading "Reconcile" action to "Push to Cloudflare" but does not upgrade its behavior.
- **Multi-token / one-config-per-account model.** We chose 1 config per org with N accounts. Revisit only if a customer needs distinct tokens per account.
- **Removing the stale `--credentials-file` flag in `dokploy-tunnel.service`.** Current `cloudflare-tunnel-setup.ts:117` only emits `--token`. Skip unless reproduced on a real box.

## Data model

### `cloudflare_config`

- **Drop** `accountId` (text), `accountName` (text).
- **Add** `accounts` (jsonb, not null, default `'[]'::jsonb`) — array of `{ id: string, name: string }`.
- All other columns unchanged.

### `cloudflare_zone`

No change. The existing `accountId` column captures which account each zone belongs to (returned by Cloudflare's `/zones` response).

### `server`

- **Add** `tunnelAccountId` (text, nullable). Set when the tunnel is provisioned. Always equals the Cloudflare account the tunnel was actually created in.

We deliberately do **not** add a separate "user-chosen tunnel account" column. The picker on the server-creation form lives in client-side form state until `provisionServerTunnel` runs, at which point the chosen value is persisted as `tunnelAccountId`. One column, one source of truth.

## Migration

Pure SQL, runs in the standard `apps/dokploy/migration.ts` boot path. No Cloudflare API calls, no user prompts.

1. Add `cloudflare_config.accounts jsonb not null default '[]'::jsonb`.
2. Backfill: for every row where `account_id IS NOT NULL`,
   ```sql
   UPDATE cloudflare_config
   SET accounts = jsonb_build_array(
       jsonb_build_object(
           'id', account_id,
           'name', COALESCE(account_name, account_id)
       )
   );
   ```
3. Add `server.tunnel_account_id text`.
4. Backfill via join — the old singular `account_id` is exactly where each existing tunnel was created:
   ```sql
   UPDATE server s
   SET tunnel_account_id = c.account_id
   FROM cloudflare_config c
   WHERE s.organization_id = c.organization_id
     AND s.tunnel_id IS NOT NULL;
   ```
5. Drop `cloudflare_config.account_id` and `cloudflare_config.account_name`.

This is correct by construction: the existing field's value is the only account the legacy code knew about, so it must be where the tunnel lives. After the backfill, mismatches between `server.tunnelAccountId` and any of the org's zones are surfaced by the new mismatch warning (see UI section).

## Service layer (`packages/server/src/services/cloudflare/index.ts`)

### `verifyToken(token)`

- **Before:** returns `{ accountId, accountName, scopes }`. Internally calls `/accounts?per_page=1` and takes the first.
- **After:** returns `{ accounts: [{id, name}], scopes }`. Pages through `/accounts` (Cloudflare returns up to 50/page) using the same loop pattern as `listZones`.

### Other CF service functions

No signature changes. `createTunnel(token, accountId, name)`, `getTunnel(token, accountId, id)`, `updateIngress(token, accountId, tunnelId, ingress)` already take `accountId` as a parameter — only the *callers* (orchestrator) change which value they pass.

The DNS endpoint (`/zones/{zoneId}/dns_records`) is account-implicit (Cloudflare resolves the account from the zone), so `createDnsRecord(token, zoneId, …)` also stays as-is.

## Orchestrator account-selection

### `provisionServerTunnel(serverId)`

New logic for picking the account to create the tunnel in:

1. If `server.tunnelAccountId` is already set (e.g. by the picker at server creation), use it.
2. Else if `config.accounts.length === 1`, use that account.
3. Else if `config.accounts.length > 1`:
   - If all of the org's enabled zones live in one account, use that account.
   - If zones span accounts, throw `TRPCError({ code: "BAD_REQUEST", message: "Org has zones in multiple Cloudflare accounts. Set the server's Cloudflare account explicitly before provisioning the tunnel." })`.

The chosen ID is passed to `createTunnel`, `getTunnel`, `updateIngress` and persisted to `server.tunnelAccountId`.

### `syncDomain(domainId)` — pre-flight check

Before pushing the CNAME, verify zone-to-tunnel account match:

```ts
if (zone.accountId !== server.tunnelAccountId) {
    throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cannot route ${zone.zoneName} via ${server.name}: zone is in Cloudflare account ${zone.accountId}, server's tunnel is in ${server.tunnelAccountId}.`,
    });
}
```

### `reconcileServer(serverId)` (renamed; see router section)

Same pre-flight check applied per-domain. Skips and logs a warning for any domain whose zone account doesn't match the tunnel; does not fail the whole reconcile.

## tRPC router (`apps/dokploy/server/api/routers/cloudflare.ts`)

- `verifyToken` — return `accounts: [{id, name}]` instead of singular.
- `saveToken` — persist the `accounts` array.
- `listAvailableZones` — unchanged (already returns each zone's `account.id`/`account.name`).
- `addZones` — unchanged (already inserts per-zone `accountId`).
- **New:** `getServerTunnelAccountChoice(input: { serverId? })` → `{ candidate: string | null, ambiguous: boolean, accounts: [{id, name}] }`. Used by the server-creation form to decide whether to show the picker. Auto-derive logic mirrors the orchestrator: single account → candidate; multi-account, single zone-account → candidate; multi-zone-account → `ambiguous: true`.
- **Rename:** `reconcileAllServersForOrg` / `reconcileServer` → `pushToCloudflareForOrg` / `pushToCloudflareForServer`. Procedure names, button labels, and tooltips all change.

## UI

1. **Cloudflare settings page** (`show-cloudflare.tsx`, `cloudflare-config-form.tsx`) — after token verify, render the list of accessible accounts as read-only chips (e.g. `Davfab16's Account · 1a2b…`). Visibility only; no selection here.

2. **Add Zone dialog** (`cloudflare-zone-list.tsx`) — group the available-zones list by account name. Each row shows `zone.example.com · Account name`.

3. **Server creation form** — new conditional field "Cloudflare account":
   - Hidden when `getServerTunnelAccountChoice` returns a non-ambiguous candidate.
   - Required when `ambiguous: true`.
   - Default value is the candidate; options are `config.accounts`.

4. **Server card** — small badge showing the bound CF account when `tunnelAccountId` is set. When any of the server's CF-managed domains has `zone.accountId !== server.tunnelAccountId`, render an `AlertBlock` warning: *"Tunnel is in account X but domain Y's zone is in account Z. Requests to Y will return Cloudflare error 1033. (Repair flow coming soon.)"* Read-only — no fix button this PR.

5. **Domain create flow** — the pre-flight check is server-side in `syncDomain`. The client surfaces the `TRPCError` via the existing toast error path; no new component.

## Testing

### Vitest unit (`apps/dokploy/__test__/cloudflare/`)

- `account-derivation.test.ts` — table-driven over the auto-derive logic:
  - 1 account in config → returns it.
  - 2 accounts, all zones in one → returns that one.
  - 2 accounts, zones span both → `{ ambiguous: true }`.
  - 0 zones added yet, 1 account → returns it.
  - 0 zones added, 2 accounts → ambiguous.
- `pre-flight.test.ts` — `syncDomain` rejects on zone/tunnel account mismatch; happy path passes.
- `migration.test.ts` — applies the migration to a fixture DB with one legacy `cloudflare_config` row and one server with a tunnel; asserts `accounts` jsonb has one entry and `server.tunnelAccountId` is set.

CF API calls are stubbed at the fetch boundary. We do not mock the database — fixture DBs only.

### Manual test plan (before opening PR), against a real multi-account token

1. Verify token → settings page shows both accounts as chips.
2. Add a zone from each account → both appear, grouped by account name.
3. Create a server on a fresh box, single-account org → no picker shown, tunnel lands in the right account, `account_tag` from `getTunnel` matches.
4. Add a Cloudflare-managed domain → CNAME created → `curl https://<host>` returns the origin response (NOT 1033/530).
5. Add a second zone from the other account → existing server card shows the mismatch warning for the domain that would be broken.
6. Create a second server with the picker required → pick account B explicitly → tunnel lands in B → domain on a B-zone routes correctly.
