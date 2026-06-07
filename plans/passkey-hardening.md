# Passkey flow hardening plan

Addresses race conditions, error surfaces, origin/rpID mismatches, and security gaps identified in the passkey flow audit (login, register, server config).

## Execution status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Client ceremony mutex + error hardening | done |
| 2 | Registration UX + parallel auth guards | done |
| 3 | Origin / rpID alignment (server) | done |
| 4 | 2FA + passkey integration (security) | done |
| 5 | Conditional autofill (safe reintroduction) | done |
| 6 | Tests + docs + verification | done |

---

## Phase 1 — Client ceremony mutex + error hardening

**Goal:** Only one WebAuthn ceremony at a time; no Next.js runtime overlays from uncaught DOMExceptions.

### Tasks

- [ ] **1.1** Add `lib/passkey-ceremony.ts` with:
  - Module-level `inFlight` flag (or `AbortController` registry)
  - `runPasskeyCeremony(fn)` wrapper that rejects concurrent calls with a user-facing “already in progress” message
  - Shared helpers: `isPasskeyCeremonyAbort`, `isPasskeyNotAllowed`, `isPasskeySecurityError`
  - Export unified `getPasskeyErrorMessage({ error, caught, flow: 'sign-in' | 'register' })` covering:
    - `AUTH_CANCELLED`, `ERROR_CEREMONY_ABORTED`, `AbortError`
    - `NotAllowedError`, timeout strings
    - `PASSKEY_NOT_FOUND`, `CHALLENGE_NOT_FOUND`, `SESSION_NOT_FRESH`
    - `INVALID_ORIGIN` / forbidden origin (from Better Auth error codes if exposed)
- [ ] **1.2** Update `pages/index.tsx`:
  - Wrap `authClient.signIn.passkey()` in `runPasskeyCeremony`
  - Route both **thrown** and `{ error }` results through unified error mapper (pass `caught` in both paths)
  - `onPasskeySignIn`: early-return if ceremony in flight
- [ ] **1.3** Update `manage-passkeys.tsx`:
  - Wrap `addPasskey` in same mutex
  - `catch` block uses shared helpers (no uncaught `AbortError` / `NotAllowedError`)
  - `handleDeletePasskey`: optionally block delete while `isAdding` (challenge cookie collision)

### Acceptance criteria

- Double-click sign-in or add-passkey does not produce a Next.js error overlay.
- Second concurrent attempt shows a toast, not a browser abort stack trace.
- No-passkey sign-in shows the friendly “register in Settings → Profile” message on both throw and `{ error }` paths.

---

## Phase 2 — Registration UX + parallel auth guards

**Goal:** Touch ID runs outside modal stacking; user sees in-flight state; login actions don’t collide.

### Tasks

- [ ] **2.1** `manage-passkeys.tsx` — in-flight UX:
  - Disable **Manage passkeys** trigger while `isAdding` or `isDeleting`
  - After closing dialog, show persistent feedback (toast or inline banner on profile card): “Waiting for device passkey prompt…”
  - Replace double-`rAF` with `onOpenChange` callback: start ceremony only after `open === false` + `requestAnimationFrame` (or `setTimeout(0)` fallback)
  - Prevent opening delete `AlertDialog` while `isAdding`
- [ ] **2.2** `pages/index.tsx` — cross-disable auth actions:
  - Disable passkey button when `isLoginLoading` or `isTwoFactor`
  - Disable email submit when `isPasskeyLoading`
  - Optional: single `authInFlight` derived state for all login methods
- [ ] **2.3** `manage-passkeys.tsx` — authenticator choice:
  - Default `authenticatorAttachment: "platform"` for MacBook Touch ID
  - Add secondary control: “Use security key” → `cross-platform` (or omit attachment for browser default)
  - Document in dialog copy that platform = Touch ID / Windows Hello; cross-platform = YubiKey, etc.
- [ ] **2.4** `loadPasskeys` Strict Mode guard:
  - `useRef` generation counter or “fetch once per mount” guard to avoid duplicate list calls in dev double-mount

### Acceptance criteria

- Add passkey: dialog closes, user sees clear in-flight state, cannot open a second register flow.
- Login: only one auth method active at a time (buttons disabled appropriately).
- Security key registration path works when selected.

---

## Phase 3 — Origin / rpID alignment (server)

