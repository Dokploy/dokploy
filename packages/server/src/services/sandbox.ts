import { posix } from "node:path";
import { db } from "@dokploy/server/db";
import {
	type apiCreateSandbox,
	environments,
	SANDBOX_DEFAULTS,
	sandboxes,
} from "@dokploy/server/db/schema";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import { TRPCError } from "@trpc/server";
import type Dockerode from "dockerode";
import { desc, eq, inArray } from "drizzle-orm";
import { quote } from "shell-quote";
import type { z } from "zod";
import {
	buildSandboxContainerOptions,
	getSandboxNetworkName,
	parseSandboxUser,
	SANDBOX_LABEL,
	type SandboxNetworkMode,
} from "../utils/sandbox/container";
import { runSandboxExec, type SandboxExecResult } from "../utils/sandbox/exec";
import {
	buildSandboxFindCommand,
	buildSandboxLsCommand,
	parseSandboxFindOutput,
	parseSandboxLsOutput,
} from "../utils/sandbox/files";
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

const statusCodeOf = (error: unknown) =>
	(error as { statusCode?: number } | null)?.statusCode;

const isNotFound = (error: unknown) => statusCodeOf(error) === 404;

export const findSandboxById = async (sandboxId: string) => {
	const result = await db.query.sandboxes.findFirst({
		where: eq(sandboxes.sandboxId, sandboxId),
		with: {
			environment: { with: { project: true } },
			server: { columns: { serverId: true, name: true, serverStatus: true } },
		},
	});
	if (!result) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox not found" });
	}
	return result;
};

export const findSandboxesByEnvironmentId = (environmentId: string) =>
	db.query.sandboxes.findMany({
		where: eq(sandboxes.environmentId, environmentId),
		orderBy: desc(sandboxes.createdAt),
		with: { server: { columns: { serverId: true, name: true } } },
	});

export const findSandboxesByProjectId = async (projectId: string) => {
	const projectEnvironments = await db.query.environments.findMany({
		where: eq(environments.projectId, projectId),
		columns: { environmentId: true },
	});
	if (projectEnvironments.length === 0) return [];
	return db.query.sandboxes.findMany({
		where: inArray(
			sandboxes.environmentId,
			projectEnvironments.map((env) => env.environmentId),
		),
		orderBy: desc(sandboxes.createdAt),
		with: { server: { columns: { serverId: true, name: true } } },
	});
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

export const ensureSandboxNetwork = async (
	docker: Dockerode,
	mode: SandboxNetworkMode,
) => {
	const name = getSandboxNetworkName(mode);
	try {
		await docker.getNetwork(name).inspect();
		return name;
	} catch (error) {
		if (!isNotFound(error)) throw error;
	}
	try {
		await docker.createNetwork({
			Name: name,
			Driver: "bridge",
			Internal: mode === "isolated",
			CheckDuplicate: true,
			Labels: { [SANDBOX_LABEL]: "true" },
		});
	} catch (error) {
		// Another create raced us; the network exists now.
		if (statusCodeOf(error) !== 409) throw error;
	}
	return name;
};

const resolveSandboxUser = async (
	docker: Dockerode,
	containerId: string,
	fallback: string | null,
) => {
	try {
		const result = await runSandboxExec(docker, containerId, {
			cmd: "id -u && id -g",
			timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
		});
		const [uid, gid] = result.stdout.trim().split(/\s+/);
		if (result.exitCode === 0 && uid && gid) return `${uid}:${gid}`;
	} catch {}
	return fallback;
};

const prepareSandboxWorkdir = async (
	docker: Dockerode,
	containerId: string,
	workdir: string,
	user: string | null,
) => {
	const parent = posix.dirname(workdir);
	const name = posix.basename(workdir);
	if (!name) return;
	if (parent !== "/") {
		await runSandboxExec(docker, containerId, {
			cmd: `mkdir -p ${quote([parent])}`,
			user: "root",
			timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
		}).catch(() => {});
	}
	const ids = parseSandboxUser(user) ?? { uid: 0, gid: 0 };
	// putArchive runs in the daemon, so it can create the directory owned by the
	// sandbox user even though every capability (CAP_CHOWN included) is dropped.
	const tar = await buildSandboxDirectoryTar({ name, ...ids });
	await docker.getContainer(containerId).putArchive(tar, { path: parent });
};

const startSandboxContainer = async (sandbox: Sandbox, projectId: string) => {
	const docker = await getRemoteDocker(sandbox.serverId);
	await ensureSandboxImage(docker, sandbox.image);
	await ensureSandboxNetwork(docker, sandbox.networkMode);
	const container = await docker.createContainer(
		buildSandboxContainerOptions({ ...sandbox, projectId }),
	);
	try {
		await container.start();
		const user = await resolveSandboxUser(docker, container.id, sandbox.user);
		await prepareSandboxWorkdir(docker, container.id, sandbox.workdir, user);
		const now = new Date();
		return await updateSandboxById(sandbox.sandboxId, {
			containerId: container.id,
			user,
			status: "running",
			expiresAt: new Date(now.getTime() + sandbox.timeoutMs),
			lastActivityAt: now,
		});
	} catch (error) {
		await container.remove({ force: true }).catch(() => {});
		throw error;
	}
};

export const createSandbox = async (
	input: z.infer<typeof apiCreateSandbox>,
) => {
	const environment = await db.query.environments.findFirst({
		where: eq(environments.environmentId, input.environmentId),
		columns: { environmentId: true, projectId: true },
	});
	if (!environment) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Environment not found",
		});
	}

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
			environmentId: input.environmentId,
			serverId: input.serverId ?? null,
			image,
			template: input.template ?? null,
			cpu: input.cpu ?? SANDBOX_DEFAULTS.cpu,
			memoryMb: input.memoryMb ?? SANDBOX_DEFAULTS.memoryMb,
			pidsLimit: input.pidsLimit ?? SANDBOX_DEFAULTS.pidsLimit,
			timeoutMs: input.timeoutMs ?? SANDBOX_DEFAULTS.timeoutMs,
			networkMode: input.networkMode ?? "isolated",
			envVars: input.envVars ?? null,
			workdir: input.workdir ?? template?.workdir ?? SANDBOX_DEFAULTS.workdir,
			user: template?.user ?? null,
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
		const running = await startSandboxContainer(sandbox, environment.projectId);
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
	const now = new Date();
	return updateSandboxById(sandbox.sandboxId, {
		lastActivityAt: now,
		expiresAt: new Date(now.getTime() + sandbox.timeoutMs),
	});
};

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
	const result = await runSandboxExec(docker, sandbox.containerId, {
		cmd: options.cmd,
		cwd: options.cwd ?? sandbox.workdir,
		env: options.env,
		timeoutMs: options.timeoutMs ?? SANDBOX_DEFAULTS.execTimeoutMs,
		onStdout: options.onStdout,
		onStderr: options.onStderr,
	});
	if (result.containerKilled) {
		await updateSandboxById(sandbox.sandboxId, { status: "error" });
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
	const mkdir = await runSandboxExec(docker, sandbox.containerId, {
		cmd: `mkdir -p ${quote([dir])}`,
		timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
	});
	if (mkdir.exitCode !== 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: mkdir.stderr.trim() || `Unable to create directory ${dir}`,
		});
	}
	const ids = parseSandboxUser(sandbox.user) ?? { uid: 0, gid: 0 };
	const tar = await buildSandboxFileTar({
		name,
		content: options.content,
		mode: options.mode,
		...ids,
	});
	await docker.getContainer(sandbox.containerId).putArchive(tar, { path: dir });
	return { path: options.path, size: options.content.length };
};

