import {
	applications,
	mounts,
	postgres,
	projects,
} from "@dokploy/server/db/schema";
import type {
	ExportScope,
	Plan,
	Snapshot,
	TransferDb,
	TransferWriteDb,
} from "@dokploy/server/services/project-export-import";
import {
	apply,
	buildPlan,
	buildRotationPlan,
	capture,
	detectRequirements,
	detectWarnings,
	rotateText,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

describe("rotateText", () => {
	it("replaces both the literal and URL-encoded form of the old password", () => {
		const specs = [
			{
				serviceId: "pg-new-1",
				serviceType: "postgres" as const,
				field: "databasePassword" as const,
				oldPassword: "p@ss",
				newPassword: "n3wpass",
			},
		];
		const { text, matched } = rotateText(
			"DATABASE_URL=postgres://user:p%40ss@host/db",
			specs,
		);
		expect(text).toBe("DATABASE_URL=postgres://user:n3wpass@host/db");
		expect(matched).toHaveLength(1);
		expect(matched[0]?.count).toBe(1);
	});

	it("counts multiple literal occurrences across the text", () => {
		const specs = [
			{
				serviceId: "pg-new-1",
				serviceType: "postgres" as const,
				field: "databasePassword" as const,
				oldPassword: "oldpass",
				newPassword: "newpass",
			},
		];
		const { text, matched } = rotateText(
			"A=oldpass\nB=oldpass\nC=unrelated",
			specs,
		);
		expect(text).toBe("A=newpass\nB=newpass\nC=unrelated");
		expect(matched[0]?.count).toBe(2);
	});

	it("leaves text untouched and reports no match when the password isn't present", () => {
		const specs = [
			{
				serviceId: "pg-new-1",
				serviceType: "postgres" as const,
				field: "databasePassword" as const,
				oldPassword: "oldpass",
				newPassword: "newpass",
			},
		];
		const { text, matched } = rotateText("nothing to see here", specs);
		expect(text).toBe("nothing to see here");
		expect(matched).toHaveLength(0);
	});

	it("processes the longer old password first so a short password isn't spliced into a longer, unrelated one", () => {
		const specs = [
			{
				serviceId: "svc-a",
				serviceType: "postgres" as const,
				field: "databasePassword" as const,
				oldPassword: "secret",
				newPassword: "A_NEW",
			},
			{
				serviceId: "svc-b",
				serviceType: "postgres" as const,
				field: "databasePassword" as const,
				oldPassword: "mysecret123",
				newPassword: "B_NEW",
			},
		];
		const { text } = rotateText(
			"A=secret\nB=postgres://u:mysecret123@host/db",
			specs,
		);
		expect(text).toBe("A=A_NEW\nB=postgres://u:B_NEW@host/db");
	});
});

describe("buildRotationPlan", () => {
	it("gives databasePassword and databaseRootPassword the same new value when the source used the same value for both", async () => {
		const tx = {
			query: {
				mysql: {
					findFirst: async () => ({
						mysqlId: "mysql-new-1",
						databasePassword: "sharedpass",
						databaseRootPassword: "sharedpass",
					}),
				},
			},
		} as any;
		const snapshot = {
			resources: {
				services: [
					{
						kind: "mysql",
						mysqlId: "mysql-old-1",
					},
				],
			},
		} as any;
		const serviceIdMap = { mysql: { "mysql-old-1": "mysql-new-1" } };

		const { specs } = await buildRotationPlan(tx, snapshot, serviceIdMap);

		expect(specs).toHaveLength(2);
		const appSpec = specs.find((s) => s.field === "databasePassword");
		const rootSpec = specs.find((s) => s.field === "databaseRootPassword");
		expect(appSpec?.newPassword).toBeDefined();
		expect(appSpec?.newPassword).toBe(rootSpec?.newPassword);

		const { text } = rotateText(
			"MYSQL_ROOT_PASSWORD=sharedpass\nMYSQL_PASSWORD=sharedpass",
			specs,
		);
		expect(text).toBe(
			`MYSQL_ROOT_PASSWORD=${rootSpec?.newPassword}\nMYSQL_PASSWORD=${appSpec?.newPassword}`,
		);
	});

	it("keeps a password that is too short or equal to the user/name and reports it", async () => {
		const tx = {
			query: {
				postgres: {
					findFirst: async () => ({
						postgresId: "pg-new-1",
						databaseUser: "app",
						databaseName: "app",
						databasePassword: "app",
					}),
				},
			},
		} as any;
		const snapshot = {
			resources: {
				services: [
					{
						kind: "postgres",
						postgresId: "pg-old-1",
						name: "db",
						environmentId: "env-1",
					},
				],
			},
		} as any;

		const { specs, unsafe } = await buildRotationPlan(tx, snapshot, {
			postgres: { "pg-old-1": "pg-new-1" },
		});

		expect(specs).toHaveLength(0);
		expect(unsafe).toEqual([
			expect.objectContaining({
				serviceId: "pg-new-1",
				serviceType: "postgres",
			}),
		]);
	});

	it("still generates independent new passwords when app and root passwords differ", async () => {
		const tx = {
			query: {
				mysql: {
					findFirst: async () => ({
						mysqlId: "mysql-new-1",
						databasePassword: "app-pass",
						databaseRootPassword: "root-pass",
					}),
				},
			},
		} as any;
		const snapshot = {
			resources: {
				services: [{ kind: "mysql", mysqlId: "mysql-old-1" }],
			},
		} as any;
		const serviceIdMap = { mysql: { "mysql-old-1": "mysql-new-1" } };

		const { specs } = await buildRotationPlan(tx, snapshot, serviceIdMap);

		const appSpec = specs.find((s) => s.field === "databasePassword");
		const rootSpec = specs.find((s) => s.field === "databaseRootPassword");
		expect(appSpec?.newPassword).not.toBe(rootSpec?.newPassword);
	});
});

const applicationWithDbRef = {
	applicationId: "app-1",
	name: "my-app",
	appName: "my-app-abc123",
	environmentId: "env-1",
	env: "DATABASE_URL=postgres://u:realdbpassword123@db/mydb",
	buildArgs: "BUILD_DB_PASS=realdbpassword123",
	buildSecrets: null,
	previewEnv: null,
	serverId: null,
	buildServerId: null,
	githubId: null,
	gitlabId: null,
	giteaId: null,
	bitbucketId: null,
	refreshToken: "webhook-token",
	registryId: null,
	buildRegistryId: null,
	rollbackRegistryId: null,
	customGitSSHKeyId: null,
	customGitSSHKey: null,
	networkIds: [],
	owner: null,
	repository: null,
	sourceType: "docker",
	autoDeploy: false,
	isPreviewDeploymentsActive: false,
	createdAt: "2024-01-01T00:00:00.000Z",
	domains: [],
	mounts: [
		{
			mountId: "mount-1",
			type: "file",
			content: "password = realdbpassword123",
			mountPath: "/etc/app.conf",
			serviceType: "application",
			createdAt: "2024-01-01",
		},
	],
	redirects: [],
	security: [],
	ports: [],
	schedules: [],
	volumeBackups: [],
};

const applicationWithoutDbRef = {
	...applicationWithDbRef,
	applicationId: "app-2",
	appName: "my-app-two-def456",
	name: "my-app-two",
	env: "UNRELATED=1",
	buildArgs: null,
	mounts: [],
};

const postgresService = {
	postgresId: "pg-1",
	name: "my-db",
	appName: "my-db-xyz789",
	environmentId: "env-1",
	env: "",
	databasePassword: "realdbpassword123",
	serverId: null,
	createdAt: "2024-01-01T00:00:00.000Z",
	mounts: [],
	backups: [],
	volumeBackups: [],
};

const emptyServiceArrays = {
	mysql: [],
	mariadb: [],
	mongo: [],
	redis: [],
	libsql: [],
	compose: [],
};

const projectTree = {
	projectId: "project-1",
	name: "my-project",
	organizationId: "org-src",
	env: "",
	createdAt: "2024-01-01T00:00:00.000Z",
	environments: [
		{
			environmentId: "env-1",
			name: "production",
			projectId: "project-1",
			env: "",
			isDefault: true,
			createdAt: "2024-01-01T00:00:00.000Z",
			applications: [applicationWithDbRef, applicationWithoutDbRef],
			postgres: [postgresService],
			...emptyServiceArrays,
		},
	],
};

const readDb = (): TransferDb =>
	({
		query: {
			projects: { findFirst: async () => projectTree },
			environments: { findFirst: async () => undefined },
			applications: {
				findMany: async () => [applicationWithDbRef, applicationWithoutDbRef],
				findFirst: async () => undefined,
			},
			schedules: { findMany: async () => [] },
			volumeBackups: { findMany: async () => [] },
			vaultProvider: { findMany: async () => [] },
			registry: { findMany: async () => [] },
			destinations: { findMany: async () => [] },
			network: { findMany: async () => [] },
			certificates: { findMany: async () => [] },
			gitProvider: { findMany: async () => [] },
			server: {
				findMany: async () => [],
				findFirst: async () => ({ organizationId: "org-dest" }),
			},
			webServerSettings: { findFirst: async () => undefined },
			sshKeys: { findMany: async () => [] },
		},
	}) as any as TransferDb;

const baseScope: ExportScope = {
	includeEnvSecrets: true,
	shared: {},
	files: {
		applicationSources: false,
		composeFiles: false,
		traefikRaw: false,
		customCertificates: false,
	},
	dumps: { mode: "none" },
	includeBackupSchedules: true,
};

const runApplyForRotationTest = async (rotateDatabaseCredentials: boolean) => {
	const db = readDb();
	const captureResult = await capture(
		db,
		{ kind: "project", id: "project-1" },
		baseScope,
		{
			detectRequirements: (tree, scope) => detectRequirements(db, tree, scope),
			detectWarnings: (tree, scope) => detectWarnings(tree, scope),
		},
	);

	const snapshot: Snapshot = {
		manifest: {
			format: "dokploy-project-export",
			formatVersion: 1,
			exportedAt: "2024-01-01T00:00:00.000Z",
			exportedBy: { userId: "user-1", email: "a@b.com" },
			sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
			scope: baseScope,
			crypto: {
				salt: "c2FsdA==",
				kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
				keyCheck: "{}",
			},
			counts: captureResult.inventory.totals,
		},
		resources: captureResult.resources,
		requirements: captureResult.requirements,
		warnings: captureResult.warnings,
		dumps: [],
	};

	const plan: Plan = await buildPlan(
		db,
		snapshot,
		"org-dest",
		{ kind: "newProject", name: "imported-project" },
		{ rotateDatabaseCredentials },
	);

	const insertedByTable = new Map<unknown, Record<string, unknown>[]>();
	let counter = 0;
	const idFieldByTable = new Map<unknown, string>([
		[projects, "projectId"],
		[applications, "applicationId"],
		[postgres, "postgresId"],
		[mounts, "mountId"],
	]);
	const environmentsTable = (await import("@dokploy/server/db/schema"))
		.environments;
	idFieldByTable.set(environmentsTable, "environmentId");

	const writeDb = {
		query: {
			vaultProvider: { findFirst: async () => undefined },
			github: { findFirst: async () => undefined },
			gitlab: { findFirst: async () => undefined },
			gitea: { findFirst: async () => undefined },
			bitbucket: { findFirst: async () => undefined },
			applications: {
				findFirst: async () => (insertedByTable.get(applications) ?? [])[0],
			},
			postgres: {
				findFirst: async () => (insertedByTable.get(postgres) ?? [])[0],
			},
			server: { findFirst: async () => undefined },
			webServerSettings: { findFirst: async () => undefined },
			mounts: {
				findMany: async (args?: { where?: unknown }) =>
					(insertedByTable.get(mounts) ?? []).filter((row) =>
						args?.where ? row.type === "file" : true,
					),
			},
			projects: {
				findFirst: async () => (insertedByTable.get(projects) ?? [])[0],
			},
			environments: {
				findFirst: async () =>
					(insertedByTable.get(environmentsTable) ?? [])[0],
			},
			compose: { findFirst: async () => undefined },
		},
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => {
				const idField = idFieldByTable.get(table);
				const row = { ...values };
				if (idField) {
					row[idField] =
						(values[idField] as string | undefined) ??
						`new-${idField}-${++counter}`;
				}
				const list = insertedByTable.get(table) ?? [];
				list.push(row);
				insertedByTable.set(table, list);
				return { returning: async () => [row] };
			},
		}),
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => ({
				where: async (condition: any) => {
					const chunks = condition?.queryChunks ?? [];
					const paramChunk = chunks.find(
						(c: any) => c?.constructor?.name === "Param",
					);
					const columnChunk = chunks.find(
						(c: any) => typeof c?.name === "string",
					);
					const list = insertedByTable.get(table) ?? [];
					for (const row of list) {
						if (
							!columnChunk ||
							!paramChunk ||
							row[columnChunk.name] === paramChunk.value
						) {
							Object.assign(row, values);
						}
					}
				},
			}),
		}),
		transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
			return fn({ ...writeDb });
		},
	} as any as TransferWriteDb;

	const result = await apply(
		writeDb,
		snapshot,
		plan,
		captureResult.secretsPlain,
		"org-dest",
	);

	return {
		result,
		insertedPostgres: (insertedByTable.get(postgres) ?? [])[0] as Record<
			string,
			unknown
		>,
		insertedApps: insertedByTable.get(applications) ?? [],
		insertedMounts: insertedByTable.get(mounts) ?? [],
	};
};

