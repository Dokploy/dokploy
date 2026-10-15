# Restore file pagination

The restore dialogs use `backup.listBackupFilesPage`. Its default page size is
50, with a maximum of 100. `backup.listBackupFiles` keeps its array response,
enumeration order, search behavior and 100-entry limit for existing callers.

Directory listing and case-insensitive path/name filtering happen before
pagination. Directories come first in descending full-path codepoint order.
Native database (`.sql.gz`, `.bson.gz`), web-server (`webserver-backup-*.zip`)
and volume (`<volume>-*.tar`) files follow, ordered by the valid UTC timestamp
encoded by `getBackupTimestamp()`. Equal timestamps use descending full-path
codepoint order. Nonstandard filenames come last in that same path order;
their modification time is unknown.

Continuation is scoped to the organization, destination, server, search and
page size. Each request checks permissions and destination/server access again.
The cursor fingerprints the sorted matching inventory. A changed inventory
returns `CONFLICT`; the picker discards its pages and asks for Refresh. Refresh
starts at the newest page. Temporary listing failures can be retried. Search
and context changes discard pending results and incompatible selections.

`rclone lsjson --no-mimetype --no-modtime` remains unchanged. The maintainer
reported approximately ten times slower enumeration when modification metadata
was requested in [#4035](https://github.com/Dokploy/dokploy/issues/4035#issuecomment-4218194604).
Every page still enumerates the directory in O(n), then sorts the matches.
This bounds response entry counts and incremental rendering, not provider I/O
or server memory. The fingerprint can detect path, size and available hash
changes; it cannot detect identical-size overwrites without a provider hash.

Run the focused provider-free tests from the repository root:

```sh
pnpm --filter=dokploy exec vitest run --config __test__/vitest.config.ts __test__/backups/backup-file-listing.test.ts __test__/backups/restore-picker-contract.test.ts
```

The router tests execute the actual tRPC permission middleware and listing
handlers with mocked permission lookup, destinations, servers and command
execution. They cover 251-entry traversal, all native timestamp formats,
deterministic ordering, full-inventory searches, cursor scope/invalidation,
authorization boundaries, shell arguments, errors and legacy compatibility.

The consumer tests render both real restore forms with a substituted picker
and synthetic form defaults. They check context and full-path selection wiring
without starting a restore. They do not prove browser interaction or React
effects. Browser proof must exercise both real pickers: loading, multiple pages,
search/navigation, empty/end states, retry, inventory-change refresh, stale
in-flight responses and selection clearing after context changes. No restore
execution is needed for that proof.
