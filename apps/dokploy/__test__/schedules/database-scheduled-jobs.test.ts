import {
	createScheduleSchema,
	databaseScheduleIdColumns,
	databaseScheduleTypes,
	getDatabaseScheduleId,
	isDatabaseScheduleType,
	isValidDatabaseScheduleTarget,
} from "@dokploy/server/db/schema/schedule";
import { describe, expect, it } from "vitest";

describe("database scheduled job targets", () => {
	it.each(databaseScheduleTypes)(
		"recognises %s and its unique database foreign key",
		(databaseType) => {
			const column = databaseScheduleIdColumns[databaseType];
			const target = { scheduleType: databaseType, [column]: "db-123" };
			expect(isDatabaseScheduleType(databaseType)).toBe(true);
			expect(isValidDatabaseScheduleTarget(target)).toBe(true);
			expect(getDatabaseScheduleId(target)).toBe("db-123");
			expect(
				createScheduleSchema.safeParse({
					name: "Refresh data",
					cronExpression: "0 0 * * *",
					command: "echo hello",
					...target,
				}).success,
			).toBe(true);
		},
	);

	it.each(databaseScheduleTypes)(
		"rejects missing, mixed and wrong database targets for %s",
		(databaseType) => {
			const column = databaseScheduleIdColumns[databaseType];
			const otherType = databaseScheduleTypes.find(
				(type) => type !== databaseType,
			);
			expect(otherType).toBeDefined();
			const otherColumn = databaseScheduleIdColumns[otherType!];
			expect(
				isValidDatabaseScheduleTarget({ scheduleType: databaseType }),
			).toBe(false);
			expect(
				isValidDatabaseScheduleTarget({
					scheduleType: databaseType,
					[otherColumn]: "different-db",
				}),
			).toBe(false);
			expect(
				isValidDatabaseScheduleTarget({
					scheduleType: databaseType,
					[column]: "db-123",
					[otherColumn]: "different-db",
				}),
			).toBe(false);
			for (const otherTarget of [
				{ applicationId: "app-123" },
				{ composeId: "compose-123" },
				{ serverId: "server-123" },
				{ organizationId: "org-123" },
			]) {
				expect(
					isValidDatabaseScheduleTarget({
						scheduleType: databaseType,
						[column]: "db-123",
						...otherTarget,
					}),
				).toBe(false);
			}
		},
	);

	it.each(["application", "compose", "server", "dokploy-server"] as const)(
		"does not permit database foreign keys on %s schedules",
		(scheduleType) => {
			expect(isDatabaseScheduleType(scheduleType)).toBe(false);
			expect(isValidDatabaseScheduleTarget({ scheduleType })).toBe(true);
			for (const column of Object.values(databaseScheduleIdColumns)) {
				expect(
					isValidDatabaseScheduleTarget({ scheduleType, [column]: "db-123" }),
				).toBe(false);
			}
			expect(
				getDatabaseScheduleId({ scheduleType, postgresId: "db-123" }),
			).toBeNull();
		},
	);
});
