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
	engineExit?: number;
	engineBase64?: string;
	pluginsExit?: number;
	pluginsBase64?: string;
	containerStatus?: string;
}

interface EngineProbe {
	serverVersion?: string | null;
	os?: string | null;
	arch?: string | null;
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
	const parsed = semver.clean(version);
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

const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

/**
 * Read-only capability probe. Engine reachability and CLI plugin metadata are
 * separate `docker info` templates so an older CLI missing ClientInfo.Plugins
 * cannot be reported as an unreachable engine. Plugin discovery uses Docker's
 * metadata subcommand. No install/configuration/model-lifecycle/server-mutation
 * commands. Each docker info stdout is captured before base64 so exit status
 * is preserved.
 */
export const buildModelRunnerScript = () => `
dockerPresent=false
engineExit=0
engineB64=""
pluginsExit=0
pluginsB64=""
containerStatus=""

if command -v docker >/dev/null 2>&1; then
	dockerPresent=true
	engineOutput=$(docker info --format '{"serverVersion":{{json .ServerVersion}},"os":{{json .OSType}},"arch":{{json .Architecture}}}' 2>/dev/null)
	engineExit=$?
	engineB64=$(printf '%s' "$engineOutput" | base64 2>/dev/null | tr -d '\\n')
	pluginsOutput=$(docker info --format '{{json .ClientInfo.Plugins}}' 2>/dev/null)
	pluginsExit=$?
	pluginsB64=$(printf '%s' "$pluginsOutput" | base64 2>/dev/null | tr -d '\\n')
	containerStatus=$(docker inspect -f '{{.State.Status}}' docker-model-runner 2>/dev/null | tr -d '\\n')
fi

printf '{"dockerPresent":%s,"engineExit":%s,"engineBase64":"%s","pluginsExit":%s,"pluginsBase64":"%s","containerStatus":"%s"}' "$dockerPresent" "$engineExit" "$engineB64" "$pluginsExit" "$pluginsB64" "$containerStatus"
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

	const engineExit = Number(envelope.engineExit ?? 0);
	const pluginsExit = Number(envelope.pluginsExit ?? 0);
	const engineText = b64Decode(envelope.engineBase64).trim();
	const pluginsText = b64Decode(envelope.pluginsBase64).trim();

	const engine =
		engineExit === 0 && engineText
			? (parseJson(engineText) as EngineProbe | null)
			: null;
	const pluginList =
		pluginsExit === 0 && pluginsText
			? (parseJson(pluginsText) as DockerInfoPlugin[] | null)
			: null;
	const plugins = capabilityFromPlugins(
		Array.isArray(pluginList) ? pluginList : null,
	);
	plugins.modelRunner.standaloneRunnerContainerStatus = containerStatus;

	if (engineExit !== 0) {
		return emptyCapability(ENGINE_UNREACHABLE, plugins);
	}

	return {
		checkedAt: new Date().toISOString(),
		docker: {
			available: true,
			version: nullIfEmpty(engine?.serverVersion ?? undefined),
			os: nullIfEmpty(engine?.os ?? undefined),
			arch: nullIfEmpty(engine?.arch ?? undefined),
		},
		compose: plugins.compose,
		modelRunner: plugins.modelRunner,
	};
};

const capabilityFromPlugins = (
	plugins: DockerInfoPlugin[] | null,
): Pick<ModelRunnerCapability, "compose" | "modelRunner"> => {
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
