# Restoration log stacking regression

This browser fixture imports Dokploy's real `Dialog`, `DrawerLogs`, and global
styles. It contains fake log lines and never calls a restoration API. It needs
the workspace dependencies from the normal development setup; no database or
Docker daemon is needed.

From `apps/dokploy`, run:

```sh
node __test__/components/fixtures/restore-log-stacking/server.mjs
```

Check these scenarios in a browser:

1. Open `http://localhost:5178/?scenario=late-overlay`. The fixture moves the
   sheet overlay after the sheet content, matching the order observed in the
   failing UI. The log text must stay sharp, and the close button must work.
2. Close the logs and reopen them using **Show restoration logs**. The panel
   must remain visible and clickable. **Logs closed** must increase on close.
3. Press Escape. Only the log panel must close, leaving the restore dialog usable.
4. Open `http://localhost:5178/?scenario=simultaneous`. Both panels open together;
   the log panel must stay visible and clickable.
5. Open `http://localhost:5178/`, then **Open restore dialog** and **Show restoration
   logs**. This checks the normal sequential opening path.

Before the fix, the late-overlay scenario blurs and blocks the log panel: its
overlay and content both have `z-index: 50`. After the fix, the log panel's
`z-index: 60` puts it above either restoration overlay regardless of DOM order.

This is a manual real-browser regression fixture, not part of the Node-only
Vitest suite. It deliberately exercises CSS painting and hit testing rather
than checking class names in a mocked DOM.
