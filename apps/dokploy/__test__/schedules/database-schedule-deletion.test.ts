import {
	databaseScheduleIdColumns,
	databaseScheduleTypes,
	schedules,
} from "@dokploy/server/db/schema/schedule";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findMany: vi.fn(),
	removeJob: vi.fn(),
	removeScheduleJob: vi.fn(),
	mode: { cloud: true },
}));

vi.mock("@dokploy/server", () => ({
	get IS_CLOUD() {
		return mocks.mode.cloud;
	},
	removeScheduleJob: mocks.removeScheduleJob,
}));
vi.mock("@dokploy/server/db", () => ({
	db: { query: { schedules: { findMany: mocks.findMany } } },
}));
vi.mock("@/server/utils/backup", () => ({ removeJob: mocks.removeJob }));

const { cancelDatabaseScheduleJobs, cancelProjectDatabaseScheduleJobs } =
	await import("@/server/utils/database-schedules");

beforeEach(() => {
	vi.resetAllMocks();
	mocks.mode.cloud = true;
	mocks.findMany.mockResolvedValue([
		{
			scheduleId: "schedule-1",
			cronExpression: "0 9 * * *",
			timezone: "Australia/Sydney",
		},
		{
			scheduleId: "schedule-2",
			cronExpression: "0 10 * * *",
			timezone: null,
		},
	]);
});

describe.each(databaseScheduleTypes)("%s database deletion", (databaseType) => {
	it("unregisters every cloud job with its original cron and timezone", async () => {
		await cancelDatabaseScheduleJobs(databaseType, "database-1");

		expect(mocks.findMany).toHaveBeenCalledExactlyOnceWith({
			where: eq(
				schedules[databaseScheduleIdColumns[databaseType]],
				"database-1",
			),
			columns: {
				scheduleId: true,
				cronExpression: true,
				timezone: true,
			},
		});
		expect(mocks.removeJob).toHaveBeenNthCalledWith(1, {
			type: "schedule",
			scheduleId: "schedule-1",
			cronSchedule: "0 9 * * *",
			timezone: "Australia/Sydney",
		});
		expect(mocks.removeJob).toHaveBeenNthCalledWith(2, {
			type: "schedule",
			scheduleId: "schedule-2",
			cronSchedule: "0 10 * * *",
			timezone: null,
		});
		expect(mocks.removeScheduleJob).not.toHaveBeenCalled();
	});

	it("cancels self-hosted jobs instead of contacting the cloud worker", async () => {
		mocks.mode.cloud = false;
		await cancelDatabaseScheduleJobs(databaseType, "database-1");

		expect(mocks.removeScheduleJob).toHaveBeenNthCalledWith(1, "schedule-1");
		expect(mocks.removeScheduleJob).toHaveBeenNthCalledWith(2, "schedule-2");
		expect(mocks.removeJob).not.toHaveBeenCalled();
	});
});

it("does not silently continue deletion when the cloud scheduler is unavailable", async () => {
	mocks.removeJob.mockRejectedValueOnce(new Error("Queue unavailable"));

	await expect(
		cancelDatabaseScheduleJobs("postgres", "database-1"),
	).rejects.toThrow("Queue unavailable");
	// Callers must await cancellation before removing the database row.
	// A rejected cancellation keeps its FK and schedule rows intact.
	expect(mocks.removeJob).toHaveBeenCalledTimes(1);
});

it("cancels database jobs when a project is cascade-deleted", async () => {
	mocks.findMany.mockResolvedValue([]);
	const environment = Object.fromEntries(
		databaseScheduleTypes.map((type) => [
			type,
			[{ [databaseScheduleIdColumns[type]]: `database-${type}` }],
		]),
	);

	await cancelProjectDatabaseScheduleJobs([
		environment,
	] as unknown as Parameters<typeof cancelProjectDatabaseScheduleJobs>[0]);

	expect(mocks.findMany).toHaveBeenCalledTimes(databaseScheduleTypes.length);
	for (const type of databaseScheduleTypes) {
		expect(mocks.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: eq(
					schedules[databaseScheduleIdColumns[type]],
					`database-${type}`,
				),
			}),
		);
	}
});
