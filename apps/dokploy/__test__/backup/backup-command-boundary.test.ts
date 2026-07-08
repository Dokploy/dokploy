import { isBackupScheduleTargetBound } from "@dokploy/server/utils/backups/invariant";
import {
	getComposeContainerCommand,
	getLibsqlBackupCommand,
	getMariadbBackupCommand,
	getMongoBackupCommand,
	getMysqlBackupCommand,
	getPostgresBackupCommand,
	getServiceContainerCommand,
	shouldRunBackupRetention,
} from "@dokploy/server/utils/backups/utils";
import { parse } from "shell-quote";
import { describe, expect, it } from "vitest";
import {
	apiCreateBackup,
	apiRestoreBackup,
	apiUpdateBackup,
} from "@/server/db/schema";

const safeCreateBackupInput = {
	backupType: "database" as const,
	database: "appdb",
	databaseType: "postgres" as const,
	destinationId: "destination-1",
	enabled: false,
	keepLatestCount: 3,
	metadata: {},
	postgresId: "postgres-1",
	prefix: "daily",
	schedule: "0 0 * * *",
	serviceName: "postgres",
	userId: "user-1",
};

const safeUpdateBackupInput = {
	backupId: "backup-1",
	database: "appdb",
	databaseType: "postgres" as const,
	destinationId: "destination-1",
	enabled: false,
	keepLatestCount: 3,
	metadata: {},
	prefix: "daily",
	schedule: "0 0 * * *",
	serviceName: "postgres",
};

const parseShellArgs = (command: string) =>
	parse(command).filter((part): part is string => typeof part === "string");

describe("backup command and schema boundaries", () => {
	it("rejects unsafe backup database and service names before persistence", () => {
		expect(
			apiCreateBackup.safeParse({
				...safeCreateBackupInput,
				database: "appdb;id",
			}).success,
		).toBe(false);

		expect(
			apiCreateBackup.safeParse({
				...safeCreateBackupInput,
				serviceName: "postgres$(id)",
			}).success,
		).toBe(false);

		expect(
			apiRestoreBackup.safeParse({
				backupFile: "appdb.sql.gz",
				backupType: "compose",
				databaseId: "compose-1",
				databaseName: "appdb",
				databaseType: "postgres",
				destinationId: "destination-1",
				metadata: {
					serviceName: "api;id",
				},
			}).success,
		).toBe(false);
	});

	it("rejects unsafe retention counts before persistence", () => {
		expect(
			apiCreateBackup.safeParse({
				...safeCreateBackupInput,
				keepLatestCount: -1,
			}).success,
		).toBe(false);

		expect(
			apiCreateBackup.safeParse({
				...safeCreateBackupInput,
				keepLatestCount: 1.5,
			}).success,
		).toBe(false);

		expect(
			apiUpdateBackup.safeParse({
				...safeUpdateBackupInput,
				keepLatestCount: -1,
			}).success,
		).toBe(false);

		expect(
			apiCreateBackup.safeParse({
				...safeCreateBackupInput,
				keepLatestCount: 0,
			}).success,
		).toBe(true);
	});

	it("skips retention deletion for invalid legacy counts", () => {
		expect(shouldRunBackupRetention(-1)).toBe(false);
		expect(shouldRunBackupRetention(1.5)).toBe(false);
		expect(shouldRunBackupRetention(0)).toBe(false);
		expect(shouldRunBackupRetention(null)).toBe(false);
		expect(shouldRunBackupRetention(1)).toBe(true);
	});

	it("rejects stored backup schedules with mismatched service bindings", () => {
		const validPostgresBackup = {
			backupType: "database",
			databaseType: "postgres",
			postgres: { appName: "postgres-one" },
			postgresId: "postgres-1",
		};

		expect(isBackupScheduleTargetBound(validPostgresBackup as never)).toBe(
			true,
		);
		expect(
			isBackupScheduleTargetBound({
				backupType: "database",
				databaseType: "web-server",
			} as never),
		).toBe(true);
		expect(
			isBackupScheduleTargetBound({
				backupType: "compose",
				compose: { appName: "compose-one" },
				composeId: "compose-1",
				databaseType: "postgres",
			} as never),
		).toBe(true);
		expect(
			isBackupScheduleTargetBound({
				...validPostgresBackup,
				databaseType: "mysql",
				mysql: { appName: "mysql-one" },
				mysqlId: "mysql-1",
			} as never),
		).toBe(false);
		expect(
			isBackupScheduleTargetBound({
				backupType: "database",
				databaseType: "web-server",
				postgres: { appName: "postgres-one" },
				postgresId: "postgres-1",
			} as never),
		).toBe(false);
		expect(
			isBackupScheduleTargetBound({
				backupType: "compose",
				compose: { appName: "compose-one" },
				composeId: "compose-1",
				databaseType: "postgres",
				postgres: { appName: "postgres-one" },
				postgresId: "postgres-1",
			} as never),
		).toBe(false);
	});

	it("rejects unsafe database names before backup command generation", () => {
		expect(() => getPostgresBackupCommand("prod;id", "dokploy")).toThrow(
			"Invalid database name",
		);
		expect(() => getMysqlBackupCommand("../prod", "root-password")).toThrow(
			"Invalid database name",
		);
		expect(() =>
			getMariadbBackupCommand("prod$(id)", "mariadb", "password"),
		).toThrow("Invalid database name");
		expect(() => getMongoBackupCommand("prod/id", "mongo", "password")).toThrow(
			"Invalid database name",
		);
		expect(() => getLibsqlBackupCommand("prod/id")).toThrow(
			"Invalid database name",
		);
	});

	it("quotes database credentials inside docker exec backup commands", () => {
		const command = getMongoBackupCommand("appdb", "$(id)", "`id`");

		expect(command).toContain('docker exec -i "$CONTAINER_ID" bash -c');
		expect(command).not.toContain("-u $(id)");
		expect(command).not.toContain("-p `id`");
		expect(command).toContain("mongodump");
		expect(command).toContain("authenticationDatabase admin");
	});

	it("quotes Docker label filters and rejects unsafe service labels", () => {
		expect(() => getServiceContainerCommand("api;id")).toThrow(
			"Invalid service name",
		);
		expect(() =>
			getComposeContainerCommand("compose", "api;id", "docker-compose"),
		).toThrow("Invalid service name");

		const command = getComposeContainerCommand(
			"compose-one",
			"api",
			"docker-compose",
		);
		const args = parseShellArgs(command.replace(/\s+\|\s+head -n 1$/, ""));

		expect(args.slice(0, 3)).toEqual(["docker", "ps", "-q"]);
		expect(args).toContain("label=com.docker.compose.project=compose-one");
		expect(args).toContain("label=com.docker.compose.service=api");
	});
});