describe("apply() with rotateDatabaseCredentials (opt-in)", () => {
	it("rotates the postgres password, rewrites the referencing app's env, build args and file mount, and warns about the app with no reference", async () => {
		const { result, insertedPostgres, insertedApps, insertedMounts } =
			await runApplyForRotationTest(true);

		expect(insertedPostgres.databasePassword).not.toBe("realdbpassword123");
		expect(typeof insertedPostgres.databasePassword).toBe("string");

		const referencingApp = insertedApps.find(
			(a) => a.applicationId === result.idMap.application?.["app-1"],
		);
		const nonReferencingApp = insertedApps.find(
			(a) => a.applicationId === result.idMap.application?.["app-2"],
		);
		expect(String(referencingApp?.env)).toContain(
			String(insertedPostgres.databasePassword),
		);
		expect(String(referencingApp?.env)).not.toContain("realdbpassword123");
		expect(String(referencingApp?.buildArgs)).toBe(
			`BUILD_DB_PASS=${insertedPostgres.databasePassword}`,
		);
		expect(String(insertedMounts[0]?.content)).toBe(
			`password = ${insertedPostgres.databasePassword}`,
		);
		expect(String(nonReferencingApp?.env)).toBe("UNRELATED=1");

		expect(result.rotations).toHaveLength(1);
		expect(result.rotations[0]).toMatchObject({
			field: "databasePassword",
			occurrences: 3,
		});

		expect(
			result.warnings.some((w) => w.code === "ROTATION_CHECK_CONSUMERS"),
		).toBe(true);
	});

	it("leaves the password untouched when rotateDatabaseCredentials is false (the default)", async () => {
		const { result, insertedPostgres, insertedApps } =
			await runApplyForRotationTest(false);

		expect(insertedPostgres.databasePassword).toBe("realdbpassword123");

		const referencingApp = insertedApps.find(
			(a) => a.applicationId === result.idMap.application?.["app-1"],
		);
		expect(String(referencingApp?.env)).toContain("realdbpassword123");

		expect(result.rotations).toHaveLength(0);
		expect(
			result.warnings.some((w) => w.code === "ROTATION_CHECK_CONSUMERS"),
		).toBe(false);
	});
});
