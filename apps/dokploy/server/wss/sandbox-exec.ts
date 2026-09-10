import type http from "node:http";
import {
	execInSandbox,
	findSandboxById,
	validateRequest,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { apiExecSandbox, SANDBOX_DEFAULTS } from "@/server/db/schema";

const execMessage = apiExecSandbox.omit({ sandboxId: true }).extend({
	type: z.literal("exec"),
});

type ServerMessage =
	| { type: "ready"; sandboxId: string }
	| { type: "stdout"; data: string }
	| { type: "stderr"; data: string }
	| { type: "exit"; exitCode: number; timedOut: boolean }
	| { type: "error"; message: string };

const send = (ws: WebSocket, message: ServerMessage) => {
	if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
};

export const setupSandboxExecWebSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wss = new WebSocketServer({ noServer: true, path: "/sandbox-exec" });

	server.on("upgrade", (req, socket, head) => {
		const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);
		if (pathname === "/sandbox-exec") {
			wss.handleUpgrade(req, socket, head, (ws) => {
				wss.emit("connection", ws, req);
			});
		}
	});

	wss.on("connection", async (ws, req) => {
		const url = new URL(req.url || "", `http://${req.headers.host}`);
		const sandboxId = url.searchParams.get("sandboxId");
		if (!sandboxId) {
			ws.close(4000, "sandboxId not provided");
			return;
		}

		const { user, session } = await validateRequest(req);
		if (!user || !session?.activeOrganizationId) {
			ws.close(4001, "Unauthorized");
			return;
		}
		const ctx = {
			user: { id: user.id },
			session: { activeOrganizationId: session.activeOrganizationId },
		};

		try {
			await checkServicePermissionAndAccess(ctx, sandboxId, {
				deployment: ["create"],
			});
			const sandbox = await findSandboxById(sandboxId);
			if (
				sandbox.environment.project.organizationId !==
				session.activeOrganizationId
			) {
				ws.close(4003, "Not authorized");
				return;
			}
		} catch {
			ws.close(4003, "Not authorized");
			return;
		}

		let running = false;
		send(ws, { type: "ready", sandboxId });

		ws.on("message", async (raw) => {
			let parsed: z.infer<typeof execMessage>;
			try {
				parsed = execMessage.parse(JSON.parse(raw.toString()));
			} catch (error) {
				send(ws, {
					type: "error",
					message: error instanceof Error ? error.message : "Invalid message",
				});
				return;
			}
			if (running) {
				send(ws, { type: "error", message: "A command is already running" });
				return;
			}
			running = true;
			try {
				const sandbox = await findSandboxById(sandboxId);
				const result = await execInSandbox(sandbox, {
					cmd: parsed.cmd,
					cwd: parsed.cwd,
					env: parsed.env,
					timeoutMs: parsed.timeoutMs ?? SANDBOX_DEFAULTS.execTimeoutMs,
					onStdout: (data) => send(ws, { type: "stdout", data }),
					onStderr: (data) => send(ws, { type: "stderr", data }),
				});
				send(ws, {
					type: "exit",
					exitCode: result.exitCode,
					timedOut: result.timedOut,
				});
			} catch (error) {
				send(ws, {
					type: "error",
					message: error instanceof Error ? error.message : String(error),
				});
			} finally {
				running = false;
			}
		});
	});
};
