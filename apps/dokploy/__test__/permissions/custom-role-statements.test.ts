import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkPermissionMock } = vi.hoisted(() => ({
	checkPermissionMock: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: { findMany: vi.fn() },
			organizationRole: { findMany: vi.fn(), findFirst: vi.fn() },
		},
		select: vi.fn(),
	},
}));

vi.mock("@dokploy/server/index", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: checkPermissionMock,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(),
}));

const { customRoleRouter } = await import(
	"@/server/api/routers/proprietary/custom-role"
);

const createCaller = () =>
	customRoleRouter.createCaller({
		session: {
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
		},
		req: {},
		res: {},
	} as never);

describe("customRole.getStatements", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		checkPermissionMock.mockResolvedValue(undefined);
	});

	it("requires member update permission before returning statements", async () => {
		const statements = await createCaller().getStatements();

		expect(checkPermissionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				session: expect.objectContaining({ activeOrganizationId: "org-1" }),
				user: expect.objectContaining({ id: "user-1" }),
			}),
			{ member: ["update"] },
		);
		expect(statements.member).toContain("update");
	});

	it("does not return statements when permission check fails", async () => {
		checkPermissionMock.mockRejectedValueOnce(
			new TRPCError({
				code: "UNAUTHORIZED",
				message: "Permission denied",
			}),
		);

		await expect(createCaller().getStatements()).rejects.toThrow(
			"Permission denied",
		);
	});
});
