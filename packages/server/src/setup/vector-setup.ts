import { IS_CLOUD, paths } from "@dokploy/server/constants";
import {
	findEnabledTelemetryProvidersByOrganization,
	findTelemetryProvidersByOrganization,
	type TelemetryProvider,
	toRuntimeConfig,
} from "@dokploy/server/services/logs-and-metrics/service";
import {
	findServerById,
	findServersByOrganizationForVectorAgent,
	getAccessibleServerIds,
} from "@dokploy/server/services/server";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import { encodeBase64 } from "@dokploy/server/utils/docker/utils";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import type Dockerode from "dockerode";
import type { ContainerSpec, CreateServiceOptions } from "dockerode";
import { nanoid } from "nanoid";
import { quote } from "shell-quote";
import { stringify } from "yaml";
import { getTelemetryProviderAdapter } from "../services/logs-and-metrics/providers/registry";
import {
	type TelemetrySignal,
	type VectorSinkConfig,
	type VectorTransformConfig,
	vrlString,
} from "../services/logs-and-metrics/types";

export const VECTOR_IMAGE = "timberio/vector:0.58.0-alpine";
const VECTOR_SERVICE_NAME = "dokploy-vector";
const VECTOR_CONFIG_CONTAINER_DIR = "/etc/vector";
const VECTOR_CONFIG_CONTAINER_PATH = `${VECTOR_CONFIG_CONTAINER_DIR}/vector.yaml`;
const VECTOR_DATA_DIR_CONTAINER = "/var/lib/vector";

export const CADVISOR_IMAGE = "ghcr.io/google/cadvisor:v0.60.6";
export const CADVISOR_SERVICE_NAME = "dokploy-cadvisor";
export const CADVISOR_PORT = 4510;
export const METRICS_SCRAPE_INTERVAL_SECS = 30;
export const LOCAL_SERVER_NAME = "Dokploy Server (local)";

const DOKPLOY_LABELS = [
	"dokploy.organization.id",
	"dokploy.project",
	"dokploy.project.id",
	"dokploy.environment",
	"dokploy.environment.id",
	"dokploy.application",
	"dokploy.application.id",
	"dokploy.service",
];

// Pseudo filesystems report 0 bytes, so their used_ratio is NaN, which InfluxDB and CloudWatch reject.
const FILESYSTEM_EXCLUDES = [
	"overlay",
	"tmpfs",
	"squashfs",
	"devtmpfs",
	"nsfs",
	"proc",
	"sysfs",
	"devpts",
	"cgroup",
	"cgroup2",
	"mqueue",
	"hugetlbfs",
	"binfmt_misc",
	"debugfs",
	"tracefs",
	"securityfs",
	"pstore",
	"bpf",
	"configfs",
	"fusectl",
	"autofs",
	"efivarfs",
	"selinuxfs",
	"rpc_pipefs",
	"ramfs",
	"rootfs",
	"fuse.lxcfs",
];

const METRIC_TAGS: Array<[label: string, tag: string]> = [
	["container_label_dokploy_organization_id", "dokploy_organization"],
	["container_label_dokploy_project", "dokploy_project"],
	["container_label_dokploy_project_id", "dokploy_project_id"],
	["container_label_dokploy_environment", "dokploy_environment"],
	["container_label_dokploy_environment_id", "dokploy_environment_id"],
	["container_label_dokploy_application", "dokploy_application"],
	["container_label_dokploy_application_id", "dokploy_application_id"],
	["container_label_dokploy_service", "dokploy_service"],
];

const buildScopeTransformSource = (serverName: string): string =>
	[
		`.dokploy_server = ${vrlString(serverName)}`,
		'.dokploy_organization = .label."dokploy.organization.id" || ""',
		'.dokploy_project = .label."dokploy.project" || ""',
		'.dokploy_project_id = .label."dokploy.project.id" || ""',
		'.dokploy_environment = .label."dokploy.environment" || ""',
		'.dokploy_environment_id = .label."dokploy.environment.id" || ""',
		'.dokploy_application = .label."dokploy.application" || ""',
		'.dokploy_application_id = .label."dokploy.application.id" || ""',
		'.dokploy_service = .label."dokploy.service" || ""',
	].join("\n");

