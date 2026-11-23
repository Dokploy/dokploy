import { beforeEach, describe, expect, it, vi } from "vitest";

let isCloud = false;
let instanceOwnerId: string | null = "user-1";
const lockedInserts: string[] = [];
const mockWithInstanceOwnerLock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/index", () => ({
	get IS_CLOUD() {
		return isCloud;
	},
	deleteOrganization: vi.fn(),
	hasValidLicense: vi.fn(async () => false),
	sendInvitationEmail: vi.fn(),
	withInstanceOwnerLock: mockWithInstanceOwnerLock,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

vi.mock("@/server/api/utils/plan-limits", () => ({
	assertMemberLimit: vi.fn(),
	assertOrganizationLimit: vi.fn(),
}));

const schema = await import("@dokploy/server/db/schema");

const lockedTx = {
	insert: (table: unknown) => ({
		values: (values: Record<string, unknown>) => {
			lockedInserts.push(
				table === schema.organization ? "organization" : "member",
			);
			return Object.assign(Promise.resolve(), {
				returning: async () => [{ id: "org-new", ...values }],
			});
		},
	}),
	query: { member: { findMany: async () => [] } },
};

const { organizationRouter } = await import(
	"@/server/api/routers/organization"
);

const callerFor = (role: "owner" | "admin" | "member") =>
	organizationRouter.createCaller({
		session: { activeOrganizationId: "org-1" },
		user: { id: "user-1", email: "user@example.com", role },
	} as Parameters<typeof organizationRouter.createCaller>[0]);

beforeEach(() => {
	isCloud = false;
	instanceOwnerId = "user-1";
	lockedInserts.length = 0;
	mockWithInstanceOwnerLock.mockReset();
	mockWithInstanceOwnerLock.mockImplementation(async (_strength, fn) =>
		fn({ tx: lockedTx, instanceOwnerId, settingsId: "settings-1" }),
	);
});

describe("organization.create", () => {
	it("rejects an admin on self-hosted without inserting anything", async () => {
		instanceOwnerId = "someone-else";

		await expect(
			callerFor("admin").create({ name: "Side project" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(lockedInserts).toEqual([]);
	});

	it("rejects an owner of a legacy organization who is not the instance owner", async () => {
		instanceOwnerId = "someone-else";

		await expect(
			callerFor("owner").create({ name: "Another one" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(lockedInserts).toEqual([]);
	});

	it("creates the organization inside the shared instance owner lock", async () => {
		await expect(
			callerFor("owner").create({ name: "Team B" }),
		).resolves.toMatchObject({ id: "org-new", name: "Team B" });
		expect(mockWithInstanceOwnerLock).toHaveBeenCalledWith(
			"share",
			expect.any(Function),
		);
		expect(lockedInserts).toEqual(["organization", "member"]);
	});

	it("does not apply the instance owner rule on cloud", async () => {
		isCloud = true;

		await expect(
			callerFor("member").create({ name: "My org" }),
		).resolves.toBeDefined();
		expect(mockWithInstanceOwnerLock).not.toHaveBeenCalled();
	});
});
