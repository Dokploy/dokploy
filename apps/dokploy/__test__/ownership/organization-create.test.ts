import { beforeEach, describe, expect, it, vi } from "vitest";

let isCloud = false;
const mockIsInstanceOwner = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/index", () => ({
	get IS_CLOUD() {
		return isCloud;
	},
	deleteOrganization: vi.fn(),
	hasValidLicense: vi.fn(async () => false),
	isInstanceOwner: mockIsInstanceOwner,
	sendInvitationEmail: vi.fn(),
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
	mockIsInstanceOwner.mockReset();
});

describe("organization.create", () => {
	it("rejects an admin on self-hosted", async () => {
		mockIsInstanceOwner.mockResolvedValue(false);

		await expect(
			callerFor("admin").create({ name: "Side project" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockIsInstanceOwner).toHaveBeenCalledWith("user-1");
	});

	it("rejects an owner of a legacy organization who is not the instance owner", async () => {
		mockIsInstanceOwner.mockResolvedValue(false);

		await expect(
			callerFor("owner").create({ name: "Another one" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("allows the instance owner on self-hosted", async () => {
		mockIsInstanceOwner.mockResolvedValue(true);

		await expect(
			callerFor("owner").create({ name: "Team B" }),
		).resolves.toBeDefined();
	});

	it("does not apply the instance owner rule on cloud", async () => {
		isCloud = true;

		await expect(
			callerFor("member").create({ name: "My org" }),
		).resolves.toBeDefined();
		expect(mockIsInstanceOwner).not.toHaveBeenCalled();
	});
});
