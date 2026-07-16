/**
 * Sentinel server id used by the monitoring UI/WS to mean "the local Dokploy
 * host" rather than a remote server. Any other value is treated as a nanoid
 * pointing at a row in the `server` table.
 */
export const LOCAL_SERVER_ID = "local";

/**
 * Resolve the on-disk monitoring bucket name for host-level stats:
 * - `"dokploy"` for the local host
 * - `"dokploy-<serverId>"` for a remote server
 *
 * The shape returned here is validated by
 * `DOKPLOY_HOST_STATS_PATTERN` in `services/application.ts` and by
 * `apiFindMonitoringStats` before it is concatenated into MONITORING_PATH.
 *
 * Kept in a dependency-free module so client bundles can import these
 * without pulling in `node:fs`, `ssh2`, or other server-only modules
 * transitively reachable from `monitoring/utils.ts`.
 */
export const getMonitoringAppName = (serverId?: string | null): string =>
	serverId && serverId !== LOCAL_SERVER_ID ? `dokploy-${serverId}` : "dokploy";
