# Design: SSO Forward Auth for Deployed Applications (Enterprise)

**Status:** Approved for implementation (v1) — branch `feat/forward-auth-sso`
**Author:** Engineering
**Date:** 2026-05
**Audience:** Internal + enterprise customer requesting the feature

## Decisions locked for v1

- **Auth gate:** Option A — integrate `oauth2-proxy` (do not build our own auth server).
- **OIDC source:** reuse the existing `sso_provider` table (read-only from this feature).
- **Auth domain per server, modeled as a `domains` row:** because each server is an isolated swarm
  with its own proxy (§6.1), each server has its **own** auth domain (e.g. `auth-prod.acme.com`)
  hosting that server's single oauth2 callback, registered **once** in the IdP per server. The auth
  domain is a row in the existing `domains` table with `domainType: "forwardAuth"` and a `serverId`
  (null = local host) — so it **inherits certificates, TLS and the domain pipeline** like any app
  domain, instead of a separate settings table. There is no `forward_auth_settings` table.
- **`domains.forwardAuthProviderId`** (FK → `sso_provider.providerId`, `ON DELETE set null`) marks an
  **app** domain as protected by a provider; deleting the provider auto-unprotects the domain. This
  is distinct from the `forwardAuth` domain row, which is the gate itself.
- **Why per-server (not one global auth domain):** a single `auth.acme.com` would resolve (DNS) to
  one server only, and the forwardAuth check runs over each server's *internal* network — a remote
  server can't reach another server's proxy without exposing it publicly. Per-server keeps every
  server autonomous (local forwardAuth, no cross-server traffic). The cost is one IdP callback per
  server, which is acceptable.
- **Shared base domain assumption:** the auth domain and the protected apps on a server share a
  base domain, so the session cookie (scoped to `baseDomain`) works across that server's apps. Apps
  outside that base are out of scope for v1.
- **Client secret at rest:** **deferred** — the `clientSecret` stays unencrypted in `oidcConfig`
  for v1 (same as today). Tracked as security debt in §10.
- **oauth2-proxy quirks handled:** `--insecure-oidc-allow-unverified-email` (many IdPs send
  `email_verified=false` → otherwise a 500), and `whitelist-domains = baseDomain` (oauth2-proxy
  has no universal wildcard; the base domain covers every app under it).

---

## 1. Problem statement

An enterprise customer wants to place an **SSO authentication gate in front of each deployed
application** (the apps/compose services that Dokploy publishes through Traefik), so that an
unauthenticated visitor must log in against the company's IdP (OIDC) before reaching the app.
This should be an **enterprise-only** feature, and ideally should reuse the OIDC information we
already store.

In short: *"Can we sit an SSO layer between Traefik and each application, reusing the OIDC
tables?"*

**Answer: yes, it's feasible.** Traefik supports this natively via the `forwardAuth`
middleware. The hard part is not Traefik — it's the **auth proxy service** that performs the
OIDC flow. This doc compares the two viable ways to build that service, and confirms what we
can and cannot reuse from the existing SSO tables.

---

## 2. Critical clarification: what our OIDC data actually is

