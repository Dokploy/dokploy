import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit coverage for cancelJobs (apps/dokploy/server/utils/backup.ts), the
// helper invoked by every database-service `remove` mutation to tear down the
// orphaned scheduled backup jobs. It had no tests; the libsql `remove`
// mutation now relies on it, so its cloud/non-cloud behavior is locked down
// here.

const state = vi.hoisted(() => ({ cloudFlag: false }));
const mockRemoveScheduleBackup = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/index", () => ({
	get IS_CLOUD() {
		return state.cloudFlag;
	},
	removeScheduleBackup: mockRemoveScheduleBackup,
}));

import { cancelJobs } from "@/server/utils/backup";

const backup = (overrides: Record<string, unknown> = {}) => ({
	backupId: "b-1",
	enabled: true,
	schedule: "*/5 * * * *",
	...overrides,
});

beforeEach(() => {
	mockRemoveScheduleBackup.mockReset();
	mockFetch.mockReset();
	mockFetch.mockResolvedValue({ json: async () => ({ ok: true }) } as never);
	vi.stubGlobal("fetch", mockFetch);
	state.cloudFlag = false;
});

describe("cancelJobs", () => {
	it("non-cloud: cancels each enabled backup's in-process schedule", async () => {
		state.cloudFlag = false;
		await cancelJobs([
			backup({ backupId: "b-1" }),
			backup({ backupId: "b-2", enabled: false }),
			backup({ backupId: "b-3" }),
		] as never);

		expect(mockRemoveScheduleBackup).toHaveBeenCalledWith("b-1");
		expect(mockRemoveScheduleBackup).toHaveBeenCalledWith("b-3");
		expect(mockRemoveScheduleBackup).not.toHaveBeenCalledWith("b-2");
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("cloud: removes each enabled backup's repeatable job via the schedules API", async () => {
		state.cloudFlag = true;
		await cancelJobs([
			backup({ backupId: "b-1" }),
			backup({ backupId: "b-2", enabled: false }),
		] as never);

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, init] = mockFetch.mock.calls[0] ?? [];
		expect(url).toContain("/remove-job");
		expect(init).toBeDefined();
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body).toEqual({
			type: "backup",
			cronSchedule: "*/5 * * * *",
			backupId: "b-1",
		});
		expect(mockRemoveScheduleBackup).not.toHaveBeenCalled();
	});

	it("skips disabled backups entirely", async () => {
		state.cloudFlag = true;
		await cancelJobs([backup({ backupId: "b-1", enabled: false })] as never);

		expect(mockFetch).not.toHaveBeenCalled();
		expect(mockRemoveScheduleBackup).not.toHaveBeenCalled();
	});

	it("is a no-op for an empty backup list", async () => {
		state.cloudFlag = true;
		await cancelJobs([] as never);

		expect(mockFetch).not.toHaveBeenCalled();
		expect(mockRemoveScheduleBackup).not.toHaveBeenCalled();
	});

	it("cancels every enabled backup in the list, not just the first", async () => {
		state.cloudFlag = false;
		await cancelJobs([
			backup({ backupId: "b-1" }),
			backup({ backupId: "b-2", enabled: false }),
			backup({ backupId: "b-3" }),
			backup({ backupId: "b-4" }),
		] as never);

		expect(mockRemoveScheduleBackup).toHaveBeenCalledTimes(3);
		expect(mockRemoveScheduleBackup).toHaveBeenCalledWith("b-1");
		expect(mockRemoveScheduleBackup).toHaveBeenCalledWith("b-3");
		expect(mockRemoveScheduleBackup).toHaveBeenCalledWith("b-4");
	});
});
