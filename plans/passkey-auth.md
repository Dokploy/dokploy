# Passkey authentication — operator guide

Self-hosted Dokploy supports WebAuthn passkeys for passwordless sign-in. This document covers environment configuration, browser security requirements, user onboarding, and interactions with Enterprise SSO.

## Execution checklist

- [x] Document `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` for self-hosted
- [x] Document HTTPS requirement for WebAuthn
- [x] Document origin matching (scheme, hostname, port)
- [x] Document passkey registration flow (Profile → Manage passkeys)
- [x] Document SSO enforce mode hiding passkey login
- [x] Add `BETTER_AUTH_URL` to env example files
- [x] Add code comment in `packages/server/src/lib/passkey-rp.ts` pointing here
- [x] Resolve RP from web server settings (`host` + `https`, else `serverIp`) when env unset
- [x] Unit tests for RP resolution (`apps/dokploy/__test__/lib/passkey-rp.test.ts`)
- [x] Login UX: copy, SSO note, conditional autofill, clearer errors
- [x] Audit logs for passkey create/delete (`resourceType: passkey`)
- [x] Document 2FA behavior (passkey sign-in respects TOTP)
- [x] Document platform vs security key registration
- [x] Troubleshooting matrix for ceremony errors

---

## Environment variables (self-hosted)

Dokploy resolves the WebAuthn **relying party ID** (`rpID`) and **origin** once at server startup. Priority:

1. **Cloud** — `https://app.dokploy.com` (fixed)
2. **`BETTER_AUTH_URL`** — then **`NEXT_PUBLIC_APP_URL`**
3. **Development** — `http://localhost:$PORT` when no env URL
4. **Web server settings** (self-hosted production, no env URL) — `https?://${host}` from **Settings → Server** (`host` + HTTPS toggle), else `http://${serverIp}:$PORT` (same logic as `getDokployUrl`)
5. **Fallback** — `http://localhost:$PORT`

Set env vars on the Dokploy container / process when you need an override that differs from UI host settings.

| Variable | Required | Purpose |
|----------|----------|---------|
| `BETTER_AUTH_URL` | **Recommended** | Public URL of your Dokploy instance, e.g. `https://dokploy.example.com`. Primary source for passkey `rpID` and `origin`. Should match the URL users type in the browser. |
| `NEXT_PUBLIC_APP_URL` | Fallback | Used only when `BETTER_AUTH_URL` is unset. Same format as above. Prefer setting `BETTER_AUTH_URL` so server-side auth and passkey config stay aligned. |

### Examples

```bash
# Production behind Traefik with a custom domain
BETTER_AUTH_URL=https://dokploy.example.com

# Local development (HTTP allowed on localhost only)
BETTER_AUTH_URL=http://localhost:3000
```

### How values are derived

From `packages/server/src/lib/passkey-rp.ts`:

- **origin** — `BETTER_AUTH_URL` with any trailing slash removed (e.g. `https://dokploy.example.com`).
- **rpID** — hostname of that URL (`dokploy.example.com`). For `localhost`, `rpID` is `localhost`.
- If neither env var is set in **development**, defaults to `http://localhost:$PORT` (`PORT` defaults to `3000`).
- If neither env var is set in **production**, Dokploy reads **Server → Host** and HTTPS from the database (restart still required after changing host/HTTPS in the UI).

After changing env vars, **Server → Host**, HTTPS, or `serverIp`, **restart the Dokploy service** so the passkey plugin picks up the new RP configuration. Existing passkeys registered under a different origin will not work until re-registered.

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

| Browser address bar | `BETTER_AUTH_URL` | Result |
|---------------------|-------------------|--------|
| `https://dokploy.example.com` | `https://dokploy.example.com` | Works |
| `https://dokploy.example.com:8443` | `https://dokploy.example.com` | **Fails** (port mismatch) |
| `http://dokploy.example.com` | `https://dokploy.example.com` | **Fails** (scheme mismatch) |
| `https://203.0.113.10` | `https://dokploy.example.com` | **Fails** (hostname mismatch) |
| `http://localhost:3000` | `http://localhost:3000` | Works (dev) |

**Operator checklist:**

1. Set `BETTER_AUTH_URL` to exactly what users open in the browser (including port if non-default).
2. Configure Dokploy **Server → Host** (web server settings) to the same hostname and enable HTTPS when not on localhost.
3. Avoid accessing the same instance by IP and by domain — pick one canonical URL and stick to it for passkeys.

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
| Passkey button does nothing / immediate error | HTTP on non-localhost | Enable HTTPS; set `BETTER_AUTH_URL` to `https://…` |
| Worked once, fails after domain change | Origin / rpID changed | Update `BETTER_AUTH_URL`, restart, re-register passkeys |
| "No passkeys" on sign-in | User never registered | Sign in another way → Profile → Manage passkeys |
| No passkey button on login | SSO enforce mode | Disable Enforce SSO or use SSO only |
| Dev works, prod fails | Missing `BETTER_AUTH_URL` in prod | Set env var to public HTTPS URL and restart |
| `AbortError` / Next.js error overlay on login | Concurrent WebAuthn ceremonies | Refresh; only one passkey operation at a time (mutex prevents double-click) |
| "Already in progress" toast | Double-clicked sign-in or add-passkey | Wait for device prompt to finish |
| `NotAllowedError` / timeout on sign-in | No passkey registered, or prompt denied | Register in Settings → Profile, or use email/password |
| `CHALLENGE_NOT_FOUND` | Stale WebAuthn challenge cookie | Refresh the page and try again |
| `SESSION_NOT_FRESH` on register | Session too old for passkey add | Sign out, sign in again, then add passkey |
| Origin / `INVALID_ORIGIN` errors | Browser URL ≠ `BETTER_AUTH_URL` | Use exact canonical URL (e.g. `localhost` not `127.0.0.1` in dev) |
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
