import {
	apiUpdateApplication,
	apiUpdateLibsql,
	apiUpdateMariaDB,
	apiUpdateMongo,
	apiUpdateMySql,
	apiUpdatePostgres,
	apiUpdateRedis,
} from "@dokploy/server/db/schema";
import {
	resourceBytesSchema,
	resourceNanoCpusSchema,
} from "@dokploy/server/db/schema/shared";
import { calculateResources } from "@dokploy/server/utils/docker/utils";
import { describe, expect, it } from "vitest";

const messagesOf = (result: { success: boolean; error?: unknown }) =>
	result.success
		? []
		: (result.error as { issues: { message: string }[] }).issues.map(
				(issue) => issue.message,
			);

describe("resourceBytesSchema", () => {
	it.each([undefined, null, "", "0", "00", "6291456", "1879048192"])(
		"accepts %j",
		(value) => {
			expect(resourceBytesSchema.safeParse(value).success).toBe(true);
		},
	);

	it.each(["1792MB", "1.5", "2e9", "-1", " 1073741824", "1GB"])(
		"refuses %j as not a whole number of bytes",
		(value) => {
			expect(messagesOf(resourceBytesSchema.safeParse(value))).toEqual([
				"Must be a whole number of bytes",
			]);
		},
	);

	it.each(["1792", "6291455"])("refuses %j as below 6 MiB", (value) => {
		expect(messagesOf(resourceBytesSchema.safeParse(value))).toEqual([
			"Must be at least 6291456 bytes",
		]);
	});
});

describe("resourceNanoCpusSchema", () => {
	it.each([undefined, null, "", "0", "00", "1000000", "1500000000"])(
		"accepts %j",
		(value) => {
			expect(resourceNanoCpusSchema.safeParse(value).success).toBe(true);
		},
	);

	it.each(["1.5", "2e9", "1792MB", "-1"])(
		"refuses %j as not a whole number of nanoCPUs",
		(value) => {
			expect(messagesOf(resourceNanoCpusSchema.safeParse(value))).toEqual([
				"Must be a whole number of nanoCPUs (1000000000 = 1 CPU)",
			]);
		},
	);

	it.each(["1", "999999"])("refuses %j as below 0.001 CPU", (value) => {
		expect(messagesOf(resourceNanoCpusSchema.safeParse(value))).toEqual([
			"Must be at least 1000000 nanoCPUs (1000000000 = 1 CPU)",
		]);
	});
});

describe("update schemas validate resource values", () => {
	it.each([
		["application", apiUpdateApplication, { applicationId: "id" }],
		["libsql", apiUpdateLibsql, { libsqlId: "id" }],
		["mariadb", apiUpdateMariaDB, { mariadbId: "id" }],
		["mongo", apiUpdateMongo, { mongoId: "id" }],
		["mysql", apiUpdateMySql, { mysqlId: "id" }],
		["postgres", apiUpdatePostgres, { postgresId: "id" }],
		["redis", apiUpdateRedis, { redisId: "id" }],
	] as const)("%s", (_, schema, ids) => {
		const parse = (input: Record<string, unknown>) =>
			schema.safeParse({ ...ids, ...input }).success;

		expect(parse({ memoryLimit: "1792MB" })).toBe(false);
		expect(parse({ memoryReservation: "1792MB" })).toBe(false);
		expect(parse({ cpuLimit: "1.5" })).toBe(false);
		expect(parse({ cpuReservation: "1.5" })).toBe(false);

		expect(
			parse({
				memoryLimit: "1879048192",
				memoryReservation: "268435456",
				cpuLimit: "1500000000",
				cpuReservation: "250000000",
			}),
		).toBe(true);
		expect(
			parse({
				memoryLimit: null,
				memoryReservation: null,
				cpuLimit: null,
				cpuReservation: null,
			}),
		).toBe(true);
		expect(parse({})).toBe(true);
	});

	it("reports the field and unit for the application", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId: "id",
			memoryLimit: "1792MB",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toMatchObject([
				{
					path: ["memoryLimit"],
					message: "Must be a whole number of bytes",
				},
			]);
		}
	});
});

describe("calculateResources", () => {
	it("leaves empty values unset", () => {
		expect(
			calculateResources({
				memoryLimit: null,
				memoryReservation: "",
				cpuLimit: null,
				cpuReservation: "",
			}),
		).toEqual({
			Limits: { MemoryBytes: undefined, NanoCPUs: undefined },
			Reservations: { MemoryBytes: undefined, NanoCPUs: undefined },
		});
	});

	it("converts digit strings to numbers", () => {
		expect(
			calculateResources({
				memoryLimit: "1879048192",
				memoryReservation: "268435456",
				cpuLimit: "1500000000",
				cpuReservation: "250000000",
			}),
		).toEqual({
			Limits: { MemoryBytes: 1879048192, NanoCPUs: 1500000000 },
			Reservations: { MemoryBytes: 268435456, NanoCPUs: 250000000 },
		});
	});
});
