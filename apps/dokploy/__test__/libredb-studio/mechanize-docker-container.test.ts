import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { mechanizeDockerContainer } from "@dokploy/server/utils/builders";
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
		getRemoteDocker: vi.fn(),
		getLibreDBStudioDeployOverrides: vi.fn(),
	};
});

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

const applicationEnv = [
	"ADMIN_EMAIL=owner@example.com",
	"ALLOW_CUSTOM_CONNECTIONS=true",
	"SEED_CACHE_TTL_MS=60000",
	`JWT_SECRET=${TYPED_INTO_ENV_TAB}`,
	`ADMIN_PASSWORD=${TYPED_INTO_ENV_TAB}`,
	`LAUNCH_TOKEN_SECRET=${TYPED_INTO_ENV_TAB}`,
];

const createApplication = (
	overridesForApp: Partial<ApplicationNested> = {},
): ApplicationNested =>
	({
		applicationId: "app-1",
		appName: "demo-shop-libredb-studio-abc123",
		env: applicationEnv.join("\n"),
		mounts: [
			{
				type: "volume",
				volumeName: "demo-shop-libredb-studio-abc123-data",
				mountPath: "/app/data",
			},
		],
		cpuLimit: null,
		memoryLimit: null,
		memoryReservation: null,
		cpuReservation: null,
		command: null,
		args: null,
		ports: [],
		sourceType: "docker",
		dockerImage: "ghcr.io/libredb/libredb-studio:0.18.0",
		registry: null,
		buildRegistry: null,
		username: null,
		password: null,
		placementSwarm: null,
		networkSwarm: null,
		networkIds: [],
		detachDokployNetwork: false,
		environment: {
			environmentId: "env-1",
			env: null,
			project: { projectId: "project-1", env: null, organizationId: "org-1" },
		},
		replicas: 1,
		stopGracePeriodSwarm: null,
		ulimitsSwarm: null,
		serverId: "server-1",
		...overridesForApp,
	}) as unknown as ApplicationNested;

type CreatedTaskTemplate = {
	ContainerSpec: { Env: string[]; Mounts: unknown[] };
	Placement: { Constraints?: string[] };
};

const createdTaskTemplate = (): CreatedTaskTemplate => {
	expect(mocks.createService).toHaveBeenCalledOnce();
	const [settings] = mocks.createService.mock.calls[0] ?? [];
	return settings.TaskTemplate as CreatedTaskTemplate;
};

describe("mechanizeDockerContainer with LibreDB Studio overrides", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.inspect.mockRejectedValue(new Error("service not found"));
		mocks.createService.mockResolvedValue(undefined);
		mocks.getRemoteDocker.mockResolvedValue({
			getService: mocks.getService,
			createService: mocks.createService,
		});
		mocks.getLibreDBStudioDeployOverrides.mockResolvedValue(null);
	});

	it("asks for overrides with the application identity", async () => {
		await mechanizeDockerContainer(createApplication());

		expect(mocks.getLibreDBStudioDeployOverrides).toHaveBeenCalledOnce();
		const [application] =
			mocks.getLibreDBStudioDeployOverrides.mock.calls[0] ?? [];
		expect(application).toMatchObject({
			applicationId: "app-1",
			appName: "demo-shop-libredb-studio-abc123",
			serverId: "server-1",
		});
	});

	it("leaves an application that is not a Studio unchanged", async () => {
		await mechanizeDockerContainer(createApplication());

		const { ContainerSpec, Placement } = createdTaskTemplate();
		expect(ContainerSpec.Env).toEqual(applicationEnv);
		expect(ContainerSpec.Mounts).toEqual([
			{
				Type: "volume",
				Source: "demo-shop-libredb-studio-abc123-data",
				Target: "/app/data",
			},
		]);
		expect(Placement).toEqual({ Constraints: ["node.role==manager"] });
	});

	it("applies the Studio env, seed mount and node constraint", async () => {
		mocks.getLibreDBStudioDeployOverrides.mockResolvedValue(overrides);

		await mechanizeDockerContainer(createApplication());

		const { ContainerSpec, Placement } = createdTaskTemplate();
		expect(ContainerSpec.Env).toEqual([
			"ADMIN_EMAIL=owner@example.com",
			...overrides.env,
		]);
		expect(ContainerSpec.Mounts).toEqual([
			{
				Type: "volume",
				Source: "demo-shop-libredb-studio-abc123-data",
				Target: "/app/data",
			},
			...overrides.mounts,
		]);
		expect(Placement).toEqual({
			Constraints: ["node.role==manager", "node.id==node-abc"],
		});
	});

	it("gives a Studio its own secrets instead of the ones typed into the env tab", async () => {
		mocks.getLibreDBStudioDeployOverrides.mockResolvedValue(overrides);

		await mechanizeDockerContainer(createApplication());

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

	it("keeps the user's placement constraints", async () => {
		mocks.getLibreDBStudioDeployOverrides.mockResolvedValue(overrides);

		await mechanizeDockerContainer(
			createApplication({
				placementSwarm: { Constraints: ["node.labels.region==eu"] },
			}),
		);

		const { Placement } = createdTaskTemplate();
		expect(Placement).toEqual({
			Constraints: ["node.labels.region==eu", "node.id==node-abc"],
		});
	});

	it("applies the overrides when an existing service is updated", async () => {
		mocks.getLibreDBStudioDeployOverrides.mockResolvedValue(overrides);
		mocks.inspect.mockResolvedValue({
			Version: { Index: "7" },
			Spec: { TaskTemplate: { ForceUpdate: 2 } },
		});

		await mechanizeDockerContainer(createApplication());

		expect(mocks.createService).not.toHaveBeenCalled();
		const [updateOptions] = mocks.update.mock.calls[0] ?? [];
		expect(updateOptions.version).toBe(7);
		expect(updateOptions.TaskTemplate.ForceUpdate).toBe(3);
		expect(updateOptions.TaskTemplate.ContainerSpec.Env).toContain(
			"SEED_LITERAL_VALUES=true",
		);
		expect(updateOptions.TaskTemplate.Placement.Constraints).toContain(
			"node.id==node-abc",
		);
	});

	it("fails the deploy before touching the service when the overrides fail", async () => {
		const failure = new Error(
			"Cannot deploy LibreDB Studio demo-shop-libredb-studio-abc123: Docker reports no Swarm node id for the host that holds its seed directory",
		);
		mocks.getLibreDBStudioDeployOverrides.mockRejectedValue(failure);

		await expect(mechanizeDockerContainer(createApplication())).rejects.toBe(
			failure,
		);
		expect(mocks.getService).not.toHaveBeenCalled();
		expect(mocks.createService).not.toHaveBeenCalled();
	});
});
