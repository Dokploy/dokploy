import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: true,
	removeScheduleBackup: vi.fn(),
}));

import {
	cancelJobs,
	removeJob,
	schedule,
	updateJob,
} from "../../server/utils/backup";

describe("Cloud Schedule Job Registration & Error Propagation (#5139)", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = {
			...originalEnv,
			JOBS_URL: "https://jobs.example.com",
			API_KEY: "test-secret-key",
		};
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	it("should send correct payload and return response on successful schedule creation", async () => {
		const mockResponseData = { success: true, jobId: "job-123" };
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => mockResponseData,
		} as unknown as Response);

		const jobPayload = {
			scheduleId: "sched-123",
			type: "schedule" as const,
			cronSchedule: "*/5 * * * *",
			timezone: "UTC",
		};

		const result = await schedule(jobPayload);

		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(global.fetch).toHaveBeenCalledWith(
			"https://jobs.example.com/create-backup",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": "test-secret-key",
				},
				body: JSON.stringify(jobPayload),
			},
		);
		expect(result).toEqual(mockResponseData);
	});

	it("should throw a descriptive error when cloud schedule creation returns non-2xx status", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
			text: async () => "Scheduler worker unavailable",
		} as unknown as Response);

		const jobPayload = {
			scheduleId: "sched-500",
			type: "schedule" as const,
			cronSchedule: "* * * * *",
			timezone: "UTC",
		};

		await expect(schedule(jobPayload)).rejects.toThrow(
			"Failed to create schedule job: Internal Server Error Scheduler worker unavailable",
		);
	});

	it("should throw a descriptive error when updateJob returns non-2xx status", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			statusText: "Bad Request",
			text: async () => "Invalid cron expression",
		} as unknown as Response);

		const jobPayload = {
			scheduleId: "sched-400",
			type: "schedule" as const,
			cronSchedule: "invalid-cron",
			timezone: "UTC",
		};

		await expect(updateJob(jobPayload)).rejects.toThrow(
			"Failed to update schedule job: Bad Request Invalid cron expression",
		);
	});

	it("should throw a descriptive error when removeJob returns non-2xx status", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			statusText: "Not Found",
			text: async () => "Job not registered",
		} as unknown as Response);

		const jobPayload = {
			scheduleId: "sched-404",
			type: "schedule" as const,
			cronSchedule: "0 0 * * *",
			timezone: "UTC",
		};

		await expect(removeJob(jobPayload)).rejects.toThrow(
			"Failed to remove schedule job: Not Found Job not registered",
		);
	});

	it("should propagate network failure when fetch rejects", async () => {
		global.fetch = vi
			.fn()
			.mockRejectedValue(new Error("Network connection refused"));

		const jobPayload = {
			scheduleId: "sched-net-err",
			type: "schedule" as const,
			cronSchedule: "*/10 * * * *",
			timezone: "UTC",
		};

		await expect(schedule(jobPayload)).rejects.toThrow(
			"Network connection refused",
		);
	});

	describe("cancelJobs", () => {
		it("should remove all enabled backup jobs when in cloud mode", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({ success: true }),
			} as unknown as Response);

			const backups = [
				{ backupId: "b1", schedule: "0 0 * * *", enabled: true },
				{ backupId: "b2", schedule: "0 12 * * *", enabled: false },
				{ backupId: "b3", schedule: "0 6 * * *", enabled: true },
			];

			await cancelJobs(backups as any);

			// b1 and b3 are enabled, b2 is disabled
			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(global.fetch).toHaveBeenCalledWith(
				"https://jobs.example.com/remove-job",
				expect.objectContaining({
					body: JSON.stringify({
						cronSchedule: "0 0 * * *",
						backupId: "b1",
						type: "backup",
					}),
				}),
			);
			expect(global.fetch).toHaveBeenCalledWith(
				"https://jobs.example.com/remove-job",
				expect.objectContaining({
					body: JSON.stringify({
						cronSchedule: "0 6 * * *",
						backupId: "b3",
						type: "backup",
					}),
				}),
			);
		});
	});
});
