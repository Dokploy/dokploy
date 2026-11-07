import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	cleanQueue,
	getJobRepeatable,
	removeJob,
	scheduleJob,
} from "../../../schedules/src/queue";

const { FakeQueue } = vi.hoisted(() => {
	type RepeatOptions = { pattern?: string; tz?: string };

	const keyOf = (name: string, repeat: RepeatOptions) =>
		`${name}:::${repeat.tz ?? ""}:${repeat.pattern ?? ""}`;

	class FakeQueue {
		private repeatables = new Map<
			string,
			{
				key: string;
				name: string;
				pattern: string | null;
				tz: string | null;
				endDate: number | null;
			}
		>();

		async add(
			name: string,
			_data: unknown,
			options: { repeat: RepeatOptions },
		) {
			const key = keyOf(name, options.repeat);
			this.repeatables.set(key, {
				key,
				name,
				pattern: options.repeat.pattern ?? null,
				tz: options.repeat.tz ?? null,
				endDate: null,
			});
		}

		async getRepeatableJobs() {
			return [...this.repeatables.values()];
		}

		async removeRepeatable(name: string, repeat: RepeatOptions) {
			return this.repeatables.delete(keyOf(name, repeat));
		}

		async obliterate() {
			this.repeatables.clear();
		}
	}

	return { FakeQueue };
});

vi.mock("bullmq", () => ({ Queue: FakeQueue }));
vi.mock("../../../schedules/src/logger.js", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe("removeJob", () => {
	beforeEach(async () => {
		await cleanQueue();
	});

	it("removes the repeatable when the caller still knows the live cron", async () => {
		const job = {
			type: "volume-backup",
			volumeBackupId: "volume-backup-1",
			cronSchedule: "0 3 * * *",
		} as const;
		await scheduleJob(job);

		const result = await removeJob(job);

		expect(result).toBe(true);
		expect(await getJobRepeatable(job)).toBeNull();
	});

	it("removes the repeatable when the stored cron drifted from the live one", async () => {
		await scheduleJob({
			type: "volume-backup",
			volumeBackupId: "volume-backup-1",
			cronSchedule: "0 3 * * *",
		});

		const staleJob = {
			type: "volume-backup",
			volumeBackupId: "volume-backup-1",
			cronSchedule: "0 4 * * *",
		} as const;
		const result = await removeJob(staleJob);

		expect(result).toBe(true);
		expect(await getJobRepeatable(staleJob)).toBeNull();
	});

	it("removes a schedule whose timezone also drifted", async () => {
		await scheduleJob({
			type: "schedule",
			scheduleId: "schedule-1",
			cronSchedule: "0 1 * * *",
			timezone: "Europe/Paris",
		});

		const staleJob = {
			type: "schedule",
			scheduleId: "schedule-1",
			cronSchedule: "30 2 * * *",
			timezone: "America/New_York",
		} as const;
		const result = await removeJob(staleJob);

		expect(result).toBe(true);
		expect(await getJobRepeatable(staleJob)).toBeNull();
	});

	it("removes the server cleanup job with a drifted cron", async () => {
		await scheduleJob({
			type: "server",
			serverId: "server-1",
			cronSchedule: "0 0 * * *",
		});

		const staleJob = {
			type: "server",
			serverId: "server-1",
			cronSchedule: "0 6 * * *",
		} as const;
		const result = await removeJob(staleJob);

		expect(result).toBe(true);
		expect(await getJobRepeatable(staleJob)).toBeNull();
	});

	it("leaves the repeatables of the other jobs untouched", async () => {
		await scheduleJob({
			type: "backup",
			backupId: "backup-1",
			cronSchedule: "0 3 * * *",
		});
		const otherJob = {
			type: "backup",
			backupId: "backup-2",
			cronSchedule: "0 4 * * *",
		} as const;
		await scheduleJob(otherJob);

		await removeJob({
			type: "backup",
			backupId: "backup-1",
			cronSchedule: "0 9 * * *",
		});

		expect(await getJobRepeatable(otherJob)).toMatchObject({
			name: "backup-2",
			pattern: "0 4 * * *",
		});
	});

	it("returns false when there is no repeatable left to remove", async () => {
		const result = await removeJob({
			type: "backup",
			backupId: "backup-1",
			cronSchedule: "0 3 * * *",
		});

		expect(result).toBe(false);
	});
});
