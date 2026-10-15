import type { ExportScope } from "@dokploy/server/services/project-export-import";
import {
	buildDatabaseSizeCommand,
	buildDirectorySizeCommand,
	estimateSizes,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

const scope: ExportScope = {
	includeEnvSecrets: true,
	shared: {},
	files: {
		applicationSources: true,
		composeFiles: true,
		traefikRaw: true,
		customCertificates: true,
	},
	dumps: { mode: "embed" },
	includeBackupSchedules: true,
};

const tree = {
	projectId: "project-1",
	name: "p",
	organizationId: "org-1",
	env: "",
	environments: [
		{
			environmentId: "env-1",
			name: "production",
			env: "",
			applications: [
				{ applicationId: "app-1", appName: "app-one", serverId: null },
			],
			compose: [
				{ composeId: "c-1", appName: "compose-one", serverId: "srv-1" },
			],
			postgres: [
				{
					postgresId: "pg-1",
					appName: "pg-one",
					serverId: null,
					databaseName: "mydb",
					databaseUser: "me",
				},
			],
			mysql: [],
			mariadb: [],
			mongo: [],
			redis: [{ redisId: "r-1", appName: "redis-one", serverId: null }],
			libsql: [],
		},
	],
};

const pathsFn = (isServer = false) =>
	({
		APPLICATIONS_PATH: isServer ? "/remote/apps" : "/local/apps",
		COMPOSE_PATH: isServer ? "/remote/compose" : "/local/compose",
	}) as never;

describe("estimateSizes", () => {
	it("sums database and file sizes, keyed to the right server and path", async () => {
		const calls: [string | null, string][] = [];
		const sizes = await estimateSizes(tree as never, scope, {
			pathsFn,
			probe: async (serverId, command) => {
				calls.push([serverId, command]);
				if (command.includes("pg_database_size")) return "1048576\n";
				if (command.includes("/remote/compose/compose-one")) return "2048";
				if (command.includes("/local/apps/app-one")) return "4096";
				throw new Error("unexpected");
			},
		});
		expect(sizes).toEqual({
			estimatedDumpBytes: 1048576,
			estimatedFilesBytes: 6144,
		});
		expect(calls.map(([serverId]) => serverId)).toEqual([null, null, "srv-1"]);
		expect(calls.some(([, c]) => c.includes("redis"))).toBe(false);
	});

	it("counts a failing probe as zero instead of failing the preview", async () => {
		const sizes = await estimateSizes(tree as never, scope, {
			pathsFn,
			probe: async () => {
				throw new Error("container not running");
			},
		});
		expect(sizes).toEqual({ estimatedDumpBytes: 0, estimatedFilesBytes: 0 });
	});
});

describe("size command builders", () => {
	it("passes database credentials as env vars, never inside the container script", () => {
		const command = buildDatabaseSizeCommand("mariadb", {
			appName: "db-one",
			databaseName: "shop",
			databaseUser: "shop",
			databasePassword: "s3cret'quote",
		}) as string;
		const [outer, inner] = command.split(" sh -c ");
		expect(outer).toContain("-e DB_PASS=");
		expect(inner).toContain('--password="$DB_PASS"');
		expect(inner).not.toContain("s3cret");
		expect(inner).not.toContain("\\$");
	});

	it("has no size probe for redis", () => {
		expect(buildDatabaseSizeCommand("redis", { appName: "x" })).toBeUndefined();
	});

	it("quotes the directory path", () => {
		expect(buildDirectorySizeCommand("/etc/dokploy/apps/my app")).toBe(
			"du -sk '/etc/dokploy/apps/my app' | awk '{print $1*1024}'",
		);
	});
});
