import {
	BUILD_ARCHITECTURES,
	type BuildArchitecture,
} from "@dokploy/server/db/schema";
import { quote } from "shell-quote";
import {
	collectRegistryPushTargets,
	registryLoginCommands,
} from "../cluster/upload";
import type { ApplicationNested } from ".";

export { BUILD_ARCHITECTURES, type BuildArchitecture };

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

export const assertPersistedArchitecture = (input: {
	buildType: string;
	buildArchitecture: BuildArchitecture;
	registryId: string | null | undefined;
	buildRegistryId: string | null | undefined;
}): void => {
	if (input.buildArchitecture === "host") {
		return;
	}
	if (isPackBuildType(input.buildType)) {
		throw new BuildArchitectureError(
			"Nixpacks, Heroku Buildpacks, and Paketo Buildpacks only support Host native architecture.",
		);
	}
	if (
		input.buildArchitecture === "multi" &&
		!input.registryId &&
		!input.buildRegistryId
	) {
		throw new BuildArchitectureError(
			"Multi-architecture builds require a cluster registry or a build registry. Docker cannot load a multi-arch image into the local daemon.",
		);
	}
};

export type BuildOutput =
	| { mode: "local"; image: string }
	| { mode: "push"; tags: string[]; logins: string };

export type BuildPlan = {
	platforms: readonly string[];
	builder: string | null;
	createDefaultBuilder: boolean;
	output: BuildOutput;
};

export class BuildArchitectureError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BuildArchitectureError";
	}
}

export type PlanBuildArchitectureInput = {
	appName?: string;
	buildArchitecture?: BuildArchitecture | null;
	buildxBuilder?: string | null;
	buildType: string;
	sourceType: string;
	registry: unknown;
	buildRegistry: unknown;
	rollbackRegistry?: unknown;
	applicationId?: string;
	rollbackActive?: boolean | null;
	dockerImage?: string | null;
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

export const architectureForApplication = (
	application: PlanBuildArchitectureInput,
): BuildArchitecture => {
	if (application.sourceType === "docker") {
		return "host";
	}
	return application.buildArchitecture ?? "host";
};

export const planArchitecture = (
	application: PlanBuildArchitectureInput,
): Pick<BuildPlan, "platforms" | "builder"> & {
	architecture: BuildArchitecture;
} => {
	const architecture = architectureForApplication(application);
	const builder = parseBuildxBuilder(application.buildxBuilder);

	if (architecture !== "host" && isPackBuildType(application.buildType)) {
		throw new BuildArchitectureError(
			"Nixpacks, Heroku Buildpacks, and Paketo Buildpacks only support Host native architecture.",
		);
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
			createDefaultBuilder: false,
			output: { mode: "local", image: localImage },
		};
	}

	if (!application.registry && !application.buildRegistry) {
		throw new BuildArchitectureError(
			"Multi-architecture builds require a cluster registry or a build registry. Docker cannot load a multi-arch image into the local daemon.",
		);
	}

	const targets = await collectRegistryPushTargets(application);
	const runTargets = targets.filter(
		(target) => target.kind === "cluster" || target.kind === "build",
	);
	if (runTargets.length === 0) {
		throw new BuildArchitectureError(
			"Multi-architecture builds require a cluster registry or a build registry. Docker cannot load a multi-arch image into the local daemon.",
		);
	}

	return {
		platforms,
		builder,
		createDefaultBuilder: builder === null,
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

export const dockerfileBuilderName = (plan: BuildPlan): string | null => {
	if (plan.builder) {
		return plan.builder;
	}
	if (plan.createDefaultBuilder) {
		return DEFAULT_MULTIARCH_BUILDER;
	}
	return null;
};

export const usesBuildx = (plan: BuildPlan): boolean => {
	return plan.output.mode === "push" || plan.builder !== null;
};

export const ensureMultiarchBuilderCommand = (plan: BuildPlan): string => {
	if (!plan.createDefaultBuilder) {
		return "";
	}
	return `docker buildx create --name ${quote([DEFAULT_MULTIARCH_BUILDER])} --driver docker-container || true\n`;
};
