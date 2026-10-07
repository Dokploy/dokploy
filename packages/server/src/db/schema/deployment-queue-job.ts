import {
	bigserial,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

/**
 * Durable journal of the in-memory deployment queue.
 *
 * The queue itself (apps/dokploy/server/queues/in-memory-queue.ts) stays the
 * executor, but it lives in process memory, so every restart of the Dokploy
 * service used to drop every waiting job. Each enqueued job is therefore also
 * written here; the row is flipped to `active` when the worker picks the job
 * up and deleted when it completes, fails or is cancelled. On boot the rows
 * that are left are the jobs the previous process never finished, and they are
 * re-enqueued.
 *
 * - `jobId`: journal id, generated when the job is enqueued (the queue's own
 *   `job-N` ids restart from 1 on every boot, so they cannot be the key).
 * - `seq`: monotonic insertion order, used to replay in the original order
 *   (`enqueuedAt` alone can tie at millisecond resolution).
 * - `payload`: the `DeploymentJob` exactly as it was handed to the queue.
 * - `state`: `waiting` | `active`.
 * - `attempts`: how many times the job was found `active` after a crash and
 *   replayed. A job that keeps killing the process is dropped after a few
 *   attempts instead of crash-looping the instance.
 */
export const deploymentQueueJobs = pgTable("deployment_queue_job", {
	jobId: text("jobId").primaryKey().notNull(),
	seq: bigserial("seq", { mode: "number" }).notNull(),
	payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
	state: text("state").notNull().default("waiting"),
	attempts: integer("attempts").notNull().default(0),
	enqueuedAt: timestamp("enqueuedAt").notNull().defaultNow(),
	startedAt: timestamp("startedAt"),
});

export type DeploymentQueueJobRow = typeof deploymentQueueJobs.$inferSelect;
