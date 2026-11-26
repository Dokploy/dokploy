import type http from "node:http";
import {
	type AuditStreamEvent,
	emitAuditEvent,
	execInSandbox,
	findAccessibleSandbox,
	redactAuditValue,
	requestAuditFields,
	validateRequest,
} from "@dokploy/server";
import { checkPermission } from "@dokploy/server/services/permission";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { apiExecSandbox, SANDBOX_DEFAULTS } from "@/server/db/schema";
import { auditWssConnection } from "./utils";

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

		let running = false;
		const authorize = async () => {
			const { user, session } = await validateRequest(req);
			if (!user || !session?.activeOrganizationId) return null;
			const organizationId = session.activeOrganizationId;
			try {
				await checkPermission(
					{
						user: { id: user.id },
						session: { activeOrganizationId: organizationId },
					},
					{ sandbox: ["create"] },
				);
				const sandbox = await findAccessibleSandbox(sandboxId, {
					userId: user.id,
					activeOrganizationId: organizationId,
				});
				return { sandbox, user, session };
			} catch {
				return null;
			}
		};
		const handle = async (raw: RawData) => {
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
			let startedAt = Date.now();
			let execAudit: AuditStreamEvent | undefined;
			try {
				const access = await authorize();
				if (!access) {
					// Access was revoked mid-session; the connection events carry the actor.
					emitAuditEvent({
						source: "wss",
						path: "/sandbox-exec",
						type: "exec",
						action: "start",
						ok: false,
						errorCode: "403",
						input: redactAuditValue({ sandboxId, ...parsed }),
						...requestAuditFields(req, null, null),
					});
					ws.close(4003, "Not authorized");
					return;
				}
				const { sandbox } = access;
				execAudit = {
					source: "wss",
					path: "/sandbox-exec",
					type: "exec",
					input: redactAuditValue({ sandboxId, ...parsed }),
					...requestAuditFields(req, access.session, access.user),
				};
				emitAuditEvent({ ...execAudit, action: "start" });
				startedAt = Date.now();
				const result = await execInSandbox(sandbox, {
					cmd: parsed.cmd,
					cwd: parsed.cwd,
					env: parsed.env,
					timeoutMs: parsed.timeoutMs ?? SANDBOX_DEFAULTS.execTimeoutMs,
					onStdout: (data) => send(ws, { type: "stdout", data }),
					onStderr: (data) => send(ws, { type: "stderr", data }),
				});
				const ok = result.exitCode === 0 && !result.timedOut;
				emitAuditEvent({
					...execAudit,
					action: "end",
					ok,
					errorCode: ok
						? undefined
						: result.timedOut
							? "timeout"
							: String(result.exitCode),
					durationMs: Date.now() - startedAt,
					metadata: { exitCode: result.exitCode, timedOut: result.timedOut },
				});
				send(ws, {
					type: "exit",
					exitCode: result.exitCode,
					timedOut: result.timedOut,
				});
			} catch (error) {
				if (execAudit) {
					emitAuditEvent({
						...execAudit,
						action: "end",
						ok: false,
						errorCode: "error",
						durationMs: Date.now() - startedAt,
					});
				}
				send(ws, {
					type: "error",
					message: error instanceof Error ? error.message : String(error),
				});
			} finally {
				running = false;
			}
		};

		let authorized = false;
		const pending: RawData[] = [];
		ws.on("message", (raw) => {
			if (!authorized) {
				pending.push(raw);
				return;
			}
			void handle(raw);
		});

		const access = await authorize();
		auditWssConnection(ws, req, access ?? {});
		if (!access) {
			ws.close(4003, "Not authorized");
			return;
		}

		authorized = true;
		send(ws, { type: "ready", sandboxId });
		for (const raw of pending.splice(0)) {
			void handle(raw);
		}
	});
};
