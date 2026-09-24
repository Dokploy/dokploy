import { IS_CLOUD, paths } from "@dokploy/server/constants";
import {
	findEnabledLogProvidersByOrganization,
	type LogProvider,
	toRuntimeConfig,
} from "@dokploy/server/services/log-management/service";
import {
	findServerById,
	findServersByOrganizationForLogManagement,
} from "@dokploy/server/services/server";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import { encodeBase64 } from "@dokploy/server/utils/docker/utils";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import type { CreateServiceOptions } from "dockerode";
import { nanoid } from "nanoid";
import { quote } from "shell-quote";
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

const buildScopeTransformSource = (): string =>
	[
		'.dokploy_organization = .label."dokploy.organization.id" || ""',
		'.dokploy_project = .label."dokploy.project" || ""',
		'.dokploy_project_id = .label."dokploy.project.id" || ""',
		'.dokploy_environment = .label."dokploy.environment" || ""',
		'.dokploy_environment_id = .label."dokploy.environment.id" || ""',
		'.dokploy_application = .label."dokploy.application" || ""',
		'.dokploy_application_id = .label."dokploy.application.id" || ""',
		'.dokploy_service = .label."dokploy.service" || ""',
	].join("\n");

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

const loadEnabledLogProviders = async (
	organizationId: string,
	logProviderIds?: string[],
): Promise<Array<LogProvider>> => {
	const providers = await findEnabledLogProvidersByOrganization(organizationId);
	return logProviderIds
		? providers.filter((provider) =>
				logProviderIds.includes(provider.logProviderId),
			)
		: providers;
};

