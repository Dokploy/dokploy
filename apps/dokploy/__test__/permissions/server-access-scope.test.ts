import { beforeEach, describe, expect, it, vi } from "vitest";

const mockServerData = (serverId: string) => ({ serverId });
const mockMemberData = (role: string, accessedServers: string[] = []) => ({
	role,
	accessedServers,
});

let serversToReturn = [mockServerData("server-1"), mockServerData("server-2")];
let memberToReturn: ReturnType<typeof mockMemberData> | undefined =
	mockMemberData("member");
let licensed = true;

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			server: {
				findMany: vi.fn(() => Promise.resolve(serversToReturn)),
			},
			member: {
				findFirst: vi.fn(() => Promise.resolve(memberToReturn)),
			},
		},
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(licensed)),
}));

const { getAccessibleServerIds } = await import(
	"@dokploy/server/services/server"
);

const session = {
	userId: "user-1",
	activeOrganizationId: "org-1",
};

beforeEach(() => {
	serversToReturn = [mockServerData("server-1"), mockServerData("server-2")];
	memberToReturn = mockMemberData("member");
	licensed = true;
	vi.clearAllMocks();
});

describe("getAccessibleServerIds", () => {
	it("returns all active organization servers for owners", async () => {
		memberToReturn = mockMemberData("owner", []);

		const result = await getAccessibleServerIds(session);

		expect([...result].sort()).toEqual(["server-1", "server-2"]);
	});

	it("returns all active organization servers when no license is active", async () => {
		licensed = false;
		memberToReturn = mockMemberData("member", []);

		const result = await getAccessibleServerIds(session);

		expect([...result].sort()).toEqual(["server-1", "server-2"]);
	});

	it("filters assigned servers to the active organization", async () => {
		memberToReturn = mockMemberData("member", [
			"server-1",
			"foreign-server",
			"server-2",
		]);

		const result = await getAccessibleServerIds(session);

		expect([...result].sort()).toEqual(["server-1", "server-2"]);
	});

	it("does not grant stale or cross-organization server assignments", async () => {
		memberToReturn = mockMemberData("member", ["foreign-server"]);

		const result = await getAccessibleServerIds(session);

		expect([...result]).toEqual([]);
	});
});
