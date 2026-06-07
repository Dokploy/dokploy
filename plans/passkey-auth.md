# Passkey authentication — operator guide

Self-hosted Dokploy supports WebAuthn passkeys for passwordless sign-in. This document covers environment configuration, browser security requirements, user onboarding, and interactions with Enterprise SSO.

## Execution checklist

- [x] Document optional `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` overrides (default: Settings → Server)
- [x] Document HTTPS requirement for WebAuthn
- [x] Document origin matching (scheme, hostname, port)
- [x] Document passkey registration flow (Profile → Manage passkeys)
- [x] Document SSO enforce mode hiding passkey login
- [x] Mark env URL overrides as optional in example files
- [x] Add code comment in `packages/server/src/lib/passkey-rp.ts` pointing here
- [x] Resolve RP from web server settings (`host` + `https`, else `serverIp`) when env unset
- [x] Unit tests for RP resolution (`apps/dokploy/__test__/lib/passkey-rp.test.ts`)
- [x] Login UX: copy, SSO note, conditional autofill, clearer errors
- [x] Audit logs for passkey create/delete (`resourceType: passkey`)
- [x] Document 2FA behavior (passkey sign-in respects TOTP)
- [x] Document platform vs security key registration
- [x] Troubleshooting matrix for ceremony errors

---

## Public URL for passkeys (self-hosted)

Passkeys need a single **canonical public URL** (scheme + hostname + port if non-default). That URL must match what users type in the browser.

### Default — most operators do not set env vars

**Most self-hosted installs do not need `BETTER_AUTH_URL`.** Dokploy already stores the public URL in **Settings → Server** (Host + HTTPS). Passkey `rpID` and `origin` use the same logic as `getDokployUrl()` when no env override is set.

Checklist for the default path:

1. **Settings → Server** — Host is your public hostname (e.g. `fleet.example.com`), HTTPS enabled for non-localhost.
2. Users open that exact URL in the browser (not the Droplet IP if you also have a domain).
3. **Restart Dokploy** after changing Host or HTTPS (RP config loads once at startup).

If that is already how you run Dokploy, passkeys should work without any new environment variables.

### Optional env overrides

`BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` are **optional**. They exist for operators who want the public URL in container env (Better Auth convention) instead of — or ahead of — the UI setting.

Resolution priority at server startup (`packages/server/src/lib/passkey-rp.ts`):

1. **Cloud** — `https://app.dokploy.com` (fixed)
2. **`BETTER_AUTH_URL`** — if set
3. **`NEXT_PUBLIC_APP_URL`** — if set and `BETTER_AUTH_URL` is unset
4. **Development** — `http://localhost:$PORT` when neither env var is set
5. **Settings → Server** — `https?://${host}`, else `http://${serverIp}:$PORT` (same as `getDokployUrl`)
6. **Fallback** — `http://localhost:$PORT`

| Variable | Required? | Purpose |
|----------|-----------|---------|
| *(none)* | **Default** | Use **Settings → Server** Host + HTTPS. Sufficient for typical installs. |
| `BETTER_AUTH_URL` | Optional | Override public URL for Better Auth / passkey `rpID` and `origin`. **Wins over Server settings when set.** |
| `NEXT_PUBLIC_APP_URL` | Optional | Same URL shape; used when `BETTER_AUTH_URL` is unset. Also used client-side for dev origin preflight when set at build time. |

**Warning:** If `BETTER_AUTH_URL` is set to the wrong value, it **overrides** correct Server settings and passkeys will fail. Leave it unset unless you have a reason to pin the URL in env.

#### When you *should* set `BETTER_AUTH_URL`

- **Local development** — pin `http://localhost:3000` (or your dev port) explicitly.
- **Env-as-source-of-truth deploys** — Swarm/Kubernetes/manifests define the public URL and you do not rely on the UI host field.
- **Host not yet in the UI** — first boot or automation before Server settings are saved, but you know the canonical URL.
- **Deliberate override** — Server Host is wrong or stale and you need a known-good URL until the UI is fixed (then align UI and remove the override).
- **Non-default port in the public URL** — e.g. `https://dokploy.example.com:8443` and you want that exact origin in env.

