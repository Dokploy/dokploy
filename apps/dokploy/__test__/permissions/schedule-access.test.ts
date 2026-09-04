import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Shared mutable mock state (hoisted so vi.mock closures can read it) ----
const mockState = vi.hoisted(() => ({
	IS_CLOUD: false,
	member: {
		id: "member-1",
		role: "owner",
		userId: "user-1",
		organizationId: "org-1",
		accessedProjects: [] as string[],
		accessedServices: [] as string[],
		accessedEnvironments: [] as string[],
		canCreateProjects: false,
		canDeleteProjects: false,
		canCreateServices: false,
		canDeleteServices: false,
		canCreateEnvironments: false,
		canDeleteEnvironments: false,
		canAccessToTraefikFiles: false,
		canAccessToDocker: false,
		canAccessToAPI: false,
		canAccessToSSHKeys: false,
		canAccessToGitProviders: false,
		user: { id: "user-1", email: "test@test.com" },
	},
	server: { organizationId: "org-1" },
}));

vi.mock("@dokploy/server/constants", () => ({
	get IS_CLOUD() {
		return mockState.IS_CLOUD;
	},
	paths: () => ({ SCHEDULES_PATH: "/tmp/schedules" }),
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(() => Promise.resolve(mockState.server)),
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	encodeBase64: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: vi.fn(() => Promise.resolve(mockState.member)),
				findMany: vi.fn(() => Promise.resolve([])),
			},
			organizationRole: {
				findFirst: vi.fn(),
				findMany: vi.fn(() => Promise.resolve([])),
			},
		},
	},
}));

const { assertHostScheduleAccess } = await import(
	"@dokploy/server/services/schedule"
);
const { updateScheduleSchema } = await import(
	"@dokploy/server/db/schema/schedule"
);

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.clearAllMocks();
	mockState.IS_CLOUD = false;
	mockState.member = {
		...mockState.member,
		role: "owner",
	};
	mockState.server = { organizationId: "org-1" };
});

describe("assertHostScheduleAccess — dokploy-server cross-org isolation", () => {
	it("owner in own org with matching scheduleOrganizationId passes", async () => {
		mockState.member = { ...mockState.member, role: "owner" };
		await expect(
			assertHostScheduleAccess(ctx, "dokploy-server", null, "org-1"),
		).resolves.toBeUndefined();
	});

	it("admin in own org with matching scheduleOrganizationId passes", async () => {
		mockState.member = { ...mockState.member, role: "admin" };
		await expect(
			assertHostScheduleAccess(ctx, "dokploy-server", null, "org-1"),
		).resolves.toBeUndefined();
	});

	it("owner targeting a FOREIGN org schedule is rejected (IDOR fix)", async () => {
		mockState.member = { ...mockState.member, role: "owner" };
		await expect(
			assertHostScheduleAccess(ctx, "dokploy-server", null, "org-2"),
		).rejects.toThrow("You don't have access to this schedule.");
	});

	it("admin targeting a FOREIGN org schedule is rejected (IDOR fix)", async () => {
		mockState.member = { ...mockState.member, role: "admin" };
		await expect(
			assertHostScheduleAccess(ctx, "dokploy-server", null, "org-2"),
		).rejects.toThrow("You don't have access to this schedule.");
	});

	it("member is rejected even when the org matches (owner/admin gate)", async () => {
		mockState.member = { ...mockState.member, role: "member" };
		await expect(
			assertHostScheduleAccess(ctx, "dokploy-server", null, "org-1"),
		).rejects.toThrow(
			"Only owners and admins can manage server-level schedules.",
		);
	});

	it("member targeting a foreign org is rejected at the role gate, not the org check", async () => {
		mockState.member = { ...mockState.member, role: "member" };
		await expect(
			assertHostScheduleAccess(ctx, "dokploy-server", null, "org-2"),
		).rejects.toThrow(
			"Only owners and admins can manage server-level schedules.",
		);
	});

	it("create path (no scheduleOrganizationId) is allowed for owner", async () => {
		mockState.member = { ...mockState.member, role: "owner" };
		await expect(
			assertHostScheduleAccess(ctx, "dokploy-server", null, undefined),
		).resolves.toBeUndefined();
	});

	it("null scheduleOrganizationId is treated as no-op (allowed)", async () => {
		mockState.member = { ...mockState.member, role: "owner" };
		await expect(
			assertHostScheduleAccess(ctx, "dokploy-server", null, null),
		).resolves.toBeUndefined();
	});

	it("rejects dokploy-server on the cloud version", async () => {
		mockState.IS_CLOUD = true;
		mockState.member = { ...mockState.member, role: "owner" };
		await expect(
			assertHostScheduleAccess(ctx, "dokploy-server", null, "org-1"),
		).rejects.toThrow(
			"Host-level schedules are not available in the cloud version.",
		);
	});

	it("is a no-op for application/compose scheduleType", async () => {
		await expect(
			assertHostScheduleAccess(ctx, "application", null, "org-2"),
		).resolves.toBeUndefined();
		await expect(
			assertHostScheduleAccess(ctx, "compose", null, "org-2"),
		).resolves.toBeUndefined();
	});
});