export const readSandboxFile = async (sandbox: Sandbox, path: string) => {
	assertSandboxRunning(sandbox);
	await touchSandbox(sandbox);
	const docker = await getRemoteDocker(sandbox.serverId);
	let archive: NodeJS.ReadableStream;
	try {
		archive = await docker
			.getContainer(sandbox.containerId)
			.getArchive({ path });
	} catch (error) {
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
	const find = await runSandboxExec(docker, sandbox.containerId, {
		cmd: buildSandboxFindCommand(target),
		timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
		maxOutputBytes: 4 * 1024 * 1024,
	});
	if (find.exitCode === 0) {
		return { path: target, entries: parseSandboxFindOutput(find.stdout) };
	}
	// busybox find has no -printf; fall back to a name-only listing.
	const ls = await runSandboxExec(docker, sandbox.containerId, {
		cmd: buildSandboxLsCommand(target),
		timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
		maxOutputBytes: 4 * 1024 * 1024,
	});
	if (ls.exitCode === 0) {
		return { path: target, entries: parseSandboxLsOutput(ls.stdout) };
	}
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: (ls.stderr || find.stderr).trim() || "Unable to list files",
	});
};

export const setSandboxTimeout = async (
	sandbox: Sandbox,
	timeoutMs: number,
) => {
	assertSandboxRunning(sandbox);
	const now = new Date();
	return updateSandboxById(sandbox.sandboxId, {
		timeoutMs,
		lastActivityAt: now,
		expiresAt: new Date(now.getTime() + timeoutMs),
	});
};

export const removeSandboxContainer = async (
	serverId: string | null,
	containerId: string,
) => {
	const docker = await getRemoteDocker(serverId);
	const container = docker.getContainer(containerId);
	await container.stop({ t: 2 }).catch((error: unknown) => {
		// 304 = already stopped, 404 = already gone
		if (statusCodeOf(error) !== 304 && !isNotFound(error)) throw error;
	});
	await container.remove({ force: true }).catch((error: unknown) => {
		if (!isNotFound(error)) throw error;
	});
};

export const killSandbox = async (sandboxId: string) => {
	const sandbox = await findSandboxById(sandboxId);
	if (sandbox.status === "killed") return sandbox;
	if (sandbox.containerId) {
		try {
			await removeSandboxContainer(sandbox.serverId, sandbox.containerId);
		} catch (error) {
			console.error(
				`[Sandbox] Failed to remove container for ${sandboxId}:`,
				error instanceof Error ? error.message : error,
			);
		}
	}
	return updateSandboxById(sandboxId, {
		status: "killed",
		killedAt: new Date(),
	});
};

export const removeSandbox = async (sandboxId: string) => {
	await killSandbox(sandboxId);
	return removeSandboxById(sandboxId);
};
