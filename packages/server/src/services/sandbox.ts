import { posix } from "node:path";
import { db } from "@dokploy/server/db";
import {
	type apiCreateSandbox,
	SANDBOX_DEFAULTS,
	sandboxes,
} from "@dokploy/server/db/schema";
import { getAccessibleServerIds } from "@dokploy/server/services/server";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import { TRPCError } from "@trpc/server";
import type Dockerode from "dockerode";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { quote } from "shell-quote";
import type { z } from "zod";
import {
	buildSandboxContainerOptions,
	buildSandboxTimeoutCommand,
	getSandboxNetworkName,
	parseSandboxUser,
	SANDBOX_DEFAULT_USER,
	SANDBOX_LABEL,
	SANDBOX_ORGANIZATION_LABEL,
	SANDBOX_ROOT_USER,
	type SandboxNetworkMode,
	withSandboxActivity,
} from "../utils/sandbox/container";
import {
	runSandboxExec,
	type SandboxExecOptions,
	type SandboxExecResult,
} from "../utils/sandbox/exec";
import {
	buildSandboxFindCommand,
	buildSandboxLsCommand,
	parseSandboxFindOutput,
	parseSandboxLsOutput,
} from "../utils/sandbox/files";
import {
	canUseSandboxRemoteExec,
	runSandboxExecRemote,
} from "../utils/sandbox/remote-exec";
import {
	buildSandboxDirectoryTar,
	buildSandboxFileTar,
	extractSandboxFile,
	SandboxFileTooLargeError,
	SandboxNotRegularFileError,
} from "../utils/sandbox/tar";
import { SANDBOX_TEMPLATES } from "../utils/sandbox/templates";

export type Sandbox = typeof sandboxes.$inferSelect;

export const SANDBOX_MAX_FILE_BYTES = 10 * 1024 * 1024;
const INTERNAL_EXEC_TIMEOUT_MS = 15_000;
const STUCK_CREATING_MS = 10 * 60 * 1000;

const statusCodeOf = (error: unknown) =>
	(error as { statusCode?: number } | null)?.statusCode;

const isNotFound = (error: unknown) => statusCodeOf(error) === 404;

const isContainerGone = (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	return (
		(statusCodeOf(error) === 404 && /no such container:/i.test(message)) ||
		(statusCodeOf(error) === 409 &&
			/is not running|removal .* in progress/i.test(message))
	);
};

const runContainerExec = (
	serverId: string | null,
	docker: Dockerode,
	containerId: string,
	options: SandboxExecOptions,
) =>
	serverId && canUseSandboxRemoteExec(options.env)
		? runSandboxExecRemote(serverId, containerId, options)
		: runSandboxExec(docker, containerId, options);

const sandboxEndsAt = sql`LEAST(${sandboxes.expiresAt}, ${sandboxes.deadlineAt})`;

const sandboxExpiryFrom = (timeoutMs: unknown) =>
	sql<Date>`LEAST(now() + ${timeoutMs} * interval '1 millisecond', ${sandboxes.deadlineAt})`;

const expireSandbox = async <T extends Sandbox>(sandbox: T) => {
	const [expired] = await db
		.update(sandboxes)
		.set({ status: "killed", killedAt: sandboxEndsAt })
		.where(
			and(
				eq(sandboxes.sandboxId, sandbox.sandboxId),
				eq(sandboxes.status, "running"),
				sql`${sandboxEndsAt} <= now()`,
			),
		)
		.returning();
	if (!expired) {
		const current = await db.query.sandboxes.findFirst({
			where: eq(sandboxes.sandboxId, sandbox.sandboxId),
		});
		return { ...sandbox, ...current };
	}
	if (expired.containerId) {
		void removeSandboxContainer(expired.serverId, expired.containerId).catch(
			(error: unknown) => {
				console.warn(
					`[Sandbox] Could not remove the container of expired sandbox ${expired.sandboxId}:`,
					error instanceof Error ? error.message : error,
				);
			},
		);
	}
	return { ...sandbox, ...expired };
};

const settleSandboxStatus = async <T extends Sandbox>(sandbox: T) => {
	const now = Date.now();
	if (sandbox.status === "running") {
		const endsAt = Math.min(
			sandbox.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
			sandbox.deadlineAt.getTime(),
		);
		return endsAt <= now ? expireSandbox(sandbox) : sandbox;
	}
	if (
		sandbox.status === "creating" &&
		Date.parse(sandbox.createdAt) <= now - STUCK_CREATING_MS
	) {
		await updateSandboxById(sandbox.sandboxId, { status: "error" });
		return { ...sandbox, status: "error" as const };
	}
	return sandbox;
};

