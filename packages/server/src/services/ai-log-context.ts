import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { IS_CLOUD, paths } from "../constants";
import { db } from "../db";
import {
	applications,
	compose,
	deployments,
	environments,
	libsql,
	mariadb,
	mongo,
	mysql,
	postgres,
	projects,
	redis,
} from "../db/schema";
import { openFiles } from "../utils/ai/file-access";
import {
	type AnalysisTarget,
	MAX_LOG_BYTES,
} from "../utils/ai/log-analysis-schema";
import { getRemoteDocker } from "../utils/servers/remote-docker";
import {
	checkPermission,
	checkServicePermissionAndAccess,
	type PermissionCtx,
} from "./permission";
import { findServerById, getAccessibleServerIds } from "./server";

type Service = {
	id: string;
	appName: string;
	serverId: string | null;
	buildServerId: string | null;
	organizationId: string;
	sourceKind: "application" | "compose" | null;
};
export type SourceLocation = { directory: string; serverId: string | null };
const denied = () =>
	new TRPCError({
		code: "FORBIDDEN",
		message: "Access denied to analysis target",
	});

async function ownedService(ctx: PermissionCtx, id: string): Promise<Service> {
	const selection = {
		sourceType: applications.sourceType,
		appName: applications.appName,
		serverId: applications.serverId,
		buildServerId: applications.buildServerId,
		organizationId: projects.organizationId,
	};
	const [app] = await db
		.select(selection)
		.from(applications)
		.innerJoin(
			environments,
			eq(applications.environmentId, environments.environmentId),
		)
		.innerJoin(projects, eq(environments.projectId, projects.projectId))
		.where(eq(applications.applicationId, id));
	if (app) {
		if (app.organizationId !== ctx.session.activeOrganizationId) throw denied();
		return {
			...app,
			id,
			sourceKind: app.sourceType === "docker" ? null : "application",
		};
	}
	const tables = [
		{ table: compose, key: compose.composeId, kind: "compose" as const },
		{ table: postgres, key: postgres.postgresId, kind: null },
		{ table: mysql, key: mysql.mysqlId, kind: null },
		{ table: mariadb, key: mariadb.mariadbId, kind: null },
		{ table: mongo, key: mongo.mongoId, kind: null },
		{ table: redis, key: redis.redisId, kind: null },
		{ table: libsql, key: libsql.libsqlId, kind: null },
	];
	for (const { table, key, kind } of tables) {
		const [row] = await db
			.select({
				appName: table.appName,
				serverId: table.serverId,
				organizationId: projects.organizationId,
			})
			.from(table)
			.innerJoin(
				environments,
				eq(table.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId))
			.where(eq(key, id));
		if (row) {
			if (row.organizationId !== ctx.session.activeOrganizationId)
				throw denied();
			return { ...row, id, buildServerId: null, sourceKind: kind };
		}
	}
	throw denied();
}

async function verifyServer(
	ctx: PermissionCtx,
	serverId: string | null | undefined,
	requireAccess: boolean,
) {
	if (!serverId) {
		if (IS_CLOUD) throw denied();
		return;
	}
	const server = await findServerById(serverId);
	if (server.organizationId !== ctx.session.activeOrganizationId)
		throw denied();
	if (requireAccess) {
		const allowed = await getAccessibleServerIds({
			userId: ctx.user.id,
			activeOrganizationId: ctx.session.activeOrganizationId,
		});
		if (!allowed.has(serverId)) throw denied();
	}
	if (!server.sshKey?.privateKey)
		throw new Error("Target server has no SSH key configured");
}

export function sourceLocation(
	service: Service,
	appName = service.appName,
	serverId = service.buildServerId || service.serverId,
): SourceLocation | undefined {
	if (!service.sourceKind) return;
	if (!/^[a-zA-Z0-9._-]+$/.test(appName) || appName === "." || appName === "..")
		throw new Error("Invalid source checkout name");
	const directories = paths(!!serverId);
	return {
		directory: path.posix.join(
			service.sourceKind === "application"
				? directories.APPLICATIONS_PATH
				: directories.COMPOSE_PATH,
			appName,
			"code",
		),
		serverId,
	};
}

export function belongsToService(
	labels: Record<string, string>,
	name: string,
	service: Pick<Service, "appName" | "sourceKind">,
) {
	return service.sourceKind === "compose"
		? labels["com.docker.compose.project"] === service.appName ||
				labels["com.docker.stack.namespace"] === service.appName
		: labels["com.docker.swarm.service.name"] === service.appName ||
				name === service.appName;
}

function linkedService(record: Record<string, unknown> | null | undefined) {
	for (const key of [
		"applicationId",
		"composeId",
		"postgresId",
		"mysqlId",
		"mariadbId",
		"mongoId",
		"redisId",
		"libsqlId",
	]) {
		if (typeof record?.[key] === "string") return record[key] as string;
	}
}

