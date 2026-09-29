import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const JOBS_URL = "http://schedule-service:3000";
const API_KEY = "test-api-key";

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn());
	vi.stubEnv("JOBS_URL", JOBS_URL);
	vi.stubEnv("API_KEY", API_KEY);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.resetModules();
});

const scheduleJob = {
	type: "schedule" as const,
	scheduleId: "sched_abc123",
	cronSchedule: "0 */6 * * *",
	timezone: "UTC",
};

describe("schedule() — POST /create-backup", () => {
	test("sends correct request to jobs service", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ message: "created" }),
		});
		vi.stubGlobal("fetch", mockFetch);

		const { schedule } = await import("@/server/utils/backup");
		await schedule(scheduleJob);

		expect(mockFetch).toHaveBeenCalledWith(
			`${JOBS_URL}/create-backup`,
			expect.objectContaining({
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": API_KEY,
				},
				body: JSON.stringify(scheduleJob),
			}),
		);
	});

	test("throws on non-2xx response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				text: () => Promise.resolve("Internal Server Error"),
			}),
		);

		const { schedule } = await import("@/server/utils/backup");
		await expect(schedule(scheduleJob)).rejects.toThrow(
			/Failed to register schedule job: 500/,
		);
	});

	test("throws on network failure", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
		);

		const { schedule } = await import("@/server/utils/backup");
		await expect(schedule(scheduleJob)).rejects.toThrow("ECONNREFUSED");
	});
});

describe("removeJob() — POST /remove-job", () => {
	test("sends correct request to jobs service", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ message: "removed" }),
		});
		vi.stubGlobal("fetch", mockFetch);

		const { removeJob } = await import("@/server/utils/backup");
		await removeJob(scheduleJob);

		expect(mockFetch).toHaveBeenCalledWith(
			`${JOBS_URL}/remove-job`,
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify(scheduleJob),
			}),
		);
	});

	test("throws on non-2xx response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 403,
				text: () => Promise.resolve("Invalid API Key"),
			}),
		);

		const { removeJob } = await import("@/server/utils/backup");
		await expect(removeJob(scheduleJob)).rejects.toThrow(
			/Failed to remove schedule job: 403/,
		);
	});

	test("throws on network failure", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
		);

		const { removeJob } = await import("@/server/utils/backup");
		await expect(removeJob(scheduleJob)).rejects.toThrow("ECONNREFUSED");
	});
});

describe("updateJob() — POST /update-backup", () => {
	test("sends correct request to jobs service", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ message: "updated" }),
		});
		vi.stubGlobal("fetch", mockFetch);

		const { updateJob } = await import("@/server/utils/backup");
		await updateJob(scheduleJob);

		expect(mockFetch).toHaveBeenCalledWith(
			`${JOBS_URL}/update-backup`,
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify(scheduleJob),
			}),
		);
	});

	test("throws on non-2xx response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 422,
				text: () => Promise.resolve("Validation failed"),
			}),
		);

		const { updateJob } = await import("@/server/utils/backup");
		await expect(updateJob(scheduleJob)).rejects.toThrow(
			/Failed to update schedule job: 422/,
		);
	});

	test("throws on network failure", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
		);

		const { updateJob } = await import("@/server/utils/backup");
		await expect(updateJob(scheduleJob)).rejects.toThrow("ECONNREFUSED");
	});

	test("handles error when response body cannot be read", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 502,
				text: () => Promise.reject(new Error("body stream error")),
			}),
		);

		const { schedule } = await import("@/server/utils/backup");
		await expect(schedule(scheduleJob)).rejects.toThrow(
			/Failed to register schedule job: 502/,
		);
	});
});
