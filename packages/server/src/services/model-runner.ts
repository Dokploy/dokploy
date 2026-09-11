import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import semver from "semver";
import { IS_CLOUD } from "../constants";

const COMPOSE_MODELS_MIN_VERSION = "2.38.0";
const ENGINE_UNREACHABLE = "Docker engine is unreachable";

export interface ModelRunnerCapability {
	checkedAt: string;
	docker: {
		available: boolean;
		version: string | null;
		os: string | null;
		arch: string | null;
	};
	compose: {
		available: boolean;
		version: string | null;
		modelsSupported: boolean;
	};
	modelRunner: {
		/**
		 * True when the `model` CLI plugin is valid in this execution
		 * environment (Dokploy container locally, SSH host remotely).
		 * `docker inspect` uses the Engine socket, so `cliAvailable: false`
		 * with `standaloneRunnerContainerStatus: "running"` is valid on
		 * local Dokploy. A null container status does not mean Model Runner
		 * cannot exist (e.g. Docker Desktop).
		 */
		cliAvailable: boolean;
		cliVersion: string | null;
		standaloneRunnerContainerStatus: string | null;
	};
	error?: string;
}

interface ProbeEnvelope {
	dockerPresent?: boolean;
	infoExit?: number;
	infoBase64?: string;
	containerStatus?: string;
}

interface DockerInfoProbe {
	serverVersion?: string | null;
	os?: string | null;
	arch?: string | null;
	plugins?: DockerInfoPlugin[] | null;
	clientInfo?: { plugins?: DockerInfoPlugin[] | null } | null;
}

interface DockerInfoPlugin {
	Name?: string;
	Version?: string;
	Err?: unknown;
}

const emptyCapability = (
	error?: unknown,
	overrides: Partial<ModelRunnerCapability> = {},
): ModelRunnerCapability => ({
	checkedAt: new Date().toISOString(),
	docker: {
		available: false,
		version: null,
		os: null,
		arch: null,
	},
	compose: {
		available: false,
		version: null,
		modelsSupported: false,
	},
	modelRunner: {
		cliAvailable: false,
		cliVersion: null,
		standaloneRunnerContainerStatus: null,
	},
	...(error !== undefined
		? {
				error:
					error instanceof Error
						? error.message
						: typeof error === "string"
							? error
							: "Could not read model runner capability",
			}
		: {}),
	...overrides,
});

const nullIfEmpty = (value: string | null | undefined): string | null => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
};

const pluginHasErr = (plugin: DockerInfoPlugin): boolean => {
	const err = plugin.Err;
	if (err == null || err === "") return false;
	return true;
};

const findPlugin = (
	plugins: DockerInfoPlugin[] | null | undefined,
	name: string,
): DockerInfoPlugin | null => {
	const plugin = plugins?.find((entry) => entry.Name === name);
	if (!plugin || pluginHasErr(plugin)) return null;
	return plugin;
};

export const composeModelsSupported = (version: string | null): boolean => {
	if (!version) return false;
	const parsed = semver.coerce(version);
	if (!parsed) return false;
	return semver.gte(parsed, COMPOSE_MODELS_MIN_VERSION);
};

const b64Decode = (value?: string): string => {
	if (!value) return "";
	try {
		return Buffer.from(value, "base64").toString("utf-8");
	} catch {
		return "";
	}
};

/**
 * Read-only capability probe. Commands are `docker info` (narrow format) and
 * `docker inspect` of `docker-model-runner`. Plugin discovery uses Docker's
 * metadata subcommand. No install/configuration/model-lifecycle/server-mutation
 * commands. `docker info` stdout is captured before base64 so its exit status
 * is preserved.
 */
export const buildModelRunnerScript = () => `
dockerPresent=false
infoExit=0
infoB64=""
containerStatus=""

if command -v docker >/dev/null 2>&1; then
	dockerPresent=true
	infoOutput=$(docker info --format '{"serverVersion":{{json .ServerVersion}},"os":{{json .OSType}},"arch":{{json .Architecture}},"plugins":{{json .ClientInfo.Plugins}}}' 2>/dev/null)
	infoExit=$?
	infoB64=$(printf '%s' "$infoOutput" | base64 2>/dev/null | tr -d '\\n')
	containerStatus=$(docker inspect -f '{{.State.Status}}' docker-model-runner 2>/dev/null | tr -d '\\n')
fi

printf '{"dockerPresent":%s,"infoExit":%s,"infoBase64":"%s","containerStatus":"%s"}' "$dockerPresent" "$infoExit" "$infoB64" "$containerStatus"
`;

export const parseModelRunnerCapability = (
	stdout: string,
): ModelRunnerCapability => {
	let envelope: ProbeEnvelope;
	try {
		envelope = JSON.parse(stdout.trim());
	} catch {
		return emptyCapability(
			new Error("Could not parse model runner probe output"),
		);
	}

	const containerStatus = nullIfEmpty(envelope.containerStatus);

	if (!envelope.dockerPresent) {
		return emptyCapability(undefined, {
			modelRunner: {
				cliAvailable: false,
				cliVersion: null,
				standaloneRunnerContainerStatus: containerStatus,
			},
		});
	}

	const infoExit = Number(envelope.infoExit ?? 0);
	const infoText = b64Decode(envelope.infoBase64).trim();
	let info: DockerInfoProbe | null = null;
	if (infoText) {
		try {
			info = JSON.parse(infoText);
		} catch {
			if (infoExit === 0) {
				return emptyCapability(
					new Error("Could not parse docker info output"),
					{
						modelRunner: {
							cliAvailable: false,
							cliVersion: null,
							standaloneRunnerContainerStatus: containerStatus,
						},
					},
				);
			}
		}
	}

	const plugins = capabilityFromPlugins(info);
	plugins.modelRunner.standaloneRunnerContainerStatus = containerStatus;

	if (infoExit !== 0 || !info) {
		return emptyCapability(ENGINE_UNREACHABLE, plugins);
	}

	return {
		checkedAt: new Date().toISOString(),
		docker: {
			available: true,
			version: nullIfEmpty(info.serverVersion ?? undefined),
			os: nullIfEmpty(info.os ?? undefined),
			arch: nullIfEmpty(info.arch ?? undefined),
		},
		compose: plugins.compose,
		modelRunner: plugins.modelRunner,
	};
};

const capabilityFromPlugins = (
	info: DockerInfoProbe | null,
): Pick<ModelRunnerCapability, "compose" | "modelRunner"> => {
	const plugins = info?.plugins ?? info?.clientInfo?.plugins;
	const composePlugin = findPlugin(plugins, "compose");
	const modelPlugin = findPlugin(plugins, "model");
	const composeVersion = nullIfEmpty(composePlugin?.Version);
	return {
		compose: {
			available: !!composePlugin,
			version: composeVersion,
			modelsSupported: composeModelsSupported(composeVersion),
		},
		modelRunner: {
			cliAvailable: !!modelPlugin,
			cliVersion: nullIfEmpty(modelPlugin?.Version),
			standaloneRunnerContainerStatus: null,
		},
	};
};

export const getModelRunnerCapability = async (
	serverId?: string,
): Promise<ModelRunnerCapability> => {
	if (IS_CLOUD && !serverId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Server is required",
		});
	}

	const script = buildModelRunnerScript();
	try {
		const result = serverId
			? await execAsyncRemote(serverId, script)
			: await execAsync(script);
		return parseModelRunnerCapability(result.stdout);
	} catch (error) {
		return emptyCapability(error);
	}
};
