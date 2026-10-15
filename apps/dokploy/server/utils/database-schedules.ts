import { IS_CLOUD, removeScheduleJob } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	type DatabaseScheduleType,
	databaseScheduleIdColumns,
	schedules,
} from "@dokploy/server/db/schema/schedule";
import type { findProjectById } from "@dokploy/server/services/project";
import { eq } from "drizzle-orm";
import { removeJob } from "@/server/utils/backup";

/** Unregister repeatable jobs before their database rows cascade-delete. */
export const cancelDatabaseScheduleJobs = async (
	databaseType: DatabaseScheduleType,
	databaseId: string,
) => {
	const jobs = await db.query.schedules.findMany({
		where: eq(schedules[databaseScheduleIdColumns[databaseType]], databaseId),
		columns: {
			scheduleId: true,
			cronExpression: true,
			timezone: true,
		},
	});

	// Include disabled jobs in case an earlier disable failed to unregister one.
	for (const job of jobs) {
		if (IS_CLOUD) {
			const response: unknown = await removeJob({
				type: "schedule",
				scheduleId: job.scheduleId,
				cronSchedule: job.cronExpression,
				timezone: job.timezone,
			});
			// The shared HTTP client resolves JSON even for error status codes.
			// Require the worker's acknowledgement before cascading away the job.
			if (
				typeof response !== "object" ||
				response === null ||
				!("result" in response) ||
				typeof response.result !== "boolean"
			) {
				throw new Error(
					`Cloud scheduler did not confirm removal of database schedule ${job.scheduleId}`,
				);
			}
		} else {
			removeScheduleJob(job.scheduleId);
		}
	}
};

/** Project deletion also cascades through all of its database schedules. */
export const cancelProjectDatabaseScheduleJobs = async (
	environments: Awaited<ReturnType<typeof findProjectById>>["environments"],
) => {
	for (const environment of environments) {
		for (const database of environment.postgres) {
			await cancelDatabaseScheduleJobs("postgres", database.postgresId);
		}
		for (const database of environment.mysql) {
			await cancelDatabaseScheduleJobs("mysql", database.mysqlId);
		}
		for (const database of environment.mariadb) {
			await cancelDatabaseScheduleJobs("mariadb", database.mariadbId);
		}
		for (const database of environment.mongo) {
			await cancelDatabaseScheduleJobs("mongo", database.mongoId);
		}
		for (const database of environment.redis) {
			await cancelDatabaseScheduleJobs("redis", database.redisId);
		}
		for (const database of environment.libsql) {
			await cancelDatabaseScheduleJobs("libsql", database.libsqlId);
		}
	}
};
