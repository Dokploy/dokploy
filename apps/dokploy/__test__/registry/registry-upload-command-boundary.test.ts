import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createRollback: vi.fn(),
	findAllDeploymentsByApplicationId: vi.fn(),
	findRegistryByIdWithCredentials: vi.fn(),
	safeDockerLoginCommand: vi.fn(() => "docker login safe"),
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	findAllDeploymentsByApplicationId: mocks.findAllDeploymentsByApplicationId,
}));

vi.mock("@dokploy/server/services/registry", () => ({
	findRegistryByIdWithCredentials: mocks.findRegistryByIdWithCredentials,
	safeDockerLoginCommand: mocks.safeDockerLoginCommand,
}));

vi.mock("@dokploy/server/services/rollbacks", () => ({
	createRollback: mocks.createRollback,
}));

const { uploadImageRemoteCommand } = await import(
	"@dokploy/server/utils/cluster/upload"
);

describe("registry upload command boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findRegistryByIdWithCredentials.mockResolvedValue({
			registryId: "registry-1",
			registryType: "cloud",
			registryUrl: "registry.example.com",
			imagePrefix: "team",
			username: "user",
			password: "secret",
		});
	});

	it("quotes docker tag and push image references", async () => {
		const command = await uploadImageRemoteCommand({
			appName: "my-app",
			applicationId: "app-1",
			dockerImage: "evil image; touch-pwn:latest",
			registry: { registryId: "registry-1" },
			buildRegistry: null,
			rollbackRegistry: null,
			rollbackActive: false,
			sourceType: "docker",
		} as never);

		expect(command).toContain(
			"docker tag 'evil image; touch-pwn:latest' 'registry.example.com/team/evil image; touch-pwn:latest'",
		);
		expect(command).toContain(
			"docker push 'registry.example.com/team/evil image; touch-pwn:latest'",
		);
		expect(command).not.toContain("docker tag evil image; touch-pwn:latest");
		expect(command).not.toContain(
			"docker push registry.example.com/team/evil image; touch-pwn:latest",
		);
	});
});
