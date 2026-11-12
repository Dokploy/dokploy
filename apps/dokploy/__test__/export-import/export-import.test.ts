import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => ({ db: {} }));
vi.mock("@dokploy/server/services/mount", () => ({
	createFileMount: vi.fn(async () => {}),
}));
vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(async (applicationId: string) => ({
		applicationId,
		domains: [{ domainId: "d" }],
		security: [{ securityId: "s" }],
		redirects: [{ redirectId: "r" }],
	})),
}));
vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: vi.fn(async () => {}),
}));
vi.mock("@dokploy/server/utils/traefik/security", () => ({
	createSecurityMiddleware: vi.fn(async () => {}),
}));
vi.mock("@dokploy/server/utils/traefik/redirect", () => ({
	createRedirectMiddleware: vi.fn(async () => {}),
}));

import {
	applications,
	compose,
	domains,
	environments,
	libsql,
	mounts,
	ports,
	postgres,
	projects,
} from "@dokploy/server/db/schema";
import {
	BundleCryptoError,
	BundleFormatError,
	encryptPayload,
	exportProject,
	importBundle,
	readBundle,
	replaceAppNames,
} from "@dokploy/server/services/project-export-import";
import { createRedirectMiddleware } from "@dokploy/server/utils/traefik/redirect";
import { createSecurityMiddleware } from "@dokploy/server/utils/traefik/security";

const PASSPHRASE = "correct horse battery";

const sourceTree = () => ({
	projectId: "p1",
	name: "Shop",
	description: null,
	organizationId: "org-source",
	env: "DB_URL=postgres://user@shop-db-abc123:5432/app",
	createdAt: "2026-01-01",
	projectTags: [{ tag: { name: "prod", color: "#f00" } }],
	environments: [
		{
			environmentId: "e1",
			name: "production",
			isDefault: true,
			env: "",
			projectId: "p1",
			createdAt: "2026-01-01",
			applications: [
				{
					applicationId: "a1",
					name: "web",
					appName: "shop-web-xyz789",
					environmentId: "e1",
					env: "DATABASE_URL=postgres://shop-db-abc123:5432/app",
					sourceType: "github",
					githubId: "gh-1",
					registryId: "reg-1",
					serverId: "srv-1",
					networkIds: [],
					applicationStatus: "done",
					domains: [
						{
							domainId: "d1",
							host: "shop.example.com",
							path: "/",
							enabled: true,
							uniqueConfigKey: 7,
							applicationId: "a1",
						},
					],
					mounts: [
						{
							mountId: "m1",
							type: "file",
							filePath: "config/app.json",
							content: "{}",
							applicationId: "a1",
						},
					],
					redirects: [],
					security: [],
					ports: [{ portId: "po1", publishedPort: 8080, targetPort: 80 }],
				},
			],
			compose: [],
			postgres: [
				{
					postgresId: "pg1",
					name: "db",
					appName: "shop-db-abc123",
					environmentId: "e1",
					databasePassword: "secret",
					externalPort: 5432,
					serverId: "srv-1",
					applicationStatus: "done",
					mounts: [],
				},
			],
			mysql: [],
			mariadb: [],
			mongo: [],
			redis: [],
			libsql: [],
		},
	],
});

const exportDb = (tree = sourceTree()) => {
	const applications = tree.environments.flatMap((env) => env.applications);
	return {
		query: {
			projects: {
				findFirst: vi.fn(async () => ({
					...tree,
					environments: tree.environments.map(
						({ applications: _applications, ...env }) => env,
					),
				})),
			},
			applications: { findMany: vi.fn(async () => applications) },
		},
	} as never;
};

