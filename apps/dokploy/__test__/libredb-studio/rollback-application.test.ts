import { rollback } from "@dokploy/server/services/rollbacks";
import type { LibreDBStudioDeployOverrides } from "@dokploy/server/utils/libredb-studio/deploy";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const inspect = vi.fn();
	const update = vi.fn();
	const getService = vi.fn(() => ({ inspect, update }));
	const createService = vi.fn();
	return {
		inspect,
		update,
		getService,
		createService,
		findRollback: vi.fn(),
		findDeploymentById: vi.fn(),
		findApplicationById: vi.fn(),
		resolveServiceNetworks: vi.fn(),
		getRemoteDocker: vi.fn(),
		getLibreDBStudioDeployOverrides: vi.fn(),
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: { query: { rollbacks: { findFirst: mocks.findRollback } } },
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	findDeploymentById: mocks.findDeploymentById,
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
}));

vi.mock("@dokploy/server/services/network", () => ({
	resolveServiceNetworks: mocks.resolveServiceNetworks,
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

vi.mock(
	"@dokploy/server/utils/libredb-studio/deploy",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@dokploy/server/utils/libredb-studio/deploy")
			>();
		return {
			...actual,
			getLibreDBStudioDeployOverrides: mocks.getLibreDBStudioDeployOverrides,
		};
	},
);

const studioSecrets = {
	launchSecret: "0123456789abcdef".repeat(4),
	jwtSecret: "J".repeat(64),
	adminPassword: "P".repeat(24),
};

const overrides: LibreDBStudioDeployOverrides = {
	mounts: [
		{
			Type: "bind",
			Source:
				"/etc/dokploy/applications/demo-shop-libredb-studio-abc123/libredb-studio/seed",
			Target: "/app/config",
			ReadOnly: true,
		},
	],
	env: [
		"SEED_CONFIG_PATH=/app/config/seed-connections.json",
		"SEED_CACHE_TTL_MS=5000",
		"ALLOW_CUSTOM_CONNECTIONS=false",
		"SEED_LITERAL_VALUES=true",
		`LAUNCH_TOKEN_SECRET=${studioSecrets.launchSecret}`,
		"LAUNCH_TOKEN_AUDIENCE=studio-1",
		"LAUNCH_TOKEN_ISSUER=dokploy",
		`JWT_SECRET=${studioSecrets.jwtSecret}`,
		`ADMIN_PASSWORD=${studioSecrets.adminPassword}`,
	],
	placementConstraint: "node.id==node-abc",
};

const TYPED_INTO_ENV_TAB = "typed-into-the-env-tab";

const snapshotEnv = [
	"ADMIN_EMAIL=owner@example.com",
	"ALLOW_CUSTOM_CONNECTIONS=true",
	"SEED_CACHE_TTL_MS=60000",
	`JWT_SECRET=${TYPED_INTO_ENV_TAB}`,
	`ADMIN_PASSWORD=${TYPED_INTO_ENV_TAB}`,
	`LAUNCH_TOKEN_SECRET=${TYPED_INTO_ENV_TAB}`,
];

// The snapshot was taken before the Studio was transferred to server-1.
const fullContext = {
	applicationId: "app-1",
	appName: "demo-shop-libredb-studio-abc123",
	serverId: "server-0",
	env: snapshotEnv.join("\n"),
	mounts: [
		{
			type: "volume",
			volumeName: "demo-shop-libredb-studio-abc123-data",
			mountPath: "/app/data",
		},
	],
	ports: [],
	cpuLimit: null,
	memoryLimit: null,
	memoryReservation: null,
	cpuReservation: null,
	command: null,
	placementSwarm: null,
	replicas: 1,
	rollbackRegistry: null,
	environment: {
		environmentId: "env-1",
		env: null,
		project: { projectId: "project-1", env: null, organizationId: "org-1" },
	},
};

const dataVolume = {
	Type: "volume",
	Source: "demo-shop-libredb-studio-abc123-data",
	Target: "/app/data",
};

type RolledBackTaskTemplate = {
	ContainerSpec: { Image: string; Env: string[]; Mounts: unknown[] };
	Placement: { Constraints?: string[] };
};

const createdTaskTemplate = (): RolledBackTaskTemplate => {
	expect(mocks.createService).toHaveBeenCalledOnce();
	const [settings] = mocks.createService.mock.calls[0] ?? [];
	return settings.TaskTemplate as RolledBackTaskTemplate;
};

describe("rollback with LibreDB Studio overrides", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findRollback.mockResolvedValue({
			rollbackId: "rollback-1",
			deploymentId: "deployment-1",
			version: 2,
			image: "demo-shop-libredb-studio-abc123:v2",
			fullContext,
			deployment: { deploymentId: "deployment-1", applicationId: "app-1" },
		});
		mocks.findDeploymentById.mockResolvedValue({
			deploymentId: "deployment-1",
			applicationId: "app-1",
		});
		mocks.findApplicationById.mockResolvedValue({
			applicationId: "app-1",
			appName: "demo-shop-libredb-studio-abc123",
			serverId: "server-1",
		});
		mocks.resolveServiceNetworks.mockResolvedValue([
			{ Target: "dokploy-network" },
		]);
		mocks.inspect.mockRejectedValue(new Error("service not found"));
		mocks.createService.mockResolvedValue(undefined);
		mocks.getRemoteDocker.mockResolvedValue({
			getService: mocks.getService,
			createService: mocks.createService,
		});
		mocks.getLibreDBStudioDeployOverrides.mockResolvedValue(null);
	});

	it("asks for overrides with the application's current server", async () => {
		await rollback("rollback-1");

		expect(mocks.getLibreDBStudioDeployOverrides).toHaveBeenCalledOnce();
		expect(mocks.getLibreDBStudioDeployOverrides).toHaveBeenCalledWith({
			applicationId: "app-1",
			appName: "demo-shop-libredb-studio-abc123",
			serverId: "server-1",
		});
	});

	it("leaves the rollback spec of an application that is not a Studio unchanged", async () => {
		await rollback("rollback-1");

		const { ContainerSpec, Placement } = createdTaskTemplate();
		expect(ContainerSpec.Image).toBe("demo-shop-libredb-studio-abc123:v2");
		expect(ContainerSpec.Env).toEqual(snapshotEnv);
		expect(ContainerSpec.Mounts).toEqual([dataVolume]);
		expect(Placement).toEqual({ Constraints: ["node.role==manager"] });
	});

	it("adds the Studio env, seed mount and node constraint to the rolled-back service", async () => {
		mocks.getLibreDBStudioDeployOverrides.mockResolvedValue(overrides);

		await rollback("rollback-1");

		const { ContainerSpec, Placement } = createdTaskTemplate();
		expect(ContainerSpec.Image).toBe("demo-shop-libredb-studio-abc123:v2");
		expect(ContainerSpec.Env).toEqual([
			"ADMIN_EMAIL=owner@example.com",
			...overrides.env,
		]);
		expect(ContainerSpec.Mounts).toEqual([dataVolume, ...overrides.mounts]);
		expect(Placement).toEqual({
			Constraints: ["node.role==manager", "node.id==node-abc"],
		});
	});

	it("gives a rolled-back Studio its own secrets instead of the snapshot's", async () => {
		mocks.getLibreDBStudioDeployOverrides.mockResolvedValue(overrides);

		await rollback("rollback-1");

		const { ContainerSpec } = createdTaskTemplate();
		expect(
			ContainerSpec.Env.filter((entry) =>
				/^(LAUNCH_TOKEN_SECRET|JWT_SECRET|ADMIN_PASSWORD)=/.test(entry),
			),
		).toEqual([
			`LAUNCH_TOKEN_SECRET=${studioSecrets.launchSecret}`,
			`JWT_SECRET=${studioSecrets.jwtSecret}`,
			`ADMIN_PASSWORD=${studioSecrets.adminPassword}`,
		]);
	});

	it("applies the overrides when the existing service is updated", async () => {
		mocks.getLibreDBStudioDeployOverrides.mockResolvedValue(overrides);
		mocks.inspect.mockResolvedValue({
			Version: { Index: "7" },
			Spec: { TaskTemplate: { ForceUpdate: 2 } },
		});

		await rollback("rollback-1");

		expect(mocks.createService).not.toHaveBeenCalled();
		const [updateOptions] = mocks.update.mock.calls[0] ?? [];
		expect(updateOptions.version).toBe(7);
		expect(updateOptions.TaskTemplate.ForceUpdate).toBe(3);
		expect(updateOptions.TaskTemplate.ContainerSpec.Env).toContain(
			"SEED_LITERAL_VALUES=true",
		);
		expect(updateOptions.TaskTemplate.ContainerSpec.Mounts).toEqual([
			dataVolume,
			...overrides.mounts,
		]);
		expect(updateOptions.TaskTemplate.Placement.Constraints).toContain(
			"node.id==node-abc",
		);
	});

	it("fails the rollback before touching the service when the overrides fail", async () => {
		const failure = new Error(
			"LibreDB Studio seed sync failed: Seed validation failed: duplicate id",
		);
		mocks.getLibreDBStudioDeployOverrides.mockRejectedValue(failure);

		await expect(rollback("rollback-1")).rejects.toBe(failure);
		expect(mocks.getService).not.toHaveBeenCalled();
		expect(mocks.createService).not.toHaveBeenCalled();
	});
});
