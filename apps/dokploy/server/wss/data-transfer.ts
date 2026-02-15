/**
 * WebSocket server for data transfer progress
 */
import type http from "node:http";
import {
	checkServiceAccess,
	findApplicationById,
	findComposeById,
	findMariadbById,
	findMongoById,
	findMountsByApplicationId,
	findMySqlById,
	findPostgresById,
	findRedisById,
	validateRequest,
} from "@dokploy/server";
import type {
	FileCompareResult,
	MountTransferConfig,
	TransferConfig,
	TransferMessage,
	TransferStatus,
} from "@dokploy/server/utils/transfer";
import {
	compareFileLists,
	runPreflightChecks,
	scanMount,
	syncMount,
} from "@dokploy/server/utils/transfer";
import { z } from "zod";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { validateTransferTargetServer } from "@/server/utils/transfer";

interface TransferSession {
	config?: TransferConfig;
	sourceFiles: Map<string, FileCompareResult[]>;
	targetFiles: Map<string, FileCompareResult[]>;
	comparisonResults: Map<string, FileCompareResult[]>;
	abortController?: AbortController;
	isPaused: boolean;
}

interface WebSocketAuthContext {
	userId: string;
	isMember: boolean;
	organizationId: string;
}

const scanConfigSchema = z
	.object({
		serviceId: z.string().min(1),
		serviceType: z.enum([
			"application",
			"postgres",
			"mysql",
			"mariadb",
			"mongo",
			"redis",
			"compose",
		]),
		targetServerId: z.string().trim().nullable().optional(),
		mergeStrategy: z
			.enum(["skip", "overwrite", "newer", "manual"])
			.default("manual"),
	})
	.passthrough();

const wsCommandSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("scan"), config: scanConfigSchema }),
	z.object({ action: z.literal("compare") }),
	z.object({
		action: z.literal("sync"),
		manualDecisions: z.record(z.enum(["skip", "overwrite"])).optional(),
	}),
	z.object({ action: z.literal("pause") }),
	z.object({ action: z.literal("resume") }),
	z.object({ action: z.literal("cancel") }),
]);

function sendMessage(
	ws: WebSocket,
	type: TransferMessage["type"],
	payload: unknown,
) {
	if (ws.readyState === ws.OPEN) {
		ws.send(
			JSON.stringify({
				type,
				payload,
				timestamp: Date.now(),
			} satisfies TransferMessage),
		);
	}
}

async function getServiceScope(
	serviceType: z.infer<typeof scanConfigSchema>["serviceType"],
	serviceId: string,
): Promise<{ sourceServerId: string | null; organizationId: string }> {
	switch (serviceType) {
		case "application": {
			const service = await findApplicationById(serviceId);
			return {
				sourceServerId: service.serverId,
				organizationId: service.environment.project.organizationId,
			};
		}
		case "compose": {
			const service = await findComposeById(serviceId);
			return {
				sourceServerId: service.serverId,
				organizationId: service.environment.project.organizationId,
			};
		}
		case "postgres": {
			const service = await findPostgresById(serviceId);
			return {
				sourceServerId: service.serverId,
				organizationId: service.environment.project.organizationId,
			};
		}
		case "mysql": {
			const service = await findMySqlById(serviceId);
			return {
				sourceServerId: service.serverId,
				organizationId: service.environment.project.organizationId,
			};
		}
		case "mariadb": {
			const service = await findMariadbById(serviceId);
			return {
				sourceServerId: service.serverId,
				organizationId: service.environment.project.organizationId,
			};
		}
		case "mongo": {
			const service = await findMongoById(serviceId);
			return {
				sourceServerId: service.serverId,
				organizationId: service.environment.project.organizationId,
			};
		}
		case "redis": {
			const service = await findRedisById(serviceId);
			return {
				sourceServerId: service.serverId,
				organizationId: service.environment.project.organizationId,
			};
		}
		default:
			throw new Error(`Unsupported service type: ${serviceType}`);
	}
}

