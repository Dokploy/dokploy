import {
	applications,
	backups,
	certificates,
	compose,
	destinations,
	dnsProvider,
	environments,
	libsql,
	mariadb,
	mongo,
	mounts,
	mysql,
	network,
	postgres,
	projects,
	redis,
	registry,
	security,
	sshKeys,
	vaultProvider,
} from "@dokploy/server/db/schema";
import type { ResourceKind } from "@dokploy/server/services/project-export-import";
import {
	NEVER_EXPORT_FIELDS,
	restoreSecretFields,
	SECRET_FIELDS,
	stripNeverExport,
} from "@dokploy/server/services/project-export-import";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const TABLES_WITH_KIND: { table: object; kind: ResourceKind }[] = [
	{ table: applications, kind: "application" },
	{ table: compose, kind: "compose" },
	{ table: environments, kind: "environment" },
	{ table: libsql, kind: "libsql" },
	{ table: mariadb, kind: "mariadb" },
	{ table: mongo, kind: "mongo" },
	{ table: mysql, kind: "mysql" },
	{ table: postgres, kind: "postgres" },
	{ table: projects, kind: "project" },
	{ table: redis, kind: "redis" },
];

const ALL_RESOURCE_TABLES: { table: object; kind: ResourceKind }[] = [
	...TABLES_WITH_KIND,
	{ table: mounts, kind: "mount" },
	{ table: security, kind: "security" },
	{ table: destinations, kind: "destination" },
	{ table: registry, kind: "registry" },
	{ table: sshKeys, kind: "sshKey" },
	{ table: certificates, kind: "certificate" },
	{ table: vaultProvider, kind: "vaultProvider" },
	{ table: dnsProvider, kind: "dnsProvider" },
	{ table: backups, kind: "backup" },
	{ table: network, kind: "network" },
];

const SENSITIVE_NAME = /password|secret|token|privatekey|accesskey|apikey/i;

describe("every sensitive-looking column is covered by SECRET_FIELDS or NEVER_EXPORT_FIELDS", () => {
	for (const { table, kind } of ALL_RESOURCE_TABLES) {
		it(`covers sensitive-named columns of "${kind}"`, () => {
			const columns = getTableColumns(table as any);
			const sensitiveFieldNames = Object.keys(columns).filter((name) =>
				SENSITIVE_NAME.test(name),
			);

			const coveredBySecretFields = new Set(
				(SECRET_FIELDS[kind] ?? []).map((entry) => entry.field),
			);
			const coveredByNeverExport = new Set(NEVER_EXPORT_FIELDS[kind] ?? []);

			for (const fieldName of sensitiveFieldNames) {
				const covered =
					coveredBySecretFields.has(fieldName) ||
					coveredByNeverExport.has(fieldName);
				expect(covered, `${kind}.${fieldName} is not covered`).toBe(true);
			}
		});
	}
});

describe("SECRET_FIELDS covers every encryptedText column", () => {
	for (const { table, kind } of TABLES_WITH_KIND) {
		it(`covers encrypted columns of "${kind}"`, () => {
			const columns = getTableColumns(table as any);
			const encryptedFieldNames = Object.entries(columns)
				.filter(
					([, col]) =>
						(col as { columnType: string }).columnType === "PgCustomColumn",
				)
				.map(([name]) => name);
			expect(encryptedFieldNames.length).toBeGreaterThan(0);

			const covered = new Set(
				(SECRET_FIELDS[kind] ?? []).map((entry) => entry.field),
			);
			for (const fieldName of encryptedFieldNames) {
				expect(covered.has(fieldName)).toBe(true);
			}
		});
	}
});

describe("stripNeverExport", () => {
	it("removes NEVER_EXPORT_FIELDS for the given kind", () => {
		const row = {
			applicationId: "a1",
			serverId: "s1",
			buildServerId: "s2",
			refreshToken: "tok",
			githubId: "gh1",
			createdAt: "2024-01-01",
			name: "app",
		};
		const stripped = stripNeverExport("application", row);
		expect(stripped).not.toHaveProperty("serverId");
		expect(stripped).not.toHaveProperty("buildServerId");
		expect(stripped).not.toHaveProperty("refreshToken");
		expect(stripped).not.toHaveProperty("githubId");
		expect(stripped).not.toHaveProperty("createdAt");
		expect(stripped.applicationId).toBe("a1");
		expect(stripped.name).toBe("app");
	});

	it("does not mutate the original row", () => {
		const row = { serverId: "s1", name: "app" };
		stripNeverExport("postgres", row);
		expect(row).toHaveProperty("serverId");
	});

	it("is a no-op for a kind with no NEVER_EXPORT_FIELDS entry", () => {
		const row = { name: "unmapped" };
		// @ts-expect-error deliberately invalid kind, to check the fallback path
		const stripped = stripNeverExport("notAKind", row);
		expect(stripped).toEqual(row);
	});

	it("every ResourceKind used in NEVER_EXPORT_FIELDS strips createdAt", () => {
		for (const kind of Object.keys(NEVER_EXPORT_FIELDS) as ResourceKind[]) {
			const stripped = stripNeverExport(kind, { createdAt: "x", id: "1" });
			expect(stripped).not.toHaveProperty("createdAt");
		}
	});
});

const SAFE_JSONB_COLUMNS = new Set(["compose.serviceNetworks", "network.ipam"]);

describe("every jsonb column is covered or explicitly allowlisted as safe", () => {
	for (const { table, kind } of ALL_RESOURCE_TABLES) {
		it(`checks jsonb columns of "${kind}"`, () => {
			const columns = getTableColumns(table as any);
			const jsonbFieldNames = Object.entries(columns)
				.filter(
					([, col]) => (col as { columnType: string }).columnType === "PgJsonb",
				)
				.map(([name]) => name);

			const coveredBySecretFields = new Set(
				(SECRET_FIELDS[kind] ?? []).map((entry) => entry.field),
			);
			const coveredByNeverExport = new Set(NEVER_EXPORT_FIELDS[kind] ?? []);

			for (const fieldName of jsonbFieldNames) {
				const covered =
					coveredBySecretFields.has(fieldName) ||
					coveredByNeverExport.has(fieldName) ||
					SAFE_JSONB_COLUMNS.has(`${kind}.${fieldName}`);
				expect(
					covered,
					`${kind}.${fieldName} is not covered or allowlisted`,
				).toBe(true);
			}
		});
	}
});

describe("restoreSecretFields / CRLF env files (T-11.5)", () => {
	it("resolves a $secret: reference even when the env file uses CRLF line endings", () => {
		const secretsPlain = new Map([["secret-uuid-1", "realpassword"]]);
		const row = {
			env: "DB_PASS=$secret:secret-uuid-1\r\nOTHER=plain\r\n",
		};
		const result = restoreSecretFields("application", row, secretsPlain);
		expect(result.env).toBe("DB_PASS=realpassword\nOTHER=plain\n");
	});
});
