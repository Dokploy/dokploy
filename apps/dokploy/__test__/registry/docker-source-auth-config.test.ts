import { getAuthConfig } from "@dokploy/server/utils/builders";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findRegistryByIdWithCredentials: vi.fn(),
}));

vi.mock("@dokploy/server/services/registry", () => ({
	findRegistryByIdWithCredentials: mocks.findRegistryByIdWithCredentials,
}));

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

describe("getAuthConfig for Docker-source applications", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findRegistryByIdWithCredentials.mockResolvedValue(registry);
	});

	it("falls back to the configured registry when the app has no credentials", async () => {
		await expect(getAuthConfig(dockerApplication())).resolves.toEqual({
			password: "registry-pass",
			username: "registry-user",
			serveraddress: "registry.example.com",
		});
		expect(mocks.findRegistryByIdWithCredentials).toHaveBeenCalledWith(
			"registry-1",
		);
	});

	it("prefers app-level credentials when they are set", async () => {
		await expect(
			getAuthConfig(
				dockerApplication({
					username: "app-user",
					password: "app-pass",
					registryUrl: "registry.example.com",
				}),
			),
		).resolves.toEqual({
			password: "app-pass",
			username: "app-user",
			serveraddress: "registry.example.com",
		});
		expect(mocks.findRegistryByIdWithCredentials).not.toHaveBeenCalled();
	});

	it("does not use private registry credentials for a Docker Hub image", async () => {
		await expect(
			getAuthConfig(dockerApplication({ dockerImage: "nginx:latest" })),
		).resolves.toBeUndefined();
		expect(mocks.findRegistryByIdWithCredentials).not.toHaveBeenCalled();
	});

	it("does not use the registry when the image targets another registry", async () => {
		await expect(
			getAuthConfig(
				dockerApplication({
					dockerImage: "other.example.com/team/app:latest",
				}),
			),
		).resolves.toBeUndefined();
	});

	it("keeps the existing behavior for non-Docker sources", async () => {
		await expect(
			getAuthConfig({
				...dockerApplication(),
				sourceType: "github",
			}),
		).resolves.toEqual({
			password: "registry-pass",
			username: "registry-user",
			serveraddress: "registry.example.com",
		});
	});
});
