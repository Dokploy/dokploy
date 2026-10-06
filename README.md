# Dokploy Community Edition

> **This is a community fork of [Dokploy](https://github.com/Dokploy/dokploy).** We are **not** affiliated with or competing against the Dokploy project. This fork exists to make new features available faster.

Based on **Dokploy v0.30.8** | Fork version **v0.30.8-community.5**

Everything in upstream Dokploy **v0.30.8**, plus **100+ community features and fixes** that haven't landed upstream yet — each one ported **1:1 with credit to its original author** — plus **fork-only security hardening**. When a fix exists as an open upstream PR or issue, we port it now instead of waiting for it to merge; when it merges upstream later, you lose nothing by switching back.

## Guides

- **[Integrations guide](https://dokploy-community.devino.ca/integrations/)** — set up Uptimely, Snapvisor, DoDomain, Sendly and Notifly
- **[FAQ](https://dokploy-community.devino.ca/faq/)** — install, migrate from Dokploy, MCP server for Claude Code, large deploy webhooks, DoDomain, uptime monitoring, telemetry

## Switching from official Dokploy

One command. Keeps every app, database, domain, and setting — the extra migrations are additive:

```bash
docker service update \
  --image ghcr.io/devinosolutions/dokploy-community:v0.30.8-community.5 \
  --with-registry-auth \
  dokploy
```

Going back to official is just as easy (our extra tables/columns are simply ignored):

```bash
docker service update --image dokploy/dokploy:v0.30.8 --with-registry-auth dokploy
```

The image is public — no registry login required.

## What's different

### Docker Network Management (fork original)

- New **Networks** page in the sidebar
- Create, delete, and manage Docker overlay networks
- Attach networks to any application or database service
- Per-resource network picker in the Advanced tab

https://github.com/user-attachments/assets/94134095-5601-4279-be2f-219734c8e199

### Remote MCP server with OAuth (fork original)

- Dokploy hosts its own **MCP server** at `POST /api/mcp` (Streamable HTTP) — Claude Code, Cursor or any MCP client connects over HTTPS with **no local process and no API key**
- **OAuth 2.1** with PKCE and dynamic client registration: `claude mcp add --transport http --scope user dokploy https://<host>/api/mcp`, then `/mcp → Authenticate` opens the browser and you sign in once
- **API-key alternative for automation fleets** — `POST /api/mcp` also accepts a Dokploy API key in the `x-api-key` header (`claude mcp add --transport http --scope user dokploy https://<host>/api/mcp --header "x-api-key: <key>"`), so dozens of unattended agent sessions never depend on one shared OAuth grant
- **Per-grant scopes** — a consent page with toggles for read, deploy, edit/delete services, edit/delete projects, backups and admin (delete and admin are off by default); role permissions still apply underneath
- **Long-lived, silently refreshed tokens** (30-day access / 365-day sliding refresh, env-tunable) shared by every session on the machine; revoke any client from Settings → Profile

### Build once, deploy by digest (fork original)

- **One builder for the whole organization** — with enforcement on, every GitHub-sourced application builds on the organization build server, pushes `<repository>:<sha>` to the organization registry, and updates the swarm service **by digest**, so CI can wait for that image instead of building a second copy of it
- **Escape hatches that leave a record** — per-application and per-compose exclusions, plus a one-shot "build locally once" grant written to an audit trail with actor, reason and timestamp, and spent by the next deploy
- **Required checks and coalescing** — a deploy can wait for named commit checks before it builds, and rapid pushes to the same unit collapse into a single deploy
- **Rollback by digest** — the last good image digest is stored, so a rollback re-deploys exactly the image that was running
- **Off by default** — with no policy configured for an organization, every code path is stock upstream behaviour

### Cloudflare integration

- Manage **Cloudflare credentials** directly in Dokploy
- Publish apps through **Cloudflare Tunnels** — no exposed ports required
- Gate services behind **Cloudflare Access** for zero-trust authentication

### Domains & networking

- **DoDomain custom-domain connect** — end users link their own domain through a hosted flow (Cloudflare OAuth, Domain Connect, or guided manual) and Dokploy verifies DNS and applies the domain automatically, powered by [DoDomain](https://dodomain.io): connect once in Settings → Integrations, then send a connect link from a domain's row in the Domains tab
- **Wildcard domain support** (`*.example.com`), with an optional wildcard-restriction setting to control who can use it
- **Per-server default domain** for auto-generated app domains — each server can hand out its own base domain
- Global **response-compression** toggle (Traefik compress middleware)
- Cross-service env references via <code>${&#123;service.&lt;name&gt;.fqdn}}</code>
- Configurable **MTU** for isolated networks, explicit `HostIp` on Traefik port bindings, and public-IP handling for `traefik.me` domains behind private IPs
- Custom certificate provider display and more reliable Traefik file-provider discovery

### Preview deployments, supercharged

- **Docker Compose preview deployments** — the most-requested unbuilt feature in upstream Dokploy ([#2028](https://github.com/Dokploy/dokploy/issues/2028)): a PR or MR spins up an **isolated copy of your entire compose stack** (own volumes, networks, and per-service preview domains), redeploys on update, and fully tears down on close
- **GitLab merge-request and Gitea/Forgejo pull-request previews** via webhook (in addition to GitHub) — for both applications and compose stacks
- **API-triggered previews** — spin up a preview deployment programmatically
- **Deterministic per-PR domains** using a `${prNumber}` template variable
- **Custom preview templates** so previews match your production topology
- **Duplicate-prevention** for concurrent webhook events and labeled PRs (with a one-time cleanup of existing duplicates)
- **Re-clone on rebuild** so new pushes to a PR actually propagate
- Build previews on a dedicated `buildServerId`, and don't block updates to existing previews when at the limit
- **Snapvisor integration** — visual-diff review status on preview deployments, powered by [Snapvisor](https://snapvisor.io): connect an account once in Settings → Integrations, then pick a Snapvisor project per application to see each preview's build status (pending, changes detected, approved, rejected) and jump straight to the review

### Backups & destinations

- **S3 encryption at rest** via rclone crypt — encrypt backups with obscured passwords before they ever leave the box
- **SFTP, FTP, and generic rclone** backup destinations, plus user-defined **S3 prefixes**
- Safer restores: 3-section sequential `pg_restore` to avoid OID race conditions, MongoDB **all-databases** backup, restore-button gating when the target service is down, and unlimited volume-backup retention
- Fixes for double-dumps, MongoDB gzip filename mismatches, replica-set preservation, and post-failure container restart

### Registries & deployments

- **AWS ECR** registry support and pulling images with **stored registry credentials**
- **Pre-deploy and post-deploy command hooks** for applications
- **Compose auto-rollback** — a failed `docker compose up` restores the last good compose file and `.env` and brings the previous release back up
- Deploy a **specific Docker image/tag** on demand, and **pull latest images** on Compose deploy
- Injected **`DOKPLOY_*` environment variables** and **git commit hash/message as build args** at deploy time
- "Deploy with Fresh Volumes" for Compose, dynamic railpack version fetching, and smarter build-cache invalidation on env changes

### Monitoring

- **Uptimely integration** — per-service uptime, SSL and domain monitors from the monitoring tab, powered by [Uptimely](https://getuptimely.com): connect once in Settings → Integrations, then opt each application, compose stack or database in from its Monitoring tab
- **Container resource breakdown** and **swap usage** in monitoring
- **Remote-server stats** via a server selector
- **Container healthcheck status** surfaced in the UI
- **Attach to a running container** to send input interactively

### Security hardening (fork only)

Beyond the ported features, this fork carries **7 direct security commits** and **13 ported hardening fixes**, including:

- **Command-injection** fixes for `customGitUrl`, mount-permission inputs, and shell-less rclone `obscure`
- **Secret redaction** — private keys kept out of build-failure notifications and logged command errors; webhook URLs masked by default
- **Permission gates** — service-permission checks on template loading, org-scoped assigned-server access, custom-role listing behind `member:read`, and validated admin invites
- **Webhook author authorization** — GitLab MR previews authorize the MR *author*, not the webhook actor, closing a preview-deployment bypass

### Also included

- **Notifications** — container crash-loop alerts, scheduled-job failure alerts, real server names in threshold alerts, and [Sendly](https://sendly.now) / [Notifly](https://notifly.io) provider channels
- **Git providers & auth** — GitHub/Google social login on self-hosted, self-hosted password reset, Codeberg preset, Gitea `write:repository` scope, and several OAuth/redirect fixes
- **Organizations & teams** — editable descriptions, bulk invitations, drag-and-drop logo upload, and **project export** to a portable JSON file
- **Per-project icons** — paste a URL or drag-and-drop an image onto any project; projects without one automatically show the **favicon of their first working domain**
- **Reliability** — clean exit on fatal startup errors instead of crash-looping, Podman idle-exec support, custom `template.toml` in git repos, and Docker/Ubuntu install-failure fixes
- **Longer login sessions** — sessions last 30 days (sliding) instead of upstream's 3, configurable via `DOKPLOY_SESSION_DAYS`
- **15+ UI/UX fixes** — deployments filtering and tab behavior, env-form edit stability, log-counter layout shift, responsive log pages, dark-theme icons, and new translations

Every item above is ported 1:1 and credited to its original upstream author. See the **[full release notes](https://github.com/DevinoSolutions/dokploy-community/releases/latest)** for the complete, per-PR credited list, migration details, and known caveats.

> Concurrent deployments — previously a fork-only feature — shipped natively in upstream Dokploy v0.29.11, so this fork now uses the official implementation.

### New in v0.30.8-community.5

**Security dependency sweep** ([#280](https://github.com/DevinoSolutions/dokploy-community/pull/280)): patched releases of next, nodemailer, hono, undici, the MCP SDK and about 40 transitive packages, plus gofiber in the monitoring agent. SCIM token generation now refuses providers that aren't bound to an organization (GHSA-j8v8-g9cx-5qf4).

> No database migration. The image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.8-community.4

**DoDomain webhook status is honest** ([#279](https://github.com/DevinoSolutions/dokploy-community/pull/279)): the Webhook row on the DoDomain card shows a green check only when the endpoint is registered and DoDomain can reach your panel. A panel on a private address (for example a Tailscale `*.ts.net` name) now shows a warning icon next to the existing explanation.

> No database migration. Merged on green CI; the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.8-community.3

**Integrations: logos, Learn more and fixes from a full end-to-end test** ([#273](https://github.com/DevinoSolutions/dokploy-community/pull/273), [#277](https://github.com/DevinoSolutions/dokploy-community/pull/277)):

- Uptimely, Snapvisor, DoDomain, Sendly and Notifly show their own logos, with a Learn more link. Uptimely's goes to the new [Dokploy × Uptimely page](https://getuptimely.com/integrations/dokploy).
- Monitor with Uptimely is disabled, with the reason, when a service has nothing to monitor. The Uptimely card shows the project name.
- Snapvisor errors stay in the dialog instead of a toast that disappears.
- DoDomain warns when your panel URL is private (for example a Tailscale `*.ts.net` name), because webhooks can't reach it. Re-verify DNS still works.
- Notifly errors are short and readable.

**Fixes for errors reported by other instances** ([#271](https://github.com/DevinoSolutions/dokploy-community/pull/271), [#272](https://github.com/DevinoSolutions/dokploy-community/pull/272)):

- The Traefik settings no longer error when Traefik has no published dashboard port or isn't on the host.
- The preview wildcard domain is validated when you save it.
- An expired GitLab token tells you to reconnect the provider.
- Volume backup failures include the real cause.
- The Requests page reads large access logs without running out of memory (port of [Dokploy/dokploy#4991](https://github.com/Dokploy/dokploy/pull/4991) by @Adriel2503).

**Upstream fixes ported ahead of their release**, each 1:1 with credit to its author:

- libsql validates the app name like the other databases ([#274](https://github.com/DevinoSolutions/dokploy-community/pull/274), [Dokploy/dokploy#5584](https://github.com/Dokploy/dokploy/pull/5584) by @cevheri).
- The terminal no longer collapses on zoom ([#275](https://github.com/DevinoSolutions/dokploy-community/pull/275), [Dokploy/dokploy#5582](https://github.com/Dokploy/dokploy/pull/5582) by @imrja8).
- Tooltips no longer stick over open dialogs on the remote servers page ([#276](https://github.com/DevinoSolutions/dokploy-community/pull/276), [Dokploy/dokploy#5575](https://github.com/Dokploy/dokploy/pull/5575) by @imrja8).

> No database migration. Merged on green CI; the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.8-community.2

**Clearer DoDomain setup and Deployments tab** ([#268](https://github.com/DevinoSolutions/dokploy-community/pull/268)):

- The DoDomain form checks each field when you leave it and shows the Base URL and secret key errors together. It links to your DoDomain dashboard and says that the App ID is filled in by Test connection.
- The Deployments tab shows short commit SHAs that you can click to copy, shows the error line on failed deployments, and explains how to deploy when there are none yet. The webhook buttons have labels.
- New FAQ answers cover large GitHub pushes and webhooks (up to 25 MB), connecting Claude Code over MCP, service status after saving provider settings, and DoDomain setup.

> No database migration. Merged on green CI; the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.8-community.1

**Upstream v0.30.8 sync** ([#259](https://github.com/DevinoSolutions/dokploy-community/pull/259)): upstream's only change is the Dokploy Cloud chat widget, so nothing changes for self-hosted installs.

**Upstream fixes ported ahead of their release**, each 1:1 with credit to its author:

- Session cookies are marked `Secure` when the dashboard is served over HTTPS ([#260](https://github.com/DevinoSolutions/dokploy-community/pull/260), from [Dokploy#5022](https://github.com/Dokploy/dokploy/pull/5022) by @Souvik-Cyclic)
- S3 credentials stay redacted in backup logs even when they contain quote characters ([#261](https://github.com/DevinoSolutions/dokploy-community/pull/261), from [Dokploy#5527](https://github.com/Dokploy/dokploy/pull/5527) by @Souvik-Cyclic)
- The deployment log tail is stopped when the browser disconnects early ([#262](https://github.com/DevinoSolutions/dokploy-community/pull/262), from [Dokploy#5529](https://github.com/Dokploy/dokploy/pull/5529) by @Souvik-Cyclic)
- Deploy webhooks accept payloads up to 25 MB ([#263](https://github.com/DevinoSolutions/dokploy-community/pull/263), from [Dokploy#5543](https://github.com/Dokploy/dokploy/pull/5543) by @Souvik-Cyclic)
- Saving a compose service's provider settings keeps its status ([#264](https://github.com/DevinoSolutions/dokploy-community/pull/264), from [Dokploy#5544](https://github.com/Dokploy/dokploy/pull/5544) by @roshanasingh4)
- Saving an application's provider settings keeps its status ([#265](https://github.com/DevinoSolutions/dokploy-community/pull/265), from [Dokploy#5455](https://github.com/Dokploy/dokploy/pull/5455) by @roshanasingh4)
- Host Block I/O stats count physical disks only ([#266](https://github.com/DevinoSolutions/dokploy-community/pull/266), from [Dokploy#5540](https://github.com/Dokploy/dokploy/pull/5540) by @Souvik-Cyclic)
- The add-invitation form keeps its input after a failed submit ([#267](https://github.com/DevinoSolutions/dokploy-community/pull/267), from [Dokploy#5498](https://github.com/Dokploy/dokploy/pull/5498) by @imrja8)

**DoDomain**: the base URL must use https; plain http is allowed only for localhost ([#258](https://github.com/DevinoSolutions/dokploy-community/pull/258)).

> No database migration. Merged on green CI; the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.7-community.11

**Sendly test emails arrive every time** ([#256](https://github.com/DevinoSolutions/dokploy-community/pull/256))

- Sendly accepts an email identical to one it already sent to the same recipient but never delivers it, so only the first **Test Notification** of a Sendly channel ever reached the inbox. Each test email now carries its send time, for example `Test Email (2026-10-03 19:06:09 UTC)`.

> Merged on green CI; the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.7-community.10

**Uptimely monitors check the right URL** ([#254](https://github.com/DevinoSolutions/dokploy-community/pull/254))

- Before creating monitors, the Uptimely panel checks each URL and shows what it returns. When one returns an error (for example a 404 at `/`), it warns that Uptimely will report it Offline.
- A new optional **Path to check** (for example `/health`) is added to every domain's monitor.
- The 30-day timeline now has per-day tooltips, a legend and a 30-day uptime percentage, and days without data look different from healthy days. Offline monitors show since when, with a hint on how to fix them.

**Clearer integrations and log viewer** ([#252](https://github.com/DevinoSolutions/dokploy-community/pull/252), [#251](https://github.com/DevinoSolutions/dokploy-community/pull/251))

- Integration dialogs keep Test connection and Save visible on small screens, and the Integrations page points to Notifications for Sendly and Notifly.
- The log viewer's input says that it writes to the container's standard input.
- A wrong Uptimely API key now shows "Uptimely rejected the API key" instead of "Uptimely JSON-RPC error undefined".

> Merged on green CI; the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.7-community.9

**Uptimely integration works with Uptimely's Code Mode MCP** ([#250](https://github.com/DevinoSolutions/dokploy-community/pull/250))

- Uptimely's MCP endpoint now exposes only `search_tools` and `execute_typescript`, so every call from Dokploy (test connection, status pages, monitor create and lookup, probes) failed with "Tool ... not found". Dokploy now runs each Uptimely tool through `execute_typescript`, and Uptimely's error codes (project access, invalid input, AI write operations off) come back as readable messages with a link to the right settings page.

**Snapvisor defaults to its API host** ([#249](https://github.com/DevinoSolutions/dokploy-community/pull/249))

- The Snapvisor Base URL now defaults to `https://api.snapvisor.io`. The old default, `https://app.snapvisor.io`, served the web app, so Test connection failed with "Snapvisor returned a non-JSON response". Saved integrations that still use the old value are treated as the API host, and build review links keep pointing at the web app.

**Container log input survives a container restart** ([#248](https://github.com/DevinoSolutions/dokploy-community/pull/248))

- Typing into the log viewer of a container that had exited and restarted went nowhere until the log viewer was reopened. The input session is now reopened on the next keystroke, including for TTY containers.

> Merged on green CI; the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.7-community.8

**Deploy hook output reaches the build server's log over one connection** ([#245](https://github.com/DevinoSolutions/dokploy-community/pull/245), fixes [#243](https://github.com/DevinoSolutions/dokploy-community/pull/243))

- When builds run on a separate server, pre- and post-deploy hook output is now relayed to the deployment log over a single SSH session per hook. It used to open a new SSH connection for every chunk, which added up to hundreds per chatty hook.
- Relayed output is capped at 8 MiB. A dropped connection is restarted once, with a marker in the log, and a failed relay never fails the deploy.
- Remote command output no longer garbles multi-byte characters split across SSH packets, and a hook that runs on the Dokploy server with the log on a build server no longer dies after 64 MiB of output.

> Merged on green tests, typecheck and independent review run on a clean clone; the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.7-community.7

**Viewing logs no longer restarts containers** ([#244](https://github.com/DevinoSolutions/dokploy-community/pull/244), from [#219](https://github.com/DevinoSolutions/dokploy-community/pull/219) by @ajnart)

- Opening or closing a container's log viewer no longer sends SIGHUP to the container. Services that exit on SIGHUP (PocketBase, for one) used to restart whenever someone looked at their logs.
- The viewer attaches to the container only when you send it a command, and never forwards signals. A new test checks this against a real container.

> Merged on green tests, typecheck and independent review run on a clean clone; the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.7-community.6

**Deploy hooks work with a separate build server** ([#240](https://github.com/DevinoSolutions/dokploy-community/pull/240), from [#222](https://github.com/DevinoSolutions/dokploy-community/pull/222) by @rossreicks)

- Pre/post deploy hooks no longer fail when an application builds on a build server and deploys to another server. Hook output is relayed into the deployment log on the build server, capped at 8 MiB.

**API docs load again** ([#239](https://github.com/DevinoSolutions/dokploy-community/pull/239), from [#218](https://github.com/DevinoSolutions/dokploy-community/pull/218) by @rossreicks)

- `/swagger` and `settings.getOpenApiDocument` failed on "Subscriptions are not supported by OpenAPI v3". Fork subscriptions are now excluded from the document, and a test builds it from the whole router.

**Link GitHub or Google on self-hosted** ([#223](https://github.com/DevinoSolutions/dokploy-community/pull/223) by @rossreicks, [#241](https://github.com/DevinoSolutions/dokploy-community/pull/241))

- The profile page offers account linking whenever GitHub or Google OAuth is configured, not only on cloud.
- With **Enforce SSO** on, linking is hidden and blocked, so no login method can bypass the SSO provider.

**Auth hardening on PostgreSQL** ([#238](https://github.com/DevinoSolutions/dokploy-community/pull/238))

- API-key rate limits and other guarded auth updates now hold when many requests arrive at once. This fixes MCP keys whose request count could climb past their limit.
- The change patches the better-auth Drizzle adapter until an upstream fix ships.

> Merged on green tests, typecheck and independent review run on a clean clone; the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.7-community.5

**MCP API-key rate limits count every tool call** ([#237](https://github.com/DevinoSolutions/dokploy-community/pull/237)) — follow-up to community.4.

- Tool calls that arrived together after a key sat idle shared one check and skipped the per-call count; each one is now counted against the key's rate limit
- Requests admitted on another request's check are flagged explicitly instead of compared by timestamp, which also closes a same-millisecond gap

> Merged on green tests, typecheck and independent review run on a clean clone; the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.7-community.4

**MCP over API key survives fleets of clients** — fixes "needs authentication" prompts in every new Claude Code session on machines that open many sessions at once ([#236](https://github.com/DevinoSolutions/dokploy-community/pull/236)).

- A Dokploy API key that is over its per-key rate limit is answered with **429 + `Retry-After`**, never 401, so MCP clients back off instead of dropping their login and marking the server as needing re-authentication
- Session handshakes (`initialize`, `notifications/initialized`, `tools/list`) are admitted on a verification of the same key from the last 60 s, and concurrent checks share one lookup, so N clients starting together cost about one verification instead of 3N; `tools/call` is still verified and counted every time, and revoked keys stop doing work immediately
- Unauthenticated callers are rejected before the request body is read
- New diagnostic line: `[mcp-diag] request throttled: reason=api_key_rate_limited retryAfter=<s>s`

> Merged on green tests, typecheck and independent review run on a clean clone; the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.7-community.3

**Native integrations for the Devino product lineup** — new **Settings → Integrations** page, four migrations (`0203`–`0206`, all idempotent), upgrades in place.

- **Uptimely** — per-service uptime, SSL and domain monitors from the Monitoring tab of every application, compose stack and database, talking to Uptimely over its MCP endpoint with a project API key; status pill, 30-day timeline, run-probe, status-page badge. Monitor creation is opt-in per service and needs the project's "AI write operations" toggle ON in Uptimely ([#229](https://github.com/DevinoSolutions/dokploy-community/pull/229))
- **Sendly and Notifly notification channels** — email through Sendly (`POST /api/emails`) and workflow triggers through Notifly (`POST /v1/events/trigger`), wired into every notification event alongside Slack, Discord, Telegram, Email and Resend ([#231](https://github.com/DevinoSolutions/dokploy-community/pull/231))
- **DoDomain custom-domain connect** — "Check DNS" and "Send connect link" on domains; end users link their own domain through DoDomain's hosted flow, a signed webhook (`/api/webhooks/dodomain`, HMAC-verified, deduplicated) marks the domain verified and re-applies it through the normal Traefik path; failures fan out to notification channels ([#232](https://github.com/DevinoSolutions/dokploy-community/pull/232))
- **Snapvisor visual testing on preview deployments** — pick a Snapvisor project per application; each preview shows the visual-diff status of the build for the deployed commit with a "Review in Snapvisor" link ([#233](https://github.com/DevinoSolutions/dokploy-community/pull/233))
- **Migrations 0203/0204 hardened** so every fork-delta migration replays idempotently on installs switching from official Dokploy ([#234](https://github.com/DevinoSolutions/dokploy-community/pull/234))

> Every PR was merged on local green (typecheck, feature and migration test suites, independent review); the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.7-community.2

**API-key authentication for the MCP endpoint** — no migrations, upgrades in place.

- **MCP endpoint accepts a Dokploy API key** — `POST /api/mcp` now also authenticates with a Dokploy API key sent in the `x-api-key` header, resolved through the same path the REST API uses, with every MCP scope. Clients that keep one OAuth grant per machine (Claude Code shares a single grant across every session and a stale session can wipe it) can instead be configured with `claude mcp add --transport http --scope user dokploy https://<host>/api/mcp --header "x-api-key: <key>"` and never depend on that grant ([#226](https://github.com/DevinoSolutions/dokploy-community/pull/226))
- **Rejected MCP requests are logged** — the endpoint logs `[mcp-diag] request rejected: reason=…` (`api_key_invalid`, `not_bearer`, `empty_bearer`, `bearer_rejected` with an 8-character token prefix) so a "keeps asking me to log in" report can be answered from the server log. Credential-less discovery probes are not logged ([#226](https://github.com/DevinoSolutions/dokploy-community/pull/226))

> Merged on local green (typecheck + MCP test suite); the image is multi-arch (`linux/amd64` and `linux/arm64`), built by CI from the release commit.

### New in v0.30.7-community.1

**Upstream v0.30.7 sync + the MCP OAuth refresh fix** — no migrations, upgrades in place.

- **Upstream v0.30.7** — trial-expiration emails and a reworked billing/onboarding plan step (cloud-only; no effect on self-hosted). The extended static Railpack version list is superseded by the fork's dynamic list fetched from GitHub releases ([#224](https://github.com/DevinoSolutions/dokploy-community/pull/224))
- **MCP clients stay connected** — every refresh-token grant failed with `ERR_INVALID_ARG_TYPE` because the rotation clamp handed a JavaScript `Date` to the database driver as a raw SQL parameter, turning a successful refresh into a 500; clients dropped their grant and looped back to the browser authorization page. The deadline is now serialised the way the timestamp column expects, and a hygiene failure can no longer fail the token response ([#225](https://github.com/DevinoSolutions/dokploy-community/pull/225))
- **Dynamically registered MCP clients survive a slow approval** — the daily purge deleted any registration older than one day with no token, so a client that registered and was authorized a few days later hit `Unknown or disabled OAuth client`. Registrations now get 30 days, and that error explains how to recover (remove and re-add the MCP server) ([#225](https://github.com/DevinoSolutions/dokploy-community/pull/225))

### New in v0.30.6-community.2

**Self-healing fork schema for upstream switchers, a Settings → Build policy fix, and quieter scheduled-backup failures** — one guarded catch-up migration, upgrades in place.

- **Switching from upstream Dokploy v0.30.6 no longer loses fork tables** — the drizzle migrator orders migrations by timestamp, so an upstream v0.30.6 database that switched to the fork silently skipped the fork's wildcard-domain, MCP OAuth and earlier catch-up migrations (`column wildcard_domain does not exist`, `relation oauth_access_token does not exist`). A new catch-up migration re-issues them, and the boot sequence now applies any fork catch-up whose hash is missing from the migrations table, independent of timestamps ([#220](https://github.com/DevinoSolutions/dokploy-community/pull/220))
- **Settings → Build policy loads again** — the exclusions and audit listings selected the full `application` row inside a relational query, which exceeds Postgres's 100-argument limit; they now select only the columns the page shows ([#220](https://github.com/DevinoSolutions/dokploy-community/pull/220))
- **Scheduled backup failures no longer surface as context-free crashes** — a failing scheduled database or volume backup is logged with its backup and server ids instead of escaping as an unhandled rejection, and command errors reported to the error tracker now carry the scrubbed command, exit code and output tail ([#220](https://github.com/DevinoSolutions/dokploy-community/pull/220))
- **Migration failures are reported** — the migration step reports a failed batch to the error tracker instead of only logging it, so a half-migrated install is diagnosable ([#220](https://github.com/DevinoSolutions/dokploy-community/pull/220))

### New in v0.30.6-community.1

**Upstream v0.30.6 sync + a fork-original build policy + longer-lived MCP sessions + critical dependency patches** — one guarded migration (three enum values, one column, one default), upgrades in place.

- **Upstream v0.30.6** — Infomaniak and OVHcloud DNS providers, an AWS Parameter Store vault provider, Infisical secret references expanded with folder paths, organization logo drag-and-drop with smarter name truncation, dynamic Open Graph metadata for whitelabeled instances, SSO enforcement extended to server-side sign-in, passkeys and email signup, DNS upserts that match on record content instead of overwriting existing records, domain validation that accepts a server's own interface addresses, and custom Docker address-pool detection in server health ([#215](https://github.com/DevinoSolutions/dokploy-community/pull/215))
- **The v0.30.5 Docker build-context change is reverted upstream** — the default build context is the Dockerfile's own directory again. An application that needed *Docker Context Path* set as a workaround on `v0.30.5-community.1` keeps working either way, so no action is required ([#215](https://github.com/DevinoSolutions/dokploy-community/pull/215))
- **Build once, deploy by digest (fork original)** — enforced remote builds on the organization build server, a registry push per commit, swarm updates by image digest, audited break-glass local builds, required commit checks, deploy coalescing, and rollback to a stored digest; off by default ([#209](https://github.com/DevinoSolutions/dokploy-community/pull/209))
- **MCP sessions stop re-authorizing daily** — access tokens now last 30 days and refresh tokens 365 days sliding, and a 5-minute rotation grace window keeps a dropped refresh response from stranding a client; every lifetime is env-tunable ([#214](https://github.com/DevinoSolutions/dokploy-community/pull/214))
- **Critical dependency patches** — `next` 16.3.3 closes two unauthenticated remote-code-execution advisories (one affecting Windows-hosted servers, one in the image optimizer), alongside `sharp` and `js-yaml` fixes ([#213](https://github.com/DevinoSolutions/dokploy-community/pull/213))

### New in v0.30.5-community.1

**Upstream v0.30.5 sync + the three most-requested open upstream PRs + credential redaction** — one guarded migration (two enum values, one nullable column with a backfill), upgrades in place.

- **Upstream v0.30.4 + v0.30.5** — Phase.dev vault provider, Porkbun DNS provider, reworked DNS records management for every record type, bulk secret import from vault providers, "Deploy with Fresh Volumes" for compose, swarm convergence check before a database deploy is marked done, remote Traefik config written over SFTP, git-provider secrets stripped from compose responses, password reset by email, responsive application logs, and an onboarding wizard for brand-new instances ([#205](https://github.com/DevinoSolutions/dokploy-community/pull/205))
- **⚠ Docker build context now defaults to the repository root** (upstream [#5231](https://github.com/Dokploy/dokploy/pull/5231)) — it used to be the Dockerfile's directory. A Dockerfile app whose Dockerfile lives in a subdirectory and copies paths relative to it needs *Docker Context Path* set to that directory, otherwise its next build fails with a file-not-found ([#205](https://github.com/DevinoSolutions/dokploy-community/pull/205))
- **Compose deployments roll back automatically** — a failed `docker compose up` restores the last good compose file and `.env` and re-runs the previous release, so a bad push no longer takes a running stack down; disabled for fresh-volume deploys, previews included, plus Live / Deploying / Deploy failed badges in the compose header ([#207](https://github.com/DevinoSolutions/dokploy-community/pull/207), from upstream [#5182](https://github.com/Dokploy/dokploy/pull/5182) by [@EngAbo3lia](https://github.com/EngAbo3lia))
- **Gitea / Forgejo preview deployments** — pull-request webhooks for applications and compose stacks, PR comments with the preview URL, a *Build Pull Request* dialog, and the same author-collaborator gate GitHub and GitLab previews use ([#208](https://github.com/DevinoSolutions/dokploy-community/pull/208), from upstream [#5149](https://github.com/Dokploy/dokploy/pull/5149) by [@ankit8697](https://github.com/ankit8697))
- **Deploy hooks run on the right server** — with a build server configured, pre/post-deploy hooks tried to `docker exec` on the build host where the container never exists; they now run on the app server and the post-deploy hook targets the exact container the rolling update brought up ([#206](https://github.com/DevinoSolutions/dokploy-community/pull/206), from upstream [#4240](https://github.com/Dokploy/dokploy/pull/4240) review fixes by [@Alfredao](https://github.com/Alfredao))
- **Security: credentials in URLs are redacted** — GitHub App installation tokens, GitLab/Gitea OAuth tokens and registry passwords embedded in clone or login URLs (including the shell-escaped form git clone uses), plus bare `ghs_`/`ghp_`/`glpat-` style tokens, no longer reach deployment logs or crash reports ([#204](https://github.com/DevinoSolutions/dokploy-community/pull/204))

### New in v0.30.3-community.4

**Remote MCP server with OAuth** — one guarded migration (three additive tables), upgrades in place.

- **MCP server hosted inside Dokploy** — `POST /api/mcp` serves all 664 API procedures as MCP tools (same names as `@dokploy/mcp`) over Streamable HTTP, so 50 Claude Code sessions share one HTTPS endpoint instead of spawning 50 local processes; `claude mcp add --transport http --scope user dokploy https://<host>/api/mcp` and `/mcp → Authenticate` is the whole setup ([#203](https://github.com/DevinoSolutions/dokploy-community/pull/203))
- **OAuth 2.1 instead of API keys** — PKCE, dynamic client registration and RFC 9728 discovery via better-auth's in-core `mcp` plugin, hardened with a consent-proof gate on the authorize endpoint, a loopback/https-only redirect-URI policy, refresh-token rotation cleanup, and a bounded request body ([#203](https://github.com/DevinoSolutions/dokploy-community/pull/203))
- **Scoped grants** — the consent page lets you check off exactly what a client may do: `dokploy:read`, `deploy`, `services:write`, `services:delete`, `projects:write`, `projects:delete`, `backups`, `admin` (delete + admin off by default); credential-store queries and raw file reads require `admin`; every tool still runs the caller's role checks ([#203](https://github.com/DevinoSolutions/dokploy-community/pull/203))
- **Minimal re-authentication** — 30-day access tokens with a 365-day sliding refresh and a 5-minute grace window on rotated refresh tokens (`DOKPLOY_MCP_ACCESS_TOKEN_HOURS` / `DOKPLOY_MCP_REFRESH_TOKEN_DAYS` / `DOKPLOY_MCP_REFRESH_GRACE_SECONDS`), daily purge of expired rows, `DOKPLOY_MCP_DISABLED=true` kill switch, and a Settings → Profile card listing authorized clients with one-click revoke ([#203](https://github.com/DevinoSolutions/dokploy-community/pull/203))

### New in v0.30.3-community.3

**Wildcard domains for generated domains** — one guarded migration (three additive columns), upgrades in place.

- **Wildcard domain base for generated domains** — set a base domain at the organization level (Settings → Server) and/or per project, and the Generate Domain button and preview-deployment defaults produce `<app>.your-base.com` instead of `sslip.io` addresses; precedence is project → server default domain → organization (with a per-project inherit toggle) → `DEFAULT_DOMAIN` env → sslip.io, and existing HTTP-01 certificate issuance keeps working unchanged ([#201](https://github.com/DevinoSolutions/dokploy-community/pull/201), the top-requested unmet feature upstream — prior art by [@amirhmoradi](https://github.com/amirhmoradi), [@LukasParke](https://github.com/LukasParke), [@semihanadolu](https://github.com/semihanadolu), [@TuroYT](https://github.com/TuroYT))
- **Domain edits now enforce the domain allow-list** — updating an existing domain could bypass a restriction that creating one enforced; fixed with regression tests (bundled in [#201](https://github.com/DevinoSolutions/dokploy-community/pull/201))
- **Deployment history restored for previews, backups and volume backups** — the community.1 authorization hardening 401'd the "View Deployments" modal for non-service resource types; ids now resolve to their owning service before the same permission check, and host-level schedules gained the authorization gate they were missing ([#202](https://github.com/DevinoSolutions/dokploy-community/pull/202) by [@lmichelin](https://github.com/lmichelin))

### New in v0.30.3-community.2

**Manual preview builds + security hardening wave 5** — no migrations.

- **Build a preview deployment from any open PR/MR with one click** — a "Build Pull Request" button on applications and compose services lists open pull/merge requests (GitHub and GitLab) and builds a preview on demand, converging with webhook-triggered previews on the same deployment; the collaborator-permission requirement is enforced on the manual path too, so untrusted fork PRs can't be built onto your host ([#199](https://github.com/DevinoSolutions/dokploy-community/pull/199) by [@ajnart](https://github.com/ajnart))
- **Unhardened legacy permission helpers removed** — the package root exported pre-hardening duplicates of the access-check helpers (unused by shipped code, but a silent-downgrade trap for future imports); all deleted, the hardened implementations are now the only ones exported, and member allow-list writes verify organization ownership before persisting ([#200](https://github.com/DevinoSolutions/dokploy-community/pull/200))

### New in v0.30.3-community.1

**Upstream v0.30.3 sync + security hardening waves 3 & 4** — one guarded migration (`network.dockerId` + `server.terminal` role backfill), upgrades in place.

- **All ~37 fixes from upstream [v0.30.3](https://github.com/Dokploy/dokploy/releases/tag/v0.30.3)** ([#198](https://github.com/DevinoSolutions/dokploy-community/pull/198)): new `server.terminal` permission decoupling terminal access from root SSH, network sync that detects delete/recreate by Docker ID, volume backups restart services after a failed backup, `.env` `${VAR}` interpolation preserved, multi-IP domain validation, monitoring chart label/unit fixes, tini as PID 1, Railpack remote installs with sudo, and more
- **Cross-organization authorization hardening, waves 3 & 4** ([#196](https://github.com/DevinoSolutions/dokploy-community/pull/196), [#197](https://github.com/DevinoSolutions/dokploy-community/pull/197)) — service-level permission checks now verify organization ownership for **every** role across ~200 procedures (deploy/start/stop/logs/env for all eight service types) and all six project/service/environment access helpers; the AI provider router no longer leaks API keys across organizations; metrics endpoints are derived server-side from the organization-scoped server row instead of trusting a caller-supplied URL and token

### New in v0.30.2-community.2

**Security hardening, swarm-deploy stability, and quieter, tougher backups** — no migrations.

- **Cross-organization authorization hardening** — a sweep found tRPC procedures that accepted a `serverId` (or registry id) from another organization and ran SSH/docker commands against it; 22 procedures across the settings, certificate, registry, destination and patch routers are now organization-scoped, and user-supplied rclone `additionalFlags` are shell-quoted at the command builder so legacy rows can't smuggle shell syntax into backup commands ([#191](https://github.com/DevinoSolutions/dokploy-community/pull/191), [#192](https://github.com/DevinoSolutions/dokploy-community/pull/192))
- **Scheduled backups of stopped databases now skip quietly** — a "backup everything" policy no longer produces an error storm for databases that are intentionally stopped; manual runs still report real failures, and an unreachable server never masks an outage ([#193](https://github.com/DevinoSolutions/dokploy-community/pull/193))
- **MariaDB/MySQL dumps and restores survive the binary rename** — newer MariaDB images renamed `mysqldump`/`mysql` to `mariadb-dump`/`mariadb`; both backup and restore now pick whichever binary exists in the container ([#193](https://github.com/DevinoSolutions/dokploy-community/pull/193))
- **Backup failures finally say why** — volume-backup and remote command errors now include the tail of the command's output (secrets redacted) instead of an empty message ([#193](https://github.com/DevinoSolutions/dokploy-community/pull/193))
- **Rolling updates are robust to daemon clock skew** — the deploy stability check now anchors task timestamps to the remote docker daemon's clock and ignores tasks from previous deployments ([#188](https://github.com/DevinoSolutions/dokploy-community/pull/188) by [@lmichelin](https://github.com/lmichelin))
- **Disk Usage works on remote servers** — the dashboard's Disk Usage tab now passes the selected server instead of always querying the Dokploy host ([#187](https://github.com/DevinoSolutions/dokploy-community/pull/187) by [@lmichelin](https://github.com/lmichelin))

### New in v0.30.2-community.1

**Upstream v0.30.2 sync + a self-healing migration for anyone switching from official Dokploy.**

- **Switching from official Dokploy now works on any existing database** — the migration runner used to silently skip this fork's older migrations when upgrading a database that had already run newer official migrations, which broke fork features (backup destinations, Cloudflare integration, project icons, …) with `column does not exist` errors. A new fully idempotent catch-up migration recreates every fork table and column regardless of upgrade path ([#189](https://github.com/DevinoSolutions/dokploy-community/pull/189)) — found and fixed within hours thanks to the fork's opt-out error reporting catching a real install's crash.
- **All fixes from upstream [v0.30.1](https://github.com/Dokploy/dokploy/releases/tag/v0.30.1) and [v0.30.2](https://github.com/Dokploy/dokploy/releases/tag/v0.30.2)** ([#190](https://github.com/DevinoSolutions/dokploy-community/pull/190)): stack deploys keep env-var quotes literal, preview redeploys are no longer blocked by the preview limit, project pages no longer over-fetch for members with limited permissions, terminal resize desync fixed, tags apply on project create, switch thumb alignment

### New in v0.30.0-community.2

**Two community-contributed fixes** — no migrations.

- **GitLab merge-request previews now work for applications** — the preview pipeline only knew how to clone GitHub repos, so GitLab application previews died at deploy time; the GitHub-only gates are now provider-aware (GitHub or GitLab), the MR branch is cloned with refreshed credentials, and early failures land in the deployment logs ([#185](https://github.com/DevinoSolutions/dokploy-community/pull/185) by [@Knyntsje](https://github.com/Knyntsje) — first-time contributor!)
- **Rolling updates no longer report false deployment failures** — the post-deploy stability check could catch the outgoing container winding down and report "Container did not stay running"; task counts now only consider tasks Swarm intends to keep alive, while crash-loop detection still sees the full task history ([#184](https://github.com/DevinoSolutions/dokploy-community/pull/184) by [@lmichelin](https://github.com/lmichelin))

### New in v0.30.0-community.1

**Upstream v0.30.0 sync.** Full merge of upstream [Dokploy v0.30.0](https://github.com/Dokploy/dokploy/releases/tag/v0.30.0) ([#186](https://github.com/DevinoSolutions/dokploy-community/pull/186)) — one guarded migration, upgrades in place.

- **Overview dashboard** — new org-wide Overview page with Services, Backups, Domains and Deployments tabs
- **Secrets (vault providers)** — store secrets in HashiCorp Vault, Infisical, AWS Secrets Manager, Doppler, Azure Key Vault, or Scaleway and reference them from service environments
- **DNS providers** — Cloudflare and AWS Route53 integration for managing DNS records from Dokploy
- **Session management** — owners can view and revoke sessions across the organization (supersedes this fork's earlier self-scoped sessions page)
- **Docker dashboard expansion** — Health diagnostics, Docker events (sortable, paginated), Images and Disk Usage tabs
- **Organization improvements** — default role for newly joining members, larger searchable organization selector
- **Traefik 3.6.25**, monitoring deployed as a swarm service, SCIM/SSO user linking fix, GitLab OAuth token fix, and TypeScript 7 across the codebase
- **Fork fixes on top**: mysql/mariadb restores strip `USE`-statements (closes a restore bug found in our backup audit), ECR rollbacks use vault-resolved credentials, and compose `.env` files are no longer double-escaped
- All fork features preserved: Backup Center (incl. destination encryption — upstream's new backup internals were adapted around it), Cloudflare Tunnel & Access, project icons, Sentry opt-out error reporting, 30-day sessions, preview deployments

### New in v0.29.14-community.3

**Member project-access fix.** One community-contributed fix — no migrations.

- **Members with service-level permissions can now open their projects** — the project and environment endpoints required explicit project-level access, so members granted access to individual services were redirected back to the dashboard; access is now granted through project, environment, or service permissions, with responses still filtered to only the services each member can see ([#183](https://github.com/DevinoSolutions/dokploy-community/pull/183) by [@m41denx](https://github.com/m41denx)).

### New in v0.29.14-community.2

**Build-server deployment status fix.** One community-contributed fix — no migrations.

- **Deployments no longer marked failed when using a separate build server** — the post-deploy stability check polled the build server for a service that only runs on the app's runtime server, reporting successful deployments as failed ([#181](https://github.com/DevinoSolutions/dokploy-community/pull/181) by [@lmichelin](https://github.com/lmichelin)).

### New in v0.29.14-community.1

**Upstream v0.29.14 sync.** Full merge of upstream [Dokploy v0.29.14](https://github.com/Dokploy/dokploy/releases/tag/v0.29.14) ([#182](https://github.com/DevinoSolutions/dokploy-community/pull/182)) — one guarded migration, upgrades in place.

- **Network management** — upstream's network management landed and replaces this fork's earlier implementation: create/inspect/recreate Docker networks with driver, IPv4/IPv6, IPAM and MTU options, attach services to networks, and detach the default dokploy network per service. The fork adds role-permission gates on top.
- **Passkey sign-in** — register passkeys and sign in with them.
- **GitHub Enterprise support** — GitHub providers accept a custom base URL.
- **Service icon management** — pick icons for compose services.
- **Misc fixes from upstream** — single-label hostnames, real error-page status codes, dropdowns staying open on window blur, rollback env resolution, preview-deployment cleanup on app delete, and more.
- Upstream's new hotfix automation workflows are not enabled in this fork (releases here are manual).

### New in v0.29.13-community.3

**Security fix & six upstream ports.** Six 1:1 ports of upstream PRs — no new migrations. **Upgrading is recommended** for the command-injection fix.

- **Security: command injection via compose service names** — a crafted compose service name could reach a `docker` error message that was interpolated unquoted into an `echo` inside the generated build script, allowing shell command injection during builds. The error text is now shell-quoted before embedding ([#178](https://github.com/DevinoSolutions/dokploy-community/pull/178), upstream [#4872](https://github.com/Dokploy/dokploy/pull/4872) by @Siumauricio).
- **Preview deployments work with GitHub apps again** — creating a preview deployment passed a redacted GitHub private key to authentication, so previews always failed with `NOT_FOUND`; the provider credentials are now re-fetched unredacted ([#179](https://github.com/DevinoSolutions/dokploy-community/pull/179), upstream [#4933](https://github.com/Dokploy/dokploy/pull/4933) by @CyrilBIENNE).
- **Postgres 100-argument limit fix for schedules & volume backups** — installs with many applications no longer crash schedule/volume-backup queries that hydrate app relations ([#175](https://github.com/DevinoSolutions/dokploy-community/pull/175), upstream [#4931](https://github.com/Dokploy/dokploy/pull/4931) by @Siumauricio).
- **GitHub provider trigger type persists** — the selected deploy trigger (push/tag) is saved correctly when editing a GitHub-provider application ([#176](https://github.com/DevinoSolutions/dokploy-community/pull/176), upstream [#4937](https://github.com/Dokploy/dokploy/pull/4937) by @narcisonunez).
- **DNS check tooltip no longer flags CDNs as errors** — domains behind a CDN/proxy show an informational message instead of a false-negative error ([#177](https://github.com/DevinoSolutions/dokploy-community/pull/177), upstream [#4911](https://github.com/Dokploy/dokploy/pull/4911) by @AbiRaditya).
- **Template dialog keeps its state on tab switch** — the create-from-template dialog no longer closes when switching browser tabs ([#180](https://github.com/DevinoSolutions/dokploy-community/pull/180), upstream [#4906](https://github.com/Dokploy/dokploy/pull/4906) by @zenojunior).

### New in v0.29.13-community.2

**Migration reliability for official-Dokploy switchers, credential scrubbing & backup cleanup.** A patch release on the v0.29.13 base — five fixes, no new migrations. **Upgrading is recommended**, especially if you switched to the fork from official Dokploy v0.29.13 or use S3 backups.

- **Migration failures fixed for installs switching from official Dokploy v0.29.13** — installs that moved from official Dokploy v0.29.13 to the fork previously re-ran migration 0174 (the fork re-timestamps it), hit a `duplicate_column` error, and rolled back the **entire** pending migration batch (0174–0192) — leaving every fork table and column silently missing. Migration 0174 now uses `ADD COLUMN IF NOT EXISTS`, a fork-wide migration-idempotency audit plus a static lint test guards against recurrence, and migration failures now log loudly and report to Sentry instead of failing quietly ([#172](https://github.com/DevinoSolutions/dokploy-community/pull/172)).
- **Credentials scrubbed from error reports** — a failed backup command could previously embed live S3 credentials (e.g. rclone `--s3-access-key-id` / `--s3-secret-access-key`) in an error message that then flowed into error reports. Credentials are now scrubbed from `ExecError` messages and from all error reports (a Sentry `beforeSend` scrubber) before anything leaves the process ([#173](https://github.com/DevinoSolutions/dokploy-community/pull/173)).
- **Partial backup uploads are cleaned up on failure** — when a backup fails mid-upload, the truncated partial object is now deleted from the destination, so it can't pollute buckets or evict good backups from retention. Failure diagnostics now distinguish **"Backup failed"** (a dump error, with the dump's stderr) from **"Upload failed"** (a destination error) ([#174](https://github.com/DevinoSolutions/dokploy-community/pull/174), inspired by upstream [#4896](https://github.com/Dokploy/dokploy/pull/4896)).
- **Cursor pointer on buttons** — buttons now show a pointer cursor on hover ([#170](https://github.com/DevinoSolutions/dokploy-community/pull/170), upstream [#4890](https://github.com/Dokploy/dokploy/pull/4890) by @SteadEXE).
- **Security-audit robustness** — the server security audit no longer breaks when sshd/ufw config contains duplicate directives; the grep pipelines take the first match and strip carriage returns so the audit JSON stays valid ([#171](https://github.com/DevinoSolutions/dokploy-community/pull/171), upstream [#4889](https://github.com/Dokploy/dokploy/pull/4889) by @reikjarloekl).

### New in v0.29.13-community.1

**Upstream v0.29.13 rebase + SMTP-without-auth, UI fixes & session diagnostics.** The fork is now based on upstream Dokploy v0.29.13 — a large security-hardening release (shell-escaping of all user-influenced commands, WebSocket handler authorization, git/registry command-injection fixes, secret redaction in API responses, org-scoped custom AI provider presets, email verification for SSO). All fork features were re-verified on top, and the fork's backup-command credential redaction was widened to cover the new escaping format. One additive migration (0192).

- **SMTP without authentication** — email notifications now work with auth-less SMTP relays: username/password are optional and the auth block is omitted when blank ([#165](https://github.com/DevinoSolutions/dokploy-community/pull/165), upstream [#4844](https://github.com/Dokploy/dokploy/pull/4844) by @hbilal9; migration 0192).
- **Org menu width fix** — the organization dropdown is no longer clipped when the sidebar is collapsed ([#166](https://github.com/DevinoSolutions/dokploy-community/pull/166), upstream [#4845](https://github.com/Dokploy/dokploy/pull/4845) by @hbilal9; also landed upstream in v0.29.13).
- **Compose "Reload" renamed to "Rebuild"** — the button label now says what the action does ([#167](https://github.com/DevinoSolutions/dokploy-community/pull/167), upstream [#4847](https://github.com/Dokploy/dokploy/pull/4847) by @ANSUJKMEHER; also landed upstream in v0.29.13).
- **Session-rejection diagnostics** (fork original) — when a browser presents a session cookie that the server rejects, the server now logs a classified reason (token unknown / expired / signature mismatch) with only an 8-char token prefix, to make unexplained logouts diagnosable ([#168](https://github.com/DevinoSolutions/dokploy-community/pull/168)).

### New in v0.29.12-community.15

**Session management, log-stream hygiene & metrics dedupe fix.** Three 1:1 ports of open upstream PRs — no migrations.

- **Session management page** — Settings → Sessions lists your active and expired sessions (device, IP, created/expires) with one-click revoke to force logout on another device; strictly self-scoped and session tokens never leave the server ([#164](https://github.com/DevinoSolutions/dokploy-community/pull/164), upstream [#4841](https://github.com/Dokploy/dokploy/pull/4841)).
- **Container log streams terminate on disconnect** — closing a logs view now reliably kills the underlying `docker logs --follow` process (SIGTERM with SIGKILL escalation, local and SSH), and log commands are spawned argument-by-argument with in-process search filtering instead of concatenated shell strings ([#163](https://github.com/DevinoSolutions/dokploy-community/pull/163), upstream [#4836](https://github.com/Dokploy/dokploy/pull/4836)).
- **Monitoring metrics dedupe fix** — container metrics are deduplicated by swarm task suffix instead of name prefix, so distinct services sharing a name prefix (e.g. `app-x-mysql` and `app-x-redis`) no longer lose metrics to each other ([#162](https://github.com/DevinoSolutions/dokploy-community/pull/162), upstream [#4843](https://github.com/Dokploy/dokploy/pull/4843)).

### New in v0.29.12-community.14

**Backup scale-safety, image restorability & navigation.** Three changes — no migrations.

- **Scheduled backup concurrency limit** — scheduled database, compose, and volume backups now run through a per-server FIFO queue (`DOKPLOY_BACKUP_CONCURRENCY`, default 4), so a policy firing many backups on one cron drains gradually instead of spawning them all at once; manual runs stay immediate ([#160](https://github.com/DevinoSolutions/dokploy-community/pull/160)).
- **Image-restorability view on the Registry page** — Settings → Registry now shows, for every application and compose service, whether its image is **Re-pullable** from a registry, **In registry** (source-built but pushed), or **⚠ Rebuild-only** (exists only on the local daemon), with per-registry push counts ([#161](https://github.com/DevinoSolutions/dokploy-community/pull/161)).
- **Coverage deep-links + tab order** — coverage rows link straight to each service's backups tab, and Coverage is now the Backup Center's first tab ([#159](https://github.com/DevinoSolutions/dokploy-community/pull/159)).

### New in v0.29.12-community.13

**Backup Center polish.** Two refinements — no migrations.

- **Instance tab manages web-server backups in place** — the Instance tab now embeds the full Web Server Backups card (schedules, run/edit/delete, Restore Backup) instead of a read-only summary linking out ([#158](https://github.com/DevinoSolutions/dokploy-community/pull/158)).
- **Destinations show the storage prefix** — coverage rows list each destination as "name · /prefix" so you can see where each backup lands at a glance ([#158](https://github.com/DevinoSolutions/dokploy-community/pull/158)).

### New in v0.29.12-community.12

**Backup Center tabs, search & activity feed.** Community-requested UX pass — no migrations.

- **Tabbed layout** — the Backup Center is now organized like the Swarm page: **Policies / Instance / Coverage / Activity** tabs with `?tab=` deep links, plus a "Viewing server" selector scoping Coverage and Activity ([#157](https://github.com/DevinoSolutions/dokploy-community/pull/157)).
- **Coverage search** — filter the coverage tree by project, environment, or service name, composing with the global facets ([#157](https://github.com/DevinoSolutions/dokploy-community/pull/157)).
- **Activity feed** — recent backup and volume-backup runs org-wide with status, destination, policy-vs-manual source, timestamps, and the uploaded artifact path parsed from the run log (confirming the file landed in the bucket), with the full run log one click away; derived from existing run records, so it works retroactively ([#157](https://github.com/DevinoSolutions/dokploy-community/pull/157)).

### New in v0.29.12-community.11

**Backup verification, browsing & restore in the Backup Center.** Coverage no longer just assumes — it can prove backups exist. No migrations.

- **Browse the real bucket contents** — every covered database/compose service gets a Browse-backups button; the dialog lazily lists the actual files under each backup's prefix (name, size, timestamp) with an "N in bucket" badge, and warns when a backup is configured but the bucket is empty ([#156](https://github.com/DevinoSolutions/dokploy-community/pull/156)).
- **Restore from the Backup Center** — each listed file has a Restore action behind a double confirmation (destructive-action confirm, then type the database name), streaming live logs via the existing restore pipeline; hidden without the restore permission and enforced server-side ([#156](https://github.com/DevinoSolutions/dokploy-community/pull/156)).

### New in v0.29.12-community.10

**Global coverage filters.** The Backup Center coverage filter is now three global facets instead of a per-project list — no migrations.

- **Environments** — multi-select over distinct environment names org-wide ("only production, everywhere" in one click); **Service types** — Databases group (with individual DB kinds), Applications, Compose; **"Not covered only"** toggle to jump straight to gaps. Facets AND together; the production-focused default view applies until any explicit facet replaces it ([#155](https://github.com/DevinoSolutions/dokploy-community/pull/155)).

### New in v0.29.12-community.9

**Backup Center coverage tree.** UX overhaul of the Backup Center's coverage view — no migrations in this release.

- **Coverage tree with rollup badges** — the flat coverage table is now an expandable **Project → Environment → Service** tree; collapsed nodes show an orange "⚠ N not covered" count (green check when fully covered), and project rows reuse the project icons/favicons ([#154](https://github.com/DevinoSolutions/dokploy-community/pull/154)).
- **Environment filter with production-focused defaults** — a /deployments-style filter shows production environments in full while non-production environments only surface databases and volume-bearing services by default; every environment can be toggled fully on or off, with "(N hidden)" hints ([#154](https://github.com/DevinoSolutions/dokploy-community/pull/154)).
- **Compose stacks expand into their containers** — a Compose service now lazily expands to the containers parsed from its compose file, with database-image detection (Postgres/MySQL/MariaDB/Mongo/Redis-family) and per-volume coverage badges, so "a compose with a database inside" is obvious at a glance ([#154](https://github.com/DevinoSolutions/dokploy-community/pull/154)).

### New in v0.29.12-community.8

**Move services between servers, and organization-wide backup policies.** Two headline features plus one additive migration (0191).

- **Move a service to another server** — move an Application, Compose, or database service to a different server in multi-server mode. The move runs a two-phase **scan → execute** flow with a downtime-safe, **copy-based cutover**: the source is stopped, its data is copied to the destination, and the service's `serverId` switches **only after a fully successful copy** — on any failure the source is restarted and left untouched. No migration ([#148](https://github.com/DevinoSolutions/dokploy-community/pull/148), upstream [#3713](https://github.com/Dokploy/dokploy/pull/3713)).
- **Backup policies + Backup Center** — manage backups organization-wide instead of service by service. Define **policies** scoped to the whole org, specific projects, or specific environments (with a one-click "production environments" preset), covering **database dumps and/or volume backups**, each targeting **one destination** with its own cron schedule and retention. Services added later that match a policy's scope are **auto-covered**. A new **Backup Center** page lists every policy, shows an org-wide **coverage table** (what's backed up vs. not) and the instance backup, and **coexists** with any manual backups you already set up. Redis/applications/Compose are covered via volume backups. Adds additive **migration 0191** ([#153](https://github.com/DevinoSolutions/dokploy-community/pull/153)).

### New in v0.29.12-community.7

**Four upstream fixes — safe auth-secret migration, domain clearing, and two editor/UI papercuts.** No migrations in this release.

- **Auth-secret migration no longer loses encrypted data** — installs moving off the deprecated hardcoded `BETTER_AUTH_SECRET` used to lose access to everything previously encrypted with the old key. The legacy-derived key is now kept as a **decrypt-only fallback**, so existing secrets stay readable while every new write uses your real secret ([#151](https://github.com/DevinoSolutions/dokploy-community/pull/151), upstream [#4834](https://github.com/Dokploy/dokploy/pull/4834)).
- **Server domain can be cleared** — clearing the panel's server domain now reverts to IP-only access instead of being rejected. The backend already removed the Traefik router on an empty host; the client-side schema was the only thing blocking it ([#152](https://github.com/DevinoSolutions/dokploy-community/pull/152), upstream [#4825](https://github.com/Dokploy/dokploy/pull/4825)).
- **Clickable icons in badges work again** — interactive icons nested inside badges are once more clickable, rather than swallowing pointer events ([#149](https://github.com/DevinoSolutions/dokploy-community/pull/149), upstream [#4827](https://github.com/Dokploy/dokploy/pull/4827)).
- **YAML auto-indentation on Enter** — the code editor now indents correctly when you press Enter inside YAML ([#150](https://github.com/DevinoSolutions/dokploy-community/pull/150), upstream [#4828](https://github.com/Dokploy/dokploy/pull/4828)).

### New in v0.29.12-community.6

**Project favicons, for real — and hardened.** Project icons now resolve the actual favicon of a project's first working domain, and the resolver is locked down against SSRF and stored XSS.

- **Real favicon resolution** — projects without an explicit icon show their first working domain's favicon, including apps that declare it via a custom `<link rel="icon">` path instead of the default `/favicon.ico`; icons now also render in the project switcher, not just cards and headers ([#145](https://github.com/DevinoSolutions/dokploy-community/pull/145)).
- **SSRF hardening** — every URL the resolver fetches, and every redirect hop, is re-validated as same-origin against the originally-requested org-managed host, pinning scheme + host **+ port** so the fetch can't be pivoted to an internal service or another port on the same IP ([#146](https://github.com/DevinoSolutions/dokploy-community/pull/146), [#147](https://github.com/DevinoSolutions/dokploy-community/pull/147)).
- **Stored-XSS hardening** — `image/svg+xml` favicons are rejected (an SVG served with its real content-type can execute inline script), and the icon response carries a locked-down `default-src 'none'; sandbox` CSP plus `nosniff` ([#147](https://github.com/DevinoSolutions/dokploy-community/pull/147)).
- **Private caching** — the auth-gated icon response is now `private`, so a shared cache can't serve one user's favicon to another.

### New in v0.29.12-community.5

**Project icons & longer sessions.** Projects can now carry an icon — upload an image or paste a URL, and projects without one automatically fall back to the favicon of their first working domain. Login sessions last **30 days** (sliding) instead of 3, tunable via `DOKPLOY_SESSION_DAYS`. Also fixes a scheduled-task bug (caught by the new error reporting on day one) where schedules targeting a stopped container ran `docker exec` with an empty ID on every tick instead of failing with a clear message.

### New in v0.29.12-community.4

**Backend error reporting (opt-out).** The fork now reports unhandled backend errors — crashes and internal server errors, i.e. the stack trace, message, and fork version — to a Devino-hosted Sentry instance, so we catch regressions across installs without waiting on bug reports. No environment variables, secrets, deployment logs, request data, or personal information are ever sent, and the reporting server's hostname is stripped before the event leaves your machine. Opt out with `DOKPLOY_DISABLE_SENTRY=true` (or `DO_NOT_TRACK=1`) — see [Error reporting & privacy](#error-reporting--privacy).

### New in v0.29.12-community.3

**Preview Deployments for Docker Compose** — upstream Dokploy's most-requested unbuilt feature, now live for GitHub PRs and GitLab MRs. Isolated per-PR stack copies with per-service domains, automatic redeploy on update, and full teardown (volumes included) on close. One additive migration (0189) applies automatically on startup.

The previous release, [v0.29.12-community.2](https://github.com/DevinoSolutions/dokploy-community/releases/tag/v0.29.12-community.2), rolled up the full port train: 100+ upstream fixes and features ported 1:1 (native **Cloudflare integration**, **AWS ECR**, **S3 backup encryption at rest**, **per-server default domains**, **remote-server monitoring stats**, and more), plus the fork-side security hardening above.

## Fresh install

On a clean Linux server with root access (same requirements as Dokploy):

```bash
curl -sSL https://dokploy-community.devino.ca/install.sh | sh
```

Install a specific version:

```bash
export DOKPLOY_VERSION=v0.30.8-community.5
curl -sSL https://dokploy-community.devino.ca/install.sh | sh
```

Update an existing installation:

```bash
curl -sSL https://dokploy-community.devino.ca/install.sh | sh -s update
```

## Docker Image

```
ghcr.io/devinosolutions/dokploy-community:v0.30.8-community.5      # versioned (recommended)
ghcr.io/devinosolutions/dokploy-community:latest                  # latest release
ghcr.io/devinosolutions/dokploy-community:canary                  # latest build
```

## Error reporting & privacy

The fork reports **unhandled backend errors** — crashes and internal server errors, i.e. the stack trace, error message, and fork version — to a Devino-hosted Sentry instance so we can catch regressions across installs without waiting on bug reports. No environment variables, secrets, deployment logs, request data, or personal information are ever sent, and the reporting server's hostname is stripped before the event leaves your machine.

Opting out is one environment variable on the `dokploy` service:

```bash
docker service update --env-add DOKPLOY_DISABLE_SENTRY=true dokploy
```

The standard [`DO_NOT_TRACK=1`](https://consoledonottrack.com) convention is also respected.

## Versioning

We follow the scheme `v<upstream-version>-community.<release>`:

| Upstream | Fork release | Tag |
|---|---|---|
| v0.29.11 | 1st release | `v0.29.11-community.1` |
| v0.29.12 | 1st release | `v0.29.12-community.1` |
| v0.29.12 | 2nd release | `v0.29.12-community.2` |
| v0.29.12 | 3rd release | `v0.29.12-community.3` |
| v0.29.12 | 4th release | `v0.29.12-community.4` |
| v0.29.12 | 5th release | `v0.29.12-community.5` |
| v0.29.12 | 6th release | `v0.29.12-community.6` |
| v0.29.12 | 7th release | `v0.29.12-community.7` |
| v0.29.12 | 8th release | `v0.29.12-community.8` |
| v0.29.12 | 9th release | `v0.29.12-community.9` |
| v0.29.12 | 10th release | `v0.29.12-community.10` |
| v0.29.12 | 11th release | `v0.29.12-community.11` |
| v0.29.12 | 12th release | `v0.29.12-community.12` |
| v0.29.12 | 13th release | `v0.29.12-community.13` |
| v0.29.12 | 14th release | `v0.29.12-community.14` |
| v0.29.12 | 15th release | `v0.29.12-community.15` |
| v0.29.13 | 1st release | `v0.29.13-community.1` |
| v0.29.13 | 2nd release | `v0.29.13-community.2` |
| v0.29.13 | 3rd release | `v0.29.13-community.3` |
| v0.29.14 | 1st release | `v0.29.14-community.1` |
| v0.29.14 | 2nd release | `v0.29.14-community.2` |
| v0.29.14 | 3rd release | `v0.29.14-community.3` |
| v0.30.0 | 1st release | `v0.30.0-community.1` |
| v0.30.0 | 2nd release | `v0.30.0-community.2` |
| v0.30.2 | 1st release | `v0.30.2-community.1` |
| v0.30.2 | 2nd release | `v0.30.2-community.2` |
| v0.30.3 | 1st release | `v0.30.3-community.1` |
| v0.30.3 | 2nd release | `v0.30.3-community.2` |
| v0.30.3 | 3rd release | `v0.30.3-community.3` |
| v0.30.3 | 4th release | `v0.30.3-community.4` |
| v0.30.5 | 1st release | `v0.30.5-community.1` |
| v0.30.6 | 1st release | `v0.30.6-community.1` |
| v0.30.6 | 2nd release | `v0.30.6-community.2` |
| v0.30.7 | 1st release | `v0.30.7-community.1` |
| v0.30.7 | 2nd release | `v0.30.7-community.2` |
| v0.30.7 | 3rd release | `v0.30.7-community.3` |

## Contributing

This fork tracks upstream Dokploy's `canary` branch. To contribute:

1. Fork this repo
2. Create a feature branch from `canary`
3. Open a PR targeting `canary`

For features that should go upstream, please also open a PR on the [official Dokploy repo](https://github.com/Dokploy/dokploy).

## Contributors

This fork carries the work of **100+ contributors** — upstream Dokploy's authors plus the fork's own community. GitHub hides the contributors panel on fork homepages, but the full list is here:

[![Contributors](https://contrib.rocks/image?repo=DevinoSolutions/dokploy-community&max=48)](https://github.com/DevinoSolutions/dokploy-community/graphs/contributors)

*[See all contributors →](https://github.com/DevinoSolutions/dokploy-community/graphs/contributors)*

## Credits

- [Dokploy](https://dokploy.com) — the original project by [@siumauricio](https://github.com/siumauricio)
- Every ported change credits its original upstream author — their work, ported and re-verified against the fork's networking and branding layer
- Community-maintained fork, stewarded by [Devino Solutions](https://devino.ca)

## License

Same as upstream — [Apache 2.0](https://github.com/DevinoSolutions/dokploy-community/blob/canary/LICENSE.MD)