const markSandboxGone = async (sandbox: Sandbox) => {
	await updateSandboxById(sandbox.sandboxId, {
		status: "killed",
		killedAt: new Date(),
	});
	return new TRPCError({
		code: "PRECONDITION_FAILED",
		message: "Sandbox is killed",
	});
};

const withLiveContainer = async <T>(
	sandbox: Sandbox,
	run: () => Promise<T>,
): Promise<T> => {
	try {
		return await run();
	} catch (error) {
		if (isContainerGone(error)) throw await markSandboxGone(sandbox);
		throw error;
	}
};

export const findSandboxById = async (
	sandboxId: string,
	organizationId?: string,
) => {
	const result = await db.query.sandboxes.findFirst({
		where: and(
			eq(sandboxes.sandboxId, sandboxId),
			organizationId ? eq(sandboxes.organizationId, organizationId) : undefined,
		),
		with: {
			server: { columns: { serverId: true, name: true, serverStatus: true } },
		},
	});
	if (!result) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox not found" });
	}
	return settleSandboxStatus(result);
};

export const findAccessibleSandbox = async (
	sandboxId: string,
	session: { userId: string; activeOrganizationId: string },
) => {
	const sandbox = await findSandboxById(
		sandboxId,
		session.activeOrganizationId,
	);
	if (sandbox.serverId) {
		const accessibleIds = await getAccessibleServerIds(session);
		if (!accessibleIds.has(sandbox.serverId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You are not authorized to access this server",
			});
		}
	}
	return sandbox;
};

export const stripSandboxSecrets = <T extends { envVars: string | null }>(
	sandbox: T,
) => {
	const { envVars: _envVars, ...rest } = sandbox;
	return rest;
};

const settleSandboxesWithDocker = async <T extends Sandbox>(
	rows: T[],
	organizationId: string,
	serverId: string | null,
) => {
	const running = rows.filter((row) => row.status === "running");
	if (running.length === 0) return rows;
	let live: Set<string>;
	try {
		const docker = await getRemoteDocker(serverId);
		const containers = await docker.listContainers({
			filters: {
				label: [
					`${SANDBOX_LABEL}=true`,
					`${SANDBOX_ORGANIZATION_LABEL}=${organizationId}`,
				],
			},
		});
		live = new Set(containers.map((container) => container.Id));
	} catch (error) {
		console.warn(
			`[Sandbox] Could not read container status on ${serverId ?? "the Dokploy server"}:`,
			error instanceof Error ? error.message : error,
		);
		return rows;
	}
	const killedAt = new Date();
	return Promise.all(
		rows.map(async (row) => {
			if (row.status !== "running") return row;
			if (row.containerId && live.has(row.containerId)) return row;
			const data = { status: "killed" as const, killedAt };
			await updateSandboxById(row.sandboxId, data);
			return { ...row, ...data };
		}),
	);
};

export const findSandboxesByOrganizationId = async (
	organizationId: string,
	serverId?: string | null,
) => {
	const rows = await db.query.sandboxes.findMany({
		where: and(
			eq(sandboxes.organizationId, organizationId),
			serverId === undefined
				? undefined
				: serverId === null
					? isNull(sandboxes.serverId)
					: eq(sandboxes.serverId, serverId),
		),
		orderBy: desc(sandboxes.createdAt),
	});
	const settled = await Promise.all(rows.map(settleSandboxStatus));
	if (serverId === undefined) return settled;
	return settleSandboxesWithDocker(settled, organizationId, serverId);
};

export const updateSandboxById = async (
	sandboxId: string,
	data: Partial<Sandbox>,
) => {
	const [result] = await db
		.update(sandboxes)
		.set(data)
		.where(eq(sandboxes.sandboxId, sandboxId))
		.returning();
	return result;
};

export const removeSandboxById = async (sandboxId: string) => {
	const [result] = await db
		.delete(sandboxes)
		.where(eq(sandboxes.sandboxId, sandboxId))
		.returning();
	return result;
};

export const ensureSandboxImage = async (docker: Dockerode, image: string) => {
	try {
		await docker.getImage(image).inspect();
		return;
	} catch (error) {
		if (!isNotFound(error)) throw error;
	}
	await new Promise<void>((resolve, reject) => {
		docker.pull(image, {}, (err, stream) => {
			if (err) {
				reject(err);
				return;
			}
			docker.modem.followProgress(stream, (progressError: Error | null) => {
				if (progressError) reject(progressError);
				else resolve();
			});
		});
	});
};

