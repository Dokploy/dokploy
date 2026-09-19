import {
	chmodSync as fsChmodSync,
	mkdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { dbUrl } from "@dokploy/server/db/constants";
import { projects } from "@dokploy/server/db/schema";
import {
	findEnabledLogProvidersByOrganization,
	hasEnabledLogProvider,
	type LogProvider,
	toRuntimeConfig,
} from "@dokploy/server/services/log-management/service";
import { findServerById } from "@dokploy/server/services/server";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import { pullImage, pullRemoteImage } from "@dokploy/server/utils/docker/utils";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import {
	execAsync,
	execAsyncRemote,
	writeFileRemote,
} from "@dokploy/server/utils/process/execAsync";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import type { CreateServiceOptions } from "dockerode";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { stringify } from "yaml";
import { getLogProviderAdapter } from "../services/log-management/providers/registry";
import type {
	VectorSinkConfig,
	VectorTransformConfig,
} from "../services/log-management/types";

const VECTOR_IMAGE = "timberio/vector:latest-alpine";
const VECTOR_SERVICE_NAME = "dokploy-vector";
const VECTOR_CONFIG_CONTAINER_DIR = "/etc/vector";
const VECTOR_CONFIG_CONTAINER_PATH = `${VECTOR_CONFIG_CONTAINER_DIR}/vector.yaml`;
const VECTOR_DATA_DIR_CONTAINER = "/var/lib/vector";

interface AppNameLookupEntry {
	projectId: string;
	projectName: string;
	environmentId: string;
	environmentName: string;
	applicationId: string;
	applicationName: string;
}

const escapeVrlString = (value: string): string =>
	value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		// biome-ignore lint/suspicious/noControlCharactersInRegex: replacing them is the point
		.replace(/[\u0000-\u001f\u007f]/g, " ");

const buildAppNameLookup = async (
	organizationId: string,
): Promise<Record<string, AppNameLookupEntry>> => {
	const projectRows = await db.query.projects.findMany({
		where: eq(projects.organizationId, organizationId),
		columns: { projectId: true, name: true },
		with: {
			environments: {
				columns: { environmentId: true, name: true },
				with: {
					applications: {
						columns: { applicationId: true, appName: true, name: true },
					},
					compose: {
						columns: { composeId: true, appName: true, name: true },
					},
				},
			},
		},
	});

	const lookup: Record<string, AppNameLookupEntry> = {};
	for (const project of projectRows) {
		for (const environment of project.environments) {
			for (const application of environment.applications) {
				lookup[application.appName] = {
					projectId: project.projectId,
					projectName: project.name,
					environmentId: environment.environmentId,
					environmentName: environment.name,
					applicationId: application.applicationId,
					applicationName: application.name,
				};
			}
			for (const composeService of environment.compose) {
				lookup[composeService.appName] = {
					projectId: project.projectId,
					projectName: project.name,
					environmentId: environment.environmentId,
					environmentName: environment.name,
					applicationId: composeService.composeId,
					applicationName: composeService.name,
				};
			}
		}
	}
	return lookup;
};

const buildScopeTransformSource = (
	organizationId: string,
	lookup: Record<string, AppNameLookupEntry>,
): string => {
	const lines: string[] = [
		`.dokploy_organization = "${escapeVrlString(organizationId)}"`,
		'.dokploy_project = ""',
		'.dokploy_project_id = ""',
		'.dokploy_environment = ""',
		'.dokploy_environment_id = ""',
		'.dokploy_application = ""',
		'.dokploy_application_id = ""',
	];

	const entries = Object.entries(lookup);
	if (entries.length === 0) {
		return lines.join("\n");
	}

	lines.push('app_name = .label."com.docker.compose.project"');
	lines.push("if app_name == null {");
	lines.push('  app_name = .label."com.docker.stack.namespace"');
	lines.push("}");
	lines.push("if app_name == null {");
	lines.push('  app_name = .label."com.docker.swarm.service.name"');
	lines.push("}");
	lines.push("if app_name != null {");
	entries.forEach(([appName, entry], index) => {
		const branch = index === 0 ? "  if" : "  } else if";
		lines.push(`${branch} app_name == "${escapeVrlString(appName)}" {`);
		lines.push(
			`    .dokploy_project = "${escapeVrlString(entry.projectName)}"`,
		);
		lines.push(
			`    .dokploy_project_id = "${escapeVrlString(entry.projectId)}"`,
		);
		lines.push(
			`    .dokploy_environment = "${escapeVrlString(entry.environmentName)}"`,
		);
		lines.push(
			`    .dokploy_environment_id = "${escapeVrlString(entry.environmentId)}"`,
		);
		lines.push(
			`    .dokploy_application = "${escapeVrlString(entry.applicationName)}"`,
		);
		lines.push(
			`    .dokploy_application_id = "${escapeVrlString(entry.applicationId)}"`,
		);
	});
	lines.push("  }");
	lines.push("}");
	return lines.join("\n");
};

const buildSinksAndTransforms = (
	providers: Array<LogProvider>,
	baseTransformId: string,
): {
	sinks: Record<string, VectorSinkConfig>;
	transforms: Record<string, VectorTransformConfig>;
} => {
	const sinks: Record<string, VectorSinkConfig> = {};
	const transforms: Record<string, VectorTransformConfig> = {};

	for (const provider of providers) {
		try {
			const adapter = getLogProviderAdapter(provider.providerType);
			const runtimeConfig = toRuntimeConfig(provider);
			const sinkId = `sink_${provider.logProviderId}`;
			let inputId = baseTransformId;
			let transform: { id: string; config: VectorTransformConfig } | null =
				null;
			if (adapter.toVectorTransform) {
				const transformId = `transform_${provider.logProviderId}`;
				transform = {
					id: transformId,
					config: adapter.toVectorTransform(
						runtimeConfig,
						transformId,
						baseTransformId,
					),
				};
				inputId = transformId;
			}
			const sink = adapter.toVectorSink(runtimeConfig, sinkId, inputId);
			if (transform) {
				transforms[transform.id] = transform.config;
			}
			sinks[sinkId] = sink;
		} catch (error) {
			console.error(
				`[Vector] Skipping log provider "${provider.name}" (${provider.logProviderId}) — invalid config:`,
				error,
			);
		}
	}

	return { sinks, transforms };
};

export interface VectorOrgData {
	providers: Array<LogProvider>;
	lookup: Record<string, AppNameLookupEntry>;
}

export const loadVectorOrgData = async (
	organizationId: string,
): Promise<VectorOrgData> => {
	const [providers, lookup] = await Promise.all([
		findEnabledLogProvidersByOrganization(organizationId),
		buildAppNameLookup(organizationId),
	]);
	return { providers, lookup };
};

export const buildVectorConfigYaml = async (
	organizationId: string,
	preloaded?: VectorOrgData,
	options?: { dropUnmatched?: boolean },
) => {
	const { providers, lookup } =
		preloaded ?? (await loadVectorOrgData(organizationId));
	const baseTransformId = options?.dropUnmatched
		? "dokploy_scope_local_only"
		: "dokploy_scope";
	const { sinks, transforms } = buildSinksAndTransforms(
		providers,
		baseTransformId,
	);

	const config = {
		data_dir: VECTOR_DATA_DIR_CONTAINER,
		sources: {
			docker_logs_source: {
				type: "docker_logs",
				docker_host: "unix:///var/run/docker.sock",
			},
		},
		transforms: {
			dokploy_scope: {
				type: "remap",
				inputs: ["docker_logs_source"],
				source: buildScopeTransformSource(organizationId, lookup),
			},
			...(options?.dropUnmatched
				? {
						dokploy_scope_local_only: {
							type: "filter",
							inputs: ["dokploy_scope"],
							condition: '.dokploy_project != ""',
						},
					}
				: {}),
			...transforms,
		},
		sinks,
	};

	return stringify(config);
};

export const collectSecretValues = (
	providers: Array<LogProvider>,
): string[] => {
	const values: string[] = [];
	for (const provider of providers) {
		if (provider.endpoint) values.push(provider.endpoint);
		if (provider.apiKey) values.push(provider.apiKey);
		if (provider.apiSecret) values.push(provider.apiSecret);
		for (const value of Object.values(provider.extraConfig ?? {})) {
			if (typeof value === "string" && value.length > 0) values.push(value);
		}
	}
	return values.filter((v) => v.length > 0).sort((a, b) => b.length - a.length);
};

export const redactSecrets = (text: string, secrets: string[]): string => {
	let redacted = text;
	for (const secret of secrets) {
		redacted = redacted.split(secret).join("[redacted]");
	}
	return redacted;
};

const VECTOR_CONFIG_LOCK_NAMESPACE = 87_234_501;

const hashServerIdToInt32 = (serverId: string): number => {
	let hash = 0;
	for (let i = 0; i < serverId.length; i++) {
		hash = (Math.imul(31, hash) + serverId.charCodeAt(i)) | 0;
	}
	return hash;
};

let lockPool: ReturnType<typeof postgres> | undefined;
const getLockPool = () => {
	if (!lockPool) {
		lockPool = postgres(dbUrl, { max: 10 });
	}
	return lockPool;
};

const LOCK_RETRY_ATTEMPTS = 3;
const LOCK_RETRY_DELAY_MS = 1000;

const configWriteLocks = new Map<string, Promise<void>>();

export const withConfigWriteLock = async <T>(
	serverId: string,
	fn: () => Promise<T>,
): Promise<T> => {
	const previous = configWriteLocks.get(serverId) ?? Promise.resolve();
	let release: () => void = () => {};
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	configWriteLocks.set(
		serverId,
		previous.then(() => current),
	);
	await previous;
	try {
		return await runWithCrossProcessLock(serverId, fn);
	} finally {
		release();
	}
};

const runWithCrossProcessLock = async <T>(
	serverId: string,
	fn: () => Promise<T>,
): Promise<T> => {
	const key1 = VECTOR_CONFIG_LOCK_NAMESPACE;
	const key2 = hashServerIdToInt32(serverId);
	for (let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS; attempt++) {
		const reserved = await getLockPool().reserve();
		try {
			const rows =
				await reserved`select pg_try_advisory_lock(${key1}, ${key2}) as locked`;
			if (rows[0]?.locked) {
				try {
					return await fn();
				} finally {
					await reserved`select pg_advisory_unlock(${key1}, ${key2})`;
				}
			}
		} finally {
			reserved.release();
		}
		if (attempt < LOCK_RETRY_ATTEMPTS) {
			await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
		}
	}
	throw new Error(
		`Vector config sync for server ${serverId} is already in progress on another Dokploy instance, skipped`,
	);
};

export const syncVectorConfig = async ({
	serverId,
	preloaded,
}: {
	serverId: string;
	preloaded?: VectorOrgData;
}) =>
	withConfigWriteLock(serverId, async () => {
		const server = await findServerById(serverId);
		const { VECTOR_PATH } = paths(true);
		const configPath = `${VECTOR_PATH}/vector.yaml`;
		const candidatePath = `${VECTOR_PATH}/vector.yaml.candidate`;
		const orgData =
			preloaded ?? (await loadVectorOrgData(server.organizationId));
		const yamlStr = await buildVectorConfigYaml(server.organizationId, orgData);

		await execAsyncRemote(serverId, `mkdir -p ${VECTOR_PATH}/data`);
		await writeFileRemote(serverId, candidatePath, yamlStr);
		await execAsyncRemote(
			serverId,
			`chmod 600 ${candidatePath} && chmod 700 ${VECTOR_PATH} && chmod 700 ${VECTOR_PATH}/data`,
		);
		try {
			await execAsyncRemote(
				serverId,
				`docker run --rm -v /var/run/docker.sock:/var/run/docker.sock:ro -v ${candidatePath}:/etc/vector/vector.yaml:ro ${VECTOR_IMAGE} validate --skip-healthchecks /etc/vector/vector.yaml`,
			);
		} catch (error) {
			const detail =
				error instanceof ExecError
					? error.stderr || error.stdout || error.message
					: error instanceof Error
						? error.message
						: String(error);
			const sanitizedDetail = redactSecrets(
				detail,
				collectSecretValues(orgData.providers),
			);
			await execAsyncRemote(serverId, `rm -f ${candidatePath}`).catch(
				(cleanupError) => {
					console.error(
						`[Vector] Failed to remove invalid config candidate ${candidatePath} on server ${serverId}:`,
						cleanupError,
					);
				},
			);
			throw new Error(
				`Generated Vector config failed validation, not applying it: ${sanitizedDetail}`,
			);
		}
		await execAsyncRemote(serverId, `mv ${candidatePath} ${configPath}`);
	});

export const buildServiceSettings = (
	vectorPath: string,
): CreateServiceOptions => {
	const VECTOR_PATH = vectorPath;
	return {
		Name: VECTOR_SERVICE_NAME,
		TaskTemplate: {
			ContainerSpec: {
				Image: VECTOR_IMAGE,
				Args: ["--config", VECTOR_CONFIG_CONTAINER_PATH, "--watch-config"],
				Mounts: [
					{
						Type: "bind",
						Source: "/var/run/docker.sock",
						Target: "/var/run/docker.sock",
						ReadOnly: true,
					},
					{
						Type: "bind",
						Source: VECTOR_PATH,
						Target: VECTOR_CONFIG_CONTAINER_DIR,
						ReadOnly: true,
					},
					{
						Type: "bind",
						Source: `${VECTOR_PATH}/data`,
						Target: VECTOR_DATA_DIR_CONTAINER,
						ReadOnly: false,
					},
				],
			},
			Networks: [{ Target: "host" }],
		},
		Mode: {
			Replicated: {
				Replicas: 1,
			},
		},
	};
};

export const stripImageDigest = (image: string): string =>
	image.split("@")[0] ?? image;

export const vectorServiceSpecUnchanged = (
	inspect: { Spec: { TaskTemplate: any; Mode?: unknown } },
	settings: CreateServiceOptions,
): boolean => {
	const desiredTaskTemplate = settings.TaskTemplate as any;
	const existing = inspect.Spec.TaskTemplate?.ContainerSpec ?? {};
	const desired = desiredTaskTemplate?.ContainerSpec ?? {};
	return (
		stripImageDigest(existing.Image ?? "") ===
			stripImageDigest(desired.Image ?? "") &&
		JSON.stringify(existing.Args ?? []) ===
			JSON.stringify(desired.Args ?? []) &&
		JSON.stringify(existing.Mounts ?? []) ===
			JSON.stringify(desired.Mounts ?? []) &&
		JSON.stringify(inspect.Spec.Mode ?? {}) ===
			JSON.stringify(settings.Mode ?? {})
	);
};

const deployVectorService = async (
	docker: Awaited<ReturnType<typeof getRemoteDocker>>,
	settings: CreateServiceOptions,
) => {
	try {
		const service = docker.getService(VECTOR_SERVICE_NAME);
		const inspect = await service.inspect();
		if (vectorServiceSpecUnchanged(inspect, settings)) {
			return;
		}
		await service.update({
			version: Number.parseInt(inspect.Version.Index, 10),
			...settings,
			TaskTemplate: {
				...settings.TaskTemplate,
				ForceUpdate: (inspect.Spec.TaskTemplate.ForceUpdate ?? 0) + 1,
			},
		});
	} catch (error: any) {
		if (error?.statusCode !== 404) {
			throw error;
		}
		await docker.createService(settings);
	}
};

export const setupVectorAgent = async ({
	serverId,
	preloaded,
}: {
	serverId: string;
	preloaded?: VectorOrgData;
}) => {
	await syncVectorConfig({ serverId, preloaded });
	const { VECTOR_PATH } = paths(true);

	await pullRemoteImage(VECTOR_IMAGE, serverId);
	const docker = await getRemoteDocker(serverId);
	await deployVectorService(docker, buildServiceSettings(VECTOR_PATH));
};

export const removeVectorAgent = async ({ serverId }: { serverId: string }) => {
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		throw new Error(`No SSH key configured for server ${serverId}`);
	}
	const docker = await getRemoteDocker(serverId);
	try {
		await docker.getService(VECTOR_SERVICE_NAME).remove();
	} catch (error: any) {
		if (error?.statusCode !== 404) {
			throw error;
		}
	}
	const { VECTOR_PATH } = paths(true);
	await execAsyncRemote(serverId, `rm -rf ${VECTOR_PATH}`);
};

