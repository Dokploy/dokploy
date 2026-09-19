import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import semver from "semver";
import { z } from "zod";
import { IS_CLOUD } from "../constants";

const COMPOSE_MODELS_MIN_VERSION = "2.38.0";
export const MODEL_RUNNER_PROBE_TIMEOUT_MS = 30_000;

export interface ModelRunnerCapability {
	checkedAt: string;
	docker: {
		/** True only after a successful, usable Engine info response. */
		available: boolean;
		version: string | null;
		os: string | null;
		arch: string | null;
	};
	compose: {
		/** Null means discovery could not establish availability. */
		available: boolean | null;
		version: string | null;
		modelsSupported: boolean | null;
		error?: string;
	};
	modelRunner: {
		/** CLI availability is independent of the Engine's runner container. */
		cliAvailable: boolean | null;
		cliVersion: string | null;
		/** Null means no status was observed, not necessarily an absent runner. */
		standaloneRunnerContainerStatus: string | null;
		error?: string;
	};
	error?: string;
}

const envelopeSchema = z.object({
	dockerPresent: z.boolean(),
	engineExit: z.number().int(),
	engineBase64: z.string(),
	pluginsExit: z.number().int(),
	pluginsBase64: z.string(),
	containerStatus: z.string(),
});
const engineSchema = z.object({
	serverVersion: z.string().trim().min(1),
	os: z.string().nullish(),
	arch: z.string().nullish(),
});
const pluginSchema = z.object({
	Name: z.string().min(1),
	Version: z.string().nullish(),
	Err: z.unknown().optional(),
});
const metadataSchema = z.object({
	plugins: z.array(pluginSchema).nullable(),
	errors: z.array(z.string()).nullable(),
});

const nullIfEmpty = (value: string | null | undefined): string | null =>
	value?.trim() || null;

export const composeModelsSupported = (
	version: string | null,
): boolean | null => {
	if (!version) return null;
	const parsed = semver.clean(version);
	return parsed ? semver.gte(parsed, COMPOSE_MODELS_MIN_VERSION) : null;
};

const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
};

const readPlugin = (
	plugins: z.infer<typeof pluginSchema>[] | null,
	name: string,
) => {
	if (plugins === null) return { available: null, version: null };
	const plugin = plugins.find((entry) => entry.Name === name);
	if (!plugin) return { available: false, version: null };
	if (plugin.Err != null && plugin.Err !== "") {
		return {
			available: false,
			version: null,
			error: `Docker ${name} CLI plugin is invalid`,
		};
	}
	return { available: true, version: nullIfEmpty(plugin.Version) };
};

const emptyCapability = (error?: string): ModelRunnerCapability => ({
	checkedAt: new Date().toISOString(),
	docker: { available: false, version: null, os: null, arch: null },
	compose: { available: null, version: null, modelsSupported: null },
	modelRunner: {
		cliAvailable: null,
		cliVersion: null,
		standaloneRunnerContainerStatus: null,
	},
	...(error ? { error } : {}),
});

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
	pluginsOutput=$(docker info --format '{"plugins":{{json .ClientInfo.Plugins}},"errors":{{json .ClientErrors}}}' 2>/dev/null)
	pluginsExit=$?
	pluginsB64=$(printf '%s' "$pluginsOutput" | base64 2>/dev/null | tr -d '\\n')
	containerStatus=$(docker inspect -f '{{.State.Status}}' docker-model-runner 2>/dev/null | tr -d '\\n')
fi

printf '{"dockerPresent":%s,"engineExit":%s,"engineBase64":"%s","pluginsExit":%s,"pluginsBase64":"%s","containerStatus":"%s"}' "$dockerPresent" "$engineExit" "$engineB64" "$pluginsExit" "$pluginsB64" "$containerStatus"
`;

export const parseModelRunnerCapability = (
	stdout: string,
): ModelRunnerCapability => {
	const parsed = envelopeSchema.safeParse(parseJson(stdout));
	if (!parsed.success)
		return emptyCapability("Could not parse model runner probe output");
	const envelope = parsed.data;
	const result = emptyCapability();
	if (!envelope.dockerPresent) {
		result.compose = {
			available: false,
			version: null,
			modelsSupported: false,
		};
		result.modelRunner.cliAvailable = false;
		return result;
	}
	const errors: string[] = [];
	const engine = engineSchema.safeParse(
		parseJson(Buffer.from(envelope.engineBase64, "base64").toString("utf8")),
	);
	if (envelope.engineExit === 0 && engine.success) {
		result.docker = {
			available: true,
			version: engine.data.serverVersion,
			os: nullIfEmpty(engine.data.os),
			arch: nullIfEmpty(engine.data.arch),
		};
	} else {
		errors.push("Could not read Docker Engine info");
	}
	const metadata = metadataSchema.safeParse(
		parseJson(Buffer.from(envelope.pluginsBase64, "base64").toString("utf8")),
	);
	let plugins: z.infer<typeof pluginSchema>[] | null = null;
	if (
		envelope.pluginsExit !== 0 ||
		(metadata.success && metadata.data.errors?.length)
	) {
		errors.push("Could not discover Docker CLI plugins");
	} else if (!metadata.success) {
		errors.push("Could not parse Docker CLI plugin metadata");
	} else {
		plugins = metadata.data.plugins ?? [];
	}
	const compose = readPlugin(plugins, "compose");
	const model = readPlugin(plugins, "model");
	result.compose = {
		...compose,
		modelsSupported:
			compose.available === false
				? false
				: composeModelsSupported(compose.version),
	};
	result.modelRunner = {
		cliAvailable: model.available,
		cliVersion: model.version,
		standaloneRunnerContainerStatus: nullIfEmpty(envelope.containerStatus),
		...(model.error ? { error: model.error } : {}),
	};
	if (errors.length) result.error = errors.join("; ");
	return result;
};

export const getModelRunnerCapability = async (
	serverId?: string,
): Promise<ModelRunnerCapability> => {
	if (IS_CLOUD && !serverId) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Server is required" });
	}
	const script = buildModelRunnerScript();
	try {
		const options = { timeout: MODEL_RUNNER_PROBE_TIMEOUT_MS };
		const result = serverId
			? await execAsyncRemote(serverId, script, undefined, options)
			: await execAsync(script, options);
		return parseModelRunnerCapability(result.stdout);
	} catch {
		return emptyCapability("Could not read model runner capability");
	}
};