**Goal:** Browser URL, `trustedOrigins`, `baseURL`, and WebAuthn `rpID` stay consistent in dev and self-hosted prod.

### Tasks

- [ ] **3.1** `passkey-rp.ts` — export helpers:
  - `getPasskeyDevOrigins(port)` → `localhost`, `127.0.0.1` (document that only one rpID is active; pick canonical via env)
  - `originMatchesRpConfig(browserOrigin, config)` for client-side preflight (optional shared constants)
- [ ] **3.2** `auth.ts` — `trustedOrigins`:
  - Ensure dev list includes `http://127.0.0.1:$PORT` (already partial)
  - When `settings.host` set: include **both** `http://` and `https://` variants; include explicit port when non-3000
  - Merge `passkeyRp.origin` into trusted origins if not already present
- [ ] **3.3** Client hostname preflight (login + register):
  - Shared helper: compare `window.location.origin` to server-expected origin
  - **Dev:** require `localhost` when `BETTER_AUTH_URL` uses localhost (register already does; **add to sign-in**)
  - **Self-hosted prod:** show actionable message when origin not in expected set (link to `plans/passkey-auth.md`)
- [ ] **3.4** Startup logging (dev only):
  - Log resolved `passkeyRp` once at auth init: `{ rpID, origin }` — aids debugging without guessing
- [ ] **3.5** Document restart requirement when Server → Host / `BETTER_AUTH_URL` changes (`plans/passkey-auth.md` update)

### Out of scope (document only)

Dynamic per-request `rpID` would require forking/wrapping Better Auth passkey endpoints. Plan accepts **canonical URL** discipline + env override instead.

### Acceptance criteria

- Sign-in at `http://127.0.0.1:3000` with `BETTER_AUTH_URL=http://localhost:3000` shows clear preflight error on **both** login and register.
- POST verify with valid session does not fail `INVALID_ORIGIN` for configured dev URLs.
- After changing `BETTER_AUTH_URL`, operator doc states restart required.

---

## Phase 4 — 2FA + passkey integration (security)

**Goal:** Passkey sign-in respects TOTP the same way email sign-in does.

**Severity:** High — passkey currently bypasses 2FA (`twoFactor` hook matches only email/username/phone paths).

### Tasks

- [ ] **4.1** Investigate Better Auth supported pattern:
  - Option A: Extend `twoFactor` plugin `hooks.after` matcher to include `/passkey/verify-authentication` **if** `ctx.context.newSession` is populated for that path (verify in source — passkey may set session directly without `newSession`)
  - Option B: Custom `hooks.after` in `auth.ts` on `/passkey/verify-authentication`:
    1. If user has `twoFactorEnabled` and no valid trust-device cookie → delete session, set 2FA cookie, return `{ twoFactorRedirect: true }` (mirror two-factor plugin)
    2. Reuse trust-device cookie logic from two-factor plugin or call shared internal helper
  - Option C: Upstream Better Auth issue/PR if official support exists in newer version
- [ ] **4.2** Implement chosen option in `packages/server/src/lib/auth.ts`
- [ ] **4.3** `pages/index.tsx` — ensure `handlePasskeySignInResult` 2FA branch is live-tested (not dead code)
- [ ] **4.4** Cloud email verification (if applicable):
  - Verify passkey sign-in respects `requireEmailVerification` for cloud; block or redirect if unverified

### Acceptance criteria

- User with 2FA enabled: passkey sign-in → TOTP screen (same as email/password).
- Trust-device cookie still skips 2FA on subsequent passkey logins (parity with email).
- User without 2FA: passkey sign-in unchanged.

### Security implications

- **High:** Without phase 4, passkey is a second-factor bypass for TOTP-enabled accounts.
- Mitigation must not weaken email 2FA flow; reuse existing cookie semantics.

---

## Phase 5 — Conditional autofill (safe reintroduction)

**Goal:** Restore passkey autofill in email field without racing the sign-in button.

### Tasks

- [ ] **5.1** Add `usePasskeyConditionalUI` hook (login page only):
  - On mount: if `PublicKeyCredential.isConditionalMediationAvailable()` → call `signIn.passkey({ autoFill: true })` **inside mutex**
  - Mutex: if user clicks “Sign in with passkey”, abort/wait for conditional request to settle first (100–200ms or explicit abort)
  - Never call `handlePasskeySignInResult` for silent conditional failures (no toast)
  - Cleanup on unmount: set `cancelled` flag (HMR-safe)
