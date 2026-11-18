import { apiUpdateApplication } from "@dokploy/server/db/schema/application";
import { apiUpdateMariaDB } from "@dokploy/server/db/schema/mariadb";
import { apiUpdateMongo } from "@dokploy/server/db/schema/mongo";
import { apiUpdateMySql } from "@dokploy/server/db/schema/mysql";
import { apiUpdatePostgres } from "@dokploy/server/db/schema/postgres";
import { apiUpdateRedis } from "@dokploy/server/db/schema/redis";
import { describe, expect, it } from "vitest";

const updateSchemas = [
	["application", apiUpdateApplication, "applicationId"],
	["mariadb", apiUpdateMariaDB, "mariadbId"],
	["mongo", apiUpdateMongo, "mongoId"],
	["mysql", apiUpdateMySql, "mysqlId"],
	["postgres", apiUpdatePostgres, "postgresId"],
	["redis", apiUpdateRedis, "redisId"],
] as const;

describe("shmSize validation", () => {
	it.each(updateSchemas)(
		"accepts a positive integer string for %s",
		(_service, schema, idField) => {
			expect(
				schema.safeParse({ [idField]: "service-id", shmSize: "6442450944" })
					.success,
			).toBe(true);
		},
	);

	it.each(updateSchemas)(
		"accepts null to clear shmSize for %s",
		(_service, schema, idField) => {
			expect(
				schema.safeParse({ [idField]: "service-id", shmSize: null }).success,
			).toBe(true);
		},
	);

	it.each(updateSchemas)(
		"rejects invalid shmSize values for %s",
		(_service, schema, idField) => {
			for (const shmSize of ["", "0", "-1", "1.5", "12bytes", " 12"])
				expect(
					schema.safeParse({ [idField]: "service-id", shmSize }).success,
				).toBe(false);
		},
	);
});
