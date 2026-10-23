import type { IncomingMessage } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyApiKey = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const apikeyFindFirst = vi.hoisted(() => vi.fn());
const memberFindFirst = vi.hoisted(() => vi.fn());
const memberFindMany = vi.hoisted(() => vi.fn());
const accountFindFirst = vi.hoisted(() => vi.fn());

// auth.ts reuses an instance already on globalThis instead of building one.
(globalThis as { betterAuthInstance?: unknown }).betterAuthInstance = {
	handler: vi.fn(),
	api: { verifyApiKey, getSession },
};

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			apikey: { findFirst: apikeyFindFirst },
			member: { findFirst: memberFindFirst, findMany: memberFindMany },
			account: { findFirst: accountFindFirst },
		},
	},
}));

const { validateRequest } = await import("@dokploy/server/lib/auth");

const baseUser = {
	id: "u1",
	firstName: "Jane",
	email: "jane@example.com",
	twoFactorEnabled: false,
	enableEnterpriseFeatures: false,
	isValidEnterpriseLicense: false,
};

const membership = ({
	twoFactorEnabled = false,
	organizationId = "org-a",
} = {}) => ({
	role: "member",
	require2FA: false,
	organization: {
		id: organizationId,
		ownerId: "owner",
		require2FA: false,
	},
	user: { ...baseUser, twoFactorEnabled },
});

const requiredBy = (...flags: { org?: boolean; member?: boolean }[]) =>
	memberFindMany.mockResolvedValue(
		flags.map(({ org = false, member = false }) => ({
			require2FA: member,
			organization: { require2FA: org },
		})),
	);

const withPassword = () =>
	accountFindFirst.mockResolvedValue({ password: "hash" });

const apiKeyRequest = () =>
	({ headers: { "x-api-key": "key" } }) as unknown as IncomingMessage;
const cookieRequest = () =>
	({ headers: { cookie: "session=1" } }) as unknown as IncomingMessage;

beforeEach(() => {
	vi.clearAllMocks();
	accountFindFirst.mockResolvedValue(undefined);
	memberFindMany.mockResolvedValue([]);
	memberFindFirst.mockResolvedValue(membership());
	verifyApiKey.mockResolvedValue({ valid: true, key: { id: "k1" } });
	apikeyFindFirst.mockResolvedValue({
		id: "k1",
		metadata: JSON.stringify({ organizationId: "org-a" }),
		user: baseUser,
	});
});

describe("validateRequest with an API key", () => {
	it("treats the key of a pending user as signed out by default", async () => {
		withPassword();
		requiredBy({ org: true });

		const result = await validateRequest(apiKeyRequest());

		expect(result).toEqual({ session: null, user: null });
	});

	it("flags the key of a pending user when the caller allows it", async () => {
		withPassword();
		requiredBy({ org: true });

		const result = await validateRequest(apiKeyRequest(), {
			allowPending: true,
		});

		expect(result.user?.id).toBe("u1");
		expect(result.user?.twoFactorSetupRequired).toBe(true);
	});

	it("accepts the key when no organization requires 2FA", async () => {
		withPassword();
		requiredBy({});

		const result = await validateRequest(apiKeyRequest());

		expect(result.user?.twoFactorSetupRequired).toBe(false);
	});

	it("accepts the key of a required user without a password", async () => {
		requiredBy({ member: true });

		const result = await validateRequest(apiKeyRequest());

		expect(result.user?.twoFactorSetupRequired).toBe(false);
	});
});

describe("validateRequest with a session", () => {
	beforeEach(() => {
		getSession.mockResolvedValue({
			session: { userId: "u1", activeOrganizationId: "org-a" },
			user: { id: "u1", twoFactorEnabled: false },
		});
	});

	it("treats a pending user as signed out by default", async () => {
		withPassword();
		requiredBy({ org: true });

		const result = await validateRequest(cookieRequest());

		expect(result).toEqual({ session: null, user: null });
	});

	it("flags a pending user when the caller allows it", async () => {
		withPassword();
		requiredBy({ org: true });

		const result = await validateRequest(cookieRequest(), {
			allowPending: true,
		});

		expect(result.user?.twoFactorSetupRequired).toBe(true);
	});

	it("flags a user whose other organization requires 2FA", async () => {
		withPassword();
		memberFindFirst.mockResolvedValue(membership({ organizationId: "org-b" }));
		requiredBy({}, { org: true });

		const result = await validateRequest(cookieRequest(), {
			allowPending: true,
		});

		expect(result.user?.twoFactorSetupRequired).toBe(true);
		expect(result.session?.activeOrganizationId).toBe("org-b");
	});

	it("doesn't flag a user once 2FA is enabled", async () => {
		withPassword();
		memberFindFirst.mockResolvedValue(membership({ twoFactorEnabled: true }));
		requiredBy({ org: true });

		const result = await validateRequest(cookieRequest());

		expect(result.user?.twoFactorSetupRequired).toBe(false);
	});

	it("doesn't flag a user when nothing requires 2FA", async () => {
		withPassword();
		requiredBy({});

		const result = await validateRequest(cookieRequest());

		expect(result.user?.twoFactorSetupRequired).toBe(false);
	});
});
