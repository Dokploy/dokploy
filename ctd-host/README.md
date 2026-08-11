# Host-level config on contracko-01 (not part of the Dokploy app)

Versioned copies of hand-managed files on the Hetzner host (`ssh contracko-01`).
The host is the source of truth; this directory is the backup + runbook. If you
change a file on the host, mirror it here in the same commit-sized step.

## traefik-dynamic/

Copies of files in `/etc/dokploy/traefik/dynamic/` on the host. Traefik's file
provider watches that directory (`watch: true`), so dropping a file there
applies live with no restart.

### zz-site-inflight.yml — marketing-site overload protection

Added 2026-07-31 after recurring prod outages: crawler floods (rotating-proxy
scrapers, then Meta's crawlers at up to ~9 req/s) saturated the single-replica,
single-threaded SvelteKit SSR of contracko.com, queueing requests for 30-100s+
until Uptime Kuma alerted.

Defines a `site-inflight` middleware (`inFlightReq`, `amount: 50`, keyed by
request host): at most 50 requests in flight per host; excess get an instant
HTTP 429 instead of joining a doomed queue. Burst-verified in prod: 150
concurrent requests → exactly 50×200 + 100×429. In the first ~36h of normal
traffic it produced exactly one organic 429.

Deliberately attached only to the two `websecure` routers of the marketing
site (`contracko.com`, `www.contracko.com`) — NOT entrypoint-wide, because
app.contracko.com holds long-lived SSE connections that count as in-flight and
would be strangled by a cap like this.

### app-navigate-neural-array-yp8cdk.yml — site router (Dokploy-generated + hand edit)

Dokploy generates this file for the marketing-site app. Our hand edit: the two
`websecure` routers list `site-inflight` in `middlewares`.

**Gotcha:** Dokploy leaves this file alone on app deploys, but REWRITES it if
the app's domain configuration is changed in the Dokploy UI — which silently
drops the middleware reference. After any domain change on the site app,
re-add `- site-inflight` to both websecure routers (or re-copy the version
here) and verify:

```sh
ssh contracko-01 "docker exec dokploy-traefik wget -qO- http://localhost:8080/api/http/middlewares/site-inflight@file"
```

`usedBy` must list both site websecure routers.
