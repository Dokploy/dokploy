import type http from "node:http";
import {
	docker,
	execAsync,
	getHostSystemStats,
	IS_CLOUD,
	recordAdvancedStats,
	validateRequest,
} from "@dokploy/server";
import { WebSocketServer } from "ws";
import { canAccessDockerOverWss } from "./authorize";

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
		const serviceId = url.searchParams.get("serviceId");
		const { user, session } = await validateRequest(req);

		if (!appName) {
			ws.close(4000, "appName no provided");
			return;
		}

		if (!user || !session) {
			ws.close();
			return;
		}

		if (!(await canAccessDockerOverWss(user, session, null, serviceId))) {
			ws.close(4003, "Not authorized");
			return;
		}
		// `docker stats --no-stream` regularly takes longer than the poll interval
		// on hosts with many containers. Without this guard every tick starts
		// another one on top of the ones still running, which compounds: more
		// concurrent readers make the daemon slower, which makes them overlap more.
		let isPolling = false;

		const intervalId = setInterval(async () => {
			if (isPolling || ws.readyState !== ws.OPEN) {
				return;
			}
			isPolling = true;
			try {
				// Special case: when monitoring "dokploy", get host system stats instead of container stats
				if (appName === "dokploy") {
					const stat = await getHostSystemStats();

					const data = await recordAdvancedStats(stat, appName);

					ws.send(
						JSON.stringify({
							data,
						}),
					);
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

				const data = await recordAdvancedStats(stat, appName);

				ws.send(
					JSON.stringify({
						data,
					}),
				);
			} catch (error) {
				// @ts-ignore
				ws.close(4000, `Error: ${error.message}`);
			} finally {
				isPolling = false;
			}
		}, 1300);

		ws.on("close", () => {
			clearInterval(intervalId);
		});
	});
};
