import { buildRemoteDocker } from "@dokploy/server/utils/providers/docker";
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

const registry = {
	registryId: "registry-1",
	username: "registry-user",
	password: "registry-pass",
	registryUrl: "registry.example.com",
};

const dockerApplication = (overrides: Record<string, unknown> = {}) =>
	({
		sourceType: "docker",
		dockerImage: "registry.example.com/team/app:latest",
		username: null,
		password: null,
		registryUrl: null,
		registry: {
			registryId: registry.registryId,
			registryUrl: registry.registryUrl,
		},
		buildRegistry: null,
		...overrides,
	}) as any;

describe("buildRemoteDocker credentials", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findRegistryByIdWithCredentials.mockResolvedValue(registry);
	});

	it("logs in with the matched registry credentials before pulling", async () => {
		const command = await buildRemoteDocker(dockerApplication());

		expect(command).toContain("docker login 'registry.example.com'");
		expect(command).toContain("registry-user");
		expect(command).toContain("registry-pass");
		expect(command.indexOf("docker login")).toBeLessThan(
			command.indexOf("docker pull"),
		);
	});

	it("logs in to a Docker Hub registry whose URL is empty", async () => {
		mocks.findRegistryByIdWithCredentials.mockResolvedValue({
			...registry,
			registryUrl: "",
		});
		const command = await buildRemoteDocker(
			dockerApplication({
				dockerImage: "docker.io/team/private:latest",
				registry: { registryId: registry.registryId, registryUrl: "" },
			}),
		);

		expect(command).toContain("docker login ''");
		expect(command).toContain("registry-pass");
	});

	it("does not send private registry credentials for a bare Docker Hub image", async () => {
		const command = await buildRemoteDocker(
			dockerApplication({ dockerImage: "nginx:latest" }),
		);

		expect(command).not.toContain("docker login");
		expect(mocks.findRegistryByIdWithCredentials).not.toHaveBeenCalled();
	});

	it("prefers app-level credentials over the configured registry", async () => {
		const command = await buildRemoteDocker(
			dockerApplication({
				username: "app-user",
				password: "app-pass",
			}),
		);

		expect(command).toContain("app-user");
		expect(command).toContain("app-pass");
		expect(mocks.findRegistryByIdWithCredentials).not.toHaveBeenCalled();
	});
});
