import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createApiKey: vi.fn(),
	getSession: vi.fn(),
	handler: vi.fn(),
	insert: vi.fn(),
	memberFindFirst: vi.fn(),
	memberInsertValues: vi.fn(),
	apiKeyFindFirst: vi.fn(),
	authOptions: undefined as any,
	checkPermission: vi.fn(),
	createAuthMiddleware: vi.fn((middleware) => middleware),
	registerSSOProvider: vi.fn(),
	select: vi.fn(),
	ssoProviderFindFirst: vi.fn(),
	ssoPlugin: vi.fn((options) => {
		mocks.ssoPluginOptions = options;
		return {};
	}),
	ssoPluginOptions: undefined as any,
	trustedOriginsWhere: vi.fn(),
	updateSSOProvider: vi.fn(),
	verifyApiKey: vi.fn(),
	webServerSettingsFindFirst: vi.fn(),
}));

vi.mock("better-auth", () => ({
	betterAuth: vi.fn((options) => {
		mocks.authOptions = options;
		return {
			handler: mocks.handler,
			api: {
				createApiKey: mocks.createApiKey,
				getSession: mocks.getSession,
				registerSSOProvider: mocks.registerSSOProvider,
				updateSSOProvider: mocks.updateSSOProvider,
				verifyApiKey: mocks.verifyApiKey,
			},
		};
	}),
}));

vi.mock("better-auth/api", () => ({
	APIError: class APIError extends Error {
		status: string;

		constructor(status: string, options?: { message?: string }) {
			super(options?.message ?? status);
			this.status = status;
		}
	},
	createAuthMiddleware: mocks.createAuthMiddleware,
}));

vi.mock("better-auth/adapters/drizzle", () => ({
	drizzleAdapter: vi.fn(() => ({})),
}));

vi.mock("@better-auth/api-key", () => ({
	apiKey: vi.fn(() => ({})),
}));

vi.mock("@better-auth/sso", () => ({
	sso: mocks.ssoPlugin,
}));

vi.mock("better-auth/plugins", () => ({
	admin: vi.fn(() => ({})),
	organization: vi.fn(() => ({})),
	twoFactor: vi.fn(() => ({})),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		insert: mocks.insert,
		select: mocks.select,
		update: vi.fn(() => ({
			set: () => ({
				where: () => ({
					returning: async () => [{}],
				}),
			}),
		})),
		query: {
			apikey: {
				findFirst: mocks.apiKeyFindFirst,
			},
			webServerSettings: {
				findFirst: mocks.webServerSettingsFindFirst,
			},
			member: {
				findFirst: mocks.memberFindFirst,
			},
			ssoProvider: {
				findFirst: mocks.ssoProviderFindFirst,
			},
		},
	},
}));

