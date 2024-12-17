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
]);

export type QueueJob = z.infer<typeof jobQueueSchema>;
