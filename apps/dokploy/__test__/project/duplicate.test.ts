import { beforeEach, describe, expect, it, vi } from "vitest";

// The router imports its service helpers (find*ById, create*, findEnvironmentById,
// createProject) from the `@dokploy/server` barrel. Mock the barrel so we both
// control their behaviour AND avoid pulling in lib/auth / monitoring / etc. at
// import time. Mock the other heavy transitive deps the router + trpc loader pull
// in (auth, audit, billing, permission, project serviceColumns) for the same
// reason and to drive the authorization decisions under test.

const mockBarrel = vi.hoisted(() => ({
	findEnvironmentById: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findLibsqlById: vi.fn(),
	findMariadbById: vi.fn(),
	findMongoById: vi.fn(),
	findMySqlById: vi.fn(),
	findPostgresById: vi.fn(),
	findRedisById: vi.fn(),
	createApplication: vi.fn(),
	createCompose: vi.fn(),
	createLibsql: vi.fn(),
	createMariadb: vi.fn(),
	createMongo: vi.fn(),
	createMysql: vi.fn(),
	createPostgres: vi.fn(),
	createRedis: vi.fn(),
	createDomain: vi.fn(),
	createMount: vi.fn(),
	createPort: vi.fn(),
	createRedirect: vi.fn(),
	createSecurity: vi.fn(),
	createPreviewDeployment: vi.fn(),
	createBackup: vi.fn(),
	createProject: vi.fn(),
	findProjectById: vi.fn(),
	findUserById: vi.fn(),
	updateProjectById: vi.fn(),
	updateUser: vi.fn(),
	deleteProject: vi.fn(),
	hasValidLicense: vi.fn().mockResolvedValue(false),
	IS_CLOUD: false,
}));

