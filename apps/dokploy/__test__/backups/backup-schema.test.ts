import { apiCreateBackup, apiUpdateBackup } from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

const metadata = (databasePort: number) => ({
	postgres: {
		databaseUser: "postgres",
		databasePort,
	},
});

describe("PostgreSQL backup port validation", () => {
	it.each([1, 5432, 65535])("accepts port %s on create", (databasePort) => {
		const result = apiCreateBackup.safeParse({
			schedule: "0 0 * * *",
			prefix: "/",
			destinationId: "destination-id",
			database: "app",
			databaseType: "postgres",
			backupType: "compose",
			composeId: "compose-id",
			serviceName: "postgres",
			metadata: metadata(databasePort),
		});

		expect(result.success).toBe(true);
	});

	it.each([0, 65536, 5432.5])("rejects port %s on create", (databasePort) => {
		const result = apiCreateBackup.safeParse({
			schedule: "0 0 * * *",
			prefix: "/",
			destinationId: "destination-id",
			database: "app",
			databaseType: "postgres",
			backupType: "compose",
			composeId: "compose-id",
			serviceName: "postgres",
			metadata: metadata(databasePort),
		});

		expect(result.success).toBe(false);
	});

	it("accepts null metadata on create", () => {
		const result = apiCreateBackup.safeParse({
			schedule: "0 0 * * *",
			prefix: "/",
			destinationId: "destination-id",
			database: "app",
			databaseType: "postgres",
			backupType: "database",
			postgresId: "postgres-id",
			metadata: null,
		});

		expect(result.success).toBe(true);
	});

	it("accepts a valid port on update", () => {
		const result = apiUpdateBackup.safeParse({
			backupId: "backup-id",
			schedule: "0 0 * * *",
			enabled: true,
			prefix: "/",
			destinationId: "destination-id",
			database: "app",
			keepLatestCount: 5,
			serviceName: "postgres",
			databaseType: "postgres",
			metadata: metadata(5432),
		});

		expect(result.success).toBe(true);
	});

	it("rejects an invalid port on update", () => {
		const result = apiUpdateBackup.safeParse({
			backupId: "backup-id",
			schedule: "0 0 * * *",
			enabled: true,
			prefix: "/",
			destinationId: "destination-id",
			database: "app",
			keepLatestCount: 5,
			serviceName: "postgres",
			databaseType: "postgres",
			metadata: metadata(0),
		});

		expect(result.success).toBe(false);
	});

	it("accepts null metadata on update", () => {
		const result = apiUpdateBackup.safeParse({
			backupId: "backup-id",
			schedule: "0 0 * * *",
			enabled: true,
			prefix: "/",
			destinationId: "destination-id",
			database: "app",
			keepLatestCount: 5,
			serviceName: "postgres",
			databaseType: "postgres",
			metadata: null,
		});

		expect(result.success).toBe(true);
	});
});