// cAdvisor also exposes go_*/process_*/machine_* series and sets every whitelisted label, empty, on all containers.
export const buildMetricsScopeTransformSource = (serverName: string): string =>
	[
		'if .namespace != "host" && !starts_with(string!(.name), "container_") { abort }',
		`.tags.dokploy_server = ${vrlString(serverName)}`,
		...METRIC_TAGS.map(
			([label, tag]) =>
				`value = del(.tags.${label})\nif is_string(value) && value != "" { .tags.${tag} = value }`,
		),
		"del(.tags.id)",
	].join("\n");

const buildSinksAndTransforms = (
	providers: Array<TelemetryProvider>,
	baseTransformId: string,
	signal: TelemetrySignal,
): {
	sinks: Record<string, VectorSinkConfig>;
	transforms: Record<string, VectorTransformConfig>;
} => {
	const sinks: Record<string, VectorSinkConfig> = {};
	const transforms: Record<string, VectorTransformConfig> = {};
	const suffix = signal === "metrics" ? "_metrics" : "";

	for (const provider of providers) {
		try {
			const adapter = getTelemetryProviderAdapter(provider.providerType);
			const runtimeConfig = toRuntimeConfig(provider);
			const sinkId = `sink_${provider.telemetryProviderId}${suffix}`;
			const transformId = `transform_${provider.telemetryProviderId}${suffix}`;
			const transform = adapter.toVectorTransform?.(
				runtimeConfig,
				transformId,
				baseTransformId,
				signal,
			);
			const inputId = transform ? transformId : baseTransformId;
			const sink = adapter.toVectorSink(runtimeConfig, sinkId, inputId, signal);
			if (transform) {
				transforms[transformId] = transform;
			}
			sinks[sinkId] = sink;
		} catch (error) {
			console.error(
				`[Vector] Skipping provider "${provider.name}" (${provider.telemetryProviderId}) — invalid config:`,
				error,
			);
		}
	}

	return { sinks, transforms };
};

export const buildVectorConfigYaml = ({
	logProviders,
	metricsProviders,
	organizationId,
	serverName,
}: {
	logProviders: Array<TelemetryProvider>;
	metricsProviders: Array<TelemetryProvider>;
	organizationId?: string;
	serverName: string;
}) => {
	const logsBaseId = organizationId
		? "dokploy_scope_local_only"
		: "dokploy_scope";
	const metricsBaseId = organizationId
		? "dokploy_metrics_scope_local_only"
		: "dokploy_metrics_scope";
	const logs = buildSinksAndTransforms(logProviders, logsBaseId, "logs");
	const metrics = buildSinksAndTransforms(
		metricsProviders,
		metricsBaseId,
		"metrics",
	);

	const config = {
		data_dir: VECTOR_DATA_DIR_CONTAINER,
		sources: {
			...(logProviders.length > 0
				? {
						docker_logs_source: {
							type: "docker_logs",
							docker_host: "unix:///var/run/docker.sock",
						},
					}
				: {}),
			...(metricsProviders.length > 0
				? {
						host_metrics_source: {
							type: "host_metrics",
							scrape_interval_secs: METRICS_SCRAPE_INTERVAL_SECS,
							collectors: [
								"cpu",
								"memory",
								"disk",
								"filesystem",
								"network",
								"load",
								"host",
							],
							filesystem: {
								filesystems: { excludes: FILESYSTEM_EXCLUDES },
							},
							network: {
								devices: { excludes: ["veth*", "br-*", "docker*"] },
							},
						},
						cadvisor_source: {
							type: "prometheus_scrape",
							endpoints: [`http://127.0.0.1:${CADVISOR_PORT}/metrics`],
							scrape_interval_secs: METRICS_SCRAPE_INTERVAL_SECS,
							scrape_timeout_secs: 10,
						},
					}
				: {}),
		},
		transforms: {
			...(logProviders.length > 0
				? {
						dokploy_scope: {
							type: "remap",
							inputs: ["docker_logs_source"],
							source: buildScopeTransformSource(serverName),
						},
						...(organizationId
							? {
									dokploy_scope_local_only: {
										type: "filter",
										inputs: ["dokploy_scope"],
										condition: `.dokploy_organization == ${vrlString(organizationId)}`,
									},
								}
							: {}),
					}
				: {}),
			...(metricsProviders.length > 0
				? {
						dokploy_metrics_scope: {
							type: "remap",
							inputs: ["host_metrics_source", "cadvisor_source"],
							drop_on_abort: true,
							source: buildMetricsScopeTransformSource(serverName),
						},
						...(organizationId
							? {
									dokploy_metrics_scope_local_only: {
										type: "filter",
										inputs: ["dokploy_metrics_scope"],
										condition: `.namespace == "host" || .tags.dokploy_organization == ${vrlString(organizationId)}`,
									},
								}
							: {}),
					}
				: {}),
			...logs.transforms,
			...metrics.transforms,
		},
		sinks: { ...logs.sinks, ...metrics.sinks },
	};

	// Vector 0.58 only expands $VAR with --dangerously-allow-env-var-interpolation, so a $ stays literal.
	return stringify(config);
};