async function buildAuthorizedTransferConfig(
	authContext: WebSocketAuthContext,
	config: z.infer<typeof scanConfigSchema>,
): Promise<TransferConfig> {
	const serviceScope = await getServiceScope(
		config.serviceType,
		config.serviceId,
	);

	if (serviceScope.organizationId !== authContext.organizationId) {
		throw new Error("You are not authorized to transfer this service");
	}

	if (authContext.isMember) {
		await checkServiceAccess(
			authContext.userId,
			config.serviceId,
			authContext.organizationId,
			"delete",
		);
	}

	const targetServerId = await validateTransferTargetServer({
		targetServerId: config.targetServerId,
		sourceServerId: serviceScope.sourceServerId,
		organizationId: authContext.organizationId,
	});

	if (!targetServerId) {
		throw new Error("Target server is required for data transfer");
	}

	const mountRows = await findMountsByApplicationId(
		config.serviceId,
		config.serviceType,
	);
	const mounts: MountTransferConfig[] = mountRows
		.filter((mount) => mount.type === "volume" || mount.type === "bind")
		.map((mount) => {
			const sourcePath =
				mount.type === "volume" ? mount.volumeName : mount.hostPath;

			if (!sourcePath) {
				throw new Error(`Mount ${mount.mountId} is missing source path`);
			}

			return {
				mountId: mount.mountId,
				mountType: mount.type as "volume" | "bind",
				sourcePath,
				targetPath: sourcePath,
				createIfMissing: true,
				updateMountConfig: false,
			};
		});

	return {
		serviceId: config.serviceId,
		serviceType: config.serviceType,
		sourceServerId: serviceScope.sourceServerId,
		targetServerId,
		mergeStrategy: config.mergeStrategy,
		mounts,
	};
}

export const setupDataTransferWebSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wss = new WebSocketServer({
		noServer: true,
		path: "/data-transfer",
	});

	server.on("upgrade", (req, socket, head) => {
		const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);

		if (pathname === "/data-transfer") {
			wss.handleUpgrade(req, socket, head, (ws) => {
				wss.emit("connection", ws, req);
			});
		}
	});

	wss.on("connection", async (ws, req) => {
		const { user, session } = await validateRequest(req);

		if (!user || !session) {
			ws.close(4001, "Unauthorized");
			return;
		}

		const authContext: WebSocketAuthContext = {
			userId: user.id,
			isMember: user.role === "member",
			organizationId: session.activeOrganizationId || "",
		};

		const transferSession: TransferSession = {
			sourceFiles: new Map(),
			targetFiles: new Map(),
			comparisonResults: new Map(),
			isPaused: false,
		};

		ws.on("message", async (data) => {
			try {
				const parsedData = JSON.parse(data.toString()) as unknown;
				const command = wsCommandSchema.parse(parsedData);

				switch (command.action) {
					case "scan": {
						const secureConfig = await buildAuthorizedTransferConfig(
							authContext,
							command.config,
						);
						await handleScan(ws, transferSession, secureConfig);
						break;
					}
					case "compare":
						await handleCompare(ws, transferSession);
						break;

					case "sync":
						await handleSync(ws, transferSession, command.manualDecisions);
						break;

					case "pause":
						transferSession.isPaused = true;
						sendMessage(ws, "paused", {});
						break;

					case "resume":
						transferSession.isPaused = false;
						sendMessage(ws, "resumed", {});
						break;

					case "cancel":
						transferSession.abortController?.abort();
						sendMessage(ws, "cancelled", {});
						break;
				}
			} catch (error) {
				sendMessage(ws, "error", {
					message:
						error instanceof z.ZodError
							? error.issues.map((issue) => issue.message).join(", ")
							: error instanceof Error
								? error.message
								: "Unknown error",
				});
			}
		});

		ws.on("close", () => {
			transferSession.abortController?.abort();
		});
	});
};

