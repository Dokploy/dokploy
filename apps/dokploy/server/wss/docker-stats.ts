import type http from "node:http";
import {
	docker,
	execAsync,
	findServerById,
	getHostSystemStats,
	getLastAdvancedStatsFile,
	getMonitoringAppName,
	getRemoteSystemStats,
	IS_CLOUD,
	LOCAL_SERVER_ID,
	recordAdvancedStats,
	recordRemoteDiskStats,
	validateRequest,
} from "@dokploy/server";
import { hasPermission } from "@dokploy/server/services/permission";
import { WebSocketServer } from "ws";

// serverIds are nanoid-generated (alphanumeric + `_` and `-`). Reject anything
// else at the WS boundary so user input cannot reach filesystem paths or SSH
// lookups in unexpected forms.
const SERVER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export const setupDockerStatsMonitoringSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wssTerm = new WebSocketServer({
		noServer: true,
		path: "/listen-docker-stats-monitoring",
	});

	server.on("upgrade", (req, socket, head) => {
		const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);

		if (pathname === "/_next/webpack-hmr") {
			return;
		}
		if (pathname === "/listen-docker-stats-monitoring") {
			wssTerm.handleUpgrade(req, socket, head, function done(ws) {
				wssTerm.emit("connection", ws, req);
			});
		}
	});

	wssTerm.on("connection", async (ws, req) => {
		const url = new URL(req.url || "", `http://${req.headers.host}`);

		if (IS_CLOUD) {
			ws.send("This feature is not available in the cloud version.");
			ws.close();
			return;
		}
		const appName = url.searchParams.get("appName");
		const appType = (url.searchParams.get("appType") || "application") as
			| "application"
			| "stack"
			| "docker-compose";
		const serverIdParam = url.searchParams.get("serverId");
		const { user, session } = await validateRequest(req);

		if (!appName) {
			ws.close(4000, "appName no provided");
			return;
		}

		if (!user || !session) {
			ws.close();
			return;
		}

		// Resolve the optional remote serverId. We do this up-front so authz and
		// path-traversal checks run before any SSH or filesystem work.
		let resolvedServerId: string | null = null;
		if (serverIdParam && serverIdParam !== LOCAL_SERVER_ID) {
			if (!SERVER_ID_PATTERN.test(serverIdParam)) {
				ws.close(4400, "Invalid serverId");
				return;
			}

			const activeOrganizationId = (
				session as typeof session & { activeOrganizationId?: string }
			).activeOrganizationId;
			if (!activeOrganizationId) {
				ws.close(4403, "forbidden");
				return;
			}

			try {
				const remoteServer = await findServerById(serverIdParam);
				if (remoteServer.organizationId !== activeOrganizationId) {
					ws.close(4403, "forbidden");
					return;
				}
				const canRead = await hasPermission(
					{
						user: { id: user.id },
						session: { activeOrganizationId },
					},
					{ monitoring: ["read"] },
				);
				if (!canRead) {
					ws.close(4403, "forbidden");
					return;
				}
				// Use the canonical DB-resolved serverId, not the raw query param.
				resolvedServerId = remoteServer.serverId;
			} catch {
				ws.close(4403, "forbidden");
				return;
			}
		}

		// `inFlight` guards against overlapping ticks. The tick body awaits SSH
		// (`getRemoteSystemStats`) which can take longer than the 1300ms interval,
		// and `updateStatsFile` does non-atomic read-modify-write on shared JSON
		// files; overlapping invocations would race on those writes (lost samples,
		// possible JSON corruption). If a tick is still running we skip this one.
		let inFlight = false;
		let intervalId: ReturnType<typeof setInterval> | null = null;
		intervalId = setInterval(async () => {
			if (inFlight) return;
			inFlight = true;
			try {
				// Special case: when monitoring "dokploy" (the host system rather than a
				// container). If serverId is provided and not "local", fetch the host stats
				// from that remote server over SSH; otherwise read local host stats.
				if (appName === "dokploy") {
					if (resolvedServerId) {
						const recordedAppName = getMonitoringAppName(resolvedServerId);
						const { container, disk } =
							await getRemoteSystemStats(resolvedServerId);
						await recordAdvancedStats(container, recordedAppName);
						await recordRemoteDiskStats(
							recordedAppName,
							disk.diskTotal,
							disk.diskUsed,
						);
						const data = await getLastAdvancedStatsFile(recordedAppName);
						ws.send(JSON.stringify({ data }));
					} else {
						const stat = await getHostSystemStats();
						await recordAdvancedStats(stat, "dokploy");
						const data = await getLastAdvancedStatsFile("dokploy");
						ws.send(JSON.stringify({ data }));
					}
					return;
				}

				const filter = {
					status: ["running"],
					...(appType === "application" && {
						label: [`com.docker.swarm.service.name=${appName}`],
					}),
					...(appType === "stack" && {
						label: [`com.docker.swarm.task.name=${appName}`],
					}),
					...(appType === "docker-compose" && {
						name: [appName],
					}),
				};

				const containers = await docker.listContainers({
					filters: JSON.stringify(filter),
				});

				const container = containers[0];
				if (!container || container?.State !== "running") {
					ws.close(4000, "Container not running");
					return;
				}
				const { stdout, stderr } = await execAsync(
					`docker stats ${container.Id} --no-stream --format \'{"BlockIO":"{{.BlockIO}}","CPUPerc":"{{.CPUPerc}}","Container":"{{.Container}}","ID":"{{.ID}}","MemPerc":"{{.MemPerc}}","MemUsage":"{{.MemUsage}}","Name":"{{.Name}}","NetIO":"{{.NetIO}}"}\'`,
				);
				if (stderr) {
					console.error("Docker stats error:", stderr);
					return;
				}
				const stat = JSON.parse(stdout);

				await recordAdvancedStats(stat, appName);
				const data = await getLastAdvancedStatsFile(appName);

				ws.send(
					JSON.stringify({
						data,
					}),
				);
			} catch (error) {
				// Clear the interval BEFORE closing the socket so no further tick can
				// fire (and trigger a `ws.send` on an already-closed socket, or kick off
				// another SSH connection after we've decided to give up).
				if (intervalId !== null) {
					clearInterval(intervalId);
					intervalId = null;
				}
				// @ts-ignore
				ws.close(4000, `Error: ${error.message}`);
			} finally {
				inFlight = false;
			}
		}, 1300);

		ws.on("close", () => {
			if (intervalId !== null) {
				clearInterval(intervalId);
				intervalId = null;
			}
		});
	});
};
