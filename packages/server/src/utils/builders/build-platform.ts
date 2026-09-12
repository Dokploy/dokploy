import {
	BUILD_ARCHITECTURES,
	type BuildArchitecture,
} from "@dokploy/server/db/schema";
import { quote } from "shell-quote";

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

export type BuildArchitecturePlan =
	| { kind: "host"; builder: string | null }
	| {
			kind: "single";
			platform: "linux/amd64" | "linux/arm64";
			builder: string | null;
	  }
	| {
			kind: "multi";
			platforms: ["linux/amd64", "linux/arm64"];
			builder: string | null;
	  };

export class BuildArchitectureError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BuildArchitectureError";
	}
}

export type PlanBuildArchitectureInput = {
	buildArchitecture?: BuildArchitecture | null;
	buildxBuilder?: string | null;
	buildType: string;
	sourceType: string;
	registry: unknown;
	buildRegistry: unknown;
	rollbackRegistry: unknown;
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

export const planBuildArchitecture = (
	application: PlanBuildArchitectureInput,
): BuildArchitecturePlan => {
	if (application.sourceType === "docker") {
		return { kind: "host", builder: null };
	}

	const architecture = application.buildArchitecture ?? "host";
	const builder = parseBuildxBuilder(application.buildxBuilder);

	if (
		architecture !== "host" &&
		PACK_BUILD_TYPES.includes(
			application.buildType as (typeof PACK_BUILD_TYPES)[number],
		)
	) {
		throw new BuildArchitectureError(
			"Nixpacks, Heroku Buildpacks, and Paketo Buildpacks only support Host native architecture.",
		);
	}

	if (architecture === "multi") {
		if (
			!application.registry &&
			!application.buildRegistry &&
			!application.rollbackRegistry
		) {
			throw new BuildArchitectureError(
				"Multi-architecture builds require a registry. Docker cannot load a multi-arch image into the local daemon.",
			);
		}
		return {
			kind: "multi",
			platforms: [...BUILD_ARCHITECTURE_PLATFORMS.multi],
			builder,
		};
	}

	if (architecture === "amd64") {
		return {
			kind: "single",
			platform: BUILD_ARCHITECTURE_PLATFORMS.amd64[0],
			builder,
		};
	}

	if (architecture === "arm64") {
		return {
			kind: "single",
			platform: BUILD_ARCHITECTURE_PLATFORMS.arm64[0],
			builder,
		};
	}

	return { kind: "host", builder };
};

export const planPlatformArgs = (plan: BuildArchitecturePlan): string[] => {
	if (plan.kind === "single") {
		return ["--platform", plan.platform];
	}
	if (plan.kind === "multi") {
		return ["--platform", plan.platforms.join(",")];
	}
	return [];
};

export const dockerfileBuildxBuilder = (
	plan: BuildArchitecturePlan,
): string | null => {
	if (plan.builder) {
		return plan.builder;
	}
	if (plan.kind === "multi") {
		return DEFAULT_MULTIARCH_BUILDER;
	}
	return null;
};

export const usesBuildx = (plan: BuildArchitecturePlan): boolean => {
	return plan.kind === "multi" || plan.builder !== null;
};

export const ensureMultiarchBuilderCommand = (
	plan: BuildArchitecturePlan,
): string => {
	if (plan.kind !== "multi" || plan.builder) {
		return "";
	}
	return `docker buildx create --name ${quote([DEFAULT_MULTIARCH_BUILDER])} --driver docker-container || true\n`;
};