export const syncVectorAgent = async ({
	serverId,
	preloaded,
}: {
	serverId: string;
	preloaded?: VectorOrgData;
}): Promise<{ installed: boolean }> => {
	const server = await findServerById(serverId);
	const hasProvider = preloaded
		? preloaded.providers.length > 0
		: await hasEnabledLogProvider(server.organizationId);
	const shouldRun = server.enableLogManagement && hasProvider;

	if (shouldRun) {
		await setupVectorAgent({ serverId, preloaded });
	} else {
		await removeVectorAgent({ serverId });
	}

	return { installed: shouldRun };
};

export const syncWebVectorConfig = async (
	organizationId: string,
	preloaded?: VectorOrgData,
) =>
	withConfigWriteLock("web", async () => {
		const { VECTOR_PATH } = paths();
		const configPath = `${VECTOR_PATH}/vector.yaml`;
		const candidatePath = `${VECTOR_PATH}/vector.yaml.candidate`;
		const orgData = preloaded ?? (await loadVectorOrgData(organizationId));
		const yamlStr = await buildVectorConfigYaml(organizationId, orgData, {
			dropUnmatched: true,
		});

		mkdirSync(`${VECTOR_PATH}/data`, { recursive: true });
		writeFileSync(candidatePath, yamlStr, "utf8");
		fsChmodSync(candidatePath, 0o600);
		fsChmodSync(VECTOR_PATH, 0o700);
		fsChmodSync(`${VECTOR_PATH}/data`, 0o700);
		try {
			await execAsync(
				`docker run --rm -v /var/run/docker.sock:/var/run/docker.sock:ro -v ${candidatePath}:/etc/vector/vector.yaml:ro ${VECTOR_IMAGE} validate --skip-healthchecks /etc/vector/vector.yaml`,
			);
		} catch (error) {
			const detail =
				error instanceof ExecError
					? error.stderr || error.stdout || error.message
					: error instanceof Error
						? error.message
						: String(error);
			const sanitizedDetail = redactSecrets(
				detail,
				collectSecretValues(orgData.providers),
			);
			try {
				rmSync(candidatePath, { force: true });
			} catch (cleanupError) {
				console.error(
					`[Vector] Failed to remove invalid local config candidate ${candidatePath}:`,
					cleanupError,
				);
			}
			throw new Error(
				`Generated Vector config failed validation, not applying it: ${sanitizedDetail}`,
			);
		}
		renameSync(candidatePath, configPath);
	});

