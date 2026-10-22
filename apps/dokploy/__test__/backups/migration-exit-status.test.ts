import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";
import { describe, expect, it } from "vitest";

const dependencies: Record<string, string> = {
	"@dokploy/server/db": 'export const dbUrl = "postgres://unused";',
	"drizzle-orm/postgres-js": "export const drizzle = () => ({});",
	"drizzle-orm/postgres-js/migrator":
		'export const migrate = async () => { throw new Error("migration test failure"); };',
	postgres:
		"export default function postgres() { return { end: async () => {} }; }",
};

const mockDependencies: Plugin = {
	name: "mock-migration-dependencies",
	setup(build) {
		build.onResolve(
			{
				filter:
					/^(@dokploy\/server\/db|drizzle-orm\/postgres-js(?:\/migrator)?|postgres)$/,
			},
			({ path }) => ({ path, namespace: "migration-test" }),
		);
		build.onLoad({ filter: /.*/, namespace: "migration-test" }, ({ path }) => ({
			contents: dependencies[path],
			loader: "js",
		}));
	},
};

describe("migration entrypoint", () => {
	it("exits with an error when a migration fails", async () => {
		const result = await build({
			entryPoints: [
				fileURLToPath(new URL("../../migration.ts", import.meta.url)),
			],
			bundle: true,
			platform: "node",
			format: "esm",
			write: false,
			plugins: [mockDependencies],
		});
		const child = spawnSync(process.execPath, ["--input-type=module", "-"], {
			encoding: "utf8",
			input: result.outputFiles[0]?.text,
		});

		expect(child.error).toBeUndefined();
		expect(child.status).toBe(1);
		expect(child.stderr).toContain("Migration failed");
		expect(child.stderr).toContain("migration test failure");
		expect(child.stdout).not.toContain("Migration complete");
	});
});