export const SANDBOX_NETWORK_OPTIONS = {
	"com.docker.network.bridge.enable_icc": "false",
};

export const ensureSandboxNetwork = async (
	docker: Dockerode,
	mode: SandboxNetworkMode,
) => {
	const name = getSandboxNetworkName(mode);
	let existing: {
		Options?: Record<string, string>;
		Containers?: Record<string, unknown>;
	} | null = null;
	try {
		existing = await docker.getNetwork(name).inspect();
	} catch (error) {
		if (!isNotFound(error)) throw error;
	}
	if (existing) {
		if (
			existing.Options?.["com.docker.network.bridge.enable_icc"] === "false"
		) {
			return name;
		}
		if (Object.keys(existing.Containers ?? {}).length > 0) {
			throw new Error(
				`Network ${name} allows traffic between containers and is in use. Remove the containers attached to it and try again.`,
			);
		}
		await docker.getNetwork(name).remove();
	}
	try {
		await docker.createNetwork({
			Name: name,
			Driver: "bridge",
			Internal: mode === "isolated",
			CheckDuplicate: true,
			Options: { ...SANDBOX_NETWORK_OPTIONS },
			Labels: { [SANDBOX_LABEL]: "true" },
		});
	} catch (error) {
		if (statusCodeOf(error) !== 409) throw error;
	}
	return name;
};

const prepareSandboxWorkdir = async (
	serverId: string | null,
	docker: Dockerode,
	containerId: string,
	workdir: string,
	user: string | null,
) => {
	const parent = posix.dirname(workdir);
	const name = posix.basename(workdir);
	if (!name) return;
	if (parent !== "/") {
		await runContainerExec(serverId, docker, containerId, {
			cmd: `mkdir -p ${quote([parent])}`,
			user: SANDBOX_ROOT_USER,
			timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
		}).catch(() => {});
	}
	const ids = parseSandboxUser(user) ?? { uid: 0, gid: 0 };
	const tar = await buildSandboxDirectoryTar({ name, ...ids });
	await docker.getContainer(containerId).putArchive(tar, { path: parent });
};

class SandboxExitedOnStartError extends Error {
	constructor() {
		super(
			"The container exited right after starting. Sandbox images must include sh, sleep and date.",
		);
	}
}

const startSandboxContainer = async (sandbox: Sandbox) => {
	const docker = await getRemoteDocker(sandbox.serverId);
	await ensureSandboxImage(docker, sandbox.image);
	await ensureSandboxNetwork(docker, sandbox.networkMode);
	const container = await docker.createContainer(
		buildSandboxContainerOptions(sandbox),
	);
	try {
		await container.start();
		await prepareSandboxWorkdir(
			sandbox.serverId,
			docker,
			container.id,
			sandbox.workdir,
			sandbox.user,
		);
		const alive = await container
			.inspect()
			.then((info) => info.State.Running)
			.catch(() => false);
		if (!alive) throw new SandboxExitedOnStartError();
		const [running] = await db
			.update(sandboxes)
			.set({
				containerId: container.id,
				status: "running",
				expiresAt: sandboxExpiryFrom(sandboxes.timeoutMs),
				lastActivityAt: sql`now()`,
			})
			.where(eq(sandboxes.sandboxId, sandbox.sandboxId))
			.returning();
		return running;
	} catch (error) {
		await container.remove({ force: true }).catch(() => {});
		if (isContainerGone(error)) throw new SandboxExitedOnStartError();
		throw error;
	}
};

