import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findDeploymentById: vi.fn(),
	findScheduleById: vi.fn(),
	getScheduleServerId: vi.fn(),
	execAsyncRemote: vi.fn(),
	execAsync: vi.fn(),
	checkDatabaseScheduleAccess: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	findDeploymentById: mocks.findDeploymentById,
	findScheduleById: mocks.findScheduleById,
	getScheduleServerId: mocks.getScheduleServerId,
	execAsyncRemote: mocks.execAsyncRemote,
	execAsync: mocks.execAsync,
	IS_CLOUD: true,
}));
vi.mock("@dokploy/server/db", () => ({ db: {} }));
vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
	findMemberByUserId: vi.fn(),
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
}));
vi.mock("@/server/api/utils/database-schedule-access", () => ({
	checkDatabaseScheduleAccess: mocks.checkDatabaseScheduleAccess,
}));
vi.mock("@/server/api/utils/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/db/schema", () => ({
	apiFindAllByApplication: {},
	apiFindAllByCompose: {},
	apiFindAllByServer: {},
	apiFindAllByType: {},
	deployments: {},
	server: {},
}));
vi.mock("@/server/queues/queueSetup", () => ({ myQueue: {} }));
vi.mock("@/server/utils/deploy", () => ({ fetchDeployApiJobs: vi.fn() }));
vi.mock("@/server/api/trpc", () => {
	const procedure = {
		input: () => ({
			query: (handler: unknown) => handler,
			mutation: (handler: unknown) => handler,
		}),
		query: (handler: unknown) => handler,
		mutation: (handler: unknown) => handler,
	};
	return {
		createTRPCRouter: (routes: unknown) => routes,
		protectedProcedure: procedure,
		withPermission: () => procedure,
	};
});

const { deploymentRouter } = await import("@/server/api/routers/deployment");
const readLogs = deploymentRouter.readLogs as unknown as (args: {
	input: { deploymentId: string; tail: number };
	ctx: typeof ctx;
}) => Promise<string>;

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.resetAllMocks();
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "remote log output" });
	mocks.execAsync.mockResolvedValue({ stdout: "local log output" });
});

describe("scheduled deployment log server selection", () => {
	it.each([
		["postgres", "postgresId"],
		["mysql", "mysqlId"],
		["mariadb", "mariadbId"],
		["mongo", "mongoId"],
		["redis", "redisId"],
		["libsql", "libsqlId"],
	] as const)(
		"reads %s scheduled logs from the database's remote server",
		async (type, idColumn) => {
			mocks.findDeploymentById.mockResolvedValue({
				deploymentId: "run-1",
				logPath: "/logs/db.log",
				serverId: null,
				application: null,
				compose: null,
				schedule: {
					scheduleId: "schedule-1",
					scheduleType: type,
					[idColumn]: "database-1",
					serverId: null,
				},
			});
			const expandedSchedule = {
				scheduleId: "schedule-1",
				[type]: { serverId: "server-1" },
			};
			mocks.findScheduleById.mockResolvedValue(expandedSchedule);
			mocks.getScheduleServerId.mockReturnValue("server-1");

			const logs = await readLogs({
				input: { deploymentId: "run-1", tail: 50 },
				ctx,
			});

			expect(logs).toBe("remote log output");
			expect(mocks.checkDatabaseScheduleAccess).toHaveBeenCalledWith(
				ctx,
				type,
				"database-1",
				{ deployment: ["read"] },
			);
			expect(mocks.findScheduleById).toHaveBeenCalledWith("schedule-1");
			expect(mocks.getScheduleServerId).toHaveBeenCalledWith(expandedSchedule);
			expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
				"server-1",
				expect.stringContaining('tail -n 50 "/logs/db.log"'),
			);
			expect(mocks.execAsync).not.toHaveBeenCalled();
		},
	);

	it("checks database read permission before resolving remote log storage", async () => {
		mocks.findDeploymentById.mockResolvedValue({
			deploymentId: "run-1",
			logPath: "/logs/db.log",
			schedule: {
				scheduleId: "schedule-1",
				scheduleType: "postgres",
				postgresId: "database-1",
			},
		});
		mocks.checkDatabaseScheduleAccess.mockRejectedValue(
			new Error("Access denied"),
		);

		await expect(
			readLogs({ input: { deploymentId: "run-1", tail: 50 }, ctx }),
		).rejects.toThrow("Access denied");
		expect(mocks.findScheduleById).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it.each(["application", "compose"] as const)(
		"does not change %s deployment log routing",
		async (type) => {
			mocks.findDeploymentById.mockResolvedValue({
				deploymentId: "run-2",
				logPath: "/logs/service.log",
				serverId: null,
				schedule: null,
				application:
					type === "application" ? { serverId: "service-server" } : null,
				compose: type === "compose" ? { serverId: "service-server" } : null,
			});

			expect(
				await readLogs({ input: { deploymentId: "run-2", tail: 20 }, ctx }),
			).toBe("remote log output");
			expect(mocks.findScheduleById).not.toHaveBeenCalled();
			expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
				"service-server",
				expect.stringContaining('tail -n 20 "/logs/service.log"'),
			);
		},
	);
});