export const collectSecretValues = (
	providers: Array<TelemetryProvider>,
): string[] => {
	const values: string[] = [];
	for (const provider of providers) {
		if (provider.endpoint) values.push(provider.endpoint);
		if (provider.apiKey) values.push(provider.apiKey);
		if (provider.apiSecret) values.push(provider.apiSecret);
		const secretKeys = getTelemetryProviderAdapter(provider.providerType)
			.credentialFields.filter((field) => field.type === "password")
			.map((field) => field.key);
		for (const key of secretKeys) {
			const value = provider.extraConfig?.[key];
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

const runOnTarget = async (serverId: string | undefined, command: string) => {
	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};

const describeError = (error: unknown) =>
	error instanceof ExecError
		? error.stderr || error.stdout || error.message
		: error instanceof Error
			? error.message
			: String(error);

const syncVectorConfig = async (
	serverId: string | undefined,
	yamlStr: string,
	secrets: string[],
) => {
	const { VECTOR_PATH } = paths(!!serverId);
	const configPath = `${VECTOR_PATH}/vector.yaml`;
	const candidatePath = `${VECTOR_PATH}/vector.yaml.candidate.${nanoid(10)}`;
	const encodedYaml = encodeBase64(yamlStr);
	// Failed commands echo their command line, which carries the whole config.
	const redact = (error: unknown) =>
		redactSecrets(describeError(error), [encodedYaml, ...secrets]);

	try {
		await runOnTarget(
			serverId,
			`umask 077 && mkdir -p ${quote([`${VECTOR_PATH}/data`])} && chmod 700 ${quote([VECTOR_PATH])} ${quote([`${VECTOR_PATH}/data`])} && echo "${encodedYaml}" | base64 -d > ${quote([candidatePath])}`,
		);
	} catch (error) {
		throw new Error(`Failed to write the Vector config: ${redact(error)}`);
	}

	try {
		await runOnTarget(
			serverId,
			`docker run --rm -v /var/run/docker.sock:/var/run/docker.sock:ro -v ${quote([`${candidatePath}:/etc/vector/vector.yaml:ro`])} ${VECTOR_IMAGE} validate --skip-healthchecks /etc/vector/vector.yaml`,
		);
	} catch (error) {
		const sanitizedDetail = redact(error);
		try {
			await runOnTarget(serverId, `rm -f ${quote([candidatePath])}`);
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

	try {
		await runOnTarget(
			serverId,
			`mv ${quote([candidatePath])} ${quote([configPath])}`,
		);
	} catch (error) {
		throw new Error(`Failed to apply the Vector config: ${redact(error)}`);
	}
};

const deploySwarmService = async (
	docker: Dockerode,
	settings: CreateServiceOptions,
	label: string,
) => {
	const service = docker.getService(settings.Name as string);
	let inspect: Awaited<ReturnType<typeof service.inspect>> | undefined;
	try {
		inspect = await service.inspect();
	} catch (error: any) {
		if (error?.statusCode !== 404) {
			throw error;
		}
	}
	if (!inspect) {
		try {
			await docker.createService(settings);
			console.log(`${label} Started ✅`);
		} catch (error: any) {
			if (error?.statusCode !== 409) {
				throw error;
			}
			console.log(`${label} service already exists, continuing...`);
		}
		return;
	}
	// --watch-config reloads a changed file; only a changed container spec needs a restart.
	// Docker rewrites mount sources and drops defaults on inspect, so compare what we set.
	const containerSpecKey = (template: unknown) => {
		const spec = (template as { ContainerSpec?: ContainerSpec })?.ContainerSpec;
		return JSON.stringify({
			image: spec?.Image,
			args: spec?.Args,
			env: spec?.Env,
			mounts: spec?.Mounts?.map(
				(mount) => `${mount.Target}:${mount.ReadOnly ? "ro" : "rw"}`,
			),
		});
	};
	const specChanged =
		containerSpecKey(inspect.Spec.TaskTemplate) !==
		containerSpecKey(settings.TaskTemplate);
	await service.update({
		version: Number.parseInt(inspect.Version.Index, 10),
		...settings,
		TaskTemplate: {
			...settings.TaskTemplate,
			ForceUpdate:
				(inspect.Spec.TaskTemplate.ForceUpdate ?? 0) + (specChanged ? 1 : 0),
		},
	});
	console.log(`${label} Updated ✅`);
};

const removeSwarmService = async (docker: Dockerode, name: string) => {
	try {
		await docker.getService(name).remove();
	} catch (error: any) {
		if (error?.statusCode !== 404) {
			throw error;
		}
	}
};

// --watch-config misses a replaced file on some mounts, and SIGHUP makes Vector reload it anyway.
const reloadVectorConfig = async (docker: Dockerode) => {
	const containers = await docker.listContainers({
		filters: JSON.stringify({
			label: [`com.docker.swarm.service.name=${VECTOR_SERVICE_NAME}`],
		}),
	});
	for (const container of containers) {
		try {
			await docker.getContainer(container.Id).kill({ signal: "SIGHUP" });
		} catch (error: any) {
			if (error?.statusCode !== 404 && error?.statusCode !== 409) {
				throw error;
			}
		}
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
				Env: ["PROCFS_ROOT=/host/proc", "SYSFS_ROOT=/host/sys"],
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
					{
						Type: "bind",
						Source: "/proc",
						Target: "/host/proc",
						ReadOnly: true,
					},
					{
						Type: "bind",
						Source: "/sys",
						Target: "/host/sys",
						ReadOnly: true,
					},
				],
			},
			Networks: [{ Target: "host" }],
			Placement: {
				Constraints: ["node.role==manager"],
			},
		},
		Mode: {
			Replicated: {
				Replicas: 1,
			},
		},
	};

	await deploySwarmService(docker, settings, "Vector");
	await reloadVectorConfig(docker);
};

export const deployCadvisorService = async (serverId?: string) => {
	const docker = await getRemoteDocker(serverId);

	const settings: CreateServiceOptions = {
		Name: CADVISOR_SERVICE_NAME,
		TaskTemplate: {
			ContainerSpec: {
				Image: CADVISOR_IMAGE,
				Args: [
					"--listen_ip=127.0.0.1",
					`--port=${CADVISOR_PORT}`,
					"--docker_only=true",
					"--store_container_labels=false",
					`--whitelisted_container_labels=${DOKPLOY_LABELS.join(",")}`,
					`--housekeeping_interval=${METRICS_SCRAPE_INTERVAL_SECS}s`,
					"--storage_duration=1m0s",
					"--event_storage_event_limit=default=0",
					"--event_storage_age_limit=default=0",
					"--disable_metrics=advtcp,cpu_topology,cpuset,hugetlb,memory_numa,oom_event,percpu,perf_event,process,referenced_memory,resctrl,sched,tcp,udp",
				],
				// The image healthcheck probes the default port and would make Swarm restart the task.
				HealthCheck: { Test: ["NONE"] },
				Mounts: [
					{ Type: "bind", Source: "/", Target: "/rootfs", ReadOnly: true },
					// /run holds both docker.sock and containerd.sock; /var/run is a symlink to it.
					{ Type: "bind", Source: "/run", Target: "/run", ReadOnly: true },
					{ Type: "bind", Source: "/sys", Target: "/sys", ReadOnly: true },
					{
						Type: "bind",
						Source: "/var/lib/docker",
						Target: "/var/lib/docker",
						ReadOnly: true,
					},
				],
			},
			Networks: [{ Target: "host" }],
			Placement: {
				Constraints: ["node.role==manager"],
			},
		},
		Mode: {
			Replicated: {
				Replicas: 1,
			},
		},
	};

	await deploySwarmService(docker, settings, "cAdvisor");
};

export const removeCadvisorService = async (serverId?: string) => {
	const docker = await getRemoteDocker(serverId);
	await removeSwarmService(docker, CADVISOR_SERVICE_NAME);
};

const vectorTargetLocks = new Map<string, Promise<unknown>>();

// In-process only: Dokploy runs a single dashboard process per host.
export const withVectorTargetLock = async <T>(
	serverId: string | undefined,
	fn: () => Promise<T>,
): Promise<T> => {
	const key = serverId ?? "local";
	const previous = vectorTargetLocks.get(key) ?? Promise.resolve();
	const current = previous.catch(() => {}).then(fn);
	vectorTargetLocks.set(key, current);
	try {
		return await current;
	} finally {
		if (vectorTargetLocks.get(key) === current) {
			vectorTargetLocks.delete(key);
		}
	}
};

export const getVectorTargetState = async (serverId?: string) => {
	if (serverId) {
		const server = await findServerById(serverId);
		return {
			organizationId: server.organizationId,
			serverName: server.name,
			telemetryProviderIds: server.telemetryProviderIds,
		};
	}
	const settings = await getWebServerSettings();
	return {
		organizationId: settings?.vectorAgentOrganizationId ?? null,
		serverName: LOCAL_SERVER_NAME,
		telemetryProviderIds: settings?.telemetryProviderIds ?? [],
	};
};

// Always called inside withVectorTargetLock: makes the host match the saved selection.
export const reconcileVectorAgent = async (serverId?: string) => {
	const state = await getVectorTargetState(serverId);
	const providers = (
		state.organizationId
			? await findEnabledTelemetryProvidersByOrganization(state.organizationId)
			: []
	).filter((p) => state.telemetryProviderIds.includes(p.telemetryProviderId));
	const logProviders = providers.filter((p) => p.signals.includes("logs"));
	const metricsProviders = providers.filter((p) =>
		p.signals.includes("metrics"),
	);

	if (logProviders.length === 0 && metricsProviders.length === 0) {
		await removeVectorAgent(serverId);
		return;
	}

	const yamlStr = buildVectorConfigYaml({
		logProviders,
		metricsProviders,
		organizationId: serverId ? undefined : (state.organizationId ?? undefined),
		serverName: state.serverName,
	});
	await syncVectorConfig(serverId, yamlStr, collectSecretValues(providers));
	await deployVectorService(serverId);
	if (metricsProviders.length > 0) {
		await deployCadvisorService(serverId);
	} else {
		await removeCadvisorService(serverId);
	}
};

export const removeVectorAgent = async (serverId?: string) => {
	if (serverId) {
		const server = await findServerById(serverId);
		if (!server.sshKeyId) {
			throw new Error(`Server ${serverId} has no SSH key`);
		}
	}
	const docker = await getRemoteDocker(serverId);
	try {
		await removeSwarmService(docker, CADVISOR_SERVICE_NAME);
	} catch (error) {
		console.error(
			`[Vector] Failed to remove cAdvisor${serverId ? ` on server ${serverId}` : ""}:`,
			error,
		);
	}
	await removeSwarmService(docker, VECTOR_SERVICE_NAME);
	const { VECTOR_PATH } = paths(!!serverId);
	await runOnTarget(serverId, `rm -rf ${quote([VECTOR_PATH])}`);
};

type VectorStatus = "running" | "not-running" | "stopped" | "unknown";

const serviceState = async (
	docker: Dockerode,
	name: string,
): Promise<VectorStatus> => {
	// listTasks returns [] instead of 404 for a missing service, so inspect first.
	try {
		await docker.getService(name).inspect();
	} catch (error: any) {
		if (error?.statusCode === 404) {
			return "stopped";
		}
		throw error;
	}
	const tasks = await docker.listTasks({
		filters: JSON.stringify({
			service: [name],
			"desired-state": ["running"],
		}),
	});
	return tasks.some((task) => task.Status?.State === "running")
		? "running"
		: "not-running";
};

const inspectVectorStatus = async (
	serverId: string | undefined,
	requireCadvisor: boolean,
): Promise<VectorStatus> => {
	const docker = await getRemoteDocker(serverId);
	const vector = await serviceState(docker, VECTOR_SERVICE_NAME);
	if (vector !== "running" || !requireCadvisor) {
		return vector;
	}
	const cadvisor = await serviceState(docker, CADVISOR_SERVICE_NAME);
	return cadvisor === "running" ? "running" : "not-running";
};

const VECTOR_CHECK_TIMEOUT_MS = 5000;

const vectorStatus = async (
	serverId: string | null,
	requireCadvisor: boolean,
): Promise<VectorStatus> => {
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			inspectVectorStatus(serverId ?? undefined, requireCadvisor),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("timeout")),
					VECTOR_CHECK_TIMEOUT_MS,
				);
			}),
		]);
	} catch {
		return "unknown";
	} finally {
		clearTimeout(timer);
	}
};

