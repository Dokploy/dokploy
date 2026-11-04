import * as bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindCredentialAccount = vi.hoisted(() => vi.fn());
const mockCreateOwnershipTransfer = vi.hoisted(() => vi.fn());
const mockIsInstanceOwner = vi.hoisted(() => vi.fn());
const mockListTransferRecipients = vi.hoisted(() => vi.fn());
const noop = vi.fn();

vi.mock("@dokploy/server", () => ({
	acceptOwnershipTransfer: noop,
	cancelOwnershipTransfer: noop,
	createOwnershipTransfer: mockCreateOwnershipTransfer,
	declineOwnershipTransfer: noop,
	findCredentialAccount: mockFindCredentialAccount,
	findIncomingTransfer: noop,
	findOwnedOrganizations: noop,
	findPendingOutgoingTransfer: noop,
	hasValidLicense: vi.fn(async () => false),
	IS_CLOUD: false,
	isInstanceOwner: mockIsInstanceOwner,
	listTransferRecipients: mockListTransferRecipients,
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
	mockListTransferRecipients.mockReset();
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

describe("ownershipTransfer.recipients", () => {
	it("returns every user the instance owner can transfer to", async () => {
		const recipients = [
			{
				id: "user-2",
				email: "alice@example.com",
				firstName: "Alice",
				lastName: "",
			},
		];
		mockListTransferRecipients.mockResolvedValue(recipients);

		await expect(caller.recipients()).resolves.toEqual(recipients);
		expect(mockListTransferRecipients).toHaveBeenCalledWith("owner-1");
	});

	it("is only available to the instance owner", async () => {
		mockIsInstanceOwner.mockResolvedValue(false);

		await expect(caller.recipients()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mockListTransferRecipients).not.toHaveBeenCalled();
	});
});