export const createSandbox = async (
	input: z.infer<typeof apiCreateSandbox> & { organizationId: string },
) => {
	const template = input.template ? SANDBOX_TEMPLATES[input.template] : null;
	const image = input.image ?? template?.image;
	if (!image) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Either template or image is required",
		});
	}

	const [sandbox] = await db
		.insert(sandboxes)
		.values({
			name: input.name ?? `sandbox-${Date.now().toString(36)}`,
			organizationId: input.organizationId,
			serverId: input.serverId ?? null,
			image,
			template: input.template ?? null,
			cpu: input.cpu ?? SANDBOX_DEFAULTS.cpu,
			memoryMb: input.memoryMb ?? SANDBOX_DEFAULTS.memoryMb,
			pidsLimit: input.pidsLimit ?? SANDBOX_DEFAULTS.pidsLimit,
			timeoutMs: input.timeoutMs ?? SANDBOX_DEFAULTS.timeoutMs,
			deadlineAt: new Date(
				Date.now() + (input.maxLifetimeMs ?? SANDBOX_DEFAULTS.maxLifetimeMs),
			),
			networkMode: input.networkMode ?? "isolated",
			envVars:
				[...(template?.env ?? []), input.envVars].filter(Boolean).join("\n") ||
				null,
			workdir: input.workdir ?? template?.workdir ?? SANDBOX_DEFAULTS.workdir,
			user: template?.user ?? SANDBOX_DEFAULT_USER,
			runtime: input.runtime ?? null,
			status: "creating",
		})
		.returning();
	if (!sandbox) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error inserting sandbox",
		});
	}

	try {
		const running = await startSandboxContainer(sandbox);
		if (!running) throw new Error("Sandbox row disappeared during creation");
		return running;
	} catch (error) {
		await updateSandboxById(sandbox.sandboxId, { status: "error" });
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Error creating sandbox: ${error instanceof Error ? error.message : error}`,
			cause: error,
		});
	}
};

type RunningSandbox = Sandbox & { containerId: string };

export const assertSandboxRunning: (
	sandbox: Sandbox,
) => asserts sandbox is RunningSandbox = (sandbox) => {
	if (sandbox.status !== "running" || !sandbox.containerId) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Sandbox is ${sandbox.status}`,
		});
	}
};

export const touchSandbox = async (sandbox: Sandbox) => {
	const [result] = await db
		.update(sandboxes)
		.set({
			lastActivityAt: sql`now()`,
			expiresAt: sandboxExpiryFrom(sandboxes.timeoutMs),
		})
		.where(eq(sandboxes.sandboxId, sandbox.sandboxId))
		.returning();
	return result;
};

const sandboxExecUser = (sandbox: Sandbox) =>
	sandbox.user ?? SANDBOX_DEFAULT_USER;

export interface ExecInSandboxOptions {
	cmd: string;
	cwd?: string;
	env?: Record<string, string>;
	timeoutMs?: number;
	onStdout?: (chunk: string) => void;
	onStderr?: (chunk: string) => void;
}

export const execInSandbox = async (
	sandbox: Sandbox,
	options: ExecInSandboxOptions,
): Promise<SandboxExecResult> => {
	assertSandboxRunning(sandbox);
	await touchSandbox(sandbox);
	const docker = await getRemoteDocker(sandbox.serverId);
	const result = await withLiveContainer(sandbox, () =>
		runContainerExec(sandbox.serverId, docker, sandbox.containerId, {
			cmd: withSandboxActivity(options.cmd),
			user: sandboxExecUser(sandbox),
			cwd: options.cwd ?? sandbox.workdir,
			env: options.env,
			timeoutMs: options.timeoutMs ?? SANDBOX_DEFAULTS.execTimeoutMs,
			onStdout: options.onStdout,
			onStderr: options.onStderr,
		}),
	);
	if (result.containerKilled) {
		await updateSandboxById(sandbox.sandboxId, {
			status: "killed",
			killedAt: new Date(),
		});
	}
	return result;
};

export const writeSandboxFile = async (
	sandbox: Sandbox,
	options: { path: string; content: Buffer; mode?: number },
) => {
	assertSandboxRunning(sandbox);
	if (options.content.length > SANDBOX_MAX_FILE_BYTES) {
		throw new TRPCError({
			code: "PAYLOAD_TOO_LARGE",
			message: `File exceeds the ${SANDBOX_MAX_FILE_BYTES} byte limit`,
		});
	}
	const dir = posix.dirname(options.path);
	const name = posix.basename(options.path);
	if (!name) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Path must point to a file",
		});
	}
	await touchSandbox(sandbox);
	const docker = await getRemoteDocker(sandbox.serverId);
	return withLiveContainer(sandbox, async () => {
		const mkdir = await runContainerExec(
			sandbox.serverId,
			docker,
			sandbox.containerId,
			{
				cmd: withSandboxActivity(`mkdir -p ${quote([dir])}`),
				user: sandboxExecUser(sandbox),
				timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
			},
		);
		if (mkdir.exitCode !== 0) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: mkdir.stderr.trim() || `Unable to create directory ${dir}`,
			});
		}
		const ids = parseSandboxUser(sandboxExecUser(sandbox)) ?? {
			uid: 0,
			gid: 0,
		};
		const tar = await buildSandboxFileTar({
			name,
			content: options.content,
			mode: options.mode,
			...ids,
		});
		await docker
			.getContainer(sandbox.containerId)
			.putArchive(tar, { path: dir });
		return { path: options.path, size: options.content.length };
	});
};

