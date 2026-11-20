import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
	query: {
		server: { findMany: vi.fn() },
		member: { findFirst: vi.fn() },
	},
}));
vi.mock("@dokploy/server/db", () => ({ db: mockDb }));

const mockHasValidLicense = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: mockHasValidLicense,
}));

vi.mock("@dokploy/server/constants", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/constants")>()),
	IS_CLOUD: false,
}));

const { assertServerAccess } = await import("@dokploy/server/services/server");

const session = { userId: "user-1", activeOrganizationId: "org-a" };

// org-a owns srv-a and srv-c; srv-b belongs to another org.
const orgServers = [{ serverId: "srv-a" }, { serverId: "srv-c" }];

const setMember = (
	role: string,
	accessedServers: string[],
	licensed: boolean,
) => {
	mockDb.query.member.findFirst.mockResolvedValue({ role, accessedServers });
	mockHasValidLicense.mockResolvedValue(licensed);
};

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.query.server.findMany.mockResolvedValue(orgServers);
});

const allow = (p: Promise<unknown>) => expect(p).resolves.toBeUndefined();
const deny = (p: Promise<unknown>) =>
	expect(p).rejects.toMatchObject({ code: "UNAUTHORIZED" });

describe("assertServerAccess — legitimate access is preserved per role", () => {
	it("owner reaches any server in the org (ignores accessedServers)", async () => {
		setMember("owner", [], true);
		await allow(assertServerAccess(session, "srv-a"));
		await allow(assertServerAccess(session, "srv-c"));
	});

	it("admin reaches any server in the org", async () => {
		setMember("admin", [], true);
		await allow(assertServerAccess(session, "srv-a"));
		await allow(assertServerAccess(session, "srv-c"));
	});

	it("member in an UNLICENSED org reaches any server in the org", async () => {
		setMember("member", [], false);
		await allow(assertServerAccess(session, "srv-a"));
		await allow(assertServerAccess(session, "srv-c"));
	});

	it("licensed member reaches a server in its accessedServers", async () => {
		setMember("member", ["srv-a"], true);
		await allow(assertServerAccess(session, "srv-a"));
	});

	it("custom role reaches a server in its accessedServers", async () => {
		setMember("deployer", ["srv-c"], true);
		await allow(assertServerAccess(session, "srv-c"));
	});

	it("any role may act on the local host (no serverId) on self-hosted", async () => {
		setMember("member", [], true);
		await allow(assertServerAccess(session, null));
	});
});

describe("assertServerAccess — unauthorized access is blocked", () => {
	it("rejects a server of another organization for everyone", async () => {
		for (const role of ["owner", "admin", "member"]) {
			setMember(role, ["srv-a"], true);
			await deny(assertServerAccess(session, "srv-b"));
		}
	});

	it("rejects a server the licensed member was not granted", async () => {
		setMember("member", ["srv-a"], true);
		await deny(assertServerAccess(session, "srv-c"));
	});

	it("rejects a custom role for a server outside its grant", async () => {
		setMember("deployer", ["srv-a"], true);
		await deny(assertServerAccess(session, "srv-c"));
	});
});

describe("assertServerAccess on Cloud", () => {
	it("rejects the local control-plane host (no serverId) when IS_CLOUD", async () => {
		vi.resetModules();
		vi.doMock("@dokploy/server/constants", async (importOriginal) => ({
			...(await importOriginal<typeof import("@dokploy/server/constants")>()),
			IS_CLOUD: true,
		}));
		vi.doMock("@dokploy/server/db", () => ({ db: mockDb }));
		vi.doMock("@dokploy/server/services/proprietary/license-key", () => ({
			hasValidLicense: mockHasValidLicense,
		}));
		const { assertServerAccess: cloudAssert } = await import(
			"@dokploy/server/services/server"
		);
		setMember("owner", [], true);
		await expect(cloudAssert(session, null)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		// A real owned server is still reachable on Cloud.
		await expect(cloudAssert(session, "srv-a")).resolves.toBeUndefined();
		vi.doUnmock("@dokploy/server/constants");
	});
});
