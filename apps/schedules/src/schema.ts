import { z } from "zod";

export const jobQueueSchema = z.discriminatedUnion("type", [
	z.object({
		cronSchedule: z.string(),
		type: z.literal("backup"),
		backupId: z.string(),
	}),
	z.object({
		cronSchedule: z.string(),
		type: z.literal("server"),
		serverId: z.string(),
	}),
	z.object({
		cronSchedule: z.string(),
		type: z.literal("schedule"),
		scheduleId: z.string(),
	}),
	z.object({
		cronSchedule: z.string(),
		type: z.literal("volume-backup"),
		volumeBackupId: z.string(),
	}),
]);

export type QueueJob = z.infer<typeof jobQueueSchema>;
