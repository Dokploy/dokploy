import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobQueueSchema } from "../../../schedules/src/schema";

const mocks = vi.hoisted(() => ({
	add: vi.fn(),
	removeRepeatable: vi.fn(),
}));

vi.mock("bullmq", () => ({
	Queue: class {
		add = mocks.add;
		removeRepeatable = mocks.removeRepeatable;
	},
}));
vi.mock("../../../schedules/src/logger.js", () => ({ logger: {} }));

const { removeJob, scheduleJob } = await import(
	"../../../schedules/src/queue.js"
);

beforeEach(() => {
	vi.clearAllMocks();
});

describe("scheduled job timezone contract", () => {
	it.each([undefined, null, "UTC", "Australia/Sydney"])(
		"uses the same repeat key when creating and removing a job with timezone %s",
		async (timezone) => {
			const job = jobQueueSchema.parse({
				type: "schedule",
				scheduleId: "schedule-1",
				cronSchedule: "0 9 * * *",
				timezone,
			});
			const repeat = {
				pattern: "0 9 * * *",
				tz: timezone || "UTC",
			};

			await scheduleJob(job);
			await removeJob(job);

			expect(mocks.add).toHaveBeenCalledWith("schedule-1", job, { repeat });
			expect(mocks.removeRepeatable).toHaveBeenCalledWith("schedule-1", repeat);
		},
	);

	it("accepts omitted timezones in existing schedule API requests", () => {
		expect(
			jobQueueSchema.safeParse({
				type: "schedule",
				scheduleId: "schedule-1",
				cronSchedule: "0 9 * * *",
			}).success,
		).toBe(true);
	});

	it("rejects non-string timezone values", () => {
		expect(
			jobQueueSchema.safeParse({
				type: "schedule",
				scheduleId: "schedule-1",
				cronSchedule: "0 9 * * *",
				timezone: 10,
			}).success,
		).toBe(false);
	});
});
