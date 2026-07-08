import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	assertRoleAssignmentAllowed: vi.fn(),
	audit: vi.fn(),
	checkPermission: vi.fn(),
	createApiKey: vi.fn(),
	createOrganizationUserWithCredentials: vi.fn(),
	apiKeyFindFirst: vi.fn(),
	deleteApiKeyWhere: vi.fn(),
	findNotificationById: vi.fn(),
	findOrganizationById: vi.fn(),
	findUserById: vi.fn(),
	getDokployUrl: vi.fn(),
	getUserByToken: vi.fn(),
	getWebServerSettings: vi.fn(),
	invitationFindFirst: vi.fn(),
	memberFindFirst: vi.fn(),
	memberFindMany: vi.fn(),
	removeUserById: vi.fn(),
	renderInvitationEmail: vi.fn(),
	sendEmailNotification: vi.fn(),
	sendResendNotification: vi.fn(),
	updateUser: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	createApiKey: mocks.createApiKey,
	createOrganizationUserWithCredentials:
		mocks.createOrganizationUserWithCredentials,
	findNotificationById: mocks.findNotificationById,
	findOrganizationById: mocks.findOrganizationById,
	findUserById: mocks.findUserById,
	getDokployUrl: mocks.getDokployUrl,
	getUserByToken: mocks.getUserByToken,
	getWebServerSettings: mocks.getWebServerSettings,
	removeUserById: mocks.removeUserById,
	renderInvitationEmail: mocks.renderInvitationEmail,
	sendEmailNotification: mocks.sendEmailNotification,
	sendResendNotification: mocks.sendResendNotification,
	updateUser: mocks.updateUser,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: mocks.memberFindFirst,
				findMany: mocks.memberFindMany,
			},
			invitation: {
				findFirst: mocks.invitationFindFirst,
			},
			apikey: {
				findFirst: mocks.apiKeyFindFirst,
			},
		},
		delete: vi.fn(() => ({
			where: mocks.deleteApiKeyWhere,
		})),
	},
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	assertRoleAssignmentAllowed: mocks.assertRoleAssignmentAllowed,
	checkPermission: mocks.checkPermission,
	hasPermission: vi.fn(),
	resolvePermissions: vi.fn(),
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

const { userRouter } = await import("../../server/api/routers/user");

const createCaller = (role: "owner" | "admin" | "member" = "owner") =>
	userRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "actor-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "actor-1",
			email: "owner@example.com",
			role,
			ownerId: "actor-1",
			enableEnterpriseFeatures: false,
			isValidEnterpriseLicense: false,
		},
	} as never);

