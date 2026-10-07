import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	type ComposeNested,
	getComposeBuildOverridePath,
	getCreateEnvFileCommand,
	getRestoreAfterFailedBuildCommand,
	type RemoteBuildDeployInfo,
} from "@dokploy/server/utils/builders/compose";
import {
	buildComposeOverrideYaml,
	type ComposePushedImage,
	getBuiltImageRepoName,
	getBuiltImageTag,
	getComposeBuildCommand,
	getComposeBuildSettingsError,
	getComposeConfigJsonCommand,
	getTagAndPushCommand,
	getWriteFileCommand,
	parseBuiltServices,
} from "@dokploy/server/utils/builders/compose-remote-build";
import {
	getRegistryLoginCommand,
	getRegistryTag,
} from "@dokploy/server/utils/cluster/upload";
import { writeDomainsToCompose } from "@dokploy/server/utils/docker/domain";
import {
	encodeBase64,
	getCreateFileCommand,
} from "@dokploy/server/utils/docker/utils";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { cloneBitbucketRepository } from "@dokploy/server/utils/providers/bitbucket";
import { cloneGitRepository } from "@dokploy/server/utils/providers/git";
import { cloneGiteaRepository } from "@dokploy/server/utils/providers/gitea";
import { cloneGithubRepository } from "@dokploy/server/utils/providers/github";
import { cloneGitlabRepository } from "@dokploy/server/utils/providers/gitlab";
import { getCreateComposeFileCommand } from "@dokploy/server/utils/providers/raw";
import { withResolvedVaultRefs } from "@dokploy/server/utils/vault";
import { TRPCError } from "@trpc/server";
import { quote } from "shell-quote";
import { generateApplyPatchesCommand } from "./patch";
import { findRegistryByIdWithCredentials } from "./registry";
import { findServerById } from "./server";

/**
 * Build-server flow for compose services.
 *
 * `docker compose up --build` normally builds on the serving host. A compose
 * that sets `buildServerId` + `buildRegistryId` instead:
 *
 *   1. clones the source on the build server (same provider code, run remotely),
 *   2. runs `docker compose build` there,
 *   3. tags and pushes every built service to the build registry as
 *      `<registry>/<appName>-<service>:dpl-<deploymentId>` (and `:latest`),
 *   4. writes `docker-compose.dokploy-build.yml` on the serving host, an
 *      override that pins each built service to the pushed image,
 *
 * after which the serving host only logs in, pulls and runs `up --no-build`
 * (see `getBuildComposeCommand`). The commands themselves are built by
 * `utils/builders/compose-remote-build.ts`; this file decides which host runs
 * which one and streams their output into the deployment log.
 */

/** The minimal compose shape the build-server settings are validated on. */
export interface ComposeBuildSettingsInput {
	buildServerId?: string | null;
	buildRegistryId?: string | null;
	command?: string | null;
}

/**
 * Validates a compose's build-server settings against the database: both or
 * neither of server and registry, the server must be of type `build`, the
 * registry must exist, and (when given) both must belong to `organizationId`.
 * Throws a BAD_REQUEST TRPCError with a message the UI can show verbatim.
 */
export const assertComposeBuildSettings = async (
	settings: ComposeBuildSettingsInput,
	organizationId?: string,
) => {
	const { buildServerId, buildRegistryId } = settings;
	let server: Awaited<ReturnType<typeof findServerById>> | null = null;
	let registry: Awaited<
		ReturnType<typeof findRegistryByIdWithCredentials>
	> | null = null;
	if (buildServerId) {
		server = await findServerById(buildServerId).catch(() => null);
	}
	if (buildRegistryId) {
		registry = await findRegistryByIdWithCredentials(buildRegistryId).catch(
			() => null,
		);
	}

	const message = getComposeBuildSettingsError({
		...settings,
		server,
		registry,
	});
	if (message) {
		throw new TRPCError({ code: "BAD_REQUEST", message });
	}
	if (
		organizationId &&
		((server && server.organizationId !== organizationId) ||
			(registry && registry.organizationId !== organizationId))
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "The build server and registry must belong to your organization",
		});
	}
};

const MAX_LOG_CHUNK = 24 * 1024;
const LOG_FLUSH_MS = 1500;

/**
 * Appends build-server output to the deployment log, which lives on the
 * *serving* host (that is where the deployment record points), batching so a
 * chatty build does not open one SSH connection per output line.
 */