const fakeImportDb = (existing: {
	projectNames?: string[];
	appPorts?: number[];
	dbPorts?: number[];
	libsqlPorts?: Record<string, number>[];
	domains?: { host: string; path: string }[];
	appNames?: string[];
}) => {
	const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
	let id = 0;
	const tx = {
		query: { tags: { findFirst: vi.fn(async () => undefined) } },
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => {
				id += 1;
				const row = {
					...values,
					projectId: values.projectId ?? `new-project-${id}`,
					environmentId: values.environmentId ?? `new-env-${id}`,
					applicationId: `new-app-${id}`,
					postgresId: `new-pg-${id}`,
					libsqlId: `new-libsql-${id}`,
					composeId: `new-compose-${id}`,
					mountId: `new-mount-${id}`,
					tagId: `new-tag-${id}`,
				};
				inserts.push({ table, values });
				const result = Promise.resolve(undefined);
				return Object.assign(result, {
					returning: async () => [row],
				});
			},
		}),
		update: () => ({ set: () => ({ where: async () => {} }) }),
	};
	const appNameRows = (existing.appNames ?? []).map((appName) => ({ appName }));
	const table = (rows: () => unknown[]) => ({
		findMany: vi.fn(async (args?: { columns?: { appName?: boolean } }) =>
			args?.columns?.appName ? appNameRows : rows(),
		),
	});
	const db = {
		query: {
			projects: {
				findFirst: vi.fn(async () =>
					existing.projectNames?.length ? { projectId: "existing" } : undefined,
				),
			},
			applications: table(() => [
				{
					applicationId: "other",
					ports: (existing.appPorts ?? []).map((publishedPort) => ({
						publishedPort,
					})),
				},
			]),
			compose: table(() => []),
			postgres: table(() =>
				(existing.dbPorts ?? []).map((externalPort) => ({ externalPort })),
			),
			mysql: table(() => []),
			mariadb: table(() => []),
			mongo: table(() => []),
			redis: table(() => []),
			libsql: table(() => existing.libsqlPorts ?? []),
			domains: { findMany: vi.fn(async () => existing.domains ?? []) },
		},
		transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
	};
	const insertsInto = (table: unknown) =>
		inserts.filter((insert) => insert.table === table).map((i) => i.values);
	return { db: db as never, insertsInto };
};

const exportedPayload = async (serviceIds?: string[]) => {
	const { content } = await exportProject(exportDb(), {
		projectId: "p1",
		serviceIds,
		passphrase: PASSPHRASE,
	});
	return (await readBundle(content, PASSPHRASE)).payload;
};

describe("bundle encryption", () => {
	it("round-trips the payload and names the file after the project", async () => {
		const { filename, content } = await exportProject(exportDb(), {
			projectId: "p1",
			passphrase: PASSPHRASE,
		});
		expect(filename).toMatch(/^shop-\d{4}-\d{2}-\d{2}\.dokploy$/);
		expect(content).not.toContain("secret");
		const { payload } = await readBundle(content, PASSPHRASE);
		expect(payload.project.name).toBe("Shop");
	});

	it("rejects a wrong passphrase", async () => {
		const { content } = await exportProject(exportDb(), {
			projectId: "p1",
			passphrase: PASSPHRASE,
		});
		await expect(
			readBundle(content, "a different passphrase"),
		).rejects.toBeInstanceOf(BundleCryptoError);
	});

	it("rejects a tampered bundle", async () => {
		const { content } = await exportProject(exportDb(), {
			projectId: "p1",
			passphrase: PASSPHRASE,
		});
		const envelope = JSON.parse(content);
		const data = Buffer.from(envelope.data, "base64");
		data[0] = (data[0] ?? 0) ^ 1;
		envelope.data = data.toString("base64");
		await expect(
			readBundle(JSON.stringify(envelope), PASSPHRASE),
		).rejects.toBeInstanceOf(BundleCryptoError);
	});

	it("rejects files that are not bundles and bundles from a newer format", async () => {
		await expect(readBundle("not json", PASSPHRASE)).rejects.toBeInstanceOf(
			BundleFormatError,
		);
		const { content } = await exportProject(exportDb(), {
			projectId: "p1",
			passphrase: PASSPHRASE,
		});
		const newer = { ...JSON.parse(content), formatVersion: 99 };
		await expect(readBundle(JSON.stringify(newer), PASSPHRASE)).rejects.toThrow(
			/newer version/,
		);
	});

	const bundleWithAppName = async (appName: string) => {
		const { content } = await exportProject(exportDb(), {
			projectId: "p1",
			passphrase: PASSPHRASE,
		});
		const { payload } = await readBundle(content, PASSPHRASE);
		payload.services[0]!.appName = appName;
		return JSON.stringify({
			...JSON.parse(content),
			...(await encryptPayload(JSON.stringify(payload), PASSPHRASE)),
		});
	};

	it.each(["unused/../victim", "..", "."])(
		"rejects a bundle with the app name %j",
		async (appName) => {
			await expect(
				readBundle(await bundleWithAppName(appName), PASSPHRASE),
			).rejects.toBeInstanceOf(BundleFormatError);
		},
	);

	it("accepts generated app names longer than 63 characters", async () => {
		const appName = `${"a".repeat(63)}-abc123`;
		const { payload } = await readBundle(
			await bundleWithAppName(appName),
			PASSPHRASE,
		);
		expect(payload.services[0]?.appName).toBe(appName);
	});
});

