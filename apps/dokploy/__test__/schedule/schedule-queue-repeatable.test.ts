import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	add: vi.fn(),
	getRepeatableJobs: vi.fn(),
	obliterate: vi.fn(),
	removeRepeatable: vi.fn(),
	removeRepeatableByKey: vi.fn(),
}));

vi.mock("bullmq", () => ({
	Queue: vi.fn(function Queue() {
		return {
			add: mocks.add,
			getRepeatableJobs: mocks.getRepeatableJobs,
			obliterate: mocks.obliterate,
			removeRepeatable: mocks.removeRepeatable,
			removeRepeatableByKey: mocks.removeRepeatableByKey,
		};
	}),
}));

const { removeJob, removeRepeatableJob, scheduleJob } = await import(
	"../../../schedules/src/queue"
);

describe("schedules queue repeatable jobs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.add.mockResolvedValue(undefined);
		mocks.removeRepeatable.mockResolvedValue(true);
		mocks.removeRepeatableByKey.mockResolvedValue(true);
	});

	it("uses timezone when adding and removing schedule repeatables", async () => {
		const job = {
			type: "schedule" as const,
			scheduleId: "schedule-1",
			cronSchedule: "0 3 * * *",
			timezone: "Europe/Moscow",
		};

		await scheduleJob(job);
		await removeJob(job);

		expect(mocks.add).toHaveBeenCalledWith("schedule-1", job, {
			repeat: {
				pattern: "0 3 * * *",
				tz: "Europe/Moscow",
			},
		});
		expect(mocks.removeRepeatable).toHaveBeenCalledWith("schedule-1", {
			pattern: "0 3 * * *",
			tz: "Europe/Moscow",
		});
	});

	it("removes update-path repeatables by key so stale repeat options are cleared", async () => {
		await expect(
			removeRepeatableJob({
				key: "repeat:schedule-1:old-pattern:Europe/Moscow",
			} as never),
		).resolves.toBe(true);

		expect(mocks.removeRepeatableByKey).toHaveBeenCalledWith(
			"repeat:schedule-1:old-pattern:Europe/Moscow",
		);
		expect(mocks.removeRepeatable).not.toHaveBeenCalled();
	});
});
