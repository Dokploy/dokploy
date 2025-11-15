import type http from "node:http";
import {
	docker,
	execAsync,
	getLastAdvancedStatsFile,
	recordAdvancedStats,
	validateRequest,
} from "@dokploy/server";
import { OSUtils } from "node-os-utils";
import { WebSocketServer } from "ws";
import { formatBytes } from "@/components/dashboard/database/backups/restore-backup";

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
		const intervalId = setInterval(async () => {
			try {
				// Special case: when monitoring "dokploy", get host system stats instead of container stats
				if (appName === "dokploy") {
					const osutils = new OSUtils();

					// Get CPU usage
					const cpuResult = await osutils.cpu.usage();
					const cpuUsage = cpuResult.success ? cpuResult.data : 0;

					// Get memory info
					const memResult = await osutils.memory.info();
					let memUsedGB = 0;
					let memTotalGB = 0;
					let memUsedPercent = 0;
					if (memResult.success) {
						memTotalGB = memResult.data.total.toGB();
						memUsedGB = memResult.data.used.toGB();
						memUsedPercent = memResult.data.usagePercentage;
					}

					// Get network stats from network.overview() or network.statsAsync()
					let netInputBytes = 0;
					let netOutputBytes = 0;
					const networkOverview = await osutils.network.overview();
					if (networkOverview.success) {
						netInputBytes = networkOverview.data.totalRxBytes.toBytes();
						netOutputBytes = networkOverview.data.totalTxBytes.toBytes();
					}

					// Get Block I/O from disk.stats() (available in v2.0!)
					// If disk.stats() doesn't work in container, fallback to /proc/diskstats
					let blockReadBytes = 0;
					let blockWriteBytes = 0;
					const diskStats = await osutils.disk.stats();
					if (diskStats.success && diskStats.data.length > 0) {
						for (const stat of diskStats.data) {
							blockReadBytes += stat.readBytes.toBytes();
							blockWriteBytes += stat.writeBytes.toBytes();
						}
					}

					// Format memory usage similar to docker stats format: "used / total"
					const memUsedFormatted = `${memUsedGB.toFixed(2)}GiB`;
					const memTotalFormatted = `${memTotalGB.toFixed(2)}GiB`;
					const memUsageFormatted = `${memUsedFormatted} / ${memTotalFormatted}`;

					// Format network I/O
					const netInputMb = netInputBytes / (1024 * 1024);
					const netOutputMb = netOutputBytes / (1024 * 1024);
					const netIOFormatted = `${netInputMb.toFixed(2)}MB / ${netOutputMb.toFixed(2)}MB`;

					// Format Block I/O
					const blockIOFormatted = `${formatBytes(blockReadBytes)} / ${formatBytes(blockWriteBytes)}`;

					// Create a stat object compatible with recordAdvancedStats
					const stat = {
						CPUPerc: `${cpuUsage.toFixed(2)}%`,
						MemPerc: `${memUsedPercent.toFixed(2)}%`,
						MemUsage: memUsageFormatted,
						BlockIO: blockIOFormatted,
						NetIO: netIOFormatted,
						Container: "dokploy",
						ID: "host-system",
						Name: "dokploy",
					};

					await recordAdvancedStats(stat, appName);
					const data = await getLastAdvancedStatsFile(appName);
					console.log(data);

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

				await recordAdvancedStats(stat, appName);
				const data = await getLastAdvancedStatsFile(appName);

				ws.send(
					JSON.stringify({
						data,
					}),
				);
			} catch (error) {
				// @ts-ignore
				ws.close(4000, `Error: ${error.message}`);
			}
		}, 1300);

		ws.on("close", () => {
			clearInterval(intervalId);
		});
	});
};
