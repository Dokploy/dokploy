import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import micromatch from "micromatch";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	migrate: vi.fn(),
	end: vi.fn(),
	db: { name: "db" },
}));

vi.mock("drizzle-orm/postgres-js/migrator", () => ({ migrate: mocks.migrate }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: () => mocks.db }));
vi.mock("postgres", () => ({ default: () => ({ end: mocks.end }) }));
vi.mock("@dokploy/server/db", () => ({ dbUrl: "postgres://test" }));

const appRoot = path.resolve(__dirname, "../..");
const dokployFolder = path.join(appRoot, "drizzle");
const studioFolder = path.join(appRoot, "drizzle-libredb-studio");

const readJournal = (folder: string) =>
	JSON.parse(readFileSync(path.join(folder, "meta/_journal.json"), "utf8")) as {
		entries: { tag: string }[];
	};

const listFiles = (folder: string): string[] =>
	readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? listFiles(path.join(folder, entry.name))
			: [entry.name],
	);

describe("Dokploy's own migrations folder", () => {
	it("has no LibreDB Studio entry in its journal", () => {
		const tags = readJournal(dokployFolder).entries.map((entry) => entry.tag);
		expect(tags.filter((tag) => tag.includes("libredb"))).toEqual([]);
	});

	it("holds no LibreDB Studio file", () => {
		expect(
			listFiles(dokployFolder).filter((name) =>
				name.includes("libredb_studio"),
			),
		).toEqual([]);
	});
});

describe("Dokploy's own drizzle-kit config", () => {
	it("leaves the LibreDB Studio schema file out of its schema input", async () => {
		const { default: config } = await import("../../server/db/drizzle.config");
		const schemaFolder = path.resolve(
			appRoot,
			"../../packages/server/src/db/schema",
		);
		const inputs = readdirSync(schemaFolder)
			.map((name) => path.relative(appRoot, path.join(schemaFolder, name)))
			.filter((file) => micromatch.isMatch(file, config.schema as string))
			.map((file) => path.basename(file));
		expect(inputs).toContain("application.ts");
		expect(inputs).not.toContain("libredb-studio.ts");
	});

	it("keeps its other commands off the libredb_studio table", async () => {
		const { default: config } = await import("../../server/db/drizzle.config");
		expect(config.tablesFilter).toEqual(["!libredb_studio"]);
	});
});

describe("the LibreDB Studio drizzle-kit config", () => {
	it("records into the migrations table the runners pass to migrate", async () => {
		const { default: config } = await import(
			"../../server/db/drizzle.libredb-studio.config"
		);
		expect(config.migrations).toEqual({
			table: studioMigration.migrationsTable,
			schema: "drizzle",
		});
	});
});

describe("the LibreDB Studio migrations folder", () => {
	it("has a journal with exactly one entry", () => {
		expect(existsSync(studioFolder)).toBe(true);
		expect(readJournal(studioFolder).entries).toHaveLength(1);
	});

	it("creates libredb_studio idempotently and references application without creating it", () => {
		const [entry] = readJournal(studioFolder).entries;
		const sql = readFileSync(
			path.join(studioFolder, `${entry?.tag}.sql`),
			"utf8",
		);
		expect(sql).toContain('CREATE TABLE IF NOT EXISTS "libredb_studio" (');
		expect(sql).not.toMatch(/CREATE TABLE (IF NOT EXISTS )?"application"/);
		expect(sql).toMatch(
			/DO \$\$ BEGIN\s+ALTER TABLE "libredb_studio" ADD CONSTRAINT "libredb_studio_applicationId_application_applicationId_fk" FOREIGN KEY \("applicationId"\) REFERENCES "public"\."application"\("applicationId"\) ON DELETE cascade ON UPDATE no action;\s+EXCEPTION\s+WHEN duplicate_object THEN null;\s+END \$\$;/,
		);
		expect(sql).toContain("--> statement-breakpoint");
	});
});

const studioMigration = {
	migrationsFolder: "drizzle-libredb-studio",
	migrationsTable: "__drizzle_migrations_libredb_studio",
};

const runners: [string, () => Promise<unknown>][] = [
	["the migration:run script", async () => import("../../migration")],
	[
		"the exported migration runner",
		async () => {
			const { migration } = await import("../../server/db/migration");
			await migration();
		},
	],
];

describe.each(runners)("%s", (_name, run) => {
	beforeEach(() => {
		vi.resetModules();
		mocks.migrate.mockReset();
		mocks.end.mockReset();
	});

	it("applies Dokploy's migrations, then the LibreDB Studio migrations from their own folder and table", async () => {
		mocks.migrate.mockResolvedValue(undefined);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});

		await run();

		expect(mocks.migrate).toHaveBeenCalledTimes(2);
		expect(mocks.migrate).toHaveBeenNthCalledWith(1, mocks.db, {
			migrationsFolder: "drizzle",
		});
		expect(mocks.migrate).toHaveBeenNthCalledWith(2, mocks.db, studioMigration);
		expect(log).toHaveBeenCalledWith("LibreDB Studio migration complete");
		expect(mocks.end).toHaveBeenCalled();
		log.mockRestore();
	});

	it("reports a failure of the LibreDB Studio migrations as such", async () => {
		const error = new Error("relation already exists");
		mocks.migrate.mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});

		await run();

		expect(log).toHaveBeenCalledWith("Migration complete");
		expect(log).toHaveBeenCalledWith("LibreDB Studio migration failed", error);
		expect(log).not.toHaveBeenCalledWith("Migration failed", error);
		expect(mocks.end).toHaveBeenCalled();
		log.mockRestore();
	});
});