export const createDeploymentLogWriter = (
	serverId: string | null,
	logPath: string,
) => {
	let buffer = "";
	let timer: ReturnType<typeof setTimeout> | undefined;
	let chain: Promise<void> = Promise.resolve();

	const write = async (text: string) => {
		if (!serverId) {
			await appendFile(logPath, text);
			return;
		}
		for (let i = 0; i < text.length; i += MAX_LOG_CHUNK) {
			const part = text.slice(i, i + MAX_LOG_CHUNK);
			await execAsyncRemote(
				serverId,
				`echo "${encodeBase64(part)}" | base64 -d >> ${quote([logPath])}`,
			);
		}
	};

	const flush = () => {
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}
		const text = buffer;
		buffer = "";
		if (!text) return chain;
		chain = chain
			.then(() => write(text))
			.catch((error) => {
				// A log line must never fail the deploy it describes.
				console.error("Could not append to the deployment log", error);
			});
		return chain;
	};

	return {
		push: (data: string) => {
			buffer += data;
			if (buffer.length >= MAX_LOG_CHUNK) {
				void flush();
			} else if (!timer) {
				timer = setTimeout(() => void flush(), LOG_FLUSH_MS);
			}
		},
		line: (text: string) => {
			buffer += `${text}\n`;
			if (!timer) timer = setTimeout(() => void flush(), LOG_FLUSH_MS);
		},
		close: () => flush(),
	};
};

type ComposeBuildEntity = ComposeNested & {
	appName: string;
	composeId: string;
	buildServerId: string | null;
	buildRegistryId: string | null;
	server?: { name: string } | null;
};

const getCloneCommand = async (entity: ComposeNested) => {
	switch (entity.sourceType) {
		case "github":
			return cloneGithubRepository({ ...entity, type: "compose" });
		case "gitlab":
			return cloneGitlabRepository({ ...entity, type: "compose" });
		case "bitbucket":
			return cloneBitbucketRepository({ ...entity, type: "compose" });
		case "git":
			return cloneGitRepository({ ...entity, type: "compose" });
		case "gitea":
			return cloneGiteaRepository({ ...entity, type: "compose" });
		case "raw":
			return getCreateComposeFileCommand(entity);
		default:
			return "";
	}
};

/**
 * Stage 1: everything that happens on the build server. Returns the images that
 * were pushed (empty when no service has a `build:` section).
 */
const buildImagesOnBuildServer = async (
	entity: ComposeBuildEntity,
	deployment: { logPath: string; deploymentId?: string },
	applyPatches: boolean,
): Promise<{ images: ComposePushedImage[]; loginCommand: string }> => {
	const { buildServerId, buildRegistryId } = entity;
	if (!buildServerId || !buildRegistryId) {
		throw new Error("Build Server and Build Registry must be set together.");
	}

	const buildServer = await findServerById(buildServerId);
	if (buildServer.serverType !== "build") {
		throw new Error(
			`Server "${buildServer.name}" is not a build server (type "${buildServer.serverType}").`,
		);
	}
	const registry = await findRegistryByIdWithCredentials(buildRegistryId);

	// Everything below runs against the build server's filesystem, so the paths
	// helpers must resolve to the remote layout.
	const resolved = await withResolvedVaultRefs(entity);
	const buildEntity = { ...resolved, serverId: buildServerId };
	const { COMPOSE_PATH } = paths(true);
	const codePath = join(COMPOSE_PATH, entity.appName, "code");
	const projectPath = resolved.mounts.length > 0 ? codePath : undefined;

	const log = createDeploymentLogWriter(entity.serverId, deployment.logPath);
	const run = (command: string) =>
		execAsyncRemote(buildServerId, command, log.push);

	try {
		log.line(
			`Building on build server ${buildServer.name} (${buildServer.ipAddress})`,
		);

		await run(`set -e;${await getCloneCommand(buildEntity)}`);

		if (applyPatches && entity.sourceType !== "raw") {
			const patches = await generateApplyPatchesCommand({
				id: entity.composeId,
				type: "compose",
				serverId: buildServerId,
			});
			if (patches) await run(`set -e;${patches}`);
		}

		// Same compose file the serving host will run (domains, randomize,
		// isolated deployment), and the same .env, so build args interpolate alike.
		const writeCompose = await writeDomainsToCompose(
			buildEntity,
			buildEntity.domains,
		);
		const envCommand = buildEntity.createEnvFile
			? getCreateEnvFileCommand(buildEntity)
			: "";
		await run(`set -e;${writeCompose}${envCommand}`);

		// File mounts live in `<compose>/files` on the serving host, where
		// `env_file:` / build secrets reach them as `../files/...`. Without them
		// `compose config` and `compose build` fail on a missing file.
		const filesDir = join(COMPOSE_PATH, entity.appName, "files");
		const fileMounts = (resolved.mounts ?? []).filter(
			(mount) => mount.type === "file" && mount.filePath,
		);
		if (fileMounts.length > 0) {
			await run(
				`set -e;${fileMounts
					.map((mount) =>
						getCreateFileCommand(
							filesDir,
							mount.filePath || "",
							mount.content || "",
						),
					)
					.join("")}`,
			);
		}

		// Not streamed: the resolved configuration contains the environment.
		const { stdout } = await execAsyncRemote(
			buildServerId,
			getComposeConfigJsonCommand(buildEntity, codePath, projectPath),
		);
		const builtServices = parseBuiltServices(stdout, entity.appName);

		if (builtServices.length === 0) {
			log.line(
				"No service has a build section, so there is nothing to build; the serving host will only pull.",
			);
			return { images: [], loginCommand: "" };
		}

		await run(getComposeBuildCommand(buildEntity, codePath, projectPath));

		const tag = getBuiltImageTag(
			deployment.deploymentId ?? Date.now().toString(36),
		);
		// Services that share one image (the same `image:` name, e.g. through a
		// YAML anchor) are one build and one push: they all run the same
		// reference, named after the first service that uses it.
		const byLocalImage = new Map<string, ComposePushedImage>();
		const images: ComposePushedImage[] = builtServices.map((built) => {
			const shared = byLocalImage.get(built.localImage);
			if (shared)
				return { ...built, ref: shared.ref, latestRef: shared.latestRef };
			const repo = getBuiltImageRepoName(entity.appName, built.service);
			const pushed = {
				...built,
				ref: getRegistryTag(registry, `${repo}:${tag}`),
				latestRef: getRegistryTag(registry, `${repo}:latest`),
			};
			byLocalImage.set(built.localImage, pushed);
			return pushed;
		});

		const loginCommand = await getRegistryLoginCommand(registry);
		await run(
			getTagAndPushCommand({
				images: [...byLocalImage.values()],
				loginCommand,
				registryLabel: registry.registryUrl || registry.registryName,
			}),
		);
		return { images, loginCommand };
	} finally {
		await log.close();
	}
};

