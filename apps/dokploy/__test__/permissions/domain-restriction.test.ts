import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
	query: {
		member: { findFirst: vi.fn() },
		organizationRole: { findMany: vi.fn() },
	},
}));
vi.mock("@dokploy/server/db", () => ({ db: mockDb }));
vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(),
}));

const {
	assertDomainAllowed,
	assertNoTraefikLabels,
	getDomainRestriction,
	matchesDomainPattern,
	stripTraefikLabels,
} = await import("@dokploy/server/services/permission");

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-a" },
};

describe("matchesDomainPattern", () => {
	it.each([
		["app.lab.acme.com", true],
		["APP.lab.acme.com ", true],
		["a.b.lab.acme.com", false],
		["lab.acme.com", false],
		["evillab.acme.com", false],
		["app.lab.acme.com.evil.com", false],
		["x`)||PathPrefix(`/`)||Host(`y.lab.acme.com", false],
		["-app.lab.acme.com", false],
	])("%s -> %s", (host, expected) => {
		expect(matchesDomainPattern(host, "*.lab.acme.com")).toBe(expected);
	});
});

describe("getDomainRestriction", () => {
	beforeEach(() => vi.clearAllMocks());

	it("never restricts built-in roles", async () => {
		mockDb.query.member.findFirst.mockResolvedValue({ role: "admin" });
		expect(await getDomainRestriction(ctx)).toBeNull();
		expect(mockDb.query.organizationRole.findMany).not.toHaveBeenCalled();
	});

	it("does not treat prototype names as built-in roles", async () => {
		mockDb.query.member.findFirst.mockResolvedValue({ role: "constructor" });
		mockDb.query.organizationRole.findMany.mockResolvedValue([
			{ allowedDomains: ["*.lab.acme.com"], requireHttps: false },
		]);
		expect(await getDomainRestriction(ctx)).not.toBeNull();
	});

	it("returns null for a custom role without patterns", async () => {
		mockDb.query.member.findFirst.mockResolvedValue({ role: "dev" });
		mockDb.query.organizationRole.findMany.mockResolvedValue([
			{ allowedDomains: null, requireHttps: false },
		]);
		expect(await getDomainRestriction(ctx)).toBeNull();
	});

	it("returns the role patterns", async () => {
		mockDb.query.member.findFirst.mockResolvedValue({ role: "dev" });
		mockDb.query.organizationRole.findMany.mockResolvedValue([
			{ allowedDomains: ["*.lab.acme.com"], requireHttps: true },
		]);
		expect(await getDomainRestriction(ctx)).toEqual({
			patterns: ["*.lab.acme.com"],
			requireHttps: true,
		});
	});
});

describe("assertDomainAllowed", () => {
	const restriction = { patterns: ["*.lab.acme.com"], requireHttps: true };

	it("allows everything without a restriction", () => {
		expect(() =>
			assertDomainAllowed(null, { host: "anything.com" }),
		).not.toThrow();
	});

	it("rejects hosts outside the patterns with FORBIDDEN", () => {
		expect(() =>
			assertDomainAllowed(restriction, { host: "other.com", https: true }),
		).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
	});

	it("rejects paths that inject Traefik rules", () => {
		expect(() =>
			assertDomainAllowed(restriction, {
				host: "app.lab.acme.com",
				https: true,
				path: "/`)||Host(`evil.com`)||PathPrefix(`/x",
			}),
		).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		expect(() =>
			assertDomainAllowed(restriction, {
				host: "app.lab.acme.com",
				https: true,
				path: "/api",
			}),
		).not.toThrow();
	});

	it("requires HTTPS when the role demands it", () => {
		expect(() =>
			assertDomainAllowed(restriction, { host: "app.lab.acme.com" }),
		).toThrow("Your role requires HTTPS on domains");
		expect(() =>
			assertDomainAllowed(restriction, {
				host: "app.lab.acme.com",
				https: true,
			}),
		).not.toThrow();
	});
});

describe("assertNoTraefikLabels", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.member.findFirst.mockResolvedValue({ role: "dev" });
		mockDb.query.organizationRole.findMany.mockResolvedValue([
			{ allowedDomains: ["*.lab.acme.com"], requireHttps: false },
		]);
	});
	const current = (labelsSwarm: Record<string, string> | null) => async () => ({
		labelsSwarm,
	});

	it("rejects new traefik labels for restricted roles", async () => {
		await expect(
			assertNoTraefikLabels(
				ctx,
				{ "traefik.http.routers.x.rule": "Host(`evil.com`)" },
				current(null),
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects changing an existing traefik label", async () => {
		await expect(
			assertNoTraefikLabels(
				ctx,
				{ "traefik.enable": "false" },
				current({ "traefik.enable": "true" }),
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("keeps unchanged traefik labels set by an admin", async () => {
		await expect(
			assertNoTraefikLabels(
				ctx,
				{ "traefik.enable": "true", "com.example": "1" },
				current({ "traefik.enable": "true" }),
			),
		).resolves.toBeUndefined();
	});

	it("ignores non-traefik labels without querying the role", async () => {
		await assertNoTraefikLabels(ctx, { "com.example": "1" }, current(null));
		expect(mockDb.query.member.findFirst).not.toHaveBeenCalled();
	});
});

describe("stripTraefikLabels", () => {
	it("keeps only non-traefik labels", () => {
		expect(
			stripTraefikLabels({ "traefik.enable": "true", "com.example": "1" }),
		).toEqual({ "com.example": "1" });
		expect(stripTraefikLabels(null)).toBeNull();
	});
});
