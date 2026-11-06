import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findScheduleById: vi.fn(),
	createSchedule: vi.fn(),
	updateSchedule: vi.fn(),
	checkDatabaseScheduleAccess: vi.fn(),
	schedule: vi.fn(),
	removeJob: vi.fn(),
	updateJob: vi.fn(),
	getDatabaseScheduleId: vi.fn(),
	isDatabaseScheduleType: vi.fn(),
}));

vi.mock("@trpc/server", () => ({ TRPCError: Error }));
vi.mock("@dokploy/server/db/schema/deployment", () => ({ deployments: {} }));
vi.mock("@dokploy/server/db/schema/schedule", () => ({
	createScheduleSchema: {},
	updateScheduleSchema: {},
	databaseScheduleIdColumns: { postgres: "postgresId" },
	getDatabaseScheduleId: mocks.getDatabaseScheduleId,
	isDatabaseScheduleType: mocks.isDatabaseScheduleType,
	isValidDatabaseScheduleTarget: () => true,
	schedules: {},
	scheduleType: { enumValues: ["application", "compose", "postgres"] },
}));
vi.mock("@dokploy/server", () => ({
	IS_CLOUD: true,
	removeScheduleJob: vi.fn(),
	scheduleJob: vi.fn(),
	runCommand: vi.fn(),
}));
vi.mock("@dokploy/server/db", () => ({ db: {} }));
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findMemberByUserId: vi.fn(),
}));
vi.mock("@dokploy/server/services/schedule", () => ({
	assertHostScheduleAccess: vi.fn(),
	createSchedule: mocks.createSchedule,
	deleteSchedule: vi.fn(),
	findScheduleById: mocks.findScheduleById,
	updateSchedule: mocks.updateSchedule,
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
}));
vi.mock("@/server/api/utils/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/api/utils/database-schedule-access", () => ({
	checkDatabaseScheduleAccess: mocks.checkDatabaseScheduleAccess,
}));
vi.mock("@/server/api/utils/plan-limits", () => ({
	assertScheduledJobLimit: vi.fn(),
}));
vi.mock("@/server/utils/backup", () => ({
	schedule: mocks.schedule,
	removeJob: mocks.removeJob,
	updateJob: mocks.updateJob,
}));
vi.mock("@/server/api/trpc", () => ({
	createTRPCRouter: (routes: unknown) => routes,
	protectedProcedure: {
		input: () => ({
			query: (handler: unknown) => handler,
			mutation: (handler: unknown) => handler,
		}),
	},
}));

const { scheduleRouter } = await import("@/server/api/routers/schedule");
type Handler = (args: {
	input: Record<string, unknown>;
	ctx: typeof ctx;
}) => Promise<unknown>;
const create = scheduleRouter.create as unknown as Handler;
const update = scheduleRouter.update as unknown as Handler;
const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.resetAllMocks();
	mocks.getDatabaseScheduleId.mockReturnValue(null);
	mocks.isDatabaseScheduleType.mockReturnValue(false);
});

describe("cloud schedule lifecycle", () => {
	it.each(["application", "compose", "postgres"] as const)(
		"removes the existing %s repeat key when disabling and editing together",
		async (type) => {
			mocks.isDatabaseScheduleType.mockReturnValue(type === "postgres");
			mocks.getDatabaseScheduleId.mockReturnValue(
				type === "postgres" ? "service-1" : null,
			);
			const existing = {
				scheduleId: "schedule-1",
				scheduleType: type,
				[`${type}Id`]: "service-1",
				cronExpression: "0 9 * * *",
				timezone: "Australia/Sydney",
				enabled: true,
			};
			mocks.findScheduleById.mockResolvedValue(existing);
			mocks.updateSchedule.mockResolvedValue({
				...existing,
				cronExpression: "0 10 * * *",
				timezone: "Europe/London",
				enabled: false,
			});

			await update({
				input: {
					scheduleId: "schedule-1",
					cronExpression: "0 10 * * *",
					timezone: "Europe/London",
					enabled: false,
				},
				ctx,
			});

			expect(mocks.removeJob).toHaveBeenCalledExactlyOnceWith({
				type: "schedule",
				scheduleId: "schedule-1",
				cronSchedule: "0 9 * * *",
				timezone: "Australia/Sydney",
			});
			expect(mocks.updateJob).not.toHaveBeenCalled();
			if (type === "postgres") {
				expect(mocks.checkDatabaseScheduleAccess).toHaveBeenCalledWith(
					ctx,
					"postgres",
					"service-1",
					{ schedule: ["update"] },
				);
			}
		},
	);

	it("propagates queue registration failures to the create caller", async () => {
		mocks.isDatabaseScheduleType.mockReturnValue(true);
		mocks.getDatabaseScheduleId.mockReturnValue("database-1");
		mocks.createSchedule.mockResolvedValue({
			scheduleId: "schedule-1",
			enabled: true,
			cronExpression: "0 9 * * *",
			timezone: null,
		});
		mocks.schedule.mockRejectedValue(new Error("Queue unavailable"));

		await expect(
			create({
				input: { scheduleType: "postgres", postgresId: "database-1" },
				ctx,
			}),
		).rejects.toThrow("Queue unavailable");
		expect(mocks.checkDatabaseScheduleAccess).toHaveBeenCalledWith(
			ctx,
			"postgres",
			"database-1",
			{ schedule: ["create"] },
		);
	});
});
