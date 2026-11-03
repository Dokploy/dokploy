import { beforeEach, describe, expect, it, vi } from "vitest";

type Write = { op: "update" | "insert"; table: unknown; values: unknown };

const writes: Write[] = [];
let ownedOrganizations = [
	{ id: "org-1", name: "One" },
	{ id: "org-2", name: "Two" },
];
// Organizations where the new owner already has a member row.
let newOwnerMemberOf = ["org-1"];

const previousOwnerFields = {
	enableEnterpriseFeatures: true,
	licenseKey: "license-123",
	isValidEnterpriseLicense: true,
	trustedOrigins: ["https://sso.example.com"],
	enablePaidFeatures: true,
};
const emptyOwnerFields = {
	enableEnterpriseFeatures: false,
	licenseKey: null,
	isValidEnterpriseLicense: false,
	trustedOrigins: null,
	enablePaidFeatures: false,
};
// Rows returned for the previous owner, then the new owner.
let ownerRows: unknown[] = [];
let targetMembership: { id: string } | undefined = { id: "member-9" };
// Instance owner as seen once the settings row is locked.
let lockedOwner = "owner";
// Order of the lock and the organization read inside the transaction.
const events: string[] = [];

vi.mock("@dokploy/server/db", async () => {
	const schema = await import("@dokploy/server/db/schema");

	const writer = {
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => {
				writes.push({ op: "update", table, values });
				const returning = async () => {
					if (table === schema.ownershipTransfer) return [{ id: "transfer-1" }];
					if (table === schema.member && values.role === "owner") {
						return newOwnerMemberOf.map((organizationId) => ({
							organizationId,
						}));
					}
					return [];
				};
				return {
					where: () => Object.assign(Promise.resolve(), { returning }),
				};
			},
		}),
		insert: (table: unknown) => ({
			values: (values: unknown) => {
				writes.push({ op: "insert", table, values });
				return Object.assign(Promise.resolve(), {
					returning: async () => [values],
				});
			},
		}),
	};

	const tx = {
		...writer,
		select: () => ({
			from: () => ({
				where: () => ({
					for: async (strength: string) => {
						events.push(`lock:${strength}`);
						return [{ instanceOwnerId: lockedOwner }];
					},
				}),
			}),
		}),
		query: {
			organization: {
				findMany: async () => {
					events.push("read-organizations");
					return ownedOrganizations;
				},
			},
			user: { findFirst: async () => ownerRows.shift() },
		},
	};

	return {
		db: {
			...writer,
			transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
			query: {
				webServerSettings: { findFirst: async () => ({ id: "settings-1" }) },
				user: {
					findFirst: async () => ({
						id: "target",
						banned: false,
						email: "new@example.com",
					}),
				},
				member: { findFirst: async () => targetMembership },
				organization: { findFirst: async () => undefined },
			},
		},
	};
});

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(async () => false),
}));

const schema = await import("@dokploy/server/db/schema");
const {
	createOwnershipTransfer,
	getTransferAcceptanceError,
	transferInstanceOwnership,
} = await import("@dokploy/server/services/ownership-transfer");

const writesTo = (table: unknown) => writes.filter((w) => w.table === table);

beforeEach(() => {
	writes.length = 0;
	ownedOrganizations = [
		{ id: "org-1", name: "One" },
		{ id: "org-2", name: "Two" },
	];
	newOwnerMemberOf = ["org-1"];
	ownerRows = [previousOwnerFields, emptyOwnerFields];
	targetMembership = { id: "member-9" };
	lockedOwner = "owner";
	events.length = 0;
});

describe("createOwnershipTransfer", () => {
	it("rejects a user who is not part of any organization", async () => {
		targetMembership = undefined;

		await expect(
			createOwnershipTransfer("owner", "new@example.com"),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringMatching(/not part of any organization/),
		});
		expect(writes).toHaveLength(0);
	});

	it("refuses when the sender stopped owning the instance before the lock was taken", async () => {
		lockedOwner = "someone-else";

		await expect(
			createOwnershipTransfer("owner", "new@example.com"),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(writes).toHaveLength(0);
	});

	it("creates a pending transfer for a member of an organization", async () => {
		const created = await createOwnershipTransfer("owner", "new@example.com");

		expect(created).toEqual(
			expect.objectContaining({ fromUserId: "owner", toUserId: "target" }),
		);
	});
});

describe("getTransferAcceptanceError", () => {
	const now = new Date("2026-01-01T00:00:00Z");
	const transfer = {
		status: "pending",
		expiresAt: new Date("2026-01-02T00:00:00Z"),
		fromUserId: "owner",
		toUserId: "target",
	};
	const valid = { userId: "target", instanceOwnerId: "owner", now };

	it("accepts a pending, unexpired transfer for its recipient", () => {
		expect(getTransferAcceptanceError(transfer, valid)).toBeNull();
	});

	it("rejects a transfer addressed to someone else", () => {
		expect(
			getTransferAcceptanceError(transfer, { ...valid, userId: "intruder" }),
		).toMatch(/not addressed to you/);
	});

	it("rejects a transfer that was already used", () => {
		expect(
			getTransferAcceptanceError({ ...transfer, status: "accepted" }, valid),
		).toMatch(/no longer pending/);
	});

	it("rejects an expired transfer", () => {
		expect(
			getTransferAcceptanceError(
				{ ...transfer, expiresAt: new Date("2025-12-31T00:00:00Z") },
				valid,
			),
		).toMatch(/expired/);
	});

	it("rejects when the sender is no longer the instance owner", () => {
		expect(
			getTransferAcceptanceError(transfer, {
				...valid,
				instanceOwnerId: "someone-else",
			}),
		).toMatch(/no longer owns/);
	});
});

