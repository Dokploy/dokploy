import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindServer = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/db", () => ({
	db: { query: { server: { findFirst: mockFindServer } } },
}));

const { haveActiveServices } = await import(
	"@dokploy/server/services/server"
);

describe("server deletion service guard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("counts external upstreams as active server services", async () => {
		mockFindServer.mockResolvedValue({
			serverId: "server-1",
			applications: [],
			compose: [],
			externalUpstreams: [{ externalUpstreamId: "upstream-1" }],
			libsql: [],
			mariadb: [],
			mongo: [],
			mysql: [],
			postgres: [],
			redis: [],
		});

		expect(await haveActiveServices("server-1")).toBe(true);
		expect(mockFindServer).toHaveBeenCalledWith(
			expect.objectContaining({
				with: expect.objectContaining({
					externalUpstreams: { columns: { externalUpstreamId: true } },
				}),
			}),
		);
	});

	it("allows deleting a server with no active services", async () => {
		mockFindServer.mockResolvedValue({
			serverId: "server-1",
			applications: [],
			compose: [],
			externalUpstreams: [],
			libsql: [],
			mariadb: [],
			mongo: [],
			mysql: [],
			postgres: [],
			redis: [],
		});

		expect(await haveActiveServices("server-1")).toBe(false);
	});
});
