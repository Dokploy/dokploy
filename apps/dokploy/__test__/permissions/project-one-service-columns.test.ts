import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Postgres allows at most 100 arguments per function call. Drizzle builds one
// json_build_array per nested relation with a single argument per column, so
// pulling a whole service table inside a `with` makes the query fail at runtime
// (the application table is already at 101 columns).
// The member branch of project.one was the only query missing `columns:`.
const PG_MAX_FUNCTION_ARGS = 100;

const SERVICE_RELATIONS = [
	"applications",
	"compose",
	"libsql",
	"mariadb",
	"mongo",
	"mysql",
	"postgres",
	"redis",
] as const;

const readSource = (relativePath: string) =>
	readFileSync(path.resolve(__dirname, "../..", relativePath), "utf8");

const countTableColumns = (source: string, table: string) => {
	const start = source.indexOf(`pgTable("${table}"`);
	const body = source.slice(start, source.indexOf("\n);", start));
	return [...body.matchAll(/^\t(\w+):/gm)].length;
};

describe("project.one — member branch", () => {
	it("application exceeds the Postgres function argument limit", () => {
		const schema = readSource(
			"../../packages/server/src/db/schema/application.ts",
		);

		// Once this no longer holds the risk is gone, but while it does no query
		// may pull the whole table inside a `with`.
		expect(countTableColumns(schema, "application")).toBeGreaterThan(
			PG_MAX_FUNCTION_ARGS,
		);
	});

	it("restricts columns on every service relation", () => {
		const router = readSource("server/api/routers/project.ts");
		const memberBranch = router.slice(
			router.indexOf("one: protectedProcedure"),
			router.indexOf("all: protectedProcedure"),
		);
		expect(memberBranch).not.toHaveLength(0);

		for (const relation of SERVICE_RELATIONS) {
			const start = memberBranch.indexOf(`${relation}: {`);
			expect(start, `missing relation ${relation}`).toBeGreaterThan(-1);

			const block = memberBranch.slice(start);
			expect(
				block.slice(0, block.indexOf("\n\t\t\t\t\t\t\t},")),
				`${relation} would pull the whole table and break the query`,
			).toContain("columns:");
		}
	});
});