async function handleScan(
	ws: WebSocket,
	session: TransferSession,
	config: TransferConfig,
) {
	session.config = config;
	session.sourceFiles.clear();
	session.targetFiles.clear();

	sendMessage(ws, "scan_start", { mounts: config.mounts.length });

	// Run preflight checks
	const preflightResults = await runPreflightChecks(
		config.targetServerId,
		config.mounts,
		(data) => {
			sendMessage(ws, "scan_progress", {
				phase: "preflight",
				mount: data.mount,
				result: data.result,
			});
		},
	);

	// Scan source mounts
	for (const mount of config.mounts) {
		sendMessage(ws, "scan_progress", {
			phase: "scanning_source",
			mount: mount.mountId,
		});

		const files = await scanMount(config.sourceServerId, mount, (file) => {
			sendMessage(ws, "scan_progress", {
				phase: "file_found",
				mount: mount.mountId,
				file: file.path,
			});
		});

		session.sourceFiles.set(mount.mountId, files as FileCompareResult[]);
	}

	// Scan target mounts
	for (const mount of config.mounts) {
		sendMessage(ws, "scan_progress", {
			phase: "scanning_target",
			mount: mount.mountId,
		});

		const files = await scanMount(
			config.targetServerId,
			{ ...mount, sourcePath: mount.targetPath },
			(file) => {
				sendMessage(ws, "scan_progress", {
					phase: "target_file_found",
					mount: mount.mountId,
					file: file.path,
				});
			},
		);

		session.targetFiles.set(mount.mountId, files as FileCompareResult[]);
	}

	sendMessage(ws, "scan_complete", {
		preflightResults: Object.fromEntries(preflightResults),
		sourceCounts: Object.fromEntries(
			Array.from(session.sourceFiles.entries()).map(([k, v]) => [k, v.length]),
		),
		targetCounts: Object.fromEntries(
			Array.from(session.targetFiles.entries()).map(([k, v]) => [k, v.length]),
		),
	});
}

async function handleCompare(ws: WebSocket, session: TransferSession) {
	if (!session.config) {
		sendMessage(ws, "error", { message: "No scan has been performed" });
		return;
	}

	sendMessage(ws, "compare_start", {});

	session.comparisonResults.clear();

	for (const mount of session.config.mounts) {
		const sourceFiles = session.sourceFiles.get(mount.mountId) || [];
		const targetFiles = session.targetFiles.get(mount.mountId) || [];

		const comparison = compareFileLists(sourceFiles, targetFiles);
		session.comparisonResults.set(mount.mountId, comparison);

		sendMessage(ws, "compare_progress", {
			mount: mount.mountId,
			total: comparison.length,
			match: comparison.filter((f) => f.status === "match").length,
			missing: comparison.filter((f) => f.status === "missing_target").length,
			newer: comparison.filter(
				(f) => f.status === "newer_source" || f.status === "newer_target",
			).length,
			conflict: comparison.filter((f) => f.status === "conflict").length,
		});
	}

	// Send full comparison results
	sendMessage(ws, "compare_complete", {
		results: Object.fromEntries(session.comparisonResults),
	});
}

async function handleSync(
	ws: WebSocket,
	session: TransferSession,
	manualDecisions?: Record<string, "skip" | "overwrite">,
) {
	if (!session.config) {
		sendMessage(ws, "error", { message: "No scan has been performed" });
		return;
	}

	session.abortController = new AbortController();
	const waitForResume = async () => {
		while (session.isPaused) {
			if (session.abortController?.signal.aborted) return;
			await new Promise((resolve) => setTimeout(resolve, 150));
		}
	};

	sendMessage(ws, "sync_start", {});

	const allErrors: string[] = [];

	for (const mount of session.config.mounts) {
		const files = session.comparisonResults.get(mount.mountId) || [];

		const result = await syncMount(
			mount,
			files,
			session.config.sourceServerId,
			session.config.targetServerId,
			session.config.mergeStrategy,
			manualDecisions,
			session.abortController.signal,
			(status) => {
				sendMessage(ws, "sync_progress", {
					mount: mount.mountId,
					...status,
				});
			},
			waitForResume,
		);

		allErrors.push(...result.errors);
	}

	sendMessage(ws, "sync_complete", {
		success: allErrors.length === 0,
		errors: allErrors,
	});
}