describe("exportProject", () => {
	it("drops references to resources that live outside the project", async () => {
		const payload = await exportedPayload();
		const app = payload.services.find((s) => s.kind === "application");
		expect(app).toBeDefined();
		expect(app).not.toHaveProperty("githubId");
		expect(app).not.toHaveProperty("registryId");
		expect(app).not.toHaveProperty("serverId");
		expect(payload.project).not.toHaveProperty("organizationId");
		expect(app?.domains).toHaveLength(1);
		expect(payload.tags).toEqual([{ name: "prod", color: "#f00" }]);
	});

	it("warns about git providers and registries that must be reconnected", async () => {
		const payload = await exportedPayload();
		expect(payload.warnings.join("\n")).toMatch(
			/"web" uses a connected git provider/,
		);
		expect(payload.warnings.join("\n")).toMatch(/"web" uses a registry/);
	});

	it("only includes the selected services", async () => {
		const payload = await exportedPayload(["pg1"]);
		expect(payload.services.map((s) => s.kind)).toEqual(["postgres"]);
	});
});

describe("replaceAppNames", () => {
	it("replaces whole app names only", () => {
		const map = { "db-abc": "db-new" };
		expect(replaceAppNames("host=db-abc;other=mydb-abc", map)).toBe(
			"host=db-new;other=mydb-abc",
		);
	});
});

