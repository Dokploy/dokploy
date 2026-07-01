import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	dbUpdate: vi.fn(),
	updateReturning: vi.fn(),
	updateSet: vi.fn(),
	updateWhere: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		update: mocks.dbUpdate,
	},
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	auth: {},
}));

const { updateUser } = await import("@dokploy/server/services/user");

describe("updateUser email verification boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.dbUpdate.mockReturnValue({
			set: mocks.updateSet,
		});
		mocks.updateSet.mockReturnValue({
			where: mocks.updateWhere,
		});
		mocks.updateWhere.mockReturnValue({
			returning: mocks.updateReturning,
		});
		mocks.updateReturning.mockResolvedValue([{ id: "user-1" }]);
	});

	it("resets emailVerified when the profile email changes", async () => {
		await updateUser("user-1", {
			email: "new@example.com",
			firstName: "Ada",
		});

		expect(mocks.updateSet).toHaveBeenCalledWith({
			email: "new@example.com",
			firstName: "Ada",
			emailVerified: false,
		});
	});

	it("does not change emailVerified for profile updates without email", async () => {
		await updateUser("user-1", {
			firstName: "Ada",
			lastName: "Lovelace",
		});

		expect(mocks.updateSet).toHaveBeenCalledWith({
			firstName: "Ada",
			lastName: "Lovelace",
		});
	});
});
