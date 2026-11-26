import { rollbackApplication } from "@dokploy/server/services/rollbacks";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const inspect = vi.fn();
	const update = vi.fn(async () => undefined);
	const createService = vi.fn(async () => undefined);
	return {
		inspect,
		update,
		createService,
		dockerLogin: vi.fn(async () => undefined),
		getRemoteDocker: vi.fn(async () => ({
			getService: () => ({ inspect, update }),
			createService,
		})),
	};
});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

vi.mock("@dokploy/server/services/registry", () => ({
	dockerLogin: mocks.dockerLogin,
	findRegistryByIdWithCredentials: vi.fn(),
}));

type RollbackContext = Parameters<typeof rollbackApplication>[3];

const context = (overrides: Record<string, unknown> = {}) =>
	({
		applicationId: "app-1",
		name: "Web",
		appName: "web-app",
		environmentId: "env-1",
		env: null,
		mounts: [],
		ports: [],
		cpuLimit: null,
		memoryLimit: null,
		cpuReservation: null,
		memoryReservation: null,
		command: null,
		replicas: 3,
		modeSwarm: null,
		networkSwarm: null,
		networkIds: [],
		detachDokployNetwork: false,
		environment: {
			name: "production",
			projectId: "project-1",
			env: null,
			project: { name: "Shop", organizationId: "org-1", env: null },
		},
		rollbackRegistry: null,
		...overrides,
	}) as unknown as RollbackContext;

type CreateSettings = {
	authconfig?: unknown;
	Mode?: unknown;
	TaskTemplate: { ContainerSpec: { Labels: Record<string, string> } };
};

const createdSettings = () =>
	(mocks.createService.mock.calls[0] as unknown as [CreateSettings])[0];

const notFound = () =>
	Object.assign(new Error("no such service"), { statusCode: 404 });

describe("rollbackApplication", () => {
	beforeEach(() => {
		mocks.inspect.mockReset();
		mocks.inspect.mockRejectedValue(notFound());
		mocks.update.mockClear();
		mocks.createService.mockClear();
		mocks.dockerLogin.mockClear();
	});

	it("sends no auth header without a rollback registry", async () => {
		await rollbackApplication("web-app", "web-app:v1", null, context());

		expect(createdSettings()).not.toHaveProperty("authconfig");
		expect(mocks.dockerLogin).not.toHaveBeenCalled();
	});

	it("sends the rollback registry credentials when one is set", async () => {
		await rollbackApplication(
			"web-app",
			"web-app:v1",
			null,
			context({
				rollbackRegistry: {
					registryUrl: "registry.example.com",
					username: "deploy",
					password: "secret",
					imagePrefix: null,
				},
			}),
		);

		expect(createdSettings().authconfig).toEqual({
			serveraddress: "registry.example.com",
			username: "deploy",
			password: "secret",
		});
	});

	it("keeps the Dokploy container labels", async () => {
		await rollbackApplication("web-app", "web-app:v1", null, context());

		expect(createdSettings().TaskTemplate.ContainerSpec.Labels).toMatchObject({
			"dokploy.application.id": "app-1",
			"dokploy.environment.id": "env-1",
			"dokploy.project.id": "project-1",
			"dokploy.organization.id": "org-1",
		});
	});

	it("applies the replica count it is given", async () => {
		await rollbackApplication(
			"web-app",
			"web-app:v1",
			null,
			context({ replicas: 5 }),
		);

		expect(createdSettings().Mode).toEqual({ Replicated: { Replicas: 5 } });
	});

	it("rolls back with the endpoint mode the server is set to", async () => {
		vi.stubEnv("DOKPLOY_SWARM_ENDPOINT_MODE", "dnsrr");
		try {
			await rollbackApplication("web-app", "web-app:v1", null, context());
		} finally {
			vi.unstubAllEnvs();
		}

		expect(
			(createdSettings() as { EndpointSpec?: { Mode?: string } }).EndpointSpec
				?.Mode,
		).toBe("dnsrr");
	});

	it("updates an existing service instead of creating it", async () => {
		mocks.inspect.mockResolvedValue({
			Version: { Index: 9 },
			Spec: { TaskTemplate: { ForceUpdate: 1 } },
		});

		await rollbackApplication("web-app", "web-app:v1", null, context());

		expect(mocks.update).toHaveBeenCalledTimes(1);
		expect(mocks.createService).not.toHaveBeenCalled();
	});

	it("does not try to create the service when inspect fails for another reason", async () => {
		mocks.inspect.mockRejectedValue(new Error("ssh: handshake failed"));

		await expect(
			rollbackApplication("web-app", "web-app:v1", null, context()),
		).rejects.toThrow("ssh: handshake failed");
		expect(mocks.createService).not.toHaveBeenCalled();
	});
});
