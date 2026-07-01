import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	hasValidLicense: vi.fn(),
	memberFindFirst: vi.fn(),
	serverFindMany: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: mocks.memberFindFirst,
			},
			server: {
				findMany: mocks.serverFindMany,
			},
		},
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: mocks.hasValidLicense,
}));

const { getAccessibleServerIds } = await import(
	"@dokploy/server/services/server"
);

describe("getAccessibleServerIds organization boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.serverFindMany.mockResolvedValue([
			{ serverId: "server-1" },
			{ serverId: "server-2" },
		]);
		mocks.hasValidLicense.mockResolvedValue(true);
	});

	it("intersects licensed member assigned servers with active organization servers", async () => {
		mocks.memberFindFirst.mockResolvedValue({
			role: "member",
			accessedServers: ["server-1", "foreign-server"],
		});

		await expect(
			getAccessibleServerIds({
				userId: "member-1",
				activeOrganizationId: "org-1",
			}),
		).resolves.toEqual(new Set(["server-1"]));
	});

	it("keeps owner and admin access scoped to active organization servers", async () => {
		mocks.memberFindFirst.mockResolvedValue({
			role: "admin",
			accessedServers: ["foreign-server"],
		});

		await expect(
			getAccessibleServerIds({
				userId: "admin-1",
				activeOrganizationId: "org-1",
			}),
		).resolves.toEqual(new Set(["server-1", "server-2"]));
		expect(mocks.hasValidLicense).not.toHaveBeenCalled();
	});
});
