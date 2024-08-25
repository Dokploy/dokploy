import type http from "node:http";
import { WebSocketServer } from "ws";
import { validateWebSocketRequest } from "../auth/auth";
import { readMonitoringConfig } from "../utils/traefik/application";
import { parseRawConfig } from "../utils/access-log/utils";
import { apiReadStatsLogs } from "../db/schema";
import fs from "node:fs";
import path from "node:path";
import { DYNAMIC_TRAEFIK_PATH } from "../constants";

export const setupRequestLogsWebSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wssTerm = new WebSocketServer({
		noServer: true,
		path: "/request-logs",
	});

	server.on("upgrade", (req, socket, head) => {
		const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);

		if (pathname === "/_next/webpack-hmr") {
			return;
		}
		if (pathname === "/request-logs") {
			wssTerm.handleUpgrade(req, socket, head, function done(ws) {
				wssTerm.emit("connection", ws, req);
			});
		}
	});

	const broadcastUpdate = (input: any) => {
		const rawConfig = readMonitoringConfig();
		const parsedConfig = parseRawConfig(
			rawConfig as string,
			input.page,
			input.sort,
			input.search,
			input.status,
		);

		return parsedConfig;
	};

	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, "access.log");

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	wssTerm.on("connection", async (ws, req) => {
		const { user, session } = await validateWebSocketRequest(req);

		if (!user || !session) {
			ws.close();
			return;
		}

		try {
			ws.on("message", (message: string) => {
				try {
					const input = apiReadStatsLogs.parse(JSON.parse(message));
					const parsedConfig = broadcastUpdate(input);
					ws.send(JSON.stringify(parsedConfig));

					fs.watch(configPath, (eventType) => {
						if (eventType === "change") {
							const parsedConfig = broadcastUpdate(input);
							ws.send(JSON.stringify(parsedConfig));
						}
					});
				} catch (error) {
					ws.send(JSON.stringify({ error: "Invalid message format" }));
				}
			});
		} catch (error) {
			const errorMessage = (error as Error)?.message;
			console.log(errorMessage);
			ws.send(errorMessage);
		}
	});
};
