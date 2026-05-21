import type { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let updateReturning: unknown[] = [];
const auditMock = vi.fn();

const updateChain = {
	set: vi.fn(() => updateChain),
	where: vi.fn(() => updateChain),
	returning: vi.fn(() => Promise.resolve(updateReturning)),
};

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			organizationRole: {
				findFirst: vi.fn(() => Promise.resolve(undefined)),
			},
		},
		update: vi.fn(() => updateChain),
	},
}));

vi.mock("@dokploy/server/index", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: auditMock,
}));

vi.mock("bcrypt", () => ({
	default: {
		compare: vi.fn(),
		hash: vi.fn(),
	},
	compare: vi.fn(),
	hash: vi.fn(),
}));

const { customRoleRouter } = await import(
	"@/server/api/routers/proprietary/custom-role"
);

const caller = customRoleRouter.createCaller({
	user: {
		id: "owner-1",
		email: "owner@example.com",
		emailVerified: true,
		name: "Owner",
		image: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		role: "owner",
		ownerId: "owner-1",
		enableEnterpriseFeatures: true,
		isValidEnterpriseLicense: true,
	},
	session: {
		id: "session-1",
		userId: "owner-1",
		activeOrganizationId: "org-1",
		expiresAt: new Date(Date.now() + 60_000),
		token: "session-token",
		createdAt: new Date(),
		updatedAt: new Date(),
		ipAddress: null,
		userAgent: null,
	},
	db: {} as never,
	req: {} as never,
	res: {} as never,
});

describe("custom role updates", () => {
	beforeEach(() => {
		updateReturning = [];
		auditMock.mockClear();
		updateChain.set.mockClear();
		updateChain.where.mockClear();
		updateChain.returning.mockClear();
	});

	it("throws NOT_FOUND when updating a missing custom role", async () => {
		await expect(
			caller.update({
				roleName: "support",
				permissions: { project: ["create"] },
			}),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: 'Role "support" not found',
		} satisfies Partial<TRPCError>);

		expect(auditMock).not.toHaveBeenCalled();
	});

	it("returns the updated role and audits when the role exists", async () => {
		const updatedRole = {
			id: "role-1",
			role: "support",
			permission: JSON.stringify({ project: ["create"] }),
		};
		updateReturning = [updatedRole];

		await expect(
			caller.update({
				roleName: "support",
				permissions: { project: ["create"] },
			}),
		).resolves.toEqual(updatedRole);

		expect(auditMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: "update",
				resourceType: "customRole",
				resourceName: "support",
			}),
		);
	});
});