describe("importBundle", () => {
	beforeEach(() => vi.clearAllMocks());

	it("creates the project on the chosen server keeping the app names", async () => {
		const payload = await exportedPayload();
		const { db, insertsInto } = fakeImportDb({});
		const result = await importBundle(db, payload, {
			organizationId: "org-target",
			serverId: "srv-target",
		});

		expect(result.projectName).toBe("Shop");
		const [project] = insertsInto(projects);
		expect(project?.organizationId).toBe("org-target");
		const [pg] = insertsInto(postgres);
		const [app] = insertsInto(applications);
		expect(pg?.appName).toBe("shop-db-abc123");
		expect(app?.appName).toBe("shop-web-xyz789");
		expect(pg?.serverId).toBe("srv-target");
		expect(pg?.applicationStatus).toBe("idle");
		expect(app?.githubId).toBeUndefined();
		expect(app?.env).toBe("DATABASE_URL=postgres://shop-db-abc123:5432/app");
		expect(result.warnings.join("\n")).not.toMatch(/already exists/);
		expect(insertsInto(environments)).toHaveLength(1);
		const [domain] = insertsInto(domains);
		expect(domain).not.toHaveProperty("uniqueConfigKey");
		expect(domain?.enabled).toBe(true);
		expect(insertsInto(mounts)).toHaveLength(1);
		expect(createSecurityMiddleware).toHaveBeenCalledTimes(1);
		expect(createRedirectMiddleware).toHaveBeenCalledTimes(1);
	});

	it("imports forward-auth domains disabled and flags domains generated for the source IP", async () => {
		const payload = await exportedPayload();
		const app = payload.services.find((s) => s.kind === "application");
		const [domain] = app?.domains as Record<string, unknown>[];
		domain!.host = "shop-web-1-2-3-4.sslip.io";
		domain!.forwardAuthEnabled = true;
		const { db, insertsInto } = fakeImportDb({});
		const result = await importBundle(db, payload, {
			organizationId: "org",
			serverId: null,
		});
		expect(insertsInto(domains)[0]).toMatchObject({
			forwardAuthEnabled: false,
			enabled: false,
		});
		expect(result.warnings.join("\n")).toMatch(/used forward auth/);
		expect(result.warnings.join("\n")).toMatch(/source server's IP/);
	});

	it("drops libsql gRPC and admin ports that are already published", async () => {
		const payload = await exportedPayload();
		payload.services.push({
			kind: "libsql",
			environmentId: "e1",
			appName: "shop-libsql-aaa111",
			name: "libsql",
			externalGRPCPort: 5001,
			externalAdminPort: 5002,
			mounts: [],
		});
		const { db, insertsInto } = fakeImportDb({
			libsqlPorts: [{ externalGRPCPort: 5001 }],
		});
		await importBundle(db, payload, { organizationId: "org", serverId: null });
		const [row] = insertsInto(libsql);
		expect(row?.externalGRPCPort).toBeNull();
		expect(row?.externalAdminPort).toBe(5002);
	});

	it("renames only services whose app name is taken and rewrites references", async () => {
		const payload = await exportedPayload();
		const { db, insertsInto } = fakeImportDb({ appNames: ["shop-db-abc123"] });
		const result = await importBundle(db, payload, {
			organizationId: "org",
			serverId: null,
		});
		const [pg] = insertsInto(postgres);
		const [project] = insertsInto(projects);
		expect(pg?.appName).not.toBe("shop-db-abc123");
		expect(insertsInto(applications)[0]?.appName).toBe("shop-web-xyz789");
		expect(insertsInto(applications)[0]?.env).toBe(
			`DATABASE_URL=postgres://${pg?.appName}:5432/app`,
		);
		expect(project?.env).toBe(`DB_URL=postgres://user@${pg?.appName}:5432/app`);
		expect(result.warnings.join("\n")).toMatch(/shop-db-abc123 already exists/);
	});

	it("resolves name, domain and port conflicts automatically", async () => {
		const payload = await exportedPayload();
		const { db, insertsInto } = fakeImportDb({
			projectNames: ["Shop"],
			appPorts: [8080],
			dbPorts: [5432],
			domains: [{ host: "shop.example.com", path: "/" }],
		});
		const result = await importBundle(db, payload, {
			organizationId: "org-target",
			serverId: null,
		});

		expect(result.projectName).toBe("imported-Shop");
		expect(insertsInto(ports)).toHaveLength(0);
		expect(insertsInto(postgres)[0]?.externalPort).toBeNull();
		expect(insertsInto(domains)[0]?.enabled).toBe(false);
		expect(result.warnings.join("\n")).toMatch(/shop\.example\.com/);
		expect(result.warnings.join("\n")).toMatch(/Port 8080/);
		expect(result.warnings.join("\n")).toMatch(/Port 5432/);
	});

	it("keeps the compose suffix so saved service names still match", async () => {
		const payload = await exportedPayload();
		payload.services.push({
			kind: "compose",
			environmentId: "e1",
			appName: "shop-stack-ccc333",
			name: "stack",
			randomize: true,
			suffix: "abc123",
			domains: [
				{
					domainId: "cd1",
					host: "stack.example.com",
					serviceName: "web-abc123",
				},
			],
			mounts: [],
		});
		const { db, insertsInto } = fakeImportDb({});
		await importBundle(db, payload, { organizationId: "org", serverId: null });
		expect(insertsInto(compose)[0]?.suffix).toBe("abc123");
		expect(
			insertsInto(domains).find((d) => d.host === "stack.example.com")
				?.serviceName,
		).toBe("web-abc123");
	});

	it.each(["../../etc/passwd", ".", ""])(
		"rejects the file mount path %j",
		async (filePath) => {
			const payload = await exportedPayload();
			const app = payload.services.find((s) => s.kind === "application");
			(app?.mounts as { filePath: string }[])[0]!.filePath = filePath;
			const { db } = fakeImportDb({});
			await expect(
				importBundle(db, payload, { organizationId: "org", serverId: null }),
			).rejects.toBeInstanceOf(BundleFormatError);
		},
	);
});
