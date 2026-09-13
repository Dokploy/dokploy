import { beforeEach, describe, expect, it, vi } from "vitest";

class TRPCError extends Error {
	code: string;
	constructor({ code, message }: { code: string; message?: string }) {
		super(message);
		this.code = code;
		this.name = "TRPCError";
	}
}

interface MockDeployment {
	deploymentId: string;
	title: string;
	description: string;
	status: "running" | "done" | "error" | "cancelled";
	logPath?: string;
	applicationId?: string | null;
	composeId?: string | null;
	previewDeploymentId?: string | null;
	backupId?: string | null;
	volumeBackupId?: string | null;
	serverId?: string | null;
	scheduleId?: string | null;
	application?: {
		applicationId: string;
		appName: string;
		name: string;
		serverId?: string | null;
	} | null;
	compose?: {
		composeId: string;
		appName: string;
		name: string;
		serverId?: string | null;
	} | null;
	schedule?: {
		scheduleId: string;
		applicationId?: string | null;
		composeId?: string | null;
		serverId?: string | null;
		organizationId?: string | null;
	} | null;
}

interface Context {
	user?: {
		id: string;
		role: string;
	} | null;
	session?: {
		id: string;
		userId: string;
		activeOrganizationId: string;
	} | null;
}

// Logic under test: mirrors production checkDeploymentAccess in apps/dokploy/server/api/routers/deployment.ts
const checkDeploymentAccess = async (
	ctx: Context,
	deployment: MockDeployment,
	permission: { deployment: ("read" | "cancel")[] } = { deployment: ["read"] },
	deps: {
		checkServicePermissionAndAccess: (
			ctx: Context,
			serviceId: string,
			permission: any,
		) => Promise<void>;
		checkPermission: (ctx: Context, permission: any) => Promise<void>;
		findServerById: (serverId: string) => Promise<{ serverId: string; organizationId: string }>;
	},
) => {
	if (!ctx.session || !ctx.user) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "UNAUTHORIZED",
		});
	}

	const serviceId =
		deployment.applicationId ||
		deployment.composeId ||
		deployment.previewDeploymentId ||
		deployment.backupId ||
		deployment.volumeBackupId ||
		deployment.schedule?.applicationId ||
		deployment.schedule?.composeId;
	if (serviceId) {
		await deps.checkServicePermissionAndAccess(ctx, serviceId, permission);
		return;
	}

	const serverId =
		deployment.serverId ||
		deployment.schedule?.serverId ||
		deployment.application?.serverId ||
		deployment.compose?.serverId;
	if (serverId) {
		const targetServer = await deps.findServerById(serverId);
		if (targetServer.organizationId !== ctx.session.activeOrganizationId) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this deployment.",
			});
		}
		await deps.checkPermission(ctx, permission);
		return;
	}

	if (deployment.schedule?.organizationId) {
		if (
			deployment.schedule.organizationId !== ctx.session.activeOrganizationId
		) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this deployment.",
			});
		}
		await deps.checkPermission(ctx, permission);
		return;
	}

	throw new TRPCError({
		code: "UNAUTHORIZED",
		message: "You don't have access to this deployment.",
	});
};

const handleFindOneDeployment = async (
	input: { deploymentId: string },
	ctx: Context,
	deps: {
		findDeploymentById: (id: string) => Promise<MockDeployment | null>;
		checkServicePermissionAndAccess: (
			ctx: Context,
			serviceId: string,
			permission: any,
		) => Promise<void>;
		checkPermission: (ctx: Context, permission: any) => Promise<void>;
		findServerById: (serverId: string) => Promise<{ serverId: string; organizationId: string }>;
	},
) => {
	const deployment = await deps.findDeploymentById(input.deploymentId);
	if (!deployment) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Deployment not found",
		});
	}
	await checkDeploymentAccess(ctx, deployment, { deployment: ["read"] }, deps);
	return deployment;
};

