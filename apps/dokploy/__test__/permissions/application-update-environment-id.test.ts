import { beforeEach, describe, expect, it, vi } from "vitest";

// The `application.update` mutation previously accepted `environmentId` via the
// `apiUpdateApplication` schema (derived from createSchema.partial()) and passed
// it straight through to updateApplication -> db.update(applications).set(...).
// That was a second cross-org re-parenting path with no target-env authorization.
// The fix omits `environmentId` from apiUpdateApplication so the field can no longer
// be set through update — environment changes must go through the guarded `move`.

const mockDb = vi.hoisted(() => {
	const returning = vi.fn(() =>
		Promise.resolve([{ applicationId: "app-1", appName: "app-1" }]),
	);
	const set = vi.fn((_data: Record<string, unknown>) => ({
		where: () => ({ returning }),
	}));
	const update = vi.fn(() => ({ set }));
	return {
		update,
		_set: set,
		_ret: returning,
		query: {
			member: { findFirst: vi.fn() },
			organizationRole: { findMany: vi.fn(() => Promise.resolve([])) },
		},
	};
});
vi.mock("@dokploy/server/db", () => ({ db: mockDb }));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@dokploy/server/services/proprietary/audit-log", () => ({
	createAuditLog: vi.fn(() => Promise.resolve()),
}));

vi.mock("@dokploy/server/services/server", () => ({
	getAccessibleServerIds: vi.fn(() => Promise.resolve(new Set())),
}));

import { applicationRouter } from "@/server/api/routers/application";
import { apiUpdateApplication } from "@/server/db/schema";

const ORG_A = "org-a";

const ctx = (): any => ({
	user: {
		id: "user-1",
		email: "owner@example.com",
		role: "owner" as const,
		ownerId: "owner-1",
	},
	session: { activeOrganizationId: ORG_A },
});

const memberRow = () => ({
	id: "member-1",
	role: "owner",
	userId: "user-1",
	organizationId: ORG_A,
	accessedServices: ["app-1"],
	accessedProjects: [],
	accessedEnvironments: [],
	canCreateServices: true,
	canCreateProjects: true,
	canCreateEnvironments: true,
	canDeleteServices: true,
	canDeleteProjects: true,
	canDeleteEnvironments: true,
	canAccessToTraefikFiles: true,
	canAccessToDocker: true,
	canAccessToAPI: true,
	canAccessToSSHKeys: true,
	canAccessToGitProviders: true,
	user: { id: "user-1", email: "owner@example.com" },
});

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.query.member.findFirst.mockResolvedValue(memberRow());
	mockDb.query.organizationRole.findMany.mockResolvedValue([]);
	mockDb._ret.mockResolvedValue([{ applicationId: "app-1", appName: "app-1" }]);
});

describe("apiUpdateApplication schema (environmentId omitted)", () => {
	it("does not expose environmentId as a parsed key", () => {
		const parsed = apiUpdateApplication.parse({
			applicationId: "app-1",
			environmentId: "foreign-env",
			autoDeploy: true,
		});
		expect(parsed).not.toHaveProperty("environmentId");
		expect(parsed).toHaveProperty("applicationId", "app-1");
		expect(parsed).toHaveProperty("autoDeploy", true);
	});

	it("silently drops environmentId supplied as an unknown key", () => {
		const parsed = apiUpdateApplication.parse({
			applicationId: "app-1",
			environmentId: "foreign-env",
		});
		expect(Object.keys(parsed)).not.toContain("environmentId");
	});
});

describe("application.update does not re-parent via environmentId", () => {
	it("ignores environmentId in the mutation payload and never writes it to the db", async () => {
		const caller = applicationRouter.createCaller(ctx());

		// A raw client could still send `environmentId` over the wire; zod now strips
		// it (it's omitted from apiUpdateApplication). Cast to simulate that payload.
		await caller.update({
			applicationId: "app-1",
			environmentId: "foreign-env",
			autoDeploy: true,
		} as any);

		expect(mockDb._set).toHaveBeenCalledOnce();
		const setData = mockDb._set.mock.calls[0]![0];
		expect(setData).not.toHaveProperty("environmentId");
		// Sanity: the legitimate field still flows through.
		expect(setData).toHaveProperty("autoDeploy", true);
	});
});