export const readSandboxFile = async (sandbox: Sandbox, path: string) => {
	assertSandboxRunning(sandbox);
	const docker = await getRemoteDocker(sandbox.serverId);
	let archive: NodeJS.ReadableStream;
	try {
		archive = await docker
			.getContainer(sandbox.containerId)
			.getArchive({ path });
	} catch (error) {
		if (isContainerGone(error)) throw await markSandboxGone(sandbox);
		if (isNotFound(error)) {
			throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
		}
		throw error;
	}
	try {
		const { content } = await extractSandboxFile(
			archive,
			SANDBOX_MAX_FILE_BYTES,
		);
		return { path, size: content.length, content };
	} catch (error) {
		if (error instanceof SandboxFileTooLargeError) {
			throw new TRPCError({
				code: "PAYLOAD_TOO_LARGE",
				message: error.message,
			});
		}
		if (error instanceof SandboxNotRegularFileError) {
			throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
		}
		throw error;
	}
};

export const listSandboxFiles = async (sandbox: Sandbox, path?: string) => {
	assertSandboxRunning(sandbox);
	await touchSandbox(sandbox);
	const target = path ?? sandbox.workdir;
	const docker = await getRemoteDocker(sandbox.serverId);
	return withLiveContainer(sandbox, async () => {
		const find = await runContainerExec(
			sandbox.serverId,
			docker,
			sandbox.containerId,
			{
				cmd: withSandboxActivity(buildSandboxFindCommand(target)),
				user: sandboxExecUser(sandbox),
				timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
				maxOutputBytes: 4 * 1024 * 1024,
			},
		);
		if (find.exitCode === 0) {
			return { path: target, entries: parseSandboxFindOutput(find.stdout) };
		}
		const ls = await runContainerExec(
			sandbox.serverId,
			docker,
			sandbox.containerId,
			{
				cmd: buildSandboxLsCommand(target),
				user: sandboxExecUser(sandbox),
				timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
				maxOutputBytes: 4 * 1024 * 1024,
			},
		);
		if (ls.exitCode === 0) {
			return { path: target, entries: parseSandboxLsOutput(ls.stdout) };
		}
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: (ls.stderr || find.stderr).trim() || "Unable to list files",
		});
	});
};

export const setSandboxTimeout = async (
	sandbox: Sandbox,
	timeoutMs: number,
) => {
	assertSandboxRunning(sandbox);
	const docker = await getRemoteDocker(sandbox.serverId);
	const result = await withLiveContainer(sandbox, () =>
		runContainerExec(sandbox.serverId, docker, sandbox.containerId, {
			cmd: buildSandboxTimeoutCommand(timeoutMs),
			user: SANDBOX_ROOT_USER,
			timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
		}),
	);
	if (result.exitCode !== 0) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: result.stderr.trim() || "Unable to update the sandbox timeout",
		});
	}
	const [updated] = await db
		.update(sandboxes)
		.set({
			timeoutMs,
			lastActivityAt: sql`now()`,
			expiresAt: sandboxExpiryFrom(timeoutMs),
		})
		.where(eq(sandboxes.sandboxId, sandbox.sandboxId))
		.returning();
	return updated;
};

export const removeSandboxContainer = async (
	serverId: string | null,
	containerId: string,
) => {
	const docker = await getRemoteDocker(serverId);
	const container = docker.getContainer(containerId);
	await container.stop({ t: 2 }).catch((error: unknown) => {
		if (statusCodeOf(error) !== 304 && !isNotFound(error)) throw error;
	});
	await container.remove({ force: true }).catch((error: unknown) => {
		if (!isNotFound(error) && statusCodeOf(error) !== 409) throw error;
	});
};

export const killSandbox = async (sandboxId: string) => {
	const sandbox = await findSandboxById(sandboxId);
	if (sandbox.containerId) {
		try {
			await removeSandboxContainer(sandbox.serverId, sandbox.containerId);
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Could not remove the sandbox container: ${error instanceof Error ? error.message : error}`,
				cause: error,
			});
		}
	}
	if (sandbox.status === "killed") return sandbox;
	return updateSandboxById(sandboxId, {
		status: "killed",
		killedAt: new Date(),
	});
};

export const removeSandbox = async (sandboxId: string) => {
	await killSandbox(sandboxId);
	return removeSandboxById(sandboxId);
};
