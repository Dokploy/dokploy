---
name: fix-issue
description: Implement a GitHub issue with reproduction and verification
allowed-tools: Bash, Edit, Write, Read, Glob, Grep, mcp__playwright__*, mcp__dokploy__*
---

The issue number is passed as $1.

## Instance

No instance is running yet — start your own, isolated to this worktree:

1. Check `apps/dokploy/.env` for `PORT` (assigned per-worktree already).
2. If nothing is listening on that port, start it: `pnpm dokploy:dev` in the
   background, then poll `curl -s -o /dev/null -w '%{http_code}' http://localhost:$PORT`
   until it answers (usually ~10-15s).
3. Use `http://localhost:$PORT` as the base URL for Playwright navigation.

Note: `mcp__dokploy__*` (this repo's `.mcp.json`) resolves its URL from
`$DOKPLOY_BASE_URL` once, at session startup — it cannot pick up a port
discovered mid-session. If those tools are unavailable or point at the wrong
instance, fall back to `curl`/`gh api` for API-level checks, or ask the user
to relaunch with `DOKPLOY_BASE_URL` exported first.

## Tools

- `mcp__dokploy__*` — the Dokploy API of the running instance. Use it to set up
  state (create a project, an app, an env var) and to verify backend behavior.
  Search for the tool you need; they are not all loaded upfront.
- `mcp__playwright__*` — the browser at $DOKPLOY_BASE_URL. Use it for anything
  a user would see or click.

Pick by where the bug lives, not by convenience:

- Bug in the UI (rendering, forms, navigation, state) → reproduce in Playwright.
  The API returning correct data proves nothing here.
- Bug in the API, deploy logic, or data → reproduce with the Dokploy MCP.
  A green screenshot proves nothing here.
- Unclear → do both.

Use the MCP to reach the state you need quickly, then verify in the UI. Do not
click through ten screens to create a project the API can create in one call.

## Steps

1. Run `gh issue view $1` and read the full issue, including comments.
2. Reproduce the bug with the appropriate tool. If you cannot reproduce it,
   comment on the issue explaining what you tried and STOP.
   Do not implement anything.
3. Implement the fix. Keep the change minimal and scoped to the issue.
4. Run `pnpm test`, then re-run the same reproduction from step 2.
5. Only if both pass: commit and run `gh pr create`. The PR description must
   include the before/after reproduction steps and reference the issue.

Never skip step 2. A fix you cannot reproduce and then verify is not a fix.