vi.mock("../../../../packages/server/src/db", () => ({
	db: {
		insert: mocks.insert,
		select: mocks.select,
		update: vi.fn(() => ({
			set: () => ({
				where: () => ({
					returning: async () => [{}],
				}),
			}),
		})),
		query: {
			apikey: {
				findFirst: mocks.apiKeyFindFirst,
			},
			webServerSettings: {
				findFirst: mocks.webServerSettingsFindFirst,
			},
			member: {
				findFirst: mocks.memberFindFirst,
			},
			ssoProvider: {
				findFirst: mocks.ssoProviderFindFirst,
			},
		},
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
}));

vi.mock("../../../../packages/server/src/services/permission", () => ({
	checkPermission: mocks.checkPermission,
}));

vi.mock("../../../../packages/server/src/services/admin", () => ({
	getTrustedOrigins: vi.fn(async () =>
		(await mocks.trustedOriginsWhere()).flatMap(
			(row: { trustedOrigins?: string[] | null }) => row.trustedOrigins ?? [],
		),
	),
	getUserByToken: vi.fn(),
}));

vi.mock("../../../../packages/server/src/services/web-server-settings", () => ({
	getWebServerSettings: mocks.webServerSettingsFindFirst,
	updateWebServerSettings: vi.fn(),
}));

vi.mock("../../../../packages/server/src/lib/access-control", () => ({
	ac: {
		newRole: vi.fn((role) => role),
	},
	adminRole: {},
	enterpriseOnlyResources: new Set<string>(),
	memberRole: {},
	ownerRole: {},
	statements: {},
}));

const { validateRequest } = await import(
	"../../../../packages/server/src/lib/auth"
);
const { shouldBlockEmailPasswordSignIn } = await import(
	"../../../../packages/server/src/lib/auth"
);
const { resolveTrustedOriginsForAuthRequest } = await import(
	"../../../../packages/server/src/lib/auth"
);
const { canProvisionSsoMembershipForEmail } = await import(
	"../../../../packages/server/src/lib/auth"
);
const { provisionSsoMembershipForCreatedUser } = await import(
	"../../../../packages/server/src/lib/auth"
);
const { resolveSsoOrganizationProvisioningRole } = await import(
	"../../../../packages/server/src/lib/auth"
);

const apiKeyRequest = {
	headers: {
		"x-api-key": "dokploy-test-key",
	},
} as unknown as IncomingMessage;

const hashedApiKey = createHash("sha256")
	.update("dokploy-test-key")
	.digest("base64url");

const apiKeyAdapterRecord = {
	id: "api-key-1",
	name: "test key",
	start: "dokploy",
	prefix: null,
	key: hashedApiKey,
	configId: "default",
	referenceId: "user-1",
	refillInterval: null,
	refillAmount: null,
	lastRefillAt: null,
	enabled: true,
	rateLimitEnabled: false,
	rateLimitTimeWindow: null,
	rateLimitMax: null,
	requestCount: 0,
	remaining: null,
	lastRequest: null,
	expiresAt: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-02T00:00:00.000Z"),
	permissions: null,
	metadata: JSON.stringify({ organizationId: "org-1" }),
};

const mockAuthSelect = () => {
	mocks.select.mockReturnValue({
		from: () => ({
			innerJoin: () => ({
				where: mocks.trustedOriginsWhere,
			}),
			where: vi.fn(async () => [apiKeyAdapterRecord]),
		}),
	});
};

const userRecord = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	email: "ada@example.com",
	emailVerified: true,
	image: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-02T00:00:00.000Z"),
	twoFactorEnabled: false,
	enableEnterpriseFeatures: false,
	isValidEnterpriseLicense: false,
};

describe("validateRequest API key sessions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.verifyApiKey.mockResolvedValue({
			valid: true,
			key: { id: "api-key-1" },
			error: null,
		});
		mocks.apiKeyFindFirst.mockResolvedValue({
			id: "api-key-1",
			metadata: JSON.stringify({ organizationId: "org-1" }),
			user: userRecord,
		});
		mocks.webServerSettingsFindFirst.mockResolvedValue({ enforceSSO: false });
		mocks.trustedOriginsWhere.mockResolvedValue([
			{ trustedOrigins: ["https://8.8.8.8"] },
		]);
		mockAuthSelect();
		mocks.insert.mockReturnValue({
			values: mocks.memberInsertValues,
		});
	});

	it("rejects API key sessions when the key owner lacks api.read", async () => {
		mocks.memberFindFirst.mockResolvedValue({
			role: "member",
			organization: {
				ownerId: "user-1",
			},
		});
		mocks.checkPermission.mockRejectedValue(new Error("Permission denied"));

		await expect(validateRequest(apiKeyRequest)).resolves.toEqual({
			session: null,
			user: null,
		});
	});

	it("rejects API key metadata for an organization the key owner is not a member of", async () => {
		mocks.memberFindFirst.mockResolvedValue(undefined);

		await expect(validateRequest(apiKeyRequest)).resolves.toEqual({
			session: null,
			user: null,
		});
	});

	it("builds an API key session only after membership is verified", async () => {
		mocks.memberFindFirst.mockResolvedValue({
			role: "owner",
			organization: {
				ownerId: "user-1",
			},
		});

		await expect(validateRequest(apiKeyRequest)).resolves.toMatchObject({
			session: {
				userId: "user-1",
				activeOrganizationId: "org-1",
			},
			user: {
				id: "user-1",
				role: "owner",
				ownerId: "user-1",
			},
		});
		expect(mocks.checkPermission).toHaveBeenCalledWith(
			{
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
			},
			{ api: ["read"] },
		);
	});
});