export async function resolveLogContext(
	ctx: PermissionCtx,
	target: AnalysisTarget,
	limit: number,
	includeSource = false,
): Promise<{ logs: string; source?: SourceLocation; truncated: boolean }> {
	if (target.type === "deployment") {
		const deployment = await db.query.deployments.findFirst({
			where: eq(deployments.deploymentId, target.deploymentId),
			with: {
				schedule: true,
				backup: true,
				volumeBackup: true,
				previewDeployment: true,
			},
		});
		if (!deployment)
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Deployment not found",
			});
		const serviceId =
			linkedService(deployment) ||
			linkedService(deployment.previewDeployment) ||
			linkedService(deployment.schedule) ||
			linkedService(deployment.backup) ||
			linkedService(deployment.volumeBackup);
		const service = serviceId ? await ownedService(ctx, serviceId) : undefined;
		if (serviceId)
			await checkServicePermissionAndAccess(ctx, serviceId, {
				deployment: ["read"],
			});
		else await checkPermission(ctx, { deployment: ["read"] });
		const serverId =
			deployment.buildServerId ||
			deployment.serverId ||
			deployment.schedule?.serverId ||
			service?.serverId ||
			null;
		if (!service && !serverId) throw denied();
		await verifyServer(ctx, serverId, !service);
		const files = await openFiles(serverId);
		try {
			const root = await files.realpath(paths(!!serverId).LOGS_PATH);
			const logPath = await files.realpath(deployment.logPath);
			if (!logPath.startsWith(`${root}/`)) throw denied();
			const stat = await files.lstat(logPath);
			if (!stat.isFile())
				throw new Error("Deployment log is not a regular file");
			const start = Math.max(0, stat.size - MAX_LOG_BYTES);
			let logs = (
				await files.read(logPath, start, Math.min(stat.size, MAX_LOG_BYTES))
			).toString("utf8");
			if (start > 0 && logs.includes("\n"))
				logs = logs.slice(logs.indexOf("\n") + 1);
			const source =
				service && includeSource
					? sourceLocation(
							service,
							deployment.previewDeployment?.appName || service.appName,
							deployment.buildServerId ||
								service.buildServerId ||
								service.serverId,
						)
					: undefined;
			if (source && serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					service: ["read"],
				});
				await verifyServer(ctx, source.serverId, false);
			}
			return { logs, source, truncated: start > 0 };
		} finally {
			files.close();
		}
	}

	const service = target.serviceId
		? await ownedService(ctx, target.serviceId)
		: undefined;
	if (service)
		await checkServicePermissionAndAccess(ctx, service.id, {
			service: ["read"],
		});
	else await checkPermission(ctx, { docker: ["read"] });
	const serverId = target.serverId || null;
	if (service && serverId !== service.serverId) throw denied();
	await verifyServer(ctx, serverId, !service);
	const docker = await getRemoteDocker(serverId);
	const dockerTarget =
		target.runType === "swarm"
			? docker.getService(target.containerId)
			: docker.getContainer(target.containerId);
	let resource = target.runType === "swarm" ? "services" : "containers";
	let config: Awaited<ReturnType<typeof dockerTarget.inspect>>;
	try {
		config = await dockerTarget.inspect();
	} catch (error) {
		// Swarm log selectors contain task IDs from `docker service ps` / `stack ps`.
		// Authorize the owning service, while keeping the log request scoped to that task.
		if (
			target.runType !== "swarm" ||
			!error ||
			typeof error !== "object" ||
			!("statusCode" in error) ||
			error.statusCode !== 404
		)
			throw error;
		const task = await docker.getTask(target.containerId).inspect();
		config = await docker.getService(task.ServiceID).inspect();
		resource = "tasks";
	}
	const labels: Record<string, string> =
		target.runType === "swarm"
			? config.Spec?.Labels || {}
			: config.Config?.Labels || {};
	const name =
		target.runType === "swarm"
			? config.Spec?.Name || ""
			: (config.Name || "").replace(/^\//, "");
	if (service && !belongsToService(labels, name, service)) throw denied();
	// Stream a finite tail and retain a bounded buffer, including both stdout and stderr.
	// Ask the modem for a streaming response even with follow=false. Dockerode's
	// convenience logs() otherwise buffers the entire response before returning it.
	const stream = await new Promise<Readable>((resolve, reject) => {
		docker.modem.dial(
			{
				path: `/${resource}/${encodeURIComponent(target.containerId)}/logs?`,
				method: "GET",
				isStream: true,
				abortSignal: AbortSignal.timeout(30000),
				statusCodes: {
					200: true,
					404: "Log target not found",
					500: "Runtime logs unavailable",
				},
				options: {
					follow: false,
					stdout: true,
					stderr: true,
					timestamps: true,
					tail: limit,
				},
			},
			(error, result) => {
				if (error) reject(error);
				else if (result instanceof Readable) resolve(result);
				else reject(new Error("Docker returned an invalid log stream"));
			},
		);
	});
	let buffer = Buffer.alloc(0);
	let truncated = false;
	const collect = (chunk: Buffer) => {
		buffer = Buffer.concat([buffer, chunk]);
		if (buffer.length > MAX_LOG_BYTES) {
			truncated = true;
			buffer = buffer.subarray(-MAX_LOG_BYTES);
		}
	};
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			stream.destroy();
			reject(new Error("Runtime log retrieval timed out"));
		}, 30000);
		const output = new PassThrough();
		output.on("data", collect);
		stream.once("error", (error: Error) => {
			clearTimeout(timer);
			reject(error);
		});
		stream.once("end", () => {
			clearTimeout(timer);
			resolve();
		});
		if (config.Config?.Tty || config.Spec?.TaskTemplate?.ContainerSpec?.TTY)
			stream.pipe(output);
		else docker.modem.demuxStream(stream, output, output);
	});
	const source = service && includeSource ? sourceLocation(service) : undefined;
	if (source) await verifyServer(ctx, source.serverId, false);
	return { logs: buffer.toString("utf8"), source, truncated };
}
