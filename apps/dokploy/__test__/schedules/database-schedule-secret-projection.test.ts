import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: { query: { schedules: { findFirst: mocks.findFirst } } },
}));
vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
	paths: vi.fn(),
}));
vi.mock("@dokploy/server/services/permission", () => ({
	findMemberByUserId: vi.fn(),
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
}));
vi.mock("@dokploy/server/utils/docker/utils", () => ({
	encodeBase64: vi.fn(),
}));
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

const { findScheduleById, findScheduleOrganizationId, getScheduleServerId } =
	await import("@dokploy/server/services/schedule");

beforeEach(() => {
	vi.resetAllMocks();
});

describe.each([
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
] as const)("%s schedule read projection", (databaseType) => {
	it("never selects database credentials or environment secrets", async () => {
		mocks.findFirst.mockResolvedValue({
			scheduleId: "schedule-1",
			[databaseType]: {
				name: "database",
				appName: "database-container",
				serverId: "server-1",
				environment: {
					environmentId: "environment-1",
					project: { organizationId: "org-1" },
				},
			},
		});

		const schedule = await findScheduleById("schedule-1");
		const query = mocks.findFirst.mock.lastCall?.[0];
		expect(query.with[databaseType]).toEqual({
			columns: {
				name: true,
				appName: true,
				serverId: true,
			},
			with: {
				environment: {
					columns: { environmentId: true },
					with: { project: { columns: { organizationId: true } } },
				},
			},
		});
		expect(getScheduleServerId(schedule)).toBe("server-1");
		expect(await findScheduleOrganizationId("schedule-1")).toBe("org-1");
	});
});