describe("user.remove membership boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.assertRoleAssignmentAllowed.mockResolvedValue(undefined);
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.memberFindFirst.mockResolvedValue({
			id: "member-active",
			userId: "target-1",
			organizationId: "org-1",
			role: "member",
			user: {
				email: "target@example.com",
			},
		});
		mocks.memberFindMany.mockResolvedValue([
			{ id: "member-active", organizationId: "org-1", userId: "target-1" },
		]);
		mocks.findNotificationById.mockResolvedValue({
			notificationId: "notification-1",
			organizationId: "org-1",
			email: {
				emailId: "email-1",
				toAddresses: [],
			},
			resend: null,
		});
		mocks.findOrganizationById.mockResolvedValue({ name: "Org One" });
		mocks.getDokployUrl.mockResolvedValue("https://dokploy.example.com");
		mocks.invitationFindFirst.mockResolvedValue({
			id: "invitation-1",
			email: "invitee@example.com",
			organizationId: "org-1",
		});
		mocks.removeUserById.mockResolvedValue(true);
		mocks.renderInvitationEmail.mockResolvedValue("<p>invite</p>");
		mocks.sendEmailNotification.mockResolvedValue(undefined);
		mocks.createApiKey.mockResolvedValue({ id: "api-key-1" });
		mocks.apiKeyFindFirst.mockResolvedValue({
			id: "api-key-1",
			name: "CI key",
			referenceId: "actor-1",
			metadata: JSON.stringify({ organizationId: "org-1" }),
		});
		mocks.deleteApiKeyWhere.mockResolvedValue(undefined);
	});

	it("rejects deleting a global user that still belongs to another organization", async () => {
		mocks.memberFindMany.mockResolvedValue([
			{ id: "member-active", organizationId: "org-1", userId: "target-1" },
			{ id: "member-other", organizationId: "org-2", userId: "target-1" },
		]);

		await expect(
			createCaller().remove({ userId: "target-1" }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});

		expect(mocks.removeUserById).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("allows authorized deletion when the target belongs only to the active organization", async () => {
		await expect(createCaller().remove({ userId: "target-1" })).resolves.toBe(
			true,
		);

		expect(mocks.removeUserById).toHaveBeenCalledWith("target-1");
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: "delete",
				resourceId: "target-1",
				resourceType: "user",
			}),
		);
	});

	it("rejects resending invitations through another organization's notification provider", async () => {
		mocks.findNotificationById.mockResolvedValue({
			notificationId: "notification-other",
			organizationId: "org-2",
			email: {
				emailId: "email-1",
				toAddresses: [],
			},
			resend: null,
		});

		await expect(
			createCaller().sendInvitation({
				invitationId: "invitation-1",
				notificationId: "notification-other",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.invitationFindFirst).not.toHaveBeenCalled();
		expect(mocks.sendEmailNotification).not.toHaveBeenCalled();
	});

	it("rejects resending invitations for tokens outside the active organization", async () => {
		mocks.invitationFindFirst.mockResolvedValue(undefined);

		await expect(
			createCaller().sendInvitation({
				invitationId: "invitation-other",
				notificationId: "notification-1",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });

		expect(mocks.sendEmailNotification).not.toHaveBeenCalled();
	});

	it("sends invitations only after notification and invitation match the active organization", async () => {
		await expect(
			createCaller().sendInvitation({
				invitationId: "invitation-1",
				notificationId: "notification-1",
			}),
		).resolves.toBe(
			"https://dokploy.example.com/invitation?token=invitation-1",
		);

		expect(mocks.invitationFindFirst).toHaveBeenCalled();
		expect(mocks.sendEmailNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				toAddresses: ["invitee@example.com"],
			}),
			expect.stringContaining("Org One"),
			"<p>invite</p>",
		);
	});

	it("requires api.read before creating API keys", async () => {
		await expect(
			createCaller().createApiKey({
				name: "CI key",
				metadata: {
					organizationId: "org-1",
				},
			}),
		).resolves.toEqual({ id: "api-key-1" });

		expect(mocks.checkPermission).toHaveBeenCalledWith(
			expect.objectContaining({
				session: expect.objectContaining({
					activeOrganizationId: "org-1",
				}),
			}),
			{ api: ["read"] },
		);
		expect(mocks.createApiKey).toHaveBeenCalled();
	});

	it("checks api.read against the API key target organization", async () => {
		mocks.memberFindFirst.mockResolvedValueOnce({
			id: "member-other",
			userId: "actor-1",
			organizationId: "org-2",
			role: "member",
		});
		mocks.checkPermission.mockImplementationOnce(async (permissionCtx) => {
			expect(permissionCtx.session.activeOrganizationId).toBe("org-2");
			throw new Error("Permission denied");
		});

		await expect(
			createCaller().createApiKey({
				name: "CI key",
				metadata: {
					organizationId: "org-2",
				},
			}),
		).rejects.toThrow("Permission denied");

		expect(mocks.createApiKey).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("does not create API keys when api.read is missing", async () => {
		mocks.checkPermission.mockRejectedValueOnce(new Error("Permission denied"));

		await expect(
			createCaller().createApiKey({
				name: "CI key",
				metadata: {
					organizationId: "org-1",
				},
			}),
		).rejects.toThrow("Permission denied");

		expect(mocks.createApiKey).not.toHaveBeenCalled();
	});

	it("requires api.read before deleting API keys", async () => {
		await expect(
			createCaller().deleteApiKey({ apiKeyId: "api-key-1" }),
		).resolves.toBe(true);

		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			api: ["read"],
		});
		expect(mocks.deleteApiKeyWhere).toHaveBeenCalled();
	});

	it("only returns API keys for the active organization", async () => {
		mocks.memberFindFirst.mockResolvedValue({
			id: "member-active",
			userId: "actor-1",
			organizationId: "org-1",
			role: "owner",
			user: {
				id: "actor-1",
				apiKeys: [
					{
						id: "api-key-org-1",
						name: "Org 1 key",
						metadata: JSON.stringify({ organizationId: "org-1" }),
					},
					{
						id: "api-key-org-2",
						name: "Org 2 key",
						metadata: JSON.stringify({ organizationId: "org-2" }),
					},
				],
			},
		});

		await expect(createCaller().get()).resolves.toMatchObject({
			user: {
				apiKeys: [
					expect.objectContaining({
						id: "api-key-org-1",
					}),
				],
			},
		});

		const result = await createCaller().get();
		expect(result?.user.apiKeys).toHaveLength(1);
		expect(result?.user.apiKeys[0]?.id).toBe("api-key-org-1");
	});

	it("rejects deleting a user's API key from another organization", async () => {
		mocks.apiKeyFindFirst.mockResolvedValue({
			id: "api-key-org-2",
			name: "Org 2 key",
			referenceId: "actor-1",
			metadata: JSON.stringify({ organizationId: "org-2" }),
		});

		await expect(
			createCaller().deleteApiKey({ apiKeyId: "api-key-org-2" }),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});

		expect(mocks.deleteApiKeyWhere).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("rejects self-host credential creation for static admin role", async () => {
		await expect(
			createCaller("owner").createUserWithCredentials({
				email: "new-admin@example.com",
				password: "password-123",
				role: "admin",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(mocks.createOrganizationUserWithCredentials).not.toHaveBeenCalled();
	});

	it("checks delegation policy before self-host credential creation with a custom role", async () => {
		mocks.createOrganizationUserWithCredentials.mockResolvedValue({
			userId: "new-user",
			email: "new-custom@example.com",
			role: "power-role",
		});

		await expect(
			createCaller("owner").createUserWithCredentials({
				email: "new-custom@example.com",
				password: "password-123",
				role: "power-role",
			}),
		).resolves.toMatchObject({ role: "power-role" });

		expect(mocks.assertRoleAssignmentAllowed).toHaveBeenCalledWith(
			expect.anything(),
			"power-role",
		);
		expect(mocks.createOrganizationUserWithCredentials).toHaveBeenCalledWith(
			expect.objectContaining({
				role: "power-role",
			}),
		);
	});
});
