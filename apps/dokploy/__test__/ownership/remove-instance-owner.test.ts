import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsInstanceOwner = vi.hoisted(() => vi.fn());
const mockRemoveUserById = vi.hoisted(() => vi.fn());
const noop = vi.fn();

vi.mock("@dokploy/server", () => ({
	ACCOUNT_DELETION_CODE_TTL_MINUTES: 10,
	consumeAccountDeletionCode: noop,
	createAccountDeletionCode: noop,
	createApiKey: noop,
	createOrganizationUserWithCredentials: noop,
	findCredentialAccount: noop,
	findNotificationById: noop,
	findOrganizationById: noop,
	findPasskeysByUserId: noop,
	findUserById: noop,
	getDokployUrl: noop,
	getUserByToken: noop,
	getWebServerSettings: noop,
	hasValidLicense: vi.fn(async () => false),
	IS_CLOUD: false,
	isInstanceOwner: mockIsInstanceOwner,
	removeUserById: mockRemoveUserById,
	renderInvitationEmail: noop,
	sendAccountDeletionCodeEmail: noop,
	sendEmailNotification: noop,
	sendResendNotification: noop,
	updateUser: noop,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: vi.fn(async () => ({
					id: "member-1",
					userId: "instance-owner",
					organizationId: "admin-org",
					role: "member",
				})),
			},
		},
	},
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

vi.mock("@/server/utils/account-deletion", () => ({
	deleteAccount: vi.fn(),
}));

const { userRouter } = await import("@/server/api/routers/user");

const caller = userRouter.createCaller({
	session: { activeOrganizationId: "admin-org" },
	user: { id: "admin-1", email: "admin@example.com", role: "owner" },
} as Parameters<typeof userRouter.createCaller>[0]);

beforeEach(() => {
	mockIsInstanceOwner.mockReset();
	mockRemoveUserById.mockReset();
});

describe("user.remove", () => {
	it("refuses to delete the instance owner from an admin-created organization", async () => {
		mockIsInstanceOwner.mockResolvedValue(true);

		await expect(
			caller.remove({ userId: "instance-owner" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockRemoveUserById).not.toHaveBeenCalled();
	});

	it("still deletes a regular member", async () => {
		mockIsInstanceOwner.mockResolvedValue(false);

		await caller.remove({ userId: "instance-owner" });
		expect(mockRemoveUserById).toHaveBeenCalledWith("instance-owner");
	});
});
