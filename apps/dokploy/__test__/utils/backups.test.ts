import {
	getMariadbBackupCommand,
	getMongoBackupCommand,
	getMysqlBackupCommand,
	getPostgresBackupCommand,
	normalizeS3Path,
} from "@dokploy/server/utils/backups/utils";
import {
	getMariadbRestoreCommand,
	getMongoRestoreCommand,
	getMysqlRestoreCommand,
	getPostgresRestoreCommand,
} from "@dokploy/server/utils/restore/utils";
import { describe, expect, test } from "vitest";

describe("normalizeS3Path", () => {
	test("should handle empty and whitespace-only prefix", () => {
		expect(normalizeS3Path("")).toBe("");
		expect(normalizeS3Path("/")).toBe("");
		expect(normalizeS3Path("  ")).toBe("");
		expect(normalizeS3Path("\t")).toBe("");
		expect(normalizeS3Path("\n")).toBe("");
		expect(normalizeS3Path(" \n \t ")).toBe("");
	});

	test("should trim whitespace from prefix", () => {
		expect(normalizeS3Path(" prefix")).toBe("prefix/");
		expect(normalizeS3Path("prefix ")).toBe("prefix/");
		expect(normalizeS3Path(" prefix ")).toBe("prefix/");
		expect(normalizeS3Path("\tprefix\t")).toBe("prefix/");
		expect(normalizeS3Path(" prefix/nested ")).toBe("prefix/nested/");
	});

	test("should remove leading slashes", () => {
		expect(normalizeS3Path("/prefix")).toBe("prefix/");
		expect(normalizeS3Path("///prefix")).toBe("prefix/");
	});

	test("should remove trailing slashes", () => {
		expect(normalizeS3Path("prefix/")).toBe("prefix/");
		expect(normalizeS3Path("prefix///")).toBe("prefix/");
	});

	test("should remove both leading and trailing slashes", () => {
		expect(normalizeS3Path("/prefix/")).toBe("prefix/");
		expect(normalizeS3Path("///prefix///")).toBe("prefix/");
	});

	test("should handle nested paths", () => {
		expect(normalizeS3Path("prefix/nested")).toBe("prefix/nested/");
		expect(normalizeS3Path("/prefix/nested/")).toBe("prefix/nested/");
		expect(normalizeS3Path("///prefix/nested///")).toBe("prefix/nested/");
	});

	test("should preserve middle slashes", () => {
		expect(normalizeS3Path("prefix/nested/deep")).toBe("prefix/nested/deep/");
		expect(normalizeS3Path("/prefix/nested/deep/")).toBe("prefix/nested/deep/");
	});

	test("should handle special characters", () => {
		expect(normalizeS3Path("prefix-with-dashes")).toBe("prefix-with-dashes/");
		expect(normalizeS3Path("prefix_with_underscores")).toBe(
			"prefix_with_underscores/",
		);
		expect(normalizeS3Path("prefix.with.dots")).toBe("prefix.with.dots/");
	});

	test("should handle the cases from the bug report", () => {
		expect(normalizeS3Path("instance-backups/")).toBe("instance-backups/");
		expect(normalizeS3Path("/instance-backups/")).toBe("instance-backups/");
		expect(normalizeS3Path("instance-backups")).toBe("instance-backups/");
	});
});

describe("backup and restore command generation", () => {
	test("keeps the original postgres backup format and appends options", () => {
		expect(
			getPostgresBackupCommand("app_db", "postgres", ["--schema-only", "--verbose"]),
		).toBe(
			'docker exec -i $CONTAINER_ID bash -c "set -o pipefail; pg_dump -Fc --no-acl --no-owner -h localhost -U postgres --no-password --schema-only --verbose \'app_db\' | gzip"',
		);
	});

	test("keeps the original mysql backup format and appends options", () => {
		expect(getMysqlBackupCommand("app_db", "secret", ["--skip-lock-tables"])).toBe(
			'docker exec -i $CONTAINER_ID bash -c "set -o pipefail; mysqldump --default-character-set=utf8mb4 -u \'root\' --password=\'secret\' --single-transaction --no-tablespaces --quick --skip-lock-tables \'app_db\' | gzip"',
		);
	});

	test("keeps the original mariadb backup format and appends options", () => {
		expect(
			getMariadbBackupCommand("app_db", "root", "secret", ["--skip-comments"]),
		).toBe(
			'docker exec -i $CONTAINER_ID bash -c "set -o pipefail; mariadb-dump --user=\'root\' --password=\'secret\' --single-transaction --quick --skip-comments --databases app_db | gzip"',
		);
	});

	test("keeps the original mongo backup format and appends options", () => {
		expect(
			getMongoBackupCommand("app_db", "admin", "secret", [
				"--numParallelCollections 1",
			]),
		).toBe(
			'docker exec -i $CONTAINER_ID bash -c "set -o pipefail; mongodump -d \'app_db\' -u \'admin\' -p \'secret\' --archive --authenticationDatabase admin --gzip --numParallelCollections 1"',
		);
	});

	test("keeps the original postgres restore format and appends options", () => {
		expect(
			getPostgresRestoreCommand("app_db", "postgres", [
				"--schema-only",
				"--jobs=2",
			]),
		).toBe(
			'docker exec -i $CONTAINER_ID sh -c "pg_restore -U \'postgres\' -d app_db -O --clean --if-exists --schema-only --jobs=2"',
		);
	});

	test("keeps the original mariadb restore format and appends options", () => {
		expect(getMariadbRestoreCommand("app_db", "root", "secret", ["--force"])).toBe(
			'docker exec -i $CONTAINER_ID sh -c "mariadb -u \'root\' -p\'secret\' --force app_db"',
		);
	});

	test("keeps the original mysql restore format and appends options", () => {
		expect(getMysqlRestoreCommand("app_db", "secret", ["--force"])).toBe(
			'docker exec -i $CONTAINER_ID sh -c "mysql -u root -p\'secret\' --force app_db"',
		);
	});

	test("keeps the original mongo restore format and appends options", () => {
		expect(
			getMongoRestoreCommand("app_db", "admin", "secret", ["--nsInclude users.*"]),
		).toBe(
			'docker exec -i $CONTAINER_ID sh -c "mongorestore --username \'admin\' --password \'secret\' --authenticationDatabase admin --db app_db --archive --drop --nsInclude users.*"',
		);
	});
});