describe("deployment.one Procedure & Access Control (Issue #5168)", () => {
	const defaultDeployment: MockDeployment = {
		deploymentId: "dep-1",
		title: "Manual Deploy",
		description: "Deploying app",
		status: "done",
		logPath: "/logs/dep-1.log",
		applicationId: "app-1",
		application: {
			applicationId: "app-1",
			appName: "my-app",
			name: "My App",
		},
	};

	const ctx: Context = {
		user: { id: "user-1", role: "owner" },
		session: {
			id: "sess-1",
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
	};

	let deps: {
		findDeploymentById: any;
		checkServicePermissionAndAccess: any;
		checkPermission: any;
		findServerById: any;
	};

	beforeEach(() => {
		deps = {
			findDeploymentById: vi.fn(async (id: string) =>
				id === "non-existent" ? null : { ...defaultDeployment },
			),
			checkServicePermissionAndAccess: vi.fn(
				async (_ctx: Context, serviceId: string) => {
					if (serviceId === "forbidden-app") {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You don't have access to this service",
						});
					}
				},
			),
			checkPermission: vi.fn(async () => {}),
			findServerById: vi.fn(async (serverId: string) => ({
				serverId,
				organizationId: serverId === "other-server" ? "other-org" : "org-1",
			})),
		};
	});

	it("returns deployment by id for authorized service owner", async () => {
		const result = await handleFindOneDeployment({ deploymentId: "dep-1" }, ctx, deps);

		expect(result).toBeDefined();
		expect(result.deploymentId).toBe("dep-1");
		expect(result.status).toBe("done");
		expect(result.application?.appName).toBe("my-app");
		expect(deps.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"app-1",
			{ deployment: ["read"] },
		);
	});

	it("throws NOT_FOUND when deployment does not exist", async () => {
		await expect(
			handleFindOneDeployment({ deploymentId: "non-existent" }, ctx, deps),
		).rejects.toThrow("Deployment not found");
	});

	it("throws UNAUTHORIZED if user lacks access to the parent service", async () => {
		deps.findDeploymentById = vi.fn(async () => ({
			...defaultDeployment,
			applicationId: "forbidden-app",
		}));

		await expect(
			handleFindOneDeployment({ deploymentId: "dep-1" }, ctx, deps),
		).rejects.toThrow("You don't have access to this service");
	});

	it("validates preview deployment via previewDeploymentId service check", async () => {
		deps.findDeploymentById = vi.fn(async () => ({
			...defaultDeployment,
			applicationId: null,
			previewDeploymentId: "preview-123",
		}));

		const result = await handleFindOneDeployment({ deploymentId: "dep-1" }, ctx, deps);

		expect(result).toBeDefined();
		expect(deps.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"preview-123",
			{ deployment: ["read"] },
		);
	});

	it("validates database backup deployment via backupId service check", async () => {
		deps.findDeploymentById = vi.fn(async () => ({
			...defaultDeployment,
			applicationId: null,
			backupId: "backup-456",
		}));

		const result = await handleFindOneDeployment({ deploymentId: "dep-1" }, ctx, deps);

		expect(result).toBeDefined();
		expect(deps.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"backup-456",
			{ deployment: ["read"] },
		);
	});

	it("validates volume backup deployment via volumeBackupId service check", async () => {
		deps.findDeploymentById = vi.fn(async () => ({
			...defaultDeployment,
			applicationId: null,
			volumeBackupId: "vol-backup-789",
		}));

		const result = await handleFindOneDeployment({ deploymentId: "dep-1" }, ctx, deps);

		expect(result).toBeDefined();
		expect(deps.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"vol-backup-789",
			{ deployment: ["read"] },
		);
	});

	it("returns schedule-triggered deployment when schedule is linked to an application", async () => {
		deps.findDeploymentById = vi.fn(async () => ({
			...defaultDeployment,
			applicationId: null,
			scheduleId: "sched-1",
			schedule: {
				scheduleId: "sched-1",
				applicationId: "app-1",
				organizationId: "org-1",
			},
		}));

		const result = await handleFindOneDeployment({ deploymentId: "dep-1" }, ctx, deps);

		expect(result).toBeDefined();
		expect(result.scheduleId).toBe("sched-1");
		expect(deps.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"app-1",
			{ deployment: ["read"] },
		);
	});

	it("returns server-level schedule deployment when server belongs to active organization", async () => {
		deps.findDeploymentById = vi.fn(async () => ({
			...defaultDeployment,
			applicationId: null,
			scheduleId: "sched-srv",
			schedule: {
				scheduleId: "sched-srv",
				serverId: "server-1",
				organizationId: "org-1",
			},
		}));

		const result = await handleFindOneDeployment({ deploymentId: "dep-1" }, ctx, deps);

		expect(result).toBeDefined();
		expect(deps.checkPermission).toHaveBeenCalled();
		expect(deps.findServerById).toHaveBeenCalledWith("server-1");
	});

	it("throws UNAUTHORIZED if server belongs to a different organization", async () => {
		deps.findDeploymentById = vi.fn(async () => ({
			...defaultDeployment,
			applicationId: null,
			serverId: "other-server",
		}));

		await expect(
			handleFindOneDeployment({ deploymentId: "dep-1" }, ctx, deps),
		).rejects.toThrow("You don't have access to this deployment.");
	});

	it("throws UNAUTHORIZED if schedule organization does not match active organization", async () => {
		deps.findDeploymentById = vi.fn(async () => ({
			...defaultDeployment,
			applicationId: null,
			scheduleId: "sched-other",
			schedule: {
				scheduleId: "sched-other",
				organizationId: "org-different",
			},
		}));

		await expect(
			handleFindOneDeployment({ deploymentId: "dep-1" }, ctx, deps),
		).rejects.toThrow("You don't have access to this deployment.");
	});

	it("fails closed and throws UNAUTHORIZED for unscoped deployments without parent resource", async () => {
		deps.findDeploymentById = vi.fn(async () => ({
			...defaultDeployment,
			applicationId: null,
			composeId: null,
			previewDeploymentId: null,
			backupId: null,
			volumeBackupId: null,
			serverId: null,
			scheduleId: null,
			schedule: null,
		}));

		await expect(
			handleFindOneDeployment({ deploymentId: "dep-1" }, ctx, deps),
		).rejects.toThrow("You don't have access to this deployment.");
	});

	it("throws UNAUTHORIZED when session is missing", async () => {
		const unauthenticatedCtx: Context = { user: null, session: null };

		await expect(
			handleFindOneDeployment({ deploymentId: "dep-1" }, unauthenticatedCtx, deps),
		).rejects.toThrow("UNAUTHORIZED");
	});
});