describe("Better Auth trusted origins", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.webServerSettingsFindFirst.mockResolvedValue({
			enforceSSO: false,
			host: "dokploy.example.com",
			serverIp: "203.0.113.10",
		});
		mocks.trustedOriginsWhere.mockResolvedValue([
			{ trustedOrigins: ["https://8.8.8.8"] },
		]);
		mockAuthSelect();
	});

	it("does not apply tenant trusted origins to ordinary Better Auth requests", async () => {
		await expect(
			resolveTrustedOriginsForAuthRequest(
				new Request("https://dokploy.example.com/api/auth/callback/sso"),
			),
		).resolves.toEqual([
			"http://203.0.113.10:3000",
			"https://dokploy.example.com",
		]);
		expect(mocks.trustedOriginsWhere).not.toHaveBeenCalled();
	});

	it("scopes tenant trusted origins to the SSO register transaction", async () => {
		await expect(
			resolveTrustedOriginsForAuthRequest(
				new Request("https://dokploy.example.com/api/auth/sso/register"),
			),
		).resolves.toEqual([
			"http://203.0.113.10:3000",
			"https://dokploy.example.com",
			"https://8.8.8.8",
		]);
		expect(mocks.trustedOriginsWhere).toHaveBeenCalledTimes(1);
	});

	it("skips database-backed origins during the Next production build", async () => {
		vi.stubEnv("NEXT_PHASE", "phase-production-build");

		try {
			await expect(
				resolveTrustedOriginsForAuthRequest(
					new Request("https://dokploy.example.com/api/auth/sso/register"),
				),
			).resolves.toEqual([]);
		} finally {
			vi.unstubAllEnvs();
		}

		expect(mocks.webServerSettingsFindFirst).not.toHaveBeenCalled();
		expect(mocks.trustedOriginsWhere).not.toHaveBeenCalled();
	});

	it("skips database-backed origins during the build-next lifecycle", async () => {
		vi.stubEnv("npm_lifecycle_event", "build-next");
		vi.stubEnv("npm_lifecycle_script", "next build --webpack");

		try {
			await expect(
				resolveTrustedOriginsForAuthRequest(
					new Request("https://dokploy.example.com/api/auth/sso/register"),
				),
			).resolves.toEqual([]);
		} finally {
			vi.unstubAllEnvs();
		}

		expect(mocks.webServerSettingsFindFirst).not.toHaveBeenCalled();
		expect(mocks.trustedOriginsWhere).not.toHaveBeenCalled();
	});
});

describe("Better Auth SSO enforcement", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.webServerSettingsFindFirst.mockResolvedValue({ enforceSSO: false });
	});

	it("blocks direct email/password sign-in while enforceSSO is enabled", async () => {
		mocks.webServerSettingsFindFirst.mockResolvedValue({ enforceSSO: true });

		await expect(
			shouldBlockEmailPasswordSignIn("/sign-in/email"),
		).resolves.toBe(true);
	});

	it("does not block SSO endpoints or password sign-in when enforceSSO is off", async () => {
		await expect(shouldBlockEmailPasswordSignIn("/sso/callback")).resolves.toBe(
			false,
		);
		await expect(
			shouldBlockEmailPasswordSignIn("/sign-in/email"),
		).resolves.toBe(false);
	});
});

describe("Better Auth account linking policy", () => {
	it("does not globally trust tenant SSO providers for implicit account linking", () => {
		const authSource = readFileSync(
			new URL("../../../../packages/server/src/lib/auth.ts", import.meta.url),
			"utf8",
		);

		expect(authSource).toMatch(/trustedProviders:\s*\["github",\s*"google"\]/);
		expect(authSource).toContain("allowDifferentEmails: false");
		expect(authSource).not.toContain("getTrustedProviders");
		expect(authSource).not.toContain("allowDifferentEmails: true");
	});
});