- [ ] **5.2** Keep `autoComplete="username webauthn"` only when conditional UI hook is active; otherwise use `username` only (avoids browser confusion without preload)
- [ ] **5.3** Skip conditional UI when `enforceSSO` or `isTwoFactor`

### Acceptance criteria

- Page load does not break manual passkey button (no `AbortError` overlay).
- With registered passkey, email field may offer autofill suggestion (browser-dependent).
- Without passkeys, conditional path is silent.

---

## Phase 6 — Tests, docs, verification

### Tasks

- [ ] **6.1** Unit tests (`apps/dokploy/__test__/lib/passkey-ceremony.test.ts`):
  - Mutex rejects concurrent calls
  - Error mapper cases (Abort, NotAllowed, SESSION_NOT_FRESH, CHALLENGE_NOT_FOUND)
- [ ] **6.2** Extend `passkey-rp.test.ts` if phase 3 adds helpers
- [ ] **6.3** Update `plans/passkey-auth.md`:
  - 2FA behavior post-fix
  - Canonical URL / restart
  - Security key vs platform
  - Troubleshooting matrix (Abort, NotAllowed, CHALLENGE_NOT_FOUND, SESSION_NOT_FRESH, INVALID_ORIGIN)
- [ ] **6.4** Manual verification checklist (run before marking plan complete):

```
[ ] Login, no passkeys → friendly message, no overlay
[ ] Double-click sign-in → mutex message
[ ] Register on localhost → success
[ ] Register on 127.0.0.1 with localhost BETTER_AUTH_URL → blocked (login + register)
[ ] 2FA enabled → passkey → TOTP prompt
[ ] 2FA + trust device → passkey skips TOTP
[ ] Delete passkey while not adding → success
[ ] Add passkey with security key option → success (if hardware available)
[ ] Conditional autofill + manual button → no AbortError
```

- [ ] **6.5** Typecheck + existing `passkey-rp` tests pass

### Acceptance criteria

- All manual checklist items pass on `http://localhost:3000` dev environment.
- `pnpm exec vitest run --config __test__/vitest.config.ts __test__/lib/passkey*.test.ts` green.

---

## File touch map

| File | Phases |
|------|--------|
| `apps/dokploy/lib/passkey-ceremony.ts` | 1 (new) |
| `apps/dokploy/pages/index.tsx` | 1, 2, 3, 4, 5 |
| `apps/dokploy/components/dashboard/settings/profile/manage-passkeys.tsx` | 1, 2, 3 |
| `packages/server/src/lib/auth.ts` | 3, 4 |
| `packages/server/src/lib/passkey-rp.ts` | 3 |
| `apps/dokploy/__test__/lib/passkey-ceremony.test.ts` | 6 (new) |
| `plans/passkey-auth.md` | 3, 6 |

---

## Implementation order (recommended)

1. **Phase 1** — stops runtime overlays; lowest risk, immediate user benefit.
2. **Phase 2** — registration reliability (modal, in-flight UX).
3. **Phase 3** — origin alignment (reduces cryptic WebAuthn failures).
4. **Phase 4** — security (2FA); do not ship passkeys to production without this.
5. **Phase 5** — optional polish after 1–4 stable.
6. **Phase 6** — lock in with tests and checklist.

---

## Replay notes

Entry points for a future agent:

1. Read this plan and `plans/passkey-auth.md`.
2. Execute phases in order; update the status table above.
3. Phase 4 is the highest-risk change — read `better-auth` two-factor `hooks.after` in `node_modules` before implementing; confirm whether passkey sets `ctx.context.newSession`.
4. Run manual checklist in §6.4 before declaring done.

---

## Open decisions (need user input if unclear during implement)

| # | Question | Default if unanswered |
|---|----------|----------------------|
| 1 | Block passkey login entirely until 2FA phase ships, or ship client fixes first? | Ship 1–3 first; 4 before merge to main |
| 2 | Security key support: separate button vs dropdown? | Secondary text link “Use security key instead” |
| 3 | Re-enable conditional autofill in phase 5, or defer? | Include in plan; implement after 4 |
