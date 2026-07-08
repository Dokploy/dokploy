import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	getConfig: vi.fn(),
	db: {
		query: {
			applications: { findFirst: vi.fn() },
			compose: { findFirst: vi.fn() },
			postgres: { findFirst: vi.fn() },
			mysql: { findFirst: vi.fn() },
			mariadb: { findFirst: vi.fn() },
			mongo: { findFirst: vi.fn() },
			redis: { findFirst: vi.fn() },
			libsql: { findFirst: vi.fn() },
			previewDeployments: { findFirst: vi.fn() },
		},
	},
}));

vi.mock("@dokploy/server", () => ({
	getConfig: mocks.getConfig,
}));

vi.mock("@dokploy/server/db", () => ({
	db: mocks.db,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

const {
	assertLocalDockerContainerAccess,
	assertLocalDockerServiceAccess,
	assertLocalDockerServiceReadAccess,
} = await import("../../server/api/utils/local-docker-access");

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

const resetServiceLookups = () => {
	for (const table of Object.values(mocks.db.query)) {
		table.findFirst.mockResolvedValue(null);
	}
};

describe("local Docker service access", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetServiceLookups();
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
	});

	it("binds local container access through Docker swarm service labels", async () => {
		mocks.getConfig.mockResolvedValue({
			Id: "container-full-id",
			Config: {
				Labels: {
					"com.docker.swarm.service.name": "app-1",
				},
			},
		});
		mocks.db.query.applications.findFirst.mockResolvedValue({
			applicationId: "application-1",
			serverId: null,
		});

		await expect(
			assertLocalDockerContainerAccess(ctx, "container-short-id", "read"),
		).resolves.toMatchObject({ Id: "container-full-id" });

		expect(mocks.getConfig).toHaveBeenCalledWith("container-short-id", null);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"application-1",
			{ docker: ["read"] },
		);
	});

	it("uses stack namespace before swarm service name for compose stacks", async () => {
		mocks.getConfig.mockResolvedValue({
			Id: "container-full-id",
			Config: {
				Labels: {
					"com.docker.stack.namespace": "compose-app",
					"com.docker.swarm.service.name": "compose-app_web",
				},
			},
		});
		mocks.db.query.compose.findFirst.mockResolvedValue({
			composeId: "compose-1",
			serverId: null,
		});

		await assertLocalDockerContainerAccess(ctx, "container-short-id", "read");

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"compose-1",
			{ docker: ["read"] },
		);
	});

	it("maps preview deployment app names back to the parent application", async () => {
		mocks.db.query.previewDeployments.findFirst.mockResolvedValue({
			application: {
				applicationId: "application-1",
				serverId: null,
			},
		});

		await assertLocalDockerServiceAccess(ctx, "preview-app-1", "execute");

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"application-1",
			{ docker: ["execute"] },
		);
	});

	it("checks service.read for local app-name read access", async () => {
		mocks.db.query.compose.findFirst.mockResolvedValue({
			composeId: "compose-1",
			serverId: null,
		});

		await assertLocalDockerServiceReadAccess(ctx, "compose-app");

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"compose-1",
			{ service: ["read"] },
		);
	});

	it("rejects local Docker targets that belong to remote server-backed services", async () => {
		mocks.db.query.applications.findFirst.mockResolvedValue({
			applicationId: "application-1",
			serverId: "server-1",
		});

		await expect(
			assertLocalDockerServiceAccess(ctx, "app-1", "delete"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.checkServicePermissionAndAccess).not.toHaveBeenCalled();
	});
});
