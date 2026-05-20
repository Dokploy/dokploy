import { beforeEach, describe, expect, it, vi } from "vitest";

const orgServers = [
	{ serverId: "server-1" },
	{ serverId: "server-2" },
	{ serverId: "server-3" },
];

const mockMemberData = (role: string, accessedServers: string[] = []) => ({
	id: "member-1",
	role,
	userId: "user-1",
	organizationId: "org-1",
	accessedServers,
});

let memberToReturn: ReturnType<typeof mockMemberData> | undefined =
	mockMemberData("member");
let licenseIsValid = false;

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			server: {
				findMany: vi.fn(() => Promise.resolve(orgServers)),
			},
			member: {
				findFirst: vi.fn(() => Promise.resolve(memberToReturn)),
			},
		},
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(licenseIsValid)),
}));

const { getAccessibleServerIds } = await import(
	"@dokploy/server/services/server"
);

const session = {
	userId: "user-1",
	activeOrganizationId: "org-1",
};

beforeEach(() => {
	vi.clearAllMocks();
	memberToReturn = mockMemberData("member");
	licenseIsValid = false;
});

describe("getAccessibleServerIds", () => {
	it("returns every organization server for owners", async () => {
		memberToReturn = mockMemberData("owner", ["server-1"]);
		licenseIsValid = true;

		await expect(getAccessibleServerIds(session)).resolves.toEqual(
			new Set(["server-1", "server-2", "server-3"]),
		);
	});

	it("returns every organization server for admins", async () => {
		memberToReturn = mockMemberData("admin", ["server-2"]);
		licenseIsValid = true;

		await expect(getAccessibleServerIds(session)).resolves.toEqual(
			new Set(["server-1", "server-2", "server-3"]),
		);
	});

	it("returns every organization server for members without enterprise license", async () => {
		memberToReturn = mockMemberData("member", ["server-2"]);
		licenseIsValid = false;

		await expect(getAccessibleServerIds(session)).resolves.toEqual(
			new Set(["server-1", "server-2", "server-3"]),
		);
	});

	it("returns only assigned servers for members with enterprise license", async () => {
		memberToReturn = mockMemberData("member", ["server-2", "server-3"]);
		licenseIsValid = true;

		await expect(getAccessibleServerIds(session)).resolves.toEqual(
			new Set(["server-2", "server-3"]),
		);
	});

	it("returns no servers for licensed members without explicit server access", async () => {
		memberToReturn = mockMemberData("member");
		licenseIsValid = true;

		await expect(getAccessibleServerIds(session)).resolves.toEqual(new Set());
	});
});