The existing `sso_provider` table
([`packages/server/src/db/schema/sso.ts:7`](../../packages/server/src/db/schema/sso.ts#L7))
is owned by the **better-auth SSO plugin**. It exists so that **users can log into the Dokploy
dashboard** against an external IdP (Dokploy acts as an OIDC/SAML *client*).

It stores, as JSON text columns:

- `oidcConfig` — `clientId`, `clientSecret`, `authorizationEndpoint`, `tokenEndpoint`,
  `userInfoEndpoint`, `jwksEndpoint`, `discoveryEndpoint`, `scopes`, `pkce`, and a `mapping`
  for user fields.
- `samlConfig` — full SAML SP/IdP metadata.
- `issuer`, `providerId` (unique), `domain`, `organizationId`, `userId`.

> ⚠️ Important security note: the `clientSecret` lives **inside the `oidcConfig` text column as
> plain JSON and is not encrypted at rest** in the schema. Reusing this data for a second
> purpose (see §4) means that secret gets read and re-injected into another service's config.
> That widens its blast radius and must be called out to the customer. If we reuse it we should
> seriously consider encrypting it at rest as part of this work.

**Key point for the customer:** this data describes Dokploy-as-an-OIDC-client. To protect their
*applications*, we need a separate component (an auth proxy) that runs the OIDC
**authorization-code flow on behalf of the protected app** — handle login redirect, callback,
token validation, session cookie, and logout. better-auth's SSO plugin does **not** do this for
third-party apps behind Traefik; it only logs users into Dokploy itself.

So "reuse the OIDC tables" is possible at the level of **credentials/endpoints** (clientId,
secret, issuer, scopes), but the *runtime behavior* (the actual SSO gate) is net-new regardless
of approach.

---

## 3. How the Traefik side works (the easy half)

Traefik's [`forwardAuth`](https://doc.traefik.io/traefik/middlewares/http/forwardauth/)
middleware delegates the auth decision to an external HTTP service. For every request Traefik
calls `address`; a `2xx` lets the request through (optionally copying `authResponseHeaders`
back to the app), anything else (typically a `302` to the IdP) is returned to the browser.

Dokploy already has everything needed to wire this up:

| Capability | Where it lives today | Reuse |
| --- | --- | --- |
| `ForwardAuthMiddleware` Traefik type | [`utils/traefik/file-types.ts:659`](../../packages/server/src/utils/traefik/file-types.ts#L659) (`address`, `tls`, `trustForwardHeader`, `authResponseHeaders`, `authRequestHeaders`) | ✅ as-is |
| Per-domain middleware chain | `domains.middlewares: text[]` column ([`db/schema/domain.ts`](../../packages/server/src/db/schema/domain.ts)) — already exists and is applied | ✅ as-is |
| Attaching middleware to a router | `createDomainLabels()` joins `domain.middlewares` into `traefik.http.routers.<name>.middlewares` ([`utils/docker/domain.ts:255`](../../packages/server/src/utils/docker/domain.ts#L255)) | ✅ as-is |
| Writing dynamic middleware YAML | `createSecurityMiddleware()` / `writeMiddleware()` pattern, local + remote(SSH) ([`utils/traefik/security.ts`](../../packages/server/src/utils/traefik/security.ts), [`middleware.ts`](../../packages/server/src/utils/traefik/middleware.ts)) | ✅ as pattern |
| Deploying a helper container/service on the swarm | `dokploy-redis` / `dokploy-monitoring` / `dokploy-traefik` setup ([`setup/redis-setup.ts`](../../packages/server/src/setup/redis-setup.ts), [`monitoring-setup.ts`](../../packages/server/src/setup/monitoring-setup.ts), [`traefik-setup.ts`](../../packages/server/src/setup/traefik-setup.ts)) on `dokploy-network` | ✅ as pattern |
| Enterprise gating | `enterpriseProcedure` + `hasValidLicense()` ([`server/api/trpc.ts:216`](../../apps/dokploy/server/api/trpc.ts#L216), [`services/proprietary/license-key.ts`](../../packages/server/src/services/proprietary/license-key.ts)) | ✅ as-is |

So the Dokploy-side glue (UI toggle on a domain → write a `forwardAuth` middleware → append its
name to `domains.middlewares` → reload Traefik) is **small and low-risk**. The variable is the
auth service that `address` points to.

---

## 4. The decision: where does the auth flow run?

This is the real fork. Both options use the *same* Traefik `forwardAuth` wiring from §3; they
differ in what sits behind `address`.

### Option A — Integrate an existing forward-auth proxy (oauth2-proxy)

Deploy a battle-tested proxy (e.g. [oauth2-proxy](https://github.com/oauth2-proxy/oauth2-proxy)
or `traefik-forward-auth`) as a Dokploy-managed Docker service, configured from the OIDC
credentials. Dokploy generates the proxy config + the Traefik middleware; the proxy owns the
OIDC flow, sessions, and cookies.

**Pros**
- The security-critical part (OIDC flow, session/cookie handling, token refresh, logout, CSRF/
  state) is mature, audited, and maintained externally.
- We write **config + deployment glue**, not an auth server. Far less code.
- oauth2-proxy supports OIDC discovery, header injection, allowed-domains/groups, and Traefik
  forwardAuth mode out of the box.
- Deployment follows an existing pattern (`dokploy-monitoring`/`dokploy-redis` style services
  on `dokploy-network`, local + remote via `serverId`).

**Cons**
- A new bundled image to ship, version, and update across self-hosted + remote servers.
- Per-org (or per-app) proxy instance + a session store (cookie-based or Redis) to manage.
- Less branding control (login is the IdP's; the proxy is mostly invisible, which is usually
  fine).
- Mapping our `oidcConfig` JSON → oauth2-proxy env/flags is a translation layer we must own and
  keep correct as configs vary (PKCE, custom endpoints, skipDiscovery, etc.).

### Option B — Build our own forward-auth service

Write a small Dokploy auth service that implements the OIDC authorization-code flow itself and
answers Traefik's forwardAuth calls.

**Pros**
- Full control over UX/branding, session model, and how it integrates with Dokploy
  orgs/permissions.
- One codebase we fully understand; no third-party image to track.
- Could share types/utilities with the rest of `packages/server`.

**Cons**
- We are now building and **owning an authentication service** — sessions, signed/encrypted
  cookies, CSRF/state/nonce, token validation against JWKS, refresh, logout, clock-skew, replay
  protection. This is a large, security-sensitive surface that is easy to get subtly wrong.
- The earlier "~200 LOC service" estimate is unrealistic; a correct implementation is
  substantially more, plus ongoing security maintenance.
- We carry the liability for any auth bug in front of customer apps.

### Recommendation

**Option A (integrate oauth2-proxy).** The Traefik wiring is identical either way, so the only
thing we're really choosing is whether to *own an auth server*. For a feature that gates access
to customer production apps, delegating the auth flow to a mature project is the lower-risk,
lower-cost, faster path. Build our own only if a hard requirement (deep branding, an unusual
session model, air-gapped constraints) makes oauth2-proxy unworkable — none is evident yet.

---

## 5. Reusing `sso_provider` (per your decision)

You chose to **reuse the existing `sso_provider` OIDC config** rather than add an independent
table. That's workable and minimizes setup for the customer, with these caveats to design
around:

1. **Semantic coupling.** `sso_provider` currently means "how Dokploy users log into the
   dashboard." Reusing it for "how app visitors authenticate" overloads it. The IdP/client may
   legitimately need to differ (different OIDC client, different allowed audience, different
   redirect URIs — the app's callback, not Dokploy's). Mitigation: treat `sso_provider` as the
   *source of issuer + base credentials*, and add a thin per-domain config (which provider,
   plus app-specific redirect/allowed-groups) rather than assuming a 1:1 reuse.
2. **Redirect URIs.** Each protected app needs its callback registered at the IdP
   (e.g. `https://app.customer.com/oauth2/callback`). The dashboard login uses Dokploy's own
   callback. The customer must add the app callbacks to the same OIDC client, or use a
   dedicated client. Document this clearly.
3. **Secret handling.** As noted in §2, reading `clientSecret` out of `oidcConfig` and injecting
   it into oauth2-proxy means that secret now lives in a second place (proxy config/env on the
   target server). Recommend encrypting `oidcConfig` at rest and passing the secret to the proxy
   via a Docker secret / file mount rather than a plain env var.
4. **better-auth ownership.** `register` currently round-trips through `auth.registerSSOProvider()`
   ([`sso.ts:251`](../../apps/dokploy/server/api/routers/proprietary/sso.ts#L251)); rows may be
   written by an external auth service. We should **read** from `sso_provider` for forward-auth,
   but avoid mutating it through the forward-auth feature to prevent fighting better-auth over
   the same rows.

---

## 6. Proposed architecture (Option A)

```
                                         ┌───────────────────────────┐
  Browser ──HTTPS──▶  Traefik  ──forwardAuth──▶  oauth2-proxy (dokploy-managed)
                       │  router for app.customer.com        │
                       │   middlewares=[sso-<provider>]       │  OIDC auth-code flow
                       │                                      ▼
                       │                              Customer IdP (OIDC)
                       │                                      │
                       ◀───── 2xx + X-Auth-* headers ─────────┘
                       │
                       ▼
                 Deployed application
```

**New/changed pieces (all enterprise-gated):**

1. **Helper service deployment** — a `dokploy-forward-auth` (oauth2-proxy) Docker service per
   org (or per server), modeled on `monitoring-setup.ts` / `redis-setup.ts`, attached to
   `dokploy-network`, supporting local + remote (`serverId`). Config derived from the chosen
   `sso_provider.oidcConfig`.
2. **Traefik middleware generation** — a `createForwardAuthMiddleware()` following the
   `security.ts` pattern: write a `forwardAuth` entry (using `ForwardAuthMiddleware` from
   `file-types.ts`) to the dynamic middlewares file, `address` pointing at the helper service,
   with `authResponseHeaders` for the user identity headers.
3. **Domain wiring** — UI toggle "Protect with SSO" on a domain + a field to pick the provider;
   appends the middleware name to the existing `domains.middlewares[]` and reloads Traefik. No
   schema change strictly required for the chain itself; a small column or join is needed to
   record *which* provider protects a domain.
4. **tRPC router** — `forward-auth` router under `routers/proprietary/`, all `enterpriseProcedure`,
   with enable/disable-on-domain mutations.

---

### 6.1. Remote servers: one proxy per server

This is forced by Dokploy's networking model, not a design preference:

- **Each remote server is its own isolated Docker Swarm** (`docker swarm init` per server,
  [`server-setup.ts:381`](../../packages/server/src/setup/server-setup.ts#L381)).
- **`dokploy-network` is an overlay local to each server's swarm**
  ([`server-setup.ts:438`](../../packages/server/src/setup/server-setup.ts#L438)) — it does
  **not** span servers. A container on the Dokploy host cannot reach a container on a remote
  server over `dokploy-network`.
- **Each server runs its own Traefik** ([`traefik-setup.ts:120`](../../packages/server/src/setup/traefik-setup.ts#L120));
  it only routes to services on that same server.

Therefore Traefik on server A can only `forwardAuth` to a proxy that lives **on server A**. The
deployment model is **one `dokploy-forward-auth` instance per server** (host + each remote),
exactly mirroring how `dokploy-monitoring` is already deployed per server via
`getRemoteDocker(serverId)` ([`monitoring-setup.ts:10`](../../packages/server/src/setup/monitoring-setup.ts#L10)).
One instance per server still protects *all* apps on that server (multi-upstream), so it is not
one-per-app.

```
Dokploy host:      dokploy-forward-auth   → protects local apps
Remote server A:   dokploy-forward-auth   → protects A's apps
Remote server B:   dokploy-forward-auth   → protects B's apps
```

**Session scope (v1 = isolated per server):** because oauth2-proxy sessions are cookie-based per
instance, a user moving between an app on server A and an app on server B may re-authenticate.
v1 accepts this. To enable shared SSO later, point all instances at a common cookie domain and
the same `cookie-secret`; v1 stores these in a structured config so flipping to shared mode is
config-only, not a refactor.

**Lifecycle:** deploy/update the proxy per server during the `serverSetup` flow
([`server-setup.ts:47`](../../packages/server/src/setup/server-setup.ts#L47)) and/or lazily the
first time a domain on that server is protected.

### 6.2. Auth domain per server (the low-friction model)

The first iteration used a per-app callback (`https://app/oauth2/callback`), which meant: register
a callback in the IdP **per app**, and update the proxy whitelist (a `service.update`) on every
new protected domain. Too manual.

v1 uses **one auth domain per server** (each server is autonomous — §6.1):

```
Per server (e.g. "Production"):
1. Admin sets "auth-prod.acme.com" for that server in SSO settings (once).
   → a Traefik router  auth-prod.acme.com/oauth2/*  → that server's oauth2-proxy
   → ONE callback to register in the IdP:  https://auth-prod.acme.com/oauth2/callback

2. app1.acme.com on Production (SSO enabled):
   - no session → forwardAuth 401 → errors middleware 302s the browser to
     https://auth-prod.acme.com/oauth2/sign_in?rd=<app1 url>
   - login at IdP → returns to auth-prod.acme.com/oauth2/callback (the one registered)
   - cookie scoped to .acme.com → redirect back to app1.acme.com ✅

3. app2.acme.com, app3.acme.com on the same server:
   - same flow, same callback, same cookie. ZERO new IdP config, ZERO proxy redeploy. ✅
```

Why it removes both pain points (within a server):
- **One IdP callback per server:** the redirect_uri is always that server's
  `auth-<server>.acme.com/oauth2/callback`, configured once per server.
- **No per-app redeploy:** cookie + whitelist are scoped to `baseDomain`, which already covers any
  new subdomain on that server.

Wiring summary:
- `forward_auth_settings`, unique per `(organizationId, serverId)`: `authDomain`, `baseDomain`
  (derived, e.g. `.acme.com`), `https`. `serverId = null` = local host.
- Proxy env (per server): `redirect-url = <scheme>://authDomain/oauth2/callback`,
  `cookie-domains = baseDomain`, `whitelist-domains = baseDomain`, per-server `cookie-secret`.
- Traefik: a dedicated `forward-auth-domain.yml` router for `authDomain/oauth2/*` → proxy on that
  server; each protected app gets a `forwardAuth` + an `errors` middleware that 302s to its
  server's auth domain login. The middleware resolves which auth domain to use from the app's
  `serverId`.

Limitations (out of scope for v1):
- Apps **not** under their server's `baseDomain` won't get shared SSO (cross-domain cookies).
- SSO is **not** shared across servers (a user moving between apps on different servers logs in
  again). True cross-server SSO would require exposing one proxy publicly for cross-server
  forwardAuth — deliberately avoided for autonomy/latency.

## 7. Open questions for the customer / product

- **Granularity:** protect per *domain*, per *application*, or per *project/environment*?
- **Session scope:** single sign-on shared across all protected apps on a base domain, or
  isolated per app? (Affects cookie domain + whether one proxy instance is shared.)
- **Authorization, not just authentication:** do they need group/role-based allow rules
  (e.g. only `group=engineering`), or is "any authenticated user from the IdP" enough?
- **Remote servers:** must this work on remote (SSH-managed) servers from day one, or
  local/Dokploy-host only for v1?
- **Logout / session lifetime** expectations.
- **Dedicated OIDC client** for app protection vs reusing the dashboard-login client.

---

## 8. Effort estimate (Option A, design-validated)

Assumes oauth2-proxy, reuse of `sso_provider`, local + remote support, one provider per domain.

| Workstream | Rough effort |
| --- | --- |
| Helper service deploy (image choice, setup module, local+remote, lifecycle) | 3–5 d |
| OIDC config → proxy config translation layer (incl. secret handling) | 2–3 d |
| `createForwardAuthMiddleware()` + dynamic file write/reload (local+remote) | 2–3 d |
| Domain wiring + provider linkage (schema touch, labels, enable/disable) | 2–3 d |
| tRPC router + UI (toggle, provider select, status) | 2–3 d |
| Security review, encryption-at-rest for secret, testing | 3–4 d |
| **Total** | **~14–21 d** |

Option B (own auth service) is **meaningfully larger** — add the full auth-server build plus
ongoing security ownership; do not estimate it as a small delta over A.

---

## 9. Recommendation summary

- **Feasible: yes.** Traefik `forwardAuth` + Dokploy's existing middleware/deploy patterns make
  the integration straightforward.
- **Build the gate with oauth2-proxy (Option A)**, not a hand-rolled auth server.
- **Reuse `sso_provider` for credentials/endpoints**, but add a thin per-domain link and treat
  app callbacks/redirects as distinct from dashboard login. Client-secret encryption at rest is
  **deferred** (see §10).
- Gate everything behind `enterpriseProcedure` + valid license, consistent with existing SSO.
- Resolve the §7 product questions (granularity, authorization rules, remote-server scope)
  before committing to the estimate.

---

## 10. Security debt (deferred to a follow-up)

These are knowingly accepted for v1 and must be tracked, not forgotten:

1. **`clientSecret` unencrypted at rest.** `oidcConfig` (incl. `clientSecret`) remains plain
   JSON in the DB, as it is today. Reusing it for forward-auth propagates the secret to each
   server's proxy config. **Follow-up:** add encrypt/decrypt for `oidcConfig` and rotate.
2. **Secret transport to proxy.** Even in v1, pass `clientSecret` to oauth2-proxy via a Docker
   secret / mounted file, **not** a plain env var, to keep it out of `docker inspect` output.
3. **Trusted proxy.** Configure oauth2-proxy `--reverse-proxy=true` and restrict
   `--trusted-proxy-ip` to the Traefik instance so forwarded identity headers can't be spoofed
   by the upstream app or other containers.
4. **Cross-server shared session (deferred).** v1 is isolated per server (§6.1); shared SSO is a
   config flip later, not built now.