export const setupWebVectorAgent = async (
	organizationId: string,
	preloaded?: VectorOrgData,
) => {
	await syncWebVectorConfig(organizationId, preloaded);
	const { VECTOR_PATH } = paths();

	await pullImage(VECTOR_IMAGE);
	const docker = await getRemoteDocker();
	await deployVectorService(docker, buildServiceSettings(VECTOR_PATH));
};

export const removeWebVectorAgent = async () => {
	const docker = await getRemoteDocker();
	try {
		await docker.getService(VECTOR_SERVICE_NAME).remove();
	} catch (error: any) {
		if (error?.statusCode !== 404) {
			throw error;
		}
	}
	const { VECTOR_PATH } = paths();
	rmSync(VECTOR_PATH, { recursive: true, force: true });
};

export const syncWebVectorAgent = async (
	preloaded?: VectorOrgData,
): Promise<{ installed: boolean }> => {
	const settings = await getWebServerSettings();
	const organizationId = settings?.logManagementOrganizationId ?? null;
	const hasProvider = organizationId
		? preloaded
			? preloaded.providers.length > 0
			: await hasEnabledLogProvider(organizationId)
		: false;
	const shouldRun =
		!!settings?.enableLogManagement && !!organizationId && hasProvider;

	if (shouldRun && organizationId) {
		await setupWebVectorAgent(organizationId, preloaded);
	} else {
		await removeWebVectorAgent();
	}

	return { installed: shouldRun };
};