/**
 * Builds the compose's images on its build server, pushes them, and writes the
 * override on the serving host. Returns what `getBuildComposeCommand` needs to
 * pull and run them, or `undefined` for a compose without a build server.
 *
 * If anything fails, the serving host's compose file and `.env` (already
 * replaced by the clone) are put back and the previous release re-confirmed, so
 * a failed build leaves production exactly as it was.
 */
export const prepareComposeBuildServerDeploy = async ({
	entity,
	deployment,
	runStep,
	applyPatches = true,
	freshVolumes = false,
}: {
	entity: ComposeBuildEntity;
	deployment: { logPath: string; deploymentId?: string };
	/** Runs a command on the serving host, appending its output to the log. */
	runStep: (command: string) => Promise<unknown>;
	applyPatches?: boolean;
	freshVolumes?: boolean;
}): Promise<RemoteBuildDeployInfo | undefined> => {
	if (!entity.buildServerId) {
		// Deleting a build server nulls `buildServerId` (ON DELETE SET NULL) but
		// leaves the registry behind. That compose was set up to never build on
		// its serving host, so do not silently start doing it.
		if (entity.buildRegistryId) {
			throw new Error(
				"This compose has a Build Registry but its Build Server no longer exists. Pick a build server again, or set both to None to build on the serving host.",
			);
		}
		return undefined;
	}

	try {
		const { images, loginCommand } = await buildImagesOnBuildServer(
			entity,
			deployment,
			applyPatches,
		);

		if (images.length > 0) {
			await runStep(
				`set -e;${getWriteFileCommand(
					getComposeBuildOverridePath(entity),
					buildComposeOverrideYaml(
						images.map((image) => ({
							service: image.service,
							image: image.ref,
						})),
						entity.composeType,
					),
				)}`,
			);
		} else {
			// An override left by an earlier deploy would resurrect services this
			// release no longer has (an override entry creates the service).
			await runStep(`rm -f ${quote([getComposeBuildOverridePath(entity)])};`);
		}

		return {
			images: images.map((image) => ({
				service: image.service,
				image: image.ref,
			})),
			loginCommand,
			servingHostLabel: entity.server?.name ?? "the Dokploy host",
		};
	} catch (error) {
		try {
			const restore = await getRestoreAfterFailedBuildCommand(entity, {
				deploymentId: deployment.deploymentId,
				freshVolumes,
			});
			if (restore) await runStep(restore);
		} catch (restoreError) {
			console.error(
				"Could not restore the previous compose release after a failed build",
				restoreError,
			);
		}
		throw error;
	}
};
