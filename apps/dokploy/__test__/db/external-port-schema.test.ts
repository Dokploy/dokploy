import {
	apiSaveExternalPortMariaDB,
	apiSaveExternalPortMongo,
	apiSaveExternalPortMySql,
	apiSaveExternalPortPostgres,
	apiSaveExternalPortRedis,
	apiUpdateMariaDB,
	apiUpdateMongo,
	apiUpdateMySql,
	apiUpdatePostgres,
	apiUpdateRedis,
} from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

const getExternalPort = (data: unknown): unknown =>
	(data as { externalPort?: unknown } | null)?.externalPort;

type SchemaCase = {
	name: string;
	schema: z.ZodTypeAny;
	updateSchema: z.ZodTypeAny;
	idField: string;
	idValue: string;
};

const cases: SchemaCase[] = [
	{
		name: "mariadb",
		schema: apiSaveExternalPortMariaDB,
		updateSchema: apiUpdateMariaDB,
		idField: "mariadbId",
		idValue: "mariadb-1",
	},
	{
		name: "mysql",
		schema: apiSaveExternalPortMySql,
		updateSchema: apiUpdateMySql,
		idField: "mysqlId",
		idValue: "mysql-1",
	},
	{
		name: "postgres",
		schema: apiSaveExternalPortPostgres,
		updateSchema: apiUpdatePostgres,
		idField: "postgresId",
		idValue: "postgres-1",
	},
	{
		name: "mongo",
		schema: apiSaveExternalPortMongo,
		updateSchema: apiUpdateMongo,
		idField: "mongoId",
		idValue: "mongo-1",
	},
	{
		name: "redis",
		schema: apiSaveExternalPortRedis,
		updateSchema: apiUpdateRedis,
		idField: "redisId",
		idValue: "redis-1",
	},
];

describe.each(cases)(
	"saveExternalPort schema for $name accepts null to revoke exposure",
	({ schema, updateSchema, idField, idValue }) => {
		it("accepts a valid published port number", () => {
			const result = schema.safeParse({
				[idField]: idValue,
				externalPort: 3306,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual({
					[idField]: idValue,
					externalPort: 3306,
				});
			}
		});

		it("accepts null and preserves it (clearing revokes external exposure)", () => {
			const result = schema.safeParse({
				[idField]: idValue,
				externalPort: null,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(getExternalPort(result.data)).toBeNull();
			}
		});

		it("rejects a string port (client must coerce before sending)", () => {
			const result = schema.safeParse({
				[idField]: idValue,
				externalPort: "3306",
			});
			expect(result.success).toBe(false);
		});

		it("rejects a missing/undefined port (field must be sent explicitly as null)", () => {
			const result = schema.safeParse({ [idField]: idValue });
			expect(result.success).toBe(false);
		});

		it("apiUpdate accepts input without externalPort (partial) (G6)", () => {
			const result = updateSchema.safeParse({ [idField]: idValue });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(getExternalPort(result.data)).toBeUndefined();
			}
		});

		it("apiUpdate accepts externalPort: null to clear via the update flow (G6)", () => {
			const result = updateSchema.safeParse({
				[idField]: idValue,
				externalPort: null,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(getExternalPort(result.data)).toBeNull();
			}
		});

		it("apiUpdate accepts a valid externalPort number (G6 no-regression)", () => {
			const result = updateSchema.safeParse({
				[idField]: idValue,
				externalPort: 5432,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(getExternalPort(result.data)).toBe(5432);
			}
		});
	},
);

describe("cross-DB lockstep: all 5 saveExternalPort schemas behave identically (H)", () => {
	it("all accept { externalPort: null } and parse to null", () => {
		for (const { schema, idField, idValue } of cases) {
			const result = schema.safeParse({
				[idField]: idValue,
				externalPort: null,
			});
			expect(result.success, `${idField} null`).toBe(true);
			if (result.success) {
				expect(
					getExternalPort(result.data),
					`${idField} null value`,
				).toBeNull();
			}
		}
	});

	it("all accept { externalPort: 5432 } and parse to 5432", () => {
		for (const { schema, idField, idValue } of cases) {
			const result = schema.safeParse({
				[idField]: idValue,
				externalPort: 5432,
			});
			expect(result.success, `${idField} 5432`).toBe(true);
			if (result.success) {
				expect(getExternalPort(result.data), `${idField} 5432 value`).toBe(
					5432,
				);
			}
		}
	});
});
