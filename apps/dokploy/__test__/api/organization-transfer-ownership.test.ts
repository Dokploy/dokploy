import { db } from "@dokploy/server/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { organizationRouter } from "@/server/api/routers/organization";
import { member, organization } from "@/server/db/schema";

type CallerCtx = {
	session: { id: string; userId: string; activeOrganizationId: string } | null;
	user: { id: string; email: string; role: string } | null;
	db: typeof db;
	req: unknown;
	res: unknown;
};

const createCtx = (overrides: Partial<CallerCtx> = {}): CallerCtx => ({
	session: {
		id: "session-1",
		userId: "owner-user",
		activeOrganizationId: "org-1",
	},
	user: { id: "owner-user", email: "owner@example.com", role: "owner" },
	db,
	req: {},
	res: {},
	...overrides,
});

const createCaller = (ctx: CallerCtx) =>
	organizationRouter.createCaller(ctx as never);

const orgFixture: any = {
	id: "org-1",
	name: "Acme",
	ownerId: "owner-user",
	slug: "acme",
	createdAt: new Date(),
};

const ownerMemberFixture: any = {
	id: "m-owner",
	organizationId: "org-1",
	userId: "owner-user",
	role: "owner",
	createdAt: new Date(),
};

const targetFixture: any = {
	id: "m-target",
	organizationId: "org-1",
	userId: "user-2",
	role: "admin",
	createdAt: new Date(),
	user: { id: "user-2", email: "target@example.com" },
};

const findFirstMock = vi.mocked(db.query.member.findFirst);

let transactionCalls: unknown[][] = [];

const createTx = () => {
	const updateMock = vi.fn((_table: unknown) => ({
		set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
	}));
	return { tx: { update: updateMock, query: db.query }, updateMock };
};

beforeEach(() => {
	findFirstMock.mockReset();
	transactionCalls = [];
	(db as unknown as { transaction: unknown }).transaction = vi.fn(
		async (cb: (tx: unknown) => Promise<unknown>) => {
			const { tx, updateMock } = createTx();
			const result = await cb(tx);
			transactionCalls.push(updateMock.mock.calls.map((call) => call[0]));
			return result;
		},
	);
});

describe("organization.transferOwnership input validation", () => {
	it("rejects a missing memberId", async () => {
		findFirstMock.mockResolvedValueOnce(ownerMemberFixture);
		const caller = createCaller(createCtx());
		await expect(
			// @ts-expect-error testing invalid input
			caller.transferOwnership({}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("rejects an empty memberId", async () => {
		findFirstMock.mockResolvedValueOnce(ownerMemberFixture);
		const caller = createCaller(createCtx());
		await expect(
			caller.transferOwnership({ memberId: "" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

describe("organization.transferOwnership authorization", () => {
	it("rejects unauthenticated calls", async () => {
		const caller = createCaller(createCtx({ session: null, user: null }));
		await expect(
			caller.transferOwnership({ memberId: "m-target" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects callers that are not the organization owner", async () => {
		findFirstMock
			.mockResolvedValueOnce({ ...ownerMemberFixture, role: "admin" })
			.mockResolvedValueOnce({ ...orgFixture, ownerId: "someone-else" })
			.mockResolvedValueOnce({ ...ownerMemberFixture, role: "admin" });

		const caller = createCaller(
			createCtx({
				user: { id: "admin-user", email: "admin@example.com", role: "admin" },
			}),
		);

		await expect(
			caller.transferOwnership({ memberId: "m-target" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects when the organization does not exist", async () => {
		findFirstMock
			.mockResolvedValueOnce(ownerMemberFixture)
			.mockResolvedValueOnce(undefined);

		const caller = createCaller(createCtx());

		await expect(
			caller.transferOwnership({ memberId: "m-target" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("organization.transferOwnership target validation", () => {
	it("rejects when the target member does not exist", async () => {
		findFirstMock
			.mockResolvedValueOnce(ownerMemberFixture)
			.mockResolvedValueOnce(orgFixture)
			.mockResolvedValueOnce(ownerMemberFixture)
			.mockResolvedValueOnce(undefined);

		const caller = createCaller(createCtx());

		await expect(
			caller.transferOwnership({ memberId: "missing" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("rejects a target from another organization", async () => {
		findFirstMock
			.mockResolvedValueOnce(ownerMemberFixture)
			.mockResolvedValueOnce(orgFixture)
			.mockResolvedValueOnce(ownerMemberFixture)
			.mockResolvedValueOnce({ ...targetFixture, organizationId: "org-2" });

		const caller = createCaller(createCtx());

		await expect(
			caller.transferOwnership({ memberId: "m-target" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects transferring ownership to the caller", async () => {
		findFirstMock
			.mockResolvedValueOnce(ownerMemberFixture)
			.mockResolvedValueOnce(orgFixture)
			.mockResolvedValueOnce(ownerMemberFixture)
			.mockResolvedValueOnce({ ...targetFixture, userId: "owner-user" });

		const caller = createCaller(createCtx());

		await expect(
			caller.transferOwnership({ memberId: "m-target" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects when the target is already the owner", async () => {
		findFirstMock
			.mockResolvedValueOnce(ownerMemberFixture)
			.mockResolvedValueOnce(orgFixture)
			.mockResolvedValueOnce(ownerMemberFixture)
			.mockResolvedValueOnce({ ...targetFixture, role: "owner" });

		const caller = createCaller(createCtx());

		await expect(
			caller.transferOwnership({ memberId: "m-target" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});
});

describe("organization.transferOwnership success path", () => {
	it("swaps roles and organization owner in a single transaction", async () => {
		findFirstMock
			.mockResolvedValueOnce(ownerMemberFixture)
			.mockResolvedValueOnce(orgFixture)
			.mockResolvedValueOnce(ownerMemberFixture)
			.mockResolvedValueOnce(targetFixture);

		const caller = createCaller(createCtx());
		const result = await caller.transferOwnership({
			memberId: "m-target",
		});

		expect(result).toBe(true);

		const transactionMock = vi.mocked(
			(db as unknown as { transaction: (cb: unknown) => unknown }).transaction,
		);
		expect(transactionMock).toHaveBeenCalledTimes(1);
		expect(transactionCalls).toHaveLength(1);
		expect(transactionCalls[0]).toEqual([member, member, organization]);
	});
});