describe("assertHostScheduleAccess — server branch (regression)", () => {
	it("owner with a server in their own org passes", async () => {
		mockState.member = { ...mockState.member, role: "owner" };
		mockState.server = { organizationId: "org-1" };
		await expect(
			assertHostScheduleAccess(ctx, "server", "server-1", undefined),
		).resolves.toBeUndefined();
	});

	it("owner with a server in a FOREIGN org is rejected", async () => {
		mockState.member = { ...mockState.member, role: "owner" };
		mockState.server = { organizationId: "org-2" };
		await expect(
			assertHostScheduleAccess(ctx, "server", "server-1", undefined),
		).rejects.toThrow("You don't have access to this server.");
	});

	it("member cannot manage server schedules (owner/admin gate)", async () => {
		mockState.member = { ...mockState.member, role: "member" };
		mockState.server = { organizationId: "org-1" };
		await expect(
			assertHostScheduleAccess(ctx, "server", "server-1", undefined),
		).rejects.toThrow(
			"Only owners and admins can manage server-level schedules.",
		);
	});

	it("passing a foreign scheduleOrganizationId is ignored for the server branch (server org is authoritative)", async () => {
		mockState.member = { ...mockState.member, role: "owner" };
		mockState.server = { organizationId: "org-1" };
		await expect(
			assertHostScheduleAccess(ctx, "server", "server-1", "org-2"),
		).resolves.toBeUndefined();
	});
});

describe("updateScheduleSchema strips ownership/identity fields", () => {
	const validPayload = {
		scheduleId: "sched-1",
		name: "nightly backup",
		command: "echo hello",
		cronExpression: "* * * * *",
		enabled: true,
		shellType: "bash" as const,
		script: "echo hello",
		description: "d",
		timezone: "UTC",
		serviceName: null,
		applicationId: null,
		composeId: null,
	};

	const strippedKeys = [
		"organizationId",
		"scheduleType",
		"serverId",
		"appName",
		"createdAt",
	] as const;

	for (const key of strippedKeys) {
		it(`strips ${key} from a crafted update payload`, () => {
			const parsed = updateScheduleSchema.safeParse({
				...validPayload,
				[key]: key === "scheduleType" ? "server" : "attacker-value",
			});
			expect(parsed.success).toBe(true);
			if (parsed.success) {
				expect(parsed.data).not.toHaveProperty(key);
			}
		});
	}

	it("keeps the legitimately mutable fields", () => {
		const parsed = updateScheduleSchema.safeParse(validPayload);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.scheduleId).toBe("sched-1");
			expect(parsed.data.name).toBe("nightly backup");
			expect(parsed.data.command).toBe("echo hello");
			expect(parsed.data.cronExpression).toBe("* * * * *");
			expect(parsed.data.enabled).toBe(true);
			expect(parsed.data.script).toBe("echo hello");
		}
	});

	it("does not require organizationId/scheduleType/serverId/appName/createdAt", () => {
		const minimal = {
			scheduleId: "sched-2",
			name: "n",
			command: "c",
			cronExpression: "0 * * * *",
		};
		const parsed = updateScheduleSchema.safeParse(minimal);
		expect(parsed.success).toBe(true);
	});
});