describe("Better Auth SSO domain verification", () => {
	it("enables Better Auth domain verification for SSO providers", () => {
		const authSource = readFileSync(
			new URL("../../../../packages/server/src/lib/auth.ts", import.meta.url),
			"utf8",
		);

		expect(authSource).toMatch(/domainVerification:\s*{\s*enabled:\s*true/s);
	});
});

describe("Better Auth SSO membership provisioning", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.memberFindFirst.mockResolvedValue({
			role: "owner",
		});
		mocks.ssoProviderFindFirst.mockResolvedValue({
			providerId: "acme-sso",
			organizationId: "org-acme",
			domain: "acme.com,example.org",
			domainVerified: true,
		});
		mocks.insert.mockReturnValue({
			values: mocks.memberInsertValues,
		});
	});

	it("matches verified SSO provider domains before membership provisioning", () => {
		expect(
			canProvisionSsoMembershipForEmail("ada@engineering.acme.com", {
				organizationId: "org-acme",
				domain: "acme.com,example.org",
				domainVerified: true,
			}),
		).toBe(true);
		expect(
			canProvisionSsoMembershipForEmail("ada@evil.com", {
				organizationId: "org-acme",
				domain: "acme.com,example.org",
				domainVerified: true,
			}),
		).toBe(false);
		expect(
			canProvisionSsoMembershipForEmail("ada@acme.com", {
				organizationId: "org-acme",
				domain: "acme.com",
				domainVerified: false,
			}),
		).toBe(false);
	});

	it("fails closed before Better Auth organization provisioning when explicit providerId email domain mismatches", async () => {
		await expect(
			resolveSsoOrganizationProvisioningRole({
				user: {
					id: "user-sso",
					email: "attacker@evil.com",
				},
				userInfo: {},
				provider: {
					providerId: "acme-sso",
					organizationId: "org-acme",
					domain: "acme.com",
					domainVerified: true,
				},
			}),
		).rejects.toThrow("SSO email domain is not allowed for this provider");
	});

	it("fails closed before Better Auth organization provisioning when provider domain is unverified", async () => {
		await expect(
			resolveSsoOrganizationProvisioningRole({
				user: {
					id: "user-sso",
					email: "ada@acme.com",
				},
				userInfo: {},
				provider: {
					providerId: "acme-sso",
					organizationId: "org-acme",
					domain: "acme.com",
					domainVerified: false,
				},
			}),
		).rejects.toThrow("SSO email domain is not allowed for this provider");
	});

	it("allows Better Auth organization provisioning only after explicit providerId email domain eligibility passes", async () => {
		await expect(
			resolveSsoOrganizationProvisioningRole({
				user: {
					id: "user-sso",
					email: "ada@engineering.acme.com",
				},
				userInfo: {},
				provider: {
					providerId: "acme-sso",
					organizationId: "org-acme",
					domain: "acme.com",
					domainVerified: true,
				},
			}),
		).resolves.toBe("member");
	});

	it("fails closed before inserting SSO membership when email domain mismatches provider domains", async () => {
		await expect(
			provisionSsoMembershipForCreatedUser(
				{
					id: "user-sso",
					email: "attacker@evil.com",
				},
				"acme-sso",
			),
		).rejects.toThrow("SSO email domain is not allowed for this provider");

		expect(mocks.ssoProviderFindFirst).toHaveBeenCalledTimes(1);
		expect(mocks.insert).not.toHaveBeenCalled();
	});

	it("provisions SSO membership only after the local email domain check passes", async () => {
		await expect(
			provisionSsoMembershipForCreatedUser(
				{
					id: "user-sso",
					email: "ada@engineering.acme.com",
				},
				"acme-sso",
			),
		).resolves.toBeUndefined();

		expect(mocks.memberInsertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user-sso",
				organizationId: "org-acme",
				role: "member",
				isDefault: true,
			}),
		);
	});
});