describe("transferInstanceOwnership", () => {
	it("reads the organizations only after taking the exclusive owner lock", async () => {
		await transferInstanceOwnership("owner", "target");

		expect(events).toEqual(["lock:update", "read-organizations"]);
	});

	it("refuses when the sender stopped owning the instance before the lock was taken", async () => {
		lockedOwner = "someone-else";

		await expect(
			transferInstanceOwnership("owner", "target"),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringMatching(/no longer owns/),
		});
		expect(writes).toHaveLength(0);
	});

	it("moves every owned organization to the new owner", async () => {
		const result = await transferInstanceOwnership("owner", "target");

		expect(result).toEqual({ organizationsTransferred: 2 });
		expect(writesTo(schema.organization)).toEqual([
			expect.objectContaining({ values: { ownerId: "target" } }),
		]);
	});

	it("promotes the new owner and demotes the old owner to member", async () => {
		await transferInstanceOwnership("owner", "target");

		const memberWrites = writesTo(schema.member);
		expect(memberWrites).toEqual([
			{ op: "update", table: schema.member, values: { role: "owner" } },
			{
				op: "insert",
				table: schema.member,
				values: [
					expect.objectContaining({
						organizationId: "org-2",
						userId: "target",
						role: "owner",
					}),
				],
			},
			{ op: "update", table: schema.member, values: { role: "member" } },
		]);
	});

	it("does not insert member rows when the new owner is already in every organization", async () => {
		newOwnerMemberOf = ["org-1", "org-2"];
		await transferInstanceOwnership("owner", "target");

		expect(
			writesTo(schema.member).filter((w) => w.op === "insert"),
		).toHaveLength(0);
	});

	it("moves license and trusted origins to the new owner", async () => {
		await transferInstanceOwnership("owner", "target");

		expect(writesTo(schema.user)).toEqual([
			expect.objectContaining({ values: previousOwnerFields }),
			expect.objectContaining({ values: emptyOwnerFields }),
		]);
	});

	it("keeps the new owner's own license when the previous owner has none", async () => {
		ownerRows = [
			{ ...emptyOwnerFields, trustedOrigins: ["https://old.example.com"] },
			{
				enableEnterpriseFeatures: true,
				licenseKey: "their-license",
				isValidEnterpriseLicense: true,
				trustedOrigins: ["https://new.example.com"],
				enablePaidFeatures: false,
			},
		];
		await transferInstanceOwnership("owner", "target");

		expect(writesTo(schema.user)[0]?.values).toEqual({
			enableEnterpriseFeatures: true,
			licenseKey: "their-license",
			isValidEnterpriseLicense: true,
			trustedOrigins: ["https://new.example.com", "https://old.example.com"],
			enablePaidFeatures: false,
		});
	});

	it("keeps the new owner's valid license over the previous owner's invalid one", async () => {
		ownerRows = [
			{
				...previousOwnerFields,
				licenseKey: "expired-key",
				isValidEnterpriseLicense: false,
			},
			{
				enableEnterpriseFeatures: true,
				licenseKey: "their-license",
				isValidEnterpriseLicense: true,
				trustedOrigins: null,
				enablePaidFeatures: false,
			},
		];
		await transferInstanceOwnership("owner", "target");

		expect(writesTo(schema.user)[0]?.values).toMatchObject({
			licenseKey: "their-license",
			isValidEnterpriseLicense: true,
		});
	});

	it("keeps the previous owner's key when neither license is valid", async () => {
		ownerRows = [
			{
				...previousOwnerFields,
				licenseKey: "needs-revalidation",
				isValidEnterpriseLicense: false,
			},
			emptyOwnerFields,
		];
		await transferInstanceOwnership("owner", "target");

		expect(writesTo(schema.user)[0]?.values).toMatchObject({
			licenseKey: "needs-revalidation",
			isValidEnterpriseLicense: false,
		});
	});

	it("hands the previous owner's git providers to the new owner", async () => {
		await transferInstanceOwnership("owner", "target");

		expect(writesTo(schema.gitProvider)).toEqual([
			expect.objectContaining({ values: { userId: "target" } }),
		]);
	});

	it("hands pending invitations in the transferred organizations to the new owner", async () => {
		await transferInstanceOwnership("owner", "target");

		expect(writesTo(schema.invitation)).toEqual([
			expect.objectContaining({ values: { inviterId: "target" } }),
		]);
	});

	it("hands Dokploy's own database backups to the new owner", async () => {
		await transferInstanceOwnership("owner", "target");

		expect(writesTo(schema.backups)).toEqual([
			expect.objectContaining({ values: { userId: "target" } }),
		]);
	});

	it("records the new instance owner", async () => {
		await transferInstanceOwnership("owner", "target");

		expect(writesTo(schema.webServerSettings)).toEqual([
			expect.objectContaining({ values: { instanceOwnerId: "target" } }),
		]);
	});

	it("claims the invitation when accepting one", async () => {
		await transferInstanceOwnership("owner", "target", "transfer-1");

		expect(writesTo(schema.ownershipTransfer)[0]).toEqual(
			expect.objectContaining({ values: { status: "accepted" } }),
		);
	});

	it("still records the new owner when the old owner has no organizations", async () => {
		ownedOrganizations = [];
		const result = await transferInstanceOwnership("owner", "target");

		expect(result).toEqual({ organizationsTransferred: 0 });
		expect(writesTo(schema.organization)).toHaveLength(0);
		expect(writesTo(schema.member)).toHaveLength(0);
		expect(writesTo(schema.webServerSettings)).toHaveLength(1);
	});
});
