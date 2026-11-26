import { getAuthConfig } from "@dokploy/server/utils/builders";
import {
	buildRemoteDocker,
	getDockerSourceCredentials,
} from "@dokploy/server/utils/providers/docker";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findRegistryByIdWithCredentials: vi.fn(),
}));

vi.mock("@dokploy/server/services/registry", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/services/registry")>();
	return {
		...actual,
		findRegistryByIdWithCredentials: mocks.findRegistryByIdWithCredentials,
	};
});

const savedRegistry = {
	registryId: "registry-1",
	username: "registry-user",
	password: "registry-token",
	registryUrl: "ghcr.io",
};

const dockerApp = (overrides: Record<string, unknown> = {}) =>
	({
		sourceType: "docker",
		dockerImage: "ghcr.io/team/app:production",
		username: null,
		password: null,
		registryUrl: null,
		dockerRegistryId: null,
		registry: null,
		buildRegistry: null,
		...overrides,
	}) as any;

describe("Docker-source pull credentials", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findRegistryByIdWithCredentials.mockResolvedValue(savedRegistry);
	});

	it("pulls anonymously when no credentials or registry are set", async () => {
		expect(await getDockerSourceCredentials(dockerApp())).toBeUndefined();
		expect(await getAuthConfig(dockerApp())).toBeUndefined();
		expect(await buildRemoteDocker(dockerApp())).not.toContain("docker login");
		expect(mocks.findRegistryByIdWithCredentials).not.toHaveBeenCalled();
	});

	it("uses the selected registry when the app has no credentials", async () => {
		const app = dockerApp({ dockerRegistryId: "registry-1" });

		expect(await getAuthConfig(app)).toEqual({
			username: "registry-user",
			password: "registry-token",
			serveraddress: "ghcr.io",
		});
		expect(mocks.findRegistryByIdWithCredentials).toHaveBeenCalledWith(
			"registry-1",
		);

		const command = await buildRemoteDocker(app);
		expect(command).toContain("docker login");
		expect(command).toContain("registry-user");
		expect(command.indexOf("docker login")).toBeLessThan(
			command.indexOf("docker pull"),
		);
	});

	it("keeps the app's own credentials ahead of the selected registry", async () => {
		const app = dockerApp({
			username: "app-user",
			password: "app-pass",
			registryUrl: "registry.example.com",
			dockerRegistryId: "registry-1",
		});

		expect(await getAuthConfig(app)).toEqual({
			username: "app-user",
			password: "app-pass",
			serveraddress: "registry.example.com",
		});
		expect(mocks.findRegistryByIdWithCredentials).not.toHaveBeenCalled();
	});

	it("ignores dockerRegistryId for non-Docker sources", async () => {
		const app = dockerApp({
			sourceType: "github",
			dockerRegistryId: "registry-1",
		});

		expect(await getAuthConfig(app)).toBeUndefined();
		expect(mocks.findRegistryByIdWithCredentials).not.toHaveBeenCalled();
	});
});