export const buildVectorConfigYaml = async (
	providers: Array<LogProvider>,
	options?: { dropUnmatched?: boolean },
) => {
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
				source: buildScopeTransformSource(),
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

const getServerLogProviderIds = async (
	serverId?: string,
): Promise<string[]> => {
	if (serverId) {
		const server = await findServerById(serverId);
		return server.logProviderIds ?? [];
	}
	const settings = await getWebServerSettings();
	return settings?.logProviderIds ?? [];
};

const syncVectorConfig = async (
	organizationId: string,
	serverId?: string,
	logProviderIds?: string[],
) => {
	const { VECTOR_PATH } = paths(!!serverId);
	const configPath = `${VECTOR_PATH}/vector.yaml`;
	const candidatePath = `${VECTOR_PATH}/vector.yaml.candidate.${nanoid(10)}`;
	const ids = logProviderIds ?? (await getServerLogProviderIds(serverId));
	const providers = await loadEnabledLogProviders(organizationId, ids);
	const yamlStr = await buildVectorConfigYaml(providers, {
		dropUnmatched: !serverId,
	});

	const writeCommand = `umask 077 && mkdir -p ${quote([`${VECTOR_PATH}/data`])} && chmod 700 ${quote([VECTOR_PATH])} ${quote([`${VECTOR_PATH}/data`])} && echo "${encodeBase64(yamlStr)}" | base64 -d > ${quote([candidatePath])}`;
	if (serverId) {
		await execAsyncRemote(serverId, writeCommand);
	} else {
		await execAsync(writeCommand);
	}

	const validateCommand = `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock:ro -v ${quote([`${candidatePath}:/etc/vector/vector.yaml:ro`])} ${VECTOR_IMAGE} validate --skip-healthchecks /etc/vector/vector.yaml`;
	try {
		if (serverId) {
			await execAsyncRemote(serverId, validateCommand);
		} else {
			await execAsync(validateCommand);
		}
	} catch (error) {
		const detail =
			error instanceof ExecError
				? error.stderr || error.stdout || error.message
				: error instanceof Error
					? error.message
					: String(error);
		const sanitizedDetail = redactSecrets(
			detail,
			collectSecretValues(providers),
		);
		const cleanupCommand = `rm -f ${quote([candidatePath])}`;
		try {
			if (serverId) {
				await execAsyncRemote(serverId, cleanupCommand);
			} else {
				await execAsync(cleanupCommand);
			}
		} catch (cleanupError) {
			console.error(
				`[Vector] Failed to remove invalid config candidate ${candidatePath}${
					serverId ? ` on server ${serverId}` : ""
				}:`,
				cleanupError,
			);
		}
		throw new Error(
			`Generated Vector config failed validation, not applying it: ${sanitizedDetail}`,
		);
	}

	const applyCommand = `mv ${quote([candidatePath])} ${quote([configPath])}`;
	if (serverId) {
		await execAsyncRemote(serverId, applyCommand);
	} else {
		await execAsync(applyCommand);
	}
};

const deployVectorService = async (serverId?: string) => {
	const { VECTOR_PATH } = paths(!!serverId);
	const docker = await getRemoteDocker(serverId);

	const settings: CreateServiceOptions = {
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

	try {
		const service = docker.getService(VECTOR_SERVICE_NAME);
		const inspect = await service.inspect();
		await service.update({
			version: Number.parseInt(inspect.Version.Index, 10),
			...settings,
			TaskTemplate: {
				...settings.TaskTemplate,
				ForceUpdate: (inspect.Spec.TaskTemplate.ForceUpdate ?? 0) + 1,
			},
		});
		console.log("Vector Updated ✅");
	} catch (_) {
		try {
			await docker.createService(settings);
			console.log("Vector Started ✅");
		} catch (error: any) {
			if (error?.statusCode !== 409) {
				throw error;
			}
			console.log("Vector service already exists, continuing...");
		}
	}
};

export const setupVectorAgent = async (
	organizationId: string,
	serverId?: string,
	logProviderIds?: string[],
) => {
	await syncVectorConfig(organizationId, serverId, logProviderIds);
	await deployVectorService(serverId);
};

export const removeVectorAgent = async (serverId?: string) => {
	const docker = await getRemoteDocker(serverId);
	try {
		await docker.getService(VECTOR_SERVICE_NAME).remove();
	} catch (error: any) {
		if (error?.statusCode !== 404) {
			throw error;
		}
	}
	const { VECTOR_PATH } = paths(!!serverId);
	const cleanupCommand = `rm -rf ${quote([VECTOR_PATH])}`;
	if (serverId) {
		await execAsyncRemote(serverId, cleanupCommand);
	} else {
		await execAsync(cleanupCommand);
	}
};

const isVectorRunning = async (serverId?: string): Promise<boolean> => {
	const docker = await getRemoteDocker(serverId);
	try {
		await docker.getService(VECTOR_SERVICE_NAME).inspect();
		return true;
	} catch {
		return false;
	}
};

const VECTOR_CHECK_TIMEOUT_MS = 5000;

const vectorStatus = async (
	serverId: string | null,
): Promise<"running" | "stopped" | "unknown"> => {
	try {
		const running = await Promise.race([
			isVectorRunning(serverId ?? undefined),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("timeout")), VECTOR_CHECK_TIMEOUT_MS),
			),
		]);
		return running ? "running" : "stopped";
	} catch {
		return "unknown";
	}
};

export const getLogManagementServerStatus = async (organizationId: string) => {
	const [servers, settings] = await Promise.all([
		findServersByOrganizationForLogManagement(organizationId),
		IS_CLOUD ? Promise.resolve(null) : getWebServerSettings(),
	]);

	const webOwnsThisOrg =
		!!settings &&
		(settings.logManagementOrganizationId === null ||
			settings.logManagementOrganizationId === organizationId);

	const targets: Array<{
		serverId: string | null;
		name: string;
		ipAddress: string | null;
		logProviderIds: string[];
	}> = [
		...(settings && webOwnsThisOrg
			? [
					{
						serverId: null,
						name: "Dokploy Server (local)",
						ipAddress: null,
						logProviderIds: settings.logProviderIds ?? [],
					},
				]
			: []),
		...servers.map((s) => ({
			serverId: s.serverId,
			name: s.name,
			ipAddress: s.ipAddress,
			logProviderIds: s.logProviderIds ?? [],
		})),
	];

	return Promise.all(
		targets.map(async (target) => ({
			...target,
			status: await vectorStatus(target.serverId),
		})),
	);
};
