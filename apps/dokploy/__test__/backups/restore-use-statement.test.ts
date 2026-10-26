import { execSync, spawnSync } from "node:child_process";
import {
	getRestoreCommand,
	stripDatabaseSwitchCommand,
} from "@dokploy/server/utils/restore/utils";
import { parse, quote } from "shell-quote";
import { describe, expect, it } from "vitest";

const filter = (input: string) =>
	execSync(stripDatabaseSwitchCommand, {
		input,
		shell: "/bin/bash",
	}).toString();

describe("restore drops database-switch statements (mysql/mariadb)", () => {
	const dump = [
		"-- MariaDB dump",
		"CREATE DATABASE /*!32312 IF NOT EXISTS*/ `production_db`;",
		"USE `production_db`;",
		"use production_db;",
		"DROP TABLE IF EXISTS `users`;",
		"CREATE TABLE `users` (`id` int NOT NULL);",
		"INSERT INTO `users` VALUES (1),(2);",
		"INSERT INTO `logs` VALUES ('USER: because'),('CREATE DATABASE is a string');",
	].join("\n");

	it("removes USE and CREATE DATABASE lines but keeps everything else", () => {
		const result = filter(dump);
		expect(result).not.toContain("USE `production_db`");
		expect(result).not.toContain("use production_db");
		expect(result).not.toContain("CREATE DATABASE /*!32312");
		expect(result).toContain("DROP TABLE IF EXISTS `users`;");
		expect(result).toContain("CREATE TABLE `users` (`id` int NOT NULL);");
		expect(result).toContain("INSERT INTO `users` VALUES (1),(2);");
		expect(result).toContain(
			"INSERT INTO `logs` VALUES ('USER: because'),('CREATE DATABASE is a string');",
		);
	});

	it("preserves multiline text inside stored objects and values", () => {
		const content = [
			"DELIMITER ;;",
			"/*!50003 CREATE*/ /*!50020 DEFINER=`root`@`localhost`*/ /*!50003 PROCEDURE `instructions`()",
			"BEGIN",
			"  SELECT 'Instructions:",
			"Use the admin page",
			"CREATE DATABASE is documentation",
			"';",
			"END */;;",
			"DELIMITER ;",
			"INSERT INTO notes VALUES ('Instructions:",
			"USE the same page",
			"CREATE DATABASE example",
			"');",
			"/* A multiline comment:",
			"USE is documented here",
			"CREATE DATABASE is documented here",
			"*/",
			"",
		].join("\n");
		expect(filter(content)).toBe(content);
	});

	it.each([
		"  uSe\n `source;db`;",
		"CREATE\nDATABASE /*!32312 IF NOT EXISTS*/ `source``db`;",
		"CREATE SCHEMA `source_db`;",
		"CREATE OR REPLACE DATABASE `source_db`;",
		"CREATE /* a comment */ DATABASE `source_db`;",
		"\tUsE\r\n`source_db`;",
		"/*!50000 USE `source_db` */;",
		"/*M!100100 CREATE DATABASE `source_db` */;",
	])("removes a complete top-level statement: %s", (statement) => {
		expect(filter(`${statement}SELECT 1;\n`).trim()).toBe("SELECT 1;");
	});

	it("keeps comments, quoted identifiers, escaped quotes and delimiter text", () => {
		const content =
			String.raw`-- USE is documentation
# CREATE DATABASE is documentation
/* A comment; with a fake delimiter // */
DELIMITER //
CREATE PROCEDURE instructions()
BEGIN
  SELECT 'escaped \' quote;
USE the admin page
CREATE DATABASE is documentation', 'doubled '' quote;
USE the same page', "double quote;
CREATE DATABASE is text", 1 AS ` +
			"`USE\nCREATE DATABASE`" +
			`;
END//
DELIMITER ;
`;
		expect(filter(content)).toBe(content);
		expect(filter(`${content}USE source_db;SELECT 2;\n`)).toBe(
			`${content}SELECT 2;\n`,
		);
	});

	it("retains leading comments when removing a switch", () => {
		const comments = "/* keep this comment */ -- keep this too\n";
		expect(filter(`${comments}USE source_db;\n`)).toBe(`${comments}\n`);
	});

	it.each(["", "USE source_db;", "CREATE DATABASE source_db;\nUSE source_db;"])(
		"succeeds when no SQL remains: %s",
		(input) => expect(filter(input).trim()).toBe(""),
	);

	it("tracks dump SQL_MODE changes and restores saved quote escaping", () => {
		const content = String.raw`/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_BACKSLASH_ESCAPES' */;
SELECT 'trailing backslash\';USE source_db;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
SELECT 'escaped \' quote;
USE is still text
';USE source_db;
`;
		expect(filter(content)).toBe(content.replaceAll("USE source_db;", ""));
	});

	it("treats double quotes as identifiers in ANSI_QUOTES mode", () => {
		const content = String.raw`SET @saved_sql_mode=@@sql_mode;
SET sql_mode='ANSI_QUOTES';
SELECT 1 AS "column\";USE source_db;
SET sql_mode=@saved_sql_mode;
SELECT "escaped \" quote;
USE is still text
";USE source_db;
`;
		expect(filter(content)).toBe(content.replaceAll("USE source_db;", ""));
	});

	it.each(["SELECT 'unfinished", "/* unfinished"])(
		"reports malformed SQL: %s",
		(input) => {
			const result = spawnSync(
				"/bin/bash",
				["-c", stripDatabaseSwitchCommand],
				{
					input,
					encoding: "utf8",
				},
			);
			expect(result.status).toBe(2);
			expect(result.stderr).toContain("Unterminated SQL quote or comment");
		},
	);

	it.each(["mysql", "mariadb"] as const)(
		"propagates producer and filter failures through the %s pipeline",
		(type) => {
			for (const producer of [
				"false",
				`printf %s ${quote(["SELECT 'unfinished"])}`,
			]) {
				const command = getRestoreCommand({
					appName: "fixture",
					type,
					restoreType: "database",
					credentials: { database: "target", databasePassword: "fixture" },
					rcloneCommand: producer,
				});
				const result = spawnSync(
					"/bin/bash",
					[
						"-c",
						`docker() { if [ "$1" = ps ]; then echo fixture; else cat >/dev/null; fi; }; export -f docker; ${command}`,
					],
					{ encoding: "utf8" },
				);
				expect(result.status).toBe(producer === "false" ? 1 : 2);
			}
		},
	);

	it("preserves shell metacharacters through the complete restore command", () => {
		const database = "target'$(printf corrupted)";
		const password = "fixture'$(printf corrupted)";
		const command = getRestoreCommand({
			appName: "fixture",
			type: "mysql",
			restoreType: "database",
			credentials: { database, databasePassword: password },
			rcloneCommand: "printf 'SELECT 1;'",
		});
		const result = execSync(
			`docker() { if [ "$1" = ps ]; then echo fixture; else cat >/dev/null; printf '%s\\n' "$@"; fi; }; export -f docker; ${command}`,
			{ shell: "/bin/bash" },
		).toString();
		expect(result).toContain(`DB_NAME=${database}\n`);
		expect(result).toContain(`DB_PASS=${password}\n`);
	});

	it("is wired into mysql and mariadb restore pipelines only", () => {
		const base = {
			appName: "my-app",
			restoreType: "database" as const,
			credentials: {
				database: "dev_db",
				databaseUser: "u",
				databasePassword: "p",
			},
			rcloneCommand: "rclone cat ':s3:bucket/file.sql.gz' | gunzip",
		};
		for (const type of ["mysql", "mariadb"] as const) {
			const cmd = getRestoreCommand({ ...base, type });
			expect(parse(cmd).slice(0, 4)).toEqual(["bash", "-o", "pipefail", "-c"]);
			expect(parse(cmd)[4]).toContain(
				`gunzip | ${stripDatabaseSwitchCommand} | docker`,
			);
		}
		const pgCmd = getRestoreCommand({ ...base, type: "postgres" });
		expect(pgCmd).not.toContain(stripDatabaseSwitchCommand);
	});
});
