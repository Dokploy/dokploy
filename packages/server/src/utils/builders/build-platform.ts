import type { BuildArchitecture } from "@dokploy/server/db/schema";
import {
	collectRegistryPushTargets,
	registryLoginCommands,
} from "../cluster/upload";
import type { ApplicationNested } from ".";

export const BUILD_ARCHITECTURE_PLATFORMS = {
	host: [] as const,
	amd64: ["linux/amd64"] as const,
	arm64: ["linux/arm64"] as const,
	multi: ["linux/amd64", "linux/arm64"] as const,
} satisfies Record<BuildArchitecture, readonly string[]>;

export const DEFAULT_MULTIARCH_BUILDER = "dokploy-multiarch";

const PACK_BUILD_TYPES = [
	"nixpacks",
	"heroku_buildpacks",
	"paketo_buildpacks",
] as const;

export const isPackBuildType = (
	buildType: string,
): buildType is (typeof PACK_BUILD_TYPES)[number] => {
	return (PACK_BUILD_TYPES as readonly string[]).includes(buildType);
};

const PACK_NEEDS_HOST =
	"Nixpacks, Heroku Buildpacks, and Paketo Buildpacks only support Host native architecture.";
const MULTI_ARCH_NEEDS_REGISTRY =
	"Multi-architecture builds require a cluster registry or a build registry. Docker cannot load a multi-arch image into the local daemon.";

export type PersistedArchitecture = {
	buildType: string;
	buildArchitecture: BuildArchitecture;
	registryId: string | null | undefined;
	buildRegistryId: string | null | undefined;
};

export const mergePersistedArchitecture = (
	current: PersistedArchitecture,
	patch: Partial<PersistedArchitecture>,
): PersistedArchitecture => ({
	buildType: patch.buildType ?? current.buildType,
	buildArchitecture: patch.buildArchitecture ?? current.buildArchitecture,
	registryId:
		patch.registryId === undefined ? current.registryId : patch.registryId,
	buildRegistryId:
		patch.buildRegistryId === undefined
			? current.buildRegistryId
			: patch.buildRegistryId,
});

export const assertPersistedArchitecture = (
	input: PersistedArchitecture,
): void => {
	if (input.buildArchitecture === "host") {
		return;
	}
	if (isPackBuildType(input.buildType)) {
		throw new BuildArchitectureError(PACK_NEEDS_HOST);
	}
	if (
		input.buildArchitecture === "multi" &&
		!input.registryId &&
		!input.buildRegistryId
	) {
		throw new BuildArchitectureError(MULTI_ARCH_NEEDS_REGISTRY);
	}
};

export type BuildOutput =
	| { mode: "local"; image: string }
	| { mode: "push"; tags: string[]; logins: string };

export type BuildPlan = {
	platforms: readonly string[];
	builder: string | null;
	output: BuildOutput;
};

export class BuildArchitectureError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BuildArchitectureError";
	}
}

export type PlanBuildArchitectureInput = {
	buildType: string;
	sourceType: string;
	buildArchitecture?: BuildArchitecture | null;
	buildxBuilder?: string | null;
};

export const parseBuildxBuilder = (
	raw: string | null | undefined,
): string | null => {
	if (raw == null) {
		return null;
	}
	const trimmed = raw.trim();
	return trimmed.length > 0 ? trimmed : null;
};

export const planArchitecture = (
	application: PlanBuildArchitectureInput,
): Pick<BuildPlan, "platforms" | "builder"> & {
	architecture: BuildArchitecture;
} => {
	const architecture =
		application.sourceType === "docker"
			? "host"
			: (application.buildArchitecture ?? "host");
	const builder = parseBuildxBuilder(application.buildxBuilder);

	if (architecture !== "host" && isPackBuildType(application.buildType)) {
		throw new BuildArchitectureError(PACK_NEEDS_HOST);
	}

	return {
		architecture,
		platforms: BUILD_ARCHITECTURE_PLATFORMS[architecture],
		builder,
	};
};

export const resolveBuildPlan = async (
	application: ApplicationNested,
): Promise<BuildPlan> => {
	const { architecture, platforms, builder } = planArchitecture(application);
	const localImage = application.appName;

	if (architecture !== "multi") {
		return {
			platforms,
			builder,
			output: { mode: "local", image: localImage },
		};
	}

	if (!application.registry && !application.buildRegistry) {
		throw new BuildArchitectureError(MULTI_ARCH_NEEDS_REGISTRY);
	}

	const targets = await collectRegistryPushTargets(application);
	const runTargets = targets.filter(
		(target) => target.kind === "cluster" || target.kind === "build",
	);
	if (runTargets.length === 0) {
		throw new BuildArchitectureError(MULTI_ARCH_NEEDS_REGISTRY);
	}

	return {
		platforms,
		builder,
		output: {
			mode: "push",
			tags: targets.map((target) => target.tag),
			logins: registryLoginCommands(targets),
		},
	};
};

export const planPlatformArgs = (
	plan: Pick<BuildPlan, "platforms">,
): string[] => {
	if (plan.platforms.length === 0) {
		return [];
	}
	return ["--platform", plan.platforms.join(",")];
};
