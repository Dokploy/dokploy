import type http from "node:http";
import {
	docker,
	execAsync,
	getHostSystemStats,
	getLastAdvancedStatsFile,
	IS_CLOUD,
	recordAdvancedStats,
	validateRequest,
} from "@dokploy/server";
import { type WebSocket, WebSocketServer } from "ws";

const REFRESH_MS = Number(process.env.MONITORING_WS_REFRESH_MS) || 1300;

interface Poller {
	clients: Set<WebSocket>;
	running: boolean;
	appType: "application" | "stack" | "docker-compose";
}

const pollers = new Map<string, Poller>();

async function runPollerLoop(appName: string) {
	const poller = pollers.get(appName);
	if (!poller) return;

	while (poller.running && poller.clients.size > 0) {
		try {
			let data: unknown;

			if (appName === "dokploy") {
				const stat = await getHostSystemStats();
				await recordAdvancedStats(stat, appName);
				data = await getLastAdvancedStatsFile(appName);
			} else {
				const filter = {
					status: ["running"],
					...(poller.appType === "application" && {
						label: [`com.docker.swarm.service.name=${appName}`],
					}),
					...(poller.appType === "stack" && {
						label: [`com.docker.swarm.task.name=${appName}`],
					}),
					...(poller.appType === "docker-compose" && {
						name: [appName],
					}),
				};

				const containers = await docker.listContainers({
					filters: JSON.stringify(filter),
				});

				const container = containers[0];
				if (!container || container?.State !== "running") {
					for (const client of poller.clients) {
						client.close(4000, "Container not running");
					}
					break;
				}

				const { stdout, stderr } = await execAsync(
					`docker stats ${container.Id} --no-stream --format '{"BlockIO":"{{.BlockIO}}","CPUPerc":"{{.CPUPerc}}","Container":"{{.Container}}","ID":"{{.ID}}","MemPerc":"{{.MemPerc}}","MemUsage":"{{.MemUsage}}","Name":"{{.Name}}","NetIO":"{{.NetIO}}"}'`,
				);
				if (stderr) {
					console.error("Docker stats error:", stderr);
					await delay(REFRESH_MS);
					continue;
				}

				const stat = JSON.parse(stdout);
				await recordAdvancedStats(stat, appName);
				data = await getLastAdvancedStatsFile(appName);
			}

			const message = JSON.stringify({ data });
			for (const client of poller.clients) {
				if (client.readyState === client.OPEN) {
					client.send(message);
				}
			}
		} catch (error) {
			const msg = `Error: ${(error as Error).message}`;
			for (const client of poller.clients) {
				client.close(4000, msg);
			}
			break;
		}

		await delay(REFRESH_MS);
	}

	pollers.delete(appName);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function addClientToPoller(
	appName: string,
	appType: "application" | "stack" | "docker-compose",
	ws: WebSocket,
) {
	let poller = pollers.get(appName);

	if (poller) {
		poller.clients.add(ws);
	} else {
		poller = {
			clients: new Set([ws]),
			running: true,
			appType,
		};
		pollers.set(appName, poller);
		runPollerLoop(appName);
	}

	ws.on("close", () => {
		if (!poller) return;
		poller.clients.delete(ws);
		if (poller.clients.size === 0) {
			poller.running = false;
		}
	});
}

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
		const { user, session } = await validateRequest(req);

		if (!appName) {
			ws.close(4000, "appName no provided");
			return;
		}

		if (!user || !session) {
			ws.close();
			return;
		}

		addClientToPoller(appName, appType, ws);
	});
};