export const getVectorAgentTargets = async (session: {
	userId: string;
	activeOrganizationId: string;
}) => {
	const organizationId = session.activeOrganizationId;
	const [allServers, settings, accessibleIds, providers] = await Promise.all([
		findServersByOrganizationForVectorAgent(organizationId),
		IS_CLOUD ? Promise.resolve(null) : getWebServerSettings(),
		getAccessibleServerIds(session),
		findTelemetryProvidersByOrganization(organizationId),
	]);
	const metricsIds = new Set(
		providers
			.filter((p) => p.enabled && p.signals.includes("metrics"))
			.map((p) => p.telemetryProviderId),
	);
	const servers = allServers.filter((s) => accessibleIds.has(s.serverId));

	const webOwnsThisOrg =
		!!settings &&
		(settings.vectorAgentOrganizationId === null ||
			settings.vectorAgentOrganizationId === organizationId);
	// Deleting the owner sets the column to null and leaves its ids behind.
	const webIsOwned = !!settings?.vectorAgentOrganizationId;

	const targets: Array<{
		serverId: string | null;
		name: string;
		ipAddress: string | null;
		telemetryProviderIds: string[];
	}> = [
		...(settings && webOwnsThisOrg
			? [
					{
						serverId: null,
						name: LOCAL_SERVER_NAME,
						ipAddress: null,
						telemetryProviderIds: webIsOwned
							? settings.telemetryProviderIds
							: [],
					},
				]
			: []),
		...servers.map((s) => ({
			serverId: s.serverId,
			name: s.name,
			ipAddress: s.ipAddress,
			telemetryProviderIds: s.telemetryProviderIds,
		})),
	];

	return Promise.all(
		targets.map(async (target) => ({
			...target,
			status: await vectorStatus(
				target.serverId,
				target.telemetryProviderIds.some((id) => metricsIds.has(id)),
			),
		})),
	);
};