#### When you should *not* set it

- **Standard VPS + domain** — Host and HTTPS are already correct in **Settings → Server** (typical Dokploy install).
- **“Just in case”** — duplicating Server Host in env adds drift risk with no benefit.
- **Different value than Server Host** — unless intentional, this causes origin mismatches.

### Examples

```bash
# Optional — local development only (HTTP allowed on localhost)
BETTER_AUTH_URL=http://localhost:3000

# Optional — production override when env, not UI, owns the public URL
BETTER_AUTH_URL=https://dokploy.example.com

# Typical production — omit both vars; set Host + HTTPS in Settings → Server instead
```

### How values are derived

- **origin** — chosen URL with trailing slash removed (e.g. `https://dokploy.example.com`).
- **rpID** — hostname of that URL (`dokploy.example.com`). For `localhost`, `rpID` is `localhost`.

After changing env vars, **Settings → Server** (Host / HTTPS / server IP), **restart the Dokploy service** so the passkey plugin picks up the new RP configuration. Existing passkeys registered under a different origin will not work until re-registered.

---

## HTTPS requirement

WebAuthn (passkeys) is a browser security feature. Browsers enforce:

| Context | HTTP | HTTPS |
|---------|------|-------|
| `localhost` | Allowed (dev) | Allowed |
| Any other host (IP, domain) | **Blocked** | Required |

