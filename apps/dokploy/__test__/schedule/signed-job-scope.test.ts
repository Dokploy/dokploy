import type { SignedScheduledQueueJob } from "@dokploy/server/utils/schedules/signed-job";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findBackupById: vi.fn(),
	findScheduleById: vi.fn(),
	findServerById: vi.fn(),
	findVolumeBackupById: vi.fn(),
	isBackupScheduleTargetBound: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	CLEANUP_CRON_JOB: "0 0 * * *",
}));

vi.mock("@dokploy/server/services/backup", () => ({
	findBackupById: mocks.findBackupById,
}));

vi.mock("@dokploy/server/services/schedule", () => ({
	findScheduleById: mocks.findScheduleById,
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));

vi.mock("@dokploy/server/services/volume-backups", () => ({
	findVolumeBackupById: mocks.findVolumeBackupById,
}));

vi.mock("@dokploy/server/utils/backups", () => ({
	isBackupScheduleTargetBound: mocks.isBackupScheduleTargetBound,
}));

const { assertSignedScheduledQueueJob, signScheduledQueueJob } = await import(
	"@dokploy/server/utils/schedules/signed-job"
);

describe("signed scheduled job scope", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("API_KEY", "global-api-key");
		vi.stubEnv("SCHEDULES_SIGNING_KEY", "schedule-signing-key");
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-1",
			serverStatus: "active",
		});
		mocks.isBackupScheduleTargetBound.mockReturnValue(true);
	});

	it("signs and verifies scoped server cleanup jobs", async () => {
		const job = {
			type: "server" as const,
			serverId: "server-1",
			cronSchedule: "0 0 * * *",
		};

		const signed = await signScheduledQueueJob(job, {
			operation: "create",
			now: 1000,
			ttlMs: 60_000,
		});

		expect(signed.scope).toMatchObject({
			type: "server",
			objectId: "server-1",
			serverId: "server-1",
			organizationId: "org-1",
			timezone: null,
			expiresAt: 61_000,
		});
		await expect(
			assertSignedScheduledQueueJob(signed, {
				operation: "create",
				now: 2000,
			}),
		).resolves.toEqual(job);
	});

	it("rejects jobs when the scoped object id is tampered", async () => {
		const signed = await signScheduledQueueJob(
			{
				type: "server",
				serverId: "server-1",
				cronSchedule: "0 0 * * *",
			},
			{ operation: "create", now: 1000 },
		);

		await expect(
			assertSignedScheduledQueueJob(
				{
					type: "server",
					cronSchedule: signed.cronSchedule,
					serverId: "server-2",
					scope: signed.scope,
					signature: signed.signature,
				},
				{ operation: "create", now: 2000 },
			),
		).rejects.toThrow(/object id/i);
	});

	it("rejects schedule jobs when timezone is tampered", async () => {
		mocks.findScheduleById.mockResolvedValue({
			scheduleId: "schedule-1",
			cronExpression: "0 0 * * *",
			enabled: true,
			timezone: "UTC",
			organizationId: "org-1",
			application: {
				serverId: "server-1",
			},
		});
		const signed = await signScheduledQueueJob(
			{
				type: "schedule",
				scheduleId: "schedule-1",
				cronSchedule: "0 0 * * *",
				timezone: "UTC",
			},
			{ operation: "create", now: 1000 },
		);

		expect(signed.scope).toMatchObject({
			timezone: "UTC",
		});

		const tamperedJob: Extract<SignedScheduledQueueJob, { type: "schedule" }> =
			{
				...(signed as Extract<SignedScheduledQueueJob, { type: "schedule" }>),
				timezone: "Europe/Moscow",
			};

		await expect(
			assertSignedScheduledQueueJob(tamperedJob, {
				operation: "create",
				now: 2000,
			}),
		).rejects.toThrow(/timezone/i);
	});

	it("derives a legacy schedule signing key from API_KEY when the explicit key is missing", async () => {
		vi.stubEnv("SCHEDULES_SIGNING_KEY", "");

		const job = {
			type: "server" as const,
			serverId: "server-1",
			cronSchedule: "0 0 * * *",
		};
		const signed = await signScheduledQueueJob(job, {
			operation: "create",
			now: 1000,
		});

		await expect(
			assertSignedScheduledQueueJob(signed, {
				operation: "create",
				now: 2000,
			}),
		).resolves.toEqual(job);
	});

	it("fails closed without explicit or legacy schedule signing material", async () => {
		vi.stubEnv("SCHEDULES_SIGNING_KEY", "");
		vi.stubEnv("API_KEY", "");

		await expect(
			signScheduledQueueJob(
				{
					type: "server",
					serverId: "server-1",
					cronSchedule: "0 0 * * *",
				},
				{ operation: "create" },
			),
		).rejects.toThrow(/set SCHEDULES_SIGNING_KEY or API_KEY/i);
	});

	it("rejects an explicit schedule signing key that matches API_KEY", async () => {
		vi.stubEnv("SCHEDULES_SIGNING_KEY", "global-api-key");
		await expect(
			signScheduledQueueJob(
				{
					type: "server",
					serverId: "server-1",
					cronSchedule: "0 0 * * *",
				},
				{ operation: "create" },
			),
		).rejects.toThrow(/must differ from the API key/i);
	});

	it("rejects expired scoped claims", async () => {
		const signed = await signScheduledQueueJob(
			{
				type: "server",
				serverId: "server-1",
				cronSchedule: "0 0 * * *",
			},
			{ operation: "create", now: 1000, ttlMs: 1000 },
		);

		await expect(
			assertSignedScheduledQueueJob(signed, {
				operation: "create",
				now: 3000,
				requireFreshScope: false,
			}),
		).rejects.toThrow(/expired/i);
	});

	it("rejects signed jobs reused for a different operation", async () => {
		const signed = await signScheduledQueueJob(
			{
				type: "server",
				serverId: "server-1",
				cronSchedule: "0 0 * * *",
			},
			{ operation: "create", now: 1000 },
		);

		await expect(
			assertSignedScheduledQueueJob(signed, {
				operation: "remove",
				now: 2000,
				requireFreshScope: false,
			}),
		).rejects.toThrow(/operation/i);
	});

	it("rejects jobs when the current database scope changed", async () => {
		const signed = await signScheduledQueueJob(
			{
				type: "server",
				serverId: "server-1",
				cronSchedule: "0 0 * * *",
			},
			{ operation: "create", now: 1000 },
		);
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-2",
			serverStatus: "active",
		});

		await expect(
			assertSignedScheduledQueueJob(signed, {
				operation: "create",
				now: 2000,
			}),
		).rejects.toThrow(/organization scope/i);
	});

	it("allows remove signatures for inactive servers when active server status is not required", async () => {
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-1",
			serverStatus: "inactive",
		});
		const job = {
			type: "server" as const,
			serverId: "server-1",
			cronSchedule: "0 0 * * *",
		};

		await expect(
			signScheduledQueueJob(job, { operation: "remove" }),
		).rejects.toThrow(/inactive/i);
		await expect(
			signScheduledQueueJob(job, {
				operation: "remove",
				requireActiveServer: false,
			}),
		).resolves.toMatchObject({
			type: "server",
			serverId: "server-1",
			scope: {
				serverId: "server-1",
				organizationId: "org-1",
			},
		});
	});

	it("verifies remove jobs by signed scope without a fresh database lookup", async () => {
		const signed = await signScheduledQueueJob(
			{
				type: "server",
				serverId: "server-1",
				cronSchedule: "0 0 * * *",
			},
			{ operation: "remove", now: 1000 },
		);
		mocks.findServerById.mockRejectedValue(new Error("should not look up"));

		await expect(
			assertSignedScheduledQueueJob(signed, {
				operation: "remove",
				now: 2000,
				requireFreshScope: false,
			}),
		).resolves.toEqual({
			type: "server",
			serverId: "server-1",
			cronSchedule: "0 0 * * *",
		});
	});
});
