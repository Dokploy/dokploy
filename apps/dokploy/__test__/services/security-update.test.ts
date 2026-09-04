import { db } from "@dokploy/server/db";
import { updateSecurityById } from "@dokploy/server/services/security";
import { beforeEach, describe, expect, it, vi } from "vitest";

const OLD_ROW = {
	securityId: "sec-1",
	username: "alice",
	password: "oldpass",
	applicationId: "app-1",
	createdAt: "2024-01-01",
};

const NEW_ROW = {
	securityId: "sec-1",
	username: "bob",
	password: "newpass",
	applicationId: "app-1",
	createdAt: "2024-01-01",
};

const APP = {
	applicationId: "app-1",
	appName: "myapp",
	serverId: null,
};

const mocks = vi.hoisted(() => {
	const returningMock = vi.fn();
	const chain = {
		set: vi.fn(),
		where: vi.fn(),
		returning: returningMock,
	};
	chain.set.mockReturnValue(chain);
	chain.where.mockReturnValue(chain);
	const tx = {
		update: vi.fn(),
	};
	tx.update.mockReturnValue(chain);
	return {
		returningMock,
		chain,
		tx,
		transaction: vi.fn(),
		findFirst: vi.fn(),
		findApplicationById: vi.fn(),
		createSecurityMiddleware: vi.fn(),
		removeSecurityMiddleware: vi.fn(),
		replaceSecurityMiddlewareUser: vi.fn(),
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: {
		transaction: mocks.transaction,
		query: {
			security: {
				findFirst: mocks.findFirst,
			},
		},
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
}));

vi.mock("@dokploy/server/utils/traefik/security", () => ({
	createSecurityMiddleware: mocks.createSecurityMiddleware,
	removeSecurityMiddleware: mocks.removeSecurityMiddleware,
	replaceSecurityMiddlewareUser: mocks.replaceSecurityMiddlewareUser,
}));

describe("updateSecurityById", () => {
	beforeEach(() => {
		mocks.findFirst.mockReset();
		mocks.findApplicationById.mockReset();
		mocks.returningMock.mockReset();
		mocks.replaceSecurityMiddlewareUser.mockReset();
		mocks.removeSecurityMiddleware.mockReset();
		mocks.createSecurityMiddleware.mockReset();
		mocks.transaction.mockReset();
		mocks.tx.update.mockReset();
		mocks.chain.set.mockReset();
		mocks.chain.where.mockReset();

		mocks.chain.set.mockReturnValue(mocks.chain);
		mocks.chain.where.mockReturnValue(mocks.chain);
		mocks.tx.update.mockReturnValue(mocks.chain);
		mocks.transaction.mockImplementation(
			async (cb: (tx: typeof mocks.tx) => unknown) => cb(mocks.tx),
		);

		mocks.findFirst.mockResolvedValue(OLD_ROW);
		mocks.findApplicationById.mockResolvedValue(APP);
		mocks.returningMock.mockResolvedValue([NEW_ROW]);
		mocks.replaceSecurityMiddlewareUser.mockResolvedValue(undefined);
		mocks.removeSecurityMiddleware.mockResolvedValue(undefined);
		mocks.createSecurityMiddleware.mockResolvedValue(undefined);
	});

	it("performs a single middleware write after the DB transaction commits with old + new security", async () => {
		await updateSecurityById("sec-1", { username: "bob", password: "newpass" });

		expect(mocks.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.findFirst).toHaveBeenCalledTimes(1);
		expect(mocks.findApplicationById).toHaveBeenCalledWith("app-1");
		expect(mocks.tx.update).toHaveBeenCalledTimes(1);

		expect(mocks.replaceSecurityMiddlewareUser).toHaveBeenCalledTimes(1);
		expect(mocks.replaceSecurityMiddlewareUser).toHaveBeenCalledWith(
			APP,
			OLD_ROW,
			NEW_ROW,
		);
		expect(mocks.removeSecurityMiddleware).not.toHaveBeenCalled();
		expect(mocks.createSecurityMiddleware).not.toHaveBeenCalled();
	});

	it("does NOT touch the middleware file when tx.update throws (unique violation rollback)", async () => {
		mocks.returningMock.mockRejectedValue(
			new Error(
				'duplicate key value violates unique constraint "security_username_applicationId_unique"',
			),
		);

		await expect(
			updateSecurityById("sec-1", { username: "bob" }),
		).rejects.toThrow();

		expect(mocks.replaceSecurityMiddlewareUser).not.toHaveBeenCalled();
		expect(mocks.removeSecurityMiddleware).not.toHaveBeenCalled();
		expect(mocks.createSecurityMiddleware).not.toHaveBeenCalled();
		expect(mocks.tx.update).toHaveBeenCalledTimes(1);
	});

	it("rethrows a TRPCError BAD_REQUEST wrapping the underlying error on tx.update failure", async () => {
		mocks.returningMock.mockRejectedValue(
			new Error(
				'duplicate key value violates unique constraint "security_username_applicationId_unique"',
			),
		);

		await expect(
			updateSecurityById("sec-1", { username: "bob" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("does NOT touch the middleware file when the security row is missing", async () => {
		mocks.findFirst.mockResolvedValue(undefined);

		await expect(updateSecurityById("missing", {})).rejects.toThrow();
		expect(mocks.replaceSecurityMiddlewareUser).not.toHaveBeenCalled();
		expect(mocks.removeSecurityMiddleware).not.toHaveBeenCalled();
		expect(mocks.createSecurityMiddleware).not.toHaveBeenCalled();
		expect(mocks.tx.update).not.toHaveBeenCalled();
	});

	it("commits the DB row even if the post-commit middleware write fails (stale-credential, not lockout)", async () => {
		mocks.returningMock.mockResolvedValue([NEW_ROW]);
		mocks.replaceSecurityMiddlewareUser.mockRejectedValue(
			new Error("ssh failure"),
		);

		await expect(
			updateSecurityById("sec-1", { username: "bob", password: "newpass" }),
		).rejects.toThrow();

		expect(mocks.tx.update).toHaveBeenCalledTimes(1);
		expect(mocks.replaceSecurityMiddlewareUser).toHaveBeenCalledTimes(1);
		expect(mocks.removeSecurityMiddleware).not.toHaveBeenCalled();
		expect(mocks.createSecurityMiddleware).not.toHaveBeenCalled();
	});

	it("runs the middleware write only after the transaction callback returns (post-commit)", async () => {
		let txReturned = false;
		mocks.transaction.mockImplementation(
			async (cb: (tx: typeof mocks.tx) => unknown) => {
				await cb(mocks.tx);
				txReturned = true;
				return { oldSecurity: OLD_ROW, newSecurity: NEW_ROW, application: APP };
			},
		);
		mocks.replaceSecurityMiddlewareUser.mockImplementation(async () => {
			expect(txReturned).toBe(true);
		});

		await updateSecurityById("sec-1", { username: "bob" });

		expect(mocks.replaceSecurityMiddlewareUser).toHaveBeenCalledTimes(1);
	});
});

describe("updateSecurityById db mock sanity", () => {
	it("exposes the mocked db used by the service under test", () => {
		expect((db as unknown as { transaction: unknown }).transaction).toBe(
			mocks.transaction,
		);
	});
});
