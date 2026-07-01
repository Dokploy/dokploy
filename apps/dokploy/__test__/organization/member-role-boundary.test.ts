import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	assertRoleAssignmentAllowed: vi.fn(),
	checkPermission: vi.fn(),
	insertInvitationReturning: vi.fn(),
	insertInvitationValues: vi.fn(),
	invitationFindFirst: vi.fn(),
	memberFindFirst: vi.fn(),
	organizationFindFirst: vi.fn(),
	organizationRoleFindFirst: vi.fn(),
	sendInvitationEmail: vi.fn(),
	updateMemberSet: vi.fn(),
	updateMemberWhere: vi.fn(),
	userFindFirst: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	sendInvitationEmail: mocks.sendInvitationEmail,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			user: {
				findFirst: mocks.userFindFirst,
			},
			member: {
				findFirst: mocks.memberFindFirst,
			},
			invitation: {
				findFirst: mocks.invitationFindFirst,
			},
			organizationRole: {
				findFirst: mocks.organizationRoleFindFirst,
			},
			organization: {
				findFirst: mocks.organizationFindFirst,
			},
		},
		insert: vi.fn(() => ({
			values: mocks.insertInvitationValues.mockReturnValue({
				returning: mocks.insertInvitationReturning,
			}),
		})),
		update: vi.fn(() => ({
			set: mocks.updateMemberSet.mockReturnValue({
				where: mocks.updateMemberWhere,
			}),
		})),
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	assertRoleAssignmentAllowed: mocks.assertRoleAssignmentAllowed,
	checkPermission: mocks.checkPermission,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

const { organizationRouter } = await import(
	"../../server/api/routers/organization"
);

const createCaller = (role: string) =>
	organizationRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "caller-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "caller-1",
			role,
		},
	} as never);

describe("organization member static role boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.assertRoleAssignmentAllowed.mockResolvedValue(undefined);
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.userFindFirst.mockResolvedValue(undefined);
		mocks.invitationFindFirst.mockResolvedValue(undefined);
		mocks.organizationRoleFindFirst.mockResolvedValue(undefined);
		mocks.organizationFindFirst.mockResolvedValue({ name: "Org" });
		mocks.insertInvitationReturning.mockResolvedValue([
			{
				id: "invitation-1",
				email: "admin@example.com",
				role: "admin",
			},
		]);
		mocks.updateMemberWhere.mockResolvedValue(undefined);
	});

	it("rejects delegated member managers inviting static admins", async () => {
		await expect(
			createCaller("member-manager").inviteMember({
				email: "admin@example.com",
				role: "admin",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(mocks.insertInvitationValues).not.toHaveBeenCalled();
	});

	it("allows owners to invite static admins", async () => {
		await expect(
			createCaller("owner").inviteMember({
				email: "admin@example.com",
				role: "admin",
			}),
		).resolves.toMatchObject({
			id: "invitation-1",
			role: "admin",
		});

		expect(mocks.insertInvitationValues).toHaveBeenCalledWith(
			expect.objectContaining({
				role: "admin",
			}),
		);
	});

	it("checks delegation policy before inviting a custom role", async () => {
		await expect(
			createCaller("member-manager").inviteMember({
				email: "custom@example.com",
				role: "power-role",
			}),
		).resolves.toMatchObject({
			id: "invitation-1",
		});

		expect(mocks.assertRoleAssignmentAllowed).toHaveBeenCalledWith(
			expect.anything(),
			"power-role",
		);
		expect(mocks.insertInvitationValues).toHaveBeenCalledWith(
			expect.objectContaining({
				role: "power-role",
			}),
		);
	});

	it("rejects custom role invitations when delegation policy fails", async () => {
		mocks.assertRoleAssignmentAllowed.mockRejectedValueOnce(
			new TRPCError({
				code: "FORBIDDEN",
				message: "Cannot assign role",
			}),
		);

		await expect(
			createCaller("member-manager").inviteMember({
				email: "custom@example.com",
				role: "power-role",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(mocks.insertInvitationValues).not.toHaveBeenCalled();
	});

	it("rejects delegated member managers promoting members to static admin", async () => {
		mocks.memberFindFirst.mockResolvedValue({
			id: "member-2",
			organizationId: "org-1",
			role: "member",
			userId: "user-2",
			user: {
				email: "member@example.com",
			},
		});

		await expect(
			createCaller("member-manager").updateMemberRole({
				memberId: "member-2",
				role: "admin",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(mocks.updateMemberSet).not.toHaveBeenCalled();
	});

	it("checks delegation policy before changing a member to a custom role", async () => {
		mocks.memberFindFirst.mockResolvedValue({
			id: "member-2",
			organizationId: "org-1",
			role: "member",
			userId: "user-2",
			user: {
				email: "member@example.com",
			},
		});

		await expect(
			createCaller("member-manager").updateMemberRole({
				memberId: "member-2",
				role: "power-role",
			}),
		).resolves.toBe(true);

		expect(mocks.assertRoleAssignmentAllowed).toHaveBeenCalledWith(
			expect.anything(),
			"power-role",
		);
		expect(mocks.updateMemberSet).toHaveBeenCalledWith({ role: "power-role" });
	});
});
