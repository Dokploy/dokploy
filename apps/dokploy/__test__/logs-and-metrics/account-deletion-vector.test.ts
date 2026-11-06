import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findOwnedOrganizations: vi.fn(),
	transaction: vi.fn(),
	removeVectorAgents: vi.fn(),
	calls: [] as string[],
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { organization: { findMany: mocks.findOwnedOrganizations } },
		transaction: mocks.transaction,
	},
}));
vi.mock("@dokploy/server/services/organization", () => ({
	removeVectorAgents: mocks.removeVectorAgents,
}));

const { deleteUserAccountData } = await import(
	"@dokploy/server/services/account-deletion"
);

beforeEach(() => {
	mocks.calls.length = 0;
	mocks.findOwnedOrganizations.mockReset();
	mocks.removeVectorAgents
		.mockReset()
		.mockImplementation(async (id: string) => mocks.calls.push(`agents:${id}`));
	mocks.transaction.mockReset().mockImplementation(async () => {
		mocks.calls.push("delete");
		return { email: "a@b.c", organizationsDeleted: 2 };
	});
});

describe("deleteUserAccountData", () => {
	it("removes the Vector agents of every owned organization before deleting the user", async () => {
		mocks.findOwnedOrganizations.mockResolvedValue([
			{ id: "org-a" },
			{ id: "org-b" },
		]);

		await deleteUserAccountData("user-1");

		expect(mocks.calls).toEqual(["agents:org-a", "agents:org-b", "delete"]);
	});

	it("deletes the user without touching agents when it owns no organization", async () => {
		mocks.findOwnedOrganizations.mockResolvedValue([]);

		await deleteUserAccountData("user-1");

		expect(mocks.removeVectorAgents).not.toHaveBeenCalled();
		expect(mocks.calls).toEqual(["delete"]);
	});
});
