import { beforeEach, describe, expect, it, vi } from "vitest";

type License = {
	enableEnterpriseFeatures: boolean;
	isValidEnterpriseLicense: boolean;
};

const licensed: License = {
	enableEnterpriseFeatures: true,
	isValidEnterpriseLicense: true,
};
const unlicensed: License = {
	enableEnterpriseFeatures: false,
	isValidEnterpriseLicense: false,
};

let instanceOwnerId: string | null = "new-owner";
const licenses: Record<string, License> = {
	"new-owner": licensed,
	"legacy-admin": unlicensed,
};

const idFromWhere = (where: unknown) => {
	const chunks = (where as { queryChunks?: unknown[] })?.queryChunks ?? [];
	const param = chunks.find(
		(c) => typeof (c as { value?: unknown })?.value === "string",
	) as { value: string } | undefined;
	return param?.value;
};

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			user: {
				findFirst: vi.fn(async ({ where }: { where: unknown }) => {
					const id = idFromWhere(where);
					return id ? licenses[id] : undefined;
				}),
			},
			member: {
				findFirst: vi.fn(async () => ({
					userId: "legacy-admin",
					role: "owner",
					user: licenses["legacy-admin"],
				})),
			},
		},
	},
}));

vi.mock("@dokploy/server/services/admin", () => ({
	getInstanceOwnerId: vi.fn(async () => instanceOwnerId),
	invalidateTrustedOriginsCache: vi.fn(),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	auth: {},
	validateRequest: vi.fn(),
}));

const { ssoRouter } = await import("@/server/api/routers/proprietary/sso");

const caller = ssoRouter.createCaller(
	{} as Parameters<typeof ssoRouter.createCaller>[0],
);

beforeEach(() => {
	instanceOwnerId = "new-owner";
	licenses["new-owner"] = licensed;
});

describe("sso.showSignInWithSSO", () => {
	it("checks the instance owner's license, not the earliest owner membership", async () => {
		await expect(caller.showSignInWithSSO()).resolves.toBe(true);
	});

	it("hides SSO when the instance owner has no valid license", async () => {
		licenses["new-owner"] = {
			enableEnterpriseFeatures: true,
			isValidEnterpriseLicense: false,
		};

		await expect(caller.showSignInWithSSO()).resolves.toBe(false);
	});

	it("hides SSO when there is no instance owner yet", async () => {
		instanceOwnerId = null;

		await expect(caller.showSignInWithSSO()).resolves.toBe(false);
	});
});
