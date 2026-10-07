import {
	applyBuildRegistryImages,
	hasBuildableServices,
} from "@dokploy/server/utils/docker/domain";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
import type { Registry } from "@dokploy/server/services/registry";
import { describe, expect, it } from "vitest";

const registry = {
	registryId: "reg-1",
	registryName: "Test Registry",
	registryUrl: "registry.example.com",
	username: "user",
	password: "pass",
	imagePrefix: "myorg",
	registryType: "cloud" as const,
	organizationId: "org-1",
	createdAt: new Date().toISOString(),
};

describe("applyBuildRegistryImages", () => {
	it("rewrites image tags for services with build:", () => {
		const spec: ComposeSpecification = {
			services: {
				api: {
					build: "./api",
					image: "local-api:latest",
				},
				db: {
					image: "postgres:16",
				},
			},
		};

		const result = applyBuildRegistryImages(spec, registry, "my-compose");

		expect(result.services?.api?.image).toBe(
			"registry.example.com/myorg/my-compose-api:latest",
		);
		expect(result.services?.api?.build).toBe("./api");
		expect(result.services?.db?.image).toBe("postgres:16");
	});

	it("lowercases and sanitizes service names in image tags", () => {
		const spec: ComposeSpecification = {
			services: {
				"MyService": {
					build: ".",
				},
			},
		};

		const result = applyBuildRegistryImages(
			spec,
			registry,
			"App-Name",
		);

		expect(result.services?.MyService?.image).toBe(
			"registry.example.com/myorg/app-name-myservice:latest",
		);
	});
});

describe("hasBuildableServices", () => {
	it("returns true when at least one service has build:", () => {
		expect(
			hasBuildableServices({
				services: {
					web: { image: "nginx" },
					api: { build: "." },
				},
			}),
		).toBe(true);
	});

	it("returns false when no service has build:", () => {
		expect(
			hasBuildableServices({
				services: {
					db: { image: "postgres:16" },
				},
			}),
		).toBe(false);
	});
});
