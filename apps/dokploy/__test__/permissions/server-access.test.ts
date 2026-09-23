import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findServers: vi.fn(),
	findMember: vi.fn(),
	findTeam: vi.fn(),
	hasValidLicense: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			server: { findMany: mocks.findServers },
			member: { findFirst: mocks.findMember },
			team: { findFirst: mocks.findTeam },
		},
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: mocks.hasValidLicense,
}));

const { getAccessibleServerIds } = await import(
	"@dokploy/server/services/server"
);

const session = { userId: "user-1", activeOrganizationId: "org-1" };

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findServers.mockResolvedValue([
		{ serverId: "member-server" },
		{ serverId: "team-server" },
	]);
	mocks.hasValidLicense.mockResolvedValue(true);
});

describe("getAccessibleServerIds team access", () => {
	it("unions individual and team assignments", async () => {
		mocks.findMember.mockResolvedValue({
			role: "member",
			teamId: "team-1",
			accessedServers: ["member-server"],
		});
		mocks.findTeam.mockResolvedValue({
			accessedServers: ["member-server", "team-server"],
		});

		await expect(getAccessibleServerIds(session)).resolves.toEqual(
			new Set(["member-server", "team-server"]),
		);
		expect(mocks.findTeam).toHaveBeenCalledOnce();
	});

	it("does not grant server IDs outside the active organization", async () => {
		mocks.findMember.mockResolvedValue({
			role: "member",
			teamId: "team-1",
			accessedServers: ["unknown-server"],
		});
		mocks.findTeam.mockResolvedValue({
			accessedServers: ["team-server", "cross-org-server"],
		});

		await expect(getAccessibleServerIds(session)).resolves.toEqual(
			new Set(["team-server"]),
		);
	});

	it("keeps the owner and unlicensed bypasses", async () => {
		mocks.findMember.mockResolvedValue({
			role: "owner",
			teamId: null,
			accessedServers: [],
		});
		await expect(getAccessibleServerIds(session)).resolves.toEqual(
			new Set(["member-server", "team-server"]),
		);

		mocks.findMember.mockResolvedValue({
			role: "member",
			teamId: null,
			accessedServers: [],
		});
		mocks.hasValidLicense.mockResolvedValue(false);
		await expect(getAccessibleServerIds(session)).resolves.toEqual(
			new Set(["member-server", "team-server"]),
		);
	});
});
