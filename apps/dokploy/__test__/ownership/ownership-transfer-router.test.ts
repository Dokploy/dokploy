import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindCredentialAccount = vi.hoisted(() => vi.fn());
const mockCreateOwnershipTransfer = vi.hoisted(() => vi.fn());
const mockIsInstanceOwner = vi.hoisted(() => vi.fn());
const mockFindTransferRecipient = vi.hoisted(() => vi.fn());
const mockSearchTransferRecipients = vi.hoisted(() => vi.fn());
const noop = vi.fn();

vi.mock("@dokploy/server", () => ({
	acceptOwnershipTransfer: noop,
	cancelOwnershipTransfer: noop,
	createOwnershipTransfer: mockCreateOwnershipTransfer,
	declineOwnershipTransfer: noop,
	findCredentialAccount: mockFindCredentialAccount,
	findIncomingTransfers: noop,
	findOwnedOrganizations: noop,
	findOwnershipTransferById: noop,
	findPendingOutgoingTransfer: noop,
	findTransferRecipient: mockFindTransferRecipient,
	searchTransferRecipients: mockSearchTransferRecipients,
	hasValidLicense: vi.fn(async () => false),
	IS_CLOUD: false,
	isInstanceOwner: mockIsInstanceOwner,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const { ownershipTransferRouter } = await import(
	"@/server/api/routers/ownership-transfer"
);

const caller = ownershipTransferRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "owner-1", email: "owner@example.com", role: "owner" },
} as Parameters<typeof ownershipTransferRouter.createCaller>[0]);

const passwordHash = bcrypt.hashSync("correct-password", 4);

beforeEach(() => {
	mockFindCredentialAccount.mockReset();
	mockCreateOwnershipTransfer.mockReset();
	mockIsInstanceOwner.mockReset();
	mockIsInstanceOwner.mockResolvedValue(true);
	mockFindCredentialAccount.mockResolvedValue({
		id: "account-1",
		password: passwordHash,
	});
	mockCreateOwnershipTransfer.mockResolvedValue({ id: "transfer-1" });
	mockFindTransferRecipient.mockReset();
	mockSearchTransferRecipients.mockReset();
});

describe("ownershipTransfer.create password confirmation", () => {
	it("rejects a wrong password without creating a transfer", async () => {
		await expect(
			caller.create({ email: "new@example.com", password: "wrong-password" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "The password is incorrect",
		});
		expect(mockCreateOwnershipTransfer).not.toHaveBeenCalled();
	});

	it("rejects an account that has no password", async () => {
		mockFindCredentialAccount.mockResolvedValue(undefined);

		await expect(
			caller.create({ email: "new@example.com", password: "anything" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringMatching(/has no password/),
		});
		expect(mockCreateOwnershipTransfer).not.toHaveBeenCalled();
	});

	it("rejects an empty password before checking it", async () => {
		await expect(
			caller.create({ email: "new@example.com", password: "" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockFindCredentialAccount).not.toHaveBeenCalled();
		expect(mockCreateOwnershipTransfer).not.toHaveBeenCalled();
	});

	it("rejects a caller who is not the instance owner before checking the password", async () => {
		mockIsInstanceOwner.mockResolvedValue(false);

		await expect(
			caller.create({ email: "new@example.com", password: "correct-password" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockFindCredentialAccount).not.toHaveBeenCalled();
	});

	it("creates the transfer when the password is correct", async () => {
		await expect(
			caller.create({ email: "new@example.com", password: "correct-password" }),
		).resolves.toEqual({ id: "transfer-1" });
		expect(mockCreateOwnershipTransfer).toHaveBeenCalledWith(
			"owner-1",
			"new@example.com",
		);
	});
});

describe("ownershipTransfer.checkRecipient", () => {
	it("returns the recipient so the password prompt can name them", async () => {
		const recipient = {
			id: "user-2",
			email: "new@example.com",
			firstName: "New",
			lastName: "Owner",
		};
		mockFindTransferRecipient.mockResolvedValue(recipient);

		await expect(
			caller.checkRecipient({ email: "new@example.com" }),
		).resolves.toEqual(recipient);
		expect(mockFindTransferRecipient).toHaveBeenCalledWith(
			"owner-1",
			"new@example.com",
		);
	});

	it("passes through why a user can't receive ownership", async () => {
		mockFindTransferRecipient.mockRejectedValue(
			new TRPCError({
				code: "NOT_FOUND",
				message:
					"No user found with that email. Invite them to an organization first.",
			}),
		);

		await expect(
			caller.checkRecipient({ email: "nobody@example.com" }),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: expect.stringMatching(/No user found/),
		});
	});

	it("rejects an invalid email without looking it up", async () => {
		await expect(
			caller.checkRecipient({ email: "not-an-email" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockFindTransferRecipient).not.toHaveBeenCalled();
	});

	it("is only available to the instance owner", async () => {
		mockIsInstanceOwner.mockResolvedValue(false);

		await expect(
			caller.checkRecipient({ email: "new@example.com" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockFindTransferRecipient).not.toHaveBeenCalled();
	});
});

describe("ownershipTransfer.searchRecipients", () => {
	it("returns matching users for the instance owner", async () => {
		const result = {
			users: [
				{
					id: "user-2",
					email: "alice@example.com",
					firstName: "Alice",
					lastName: "",
				},
			],
			hasMore: false,
		};
		mockSearchTransferRecipients.mockResolvedValue(result);

		await expect(caller.searchRecipients({ query: "a" })).resolves.toEqual(
			result,
		);
		expect(mockSearchTransferRecipients).toHaveBeenCalledWith("owner-1", "a");
	});

	it("is only available to the instance owner", async () => {
		mockIsInstanceOwner.mockResolvedValue(false);

		await expect(caller.searchRecipients({ query: "a" })).rejects.toMatchObject(
			{ code: "FORBIDDEN" },
		);
		expect(mockSearchTransferRecipients).not.toHaveBeenCalled();
	});

	it("rejects an overly long query", async () => {
		await expect(
			caller.searchRecipients({ query: "a".repeat(101) }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockSearchTransferRecipients).not.toHaveBeenCalled();
	});
});