Self-hosted Dokploy on a VPS or custom domain **must** be served over HTTPS (Traefik + Let's Encrypt is the default install path). Passkey registration and sign-in will fail on plain `http://` for non-localhost hosts even if email/password login works.

---

## Origin must match the browser URL

WebAuthn checks that the page **origin** (scheme + hostname + port) matches what the server configured. All three must align:

| Browser address bar | Canonical URL (Server Host or env override) | Result |
|---------------------|---------------------------------------------|--------|
| `https://dokploy.example.com` | `https://dokploy.example.com` | Works |
| `https://dokploy.example.com:8443` | `https://dokploy.example.com` | **Fails** (port mismatch) |
| `http://dokploy.example.com` | `https://dokploy.example.com` | **Fails** (scheme mismatch) |
| `https://203.0.113.10` | `https://dokploy.example.com` | **Fails** (hostname mismatch) |
| `http://localhost:3000` | `http://localhost:3000` | Works (dev) |

**Operator checklist:**

1. Pick one canonical URL and use it everywhere (browser, **Settings → Server**, and optional `BETTER_AUTH_URL` if you set it).
2. Configure **Settings → Server** Host + HTTPS to that URL (default path — no env var needed).
3. Avoid accessing the same instance by IP and by domain — pick one and stick to it for passkeys.

Symptoms of a mismatch: "SecurityError", "NotAllowedError", or generic passkey registration/sign-in failures in the browser console; server-side WebAuthn verification rejects the ceremony.

---

## Registering passkeys before sign-in

Passkeys are **per-user credentials** bound to the Dokploy origin. Users must register at least one passkey while authenticated before "Sign in with passkey" on the login page will succeed.

### Steps for end users

1. Sign in with email and password (or another enabled method).
2. Open **Settings → Profile** (`/dashboard/settings/profile`).
3. In the Account card header, click **Manage passkeys**.
4. Optionally enter a name (e.g. "MacBook Touch ID", "YubiKey").
5. Click **Add passkey** and complete the browser or platform prompt (Touch ID, Windows Hello, security key, etc.).
6. Sign out and use **Sign in with passkey** on the login page.

Users can register multiple passkeys and remove old ones from the same dialog.

### Platform passkeys vs security keys

By default, **Add passkey** registers a **platform** authenticator (Touch ID, Windows Hello, device PIN). To register a **cross-platform** security key (YubiKey, etc.), click **Use security key instead** in the Manage passkeys dialog before adding.

---

## Two-factor authentication (2FA)

Passkey sign-in **respects TOTP 2FA** the same way email/password sign-in does:

1. User completes passkey verification.
2. If 2FA is enabled and no valid **trust device** cookie is present, the server returns `{ twoFactorRedirect: true }` and the login page shows the TOTP screen.
3. After entering a valid 6-digit code (or backup code), the session is created.

If the user previously checked **Trust this device** during a 2FA verification, subsequent passkey (and email) sign-ins skip the TOTP prompt until the trust cookie expires.

---

## Conditional passkey autofill (login page)

On supported browsers, the login page preloads passkey conditional mediation so the email field may offer a passkey autofill suggestion. This runs silently — no toast on failure or when no passkeys exist. Manual **Sign in with passkey** waits for any in-flight conditional ceremony to finish before starting.

Conditional autofill is disabled when SSO enforce mode is on or when the 2FA screen is showing.

---

## SSO enforce mode

Enterprise SSO includes an **Enforce SSO** toggle (**Settings → SSO**). When enabled:

- The login page shows **only** SSO sign-in.
- Email/password, passkey, and other fallback methods in `loginContent` are **not rendered**.
- Users cannot register new passkeys from the login page (they were never able to — registration requires an authenticated session in Profile).

To use passkeys in an organization:

- Leave **Enforce SSO** disabled if passkey or password login should remain available alongside SSO, **or**
- Disable enforce mode temporarily so users can sign in with password, register passkeys under Profile, then re-enable if your policy allows passkeys alongside SSO.

When SSO is configured but **not** enforced, the login page shows "Sign in with SSO" above email/password and passkey options; passkey sign-in remains available.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Passkey button does nothing / immediate error | HTTP on non-localhost | Enable HTTPS in **Settings → Server** (or set optional `BETTER_AUTH_URL`) |
| Worked once, fails after domain change | Origin / rpID changed | Update **Settings → Server** Host (or env override), restart, re-register passkeys |
| "No passkeys" on sign-in | User never registered | Sign in another way → Profile → Manage passkeys |
| No passkey button on login | SSO enforce mode | Disable Enforce SSO or use SSO only |
| Dev works, prod fails | Server Host / HTTPS wrong or HTTP on prod | Fix **Settings → Server**; restart (env override optional) |
| `AbortError` / Next.js error overlay on login | Concurrent WebAuthn ceremonies | Refresh; only one passkey operation at a time (mutex prevents double-click) |
| "Already in progress" toast | Double-clicked sign-in or add-passkey | Wait for device prompt to finish |
| `NotAllowedError` / timeout on sign-in | No passkey registered, or prompt denied | Register in Settings → Profile, or use email/password |
| `CHALLENGE_NOT_FOUND` | Stale WebAuthn challenge cookie | Refresh the page and try again |
| `SESSION_NOT_FRESH` on register | Session too old for passkey add | Sign out, sign in again, then add passkey |
| Origin / `INVALID_ORIGIN` errors | Browser URL ≠ canonical URL | Match **Settings → Server** Host (or unset wrong `BETTER_AUTH_URL`); use `localhost` not `127.0.0.1` in dev |
| Passkey bypasses 2FA | Outdated server (pre-hardening) | Upgrade to build with passkey 2FA hook; restart server |
| 2FA shown after passkey (expected) | User has TOTP enabled | Enter authenticator code — same as email login |
| Security key not offered | Platform-only default | Click **Use security key instead** before Add passkey |

---

## Related code

- RP / origin resolution: `packages/server/src/lib/passkey-rp.ts`
- Auth plugin wiring + passkey 2FA hook: `packages/server/src/lib/auth.ts`
- Ceremony mutex + error mapping: `apps/dokploy/lib/passkey-ceremony.ts`
- Conditional autofill hook: `apps/dokploy/utils/hooks/use-passkey-conditional-ui.ts`
- Login UI: `apps/dokploy/pages/index.tsx`
- Passkey management UI: `apps/dokploy/components/dashboard/settings/profile/manage-passkeys.tsx`
- SSO enforce toggle: `apps/dokploy/components/dashboard/settings/servers/actions/toggle-enforce-sso.tsx`
- Unit tests: `apps/dokploy/__test__/lib/passkey-rp.test.ts`, `apps/dokploy/__test__/lib/passkey-ceremony.test.ts`