const mockPermission = vi.hoisted(() => ({
	checkProjectAccess: vi.fn().mockResolvedValue(undefined),
	checkPermission: vi.fn().mockResolvedValue(undefined),
	findMemberByUserId: vi.fn(),
	addNewProject: vi.fn().mockResolvedValue(undefined),
	addNewEnvironment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@dokploy/server", () => mockBarrel);

vi.mock("@dokploy/server/services/permission", () => mockPermission);

vi.mock("@dokploy/server/services/project", () => ({
	serviceColumns: {
		name: true,
		description: true,
		appName: true,
		createdAt: true,
		serverId: true,
	},
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/utils/billing", () => ({
	getBillingStatus: vi.fn(),
}));

import { projectRouter } from "@/server/api/routers/project";

const ORG_A = "org-attacker";
const ORG_B = "org-victim";

const ownerCtx = () => ({
	user: {
		id: "user-attacker",
		role: "owner",
		email: "att@a.com",
		ownerId: "user-attacker",
	},
	session: { activeOrganizationId: ORG_A },
});

const memberCtx = () => ({
	user: {
		id: "user-member",
		role: "member",
		email: "mem@a.com",
		ownerId: "user-owner",
	},
	session: { activeOrganizationId: ORG_A },
});

const buildEnv = (
	organizationId: string,
	projectId: string,
	environmentId: string,
) => ({
	environmentId,
	projectId,
	name: "env",
	description: "",
	isDefault: false,
	env: "",
	project: { organizationId, projectId, env: "", name: "proj" },
});

const buildApp = (organizationId: string, environmentId: string) => ({
	applicationId: "app-src",
	environmentId,
	environment: { project: { organizationId, projectId: "p-src", env: "" } },
	appName: "my-app-xyz",
	name: "My App",
	env: "SECRET=leaked",
	domains: [],
	security: [],
	ports: [],
	registry: null,
	redirects: [],
	previewDeployments: [],
	mounts: [],
	refreshToken: null,
});

const buildCompose = (organizationId: string, environmentId: string) => ({
	composeId: "comp-src",
	environmentId,
	environment: { project: { organizationId, projectId: "p-src", env: "" } },
	appName: "my-compose-xyz",
	name: "My Compose",
	compose: "services: {}",
	mounts: [],
	domains: [],
	refreshToken: null,
});

const buildPostgres = (organizationId: string, environmentId: string) => ({
	postgresId: "pg-src",
	environmentId,
	environment: { project: { organizationId, projectId: "p-src", env: "" } },
	appName: "my-pg-xyz",
	name: "My PG",
	databasePassword: "pg-password-leaked",
	mounts: [],
	backups: [],
});

const newProjectEnv = {
	environment: {
		environmentId: "env-new",
		projectId: "proj-new",
		name: "env",
		description: "",
		isDefault: false,
		env: "",
	},
};

const duplicate = (ctx: any, input: any) =>
	projectRouter.createCaller(ctx).duplicate(input);

beforeEach(() => {
	vi.clearAllMocks();
	mockPermission.checkProjectAccess.mockResolvedValue(undefined);
	mockPermission.checkPermission.mockResolvedValue(undefined);
	mockPermission.addNewProject.mockResolvedValue(undefined);
	mockPermission.addNewEnvironment.mockResolvedValue(undefined);
	mockBarrel.hasValidLicense.mockResolvedValue(false);
	mockBarrel.createProject.mockResolvedValue(newProjectEnv);
});

describe("project.duplicate IDOR guard", () => {
	it("blocks cross-org application duplication via new-project mode (no leak)", async () => {
		mockBarrel.findApplicationById.mockResolvedValue(
			buildApp(ORG_B, "env-victim"),
		);

		await expect(
			duplicate(ownerCtx(), {
				sourceEnvironmentId: "",
				name: "Copy",
				includeServices: true,
				selectedServices: [{ id: "app-victim", type: "application" }],
				duplicateInSameProject: false,
			}),
		).rejects.toThrow(/not authorized to access this service/);

		expect(mockBarrel.findApplicationById).toHaveBeenCalledWith("app-victim");
		// The victim's secret-bearing row must never be re-created in the caller's org.
		expect(mockBarrel.createApplication).not.toHaveBeenCalled();
		// The source environment is not loaded on the cross-project branch (frontend
		// sends an empty sourceEnvironmentId here), so it must not be looked up.
		expect(mockBarrel.findEnvironmentById).not.toHaveBeenCalled();
	});

	it("blocks cross-org application duplication via existing-environment mode (no leak, no empty project)", async () => {
		mockBarrel.findEnvironmentById.mockResolvedValue(
			buildEnv(ORG_A, "proj-target", "env-target"),
		);
		mockBarrel.findApplicationById.mockResolvedValue(
			buildApp(ORG_B, "env-victim"),
		);

		await expect(
			duplicate(ownerCtx(), {
				sourceEnvironmentId: "env-target",
				name: "Copy",
				includeServices: true,
				selectedServices: [{ id: "app-victim", type: "application" }],
				duplicateInSameProject: true,
			}),
		).rejects.toThrow(/not authorized to access this service/);

		expect(mockBarrel.findApplicationById).toHaveBeenCalledWith("app-victim");
		expect(mockBarrel.createApplication).not.toHaveBeenCalled();
		expect(mockBarrel.createProject).not.toHaveBeenCalled();
	});

	it("blocks cross-org compose duplication", async () => {
		mockBarrel.findEnvironmentById.mockResolvedValue(
			buildEnv(ORG_A, "proj-target", "env-target"),
		);
		mockBarrel.findComposeById.mockResolvedValue(
			buildCompose(ORG_B, "env-victim"),
		);

		await expect(
			duplicate(ownerCtx(), {
				sourceEnvironmentId: "env-target",
				name: "Copy",
				includeServices: true,
				selectedServices: [{ id: "comp-victim", type: "compose" }],
				duplicateInSameProject: true,
			}),
		).rejects.toThrow(/not authorized to access this service/);
		expect(mockBarrel.createCompose).not.toHaveBeenCalled();
	});

	it("blocks cross-org postgres duplication (databasePassword not copied)", async () => {
		mockBarrel.findEnvironmentById.mockResolvedValue(
			buildEnv(ORG_A, "proj-target", "env-target"),
		);
		mockBarrel.findPostgresById.mockResolvedValue(
			buildPostgres(ORG_B, "env-victim"),
		);

		await expect(
			duplicate(ownerCtx(), {
				sourceEnvironmentId: "env-target",
				name: "Copy",
				includeServices: true,
				selectedServices: [{ id: "pg-victim", type: "postgres" }],
				duplicateInSameProject: true,
			}),
		).rejects.toThrow(/not authorized to access this service/);
		expect(mockBarrel.createPostgres).not.toHaveBeenCalled();
	});

	it("rejects a cross-org target environment before touching any service", async () => {
		mockBarrel.findEnvironmentById.mockResolvedValue(
			buildEnv(ORG_B, "proj-other", "env-other"),
		);

		await expect(
			duplicate(ownerCtx(), {
				sourceEnvironmentId: "env-other",
				name: "Copy",
				includeServices: true,
				selectedServices: [{ id: "app-x", type: "application" }],
				duplicateInSameProject: true,
			}),
		).rejects.toThrow(/not authorized to access this project/);
		expect(mockBarrel.findApplicationById).not.toHaveBeenCalled();
		expect(mockBarrel.createApplication).not.toHaveBeenCalled();
	});

	it("allows in-org new-project duplication and copies secrets within the org (no regression)", async () => {
		mockBarrel.findApplicationById.mockResolvedValue(
			buildApp(ORG_A, "env-src"),
		);

		const result = await duplicate(ownerCtx(), {
			sourceEnvironmentId: "",
			name: "Copy",
			description: "desc",
			includeServices: true,
			selectedServices: [{ id: "app-mine", type: "application" }],
			duplicateInSameProject: false,
		});

		expect(mockBarrel.findApplicationById).toHaveBeenCalledWith("app-mine");
		expect(mockBarrel.createProject).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Copy", description: "desc" }),
			ORG_A,
		);
		expect(mockBarrel.createApplication).toHaveBeenCalledWith(
			expect.objectContaining({
				environmentId: "env-new",
				env: "SECRET=leaked",
				name: "My App",
			}),
		);
		expect(mockPermission.addNewProject).toHaveBeenCalledWith(
			expect.anything(),
			"proj-new",
		);
		expect(result).toEqual(newProjectEnv.environment);
	});

	it("allows in-org cross-environment duplication (existing-env mode)", async () => {
		// The frontend sends the TARGET environment as sourceEnvironmentId while the
		// services come from the caller's current (source) environment. Binding the
		// source services to sourceEnvironmentId (as the report literally suggested)
		// would reject this legitimate flow; binding them to their own org does not.
		mockBarrel.findEnvironmentById.mockResolvedValue(
			buildEnv(ORG_A, "proj-target", "env-target"),
		);
		mockBarrel.findApplicationById.mockResolvedValue(
			buildApp(ORG_A, "env-src"),
		);

		await duplicate(ownerCtx(), {
			sourceEnvironmentId: "env-target",
			name: "Copy",
			includeServices: true,
			selectedServices: [{ id: "app-mine", type: "application" }],
			duplicateInSameProject: true,
		});

		expect(mockBarrel.createApplication).toHaveBeenCalledWith(
			expect.objectContaining({
				environmentId: "env-target",
				env: "SECRET=leaked",
			}),
		);
		expect(mockBarrel.createProject).not.toHaveBeenCalled();
	});

	it("blocks a member from duplicating a service not in their accessedServices (intra-org)", async () => {
		mockPermission.findMemberByUserId.mockResolvedValue({
			role: "member",
			accessedServices: ["app-allowed"],
			accessedProjects: ["proj-src"],
			accessedEnvironments: ["env-src"],
		});
		mockBarrel.findApplicationById.mockResolvedValue(
			buildApp(ORG_A, "env-src"),
		);

		await expect(
			duplicate(memberCtx(), {
				sourceEnvironmentId: "",
				name: "Copy",
				includeServices: true,
				selectedServices: [{ id: "app-other", type: "application" }],
				duplicateInSameProject: false,
			}),
		).rejects.toThrow(/don't have access to this service/);
		expect(mockBarrel.createApplication).not.toHaveBeenCalled();
	});

	it("allows a member to duplicate a service in their accessedServices (no regression)", async () => {
		mockPermission.findMemberByUserId.mockResolvedValue({
			role: "member",
			accessedServices: ["app-allowed"],
			accessedProjects: ["proj-target"],
			accessedEnvironments: ["env-target"],
		});
		mockBarrel.findEnvironmentById.mockResolvedValue(
			buildEnv(ORG_A, "proj-target", "env-target"),
		);
		mockBarrel.findApplicationById.mockResolvedValue(
			buildApp(ORG_A, "env-src"),
		);

		await duplicate(memberCtx(), {
			sourceEnvironmentId: "env-target",
			name: "Copy",
			includeServices: true,
			selectedServices: [{ id: "app-allowed", type: "application" }],
			duplicateInSameProject: true,
		});

		expect(mockBarrel.createApplication).toHaveBeenCalledWith(
			expect.objectContaining({
				environmentId: "env-target",
				env: "SECRET=leaked",
			}),
		);
	});

	it("blocks a member from duplicating into a target project not in their accessedProjects", async () => {
		mockPermission.findMemberByUserId.mockResolvedValue({
			role: "member",
			accessedServices: ["app-allowed"],
			accessedProjects: ["proj-other"],
			accessedEnvironments: ["env-other"],
		});
		mockBarrel.findEnvironmentById.mockResolvedValue(
			buildEnv(ORG_A, "proj-target", "env-target"),
		);

		await expect(
			duplicate(memberCtx(), {
				sourceEnvironmentId: "env-target",
				name: "Copy",
				includeServices: true,
				selectedServices: [{ id: "app-allowed", type: "application" }],
				duplicateInSameProject: true,
			}),
		).rejects.toThrow(/don't have access to this project/);
		expect(mockBarrel.createApplication).not.toHaveBeenCalled();
	});
});
