import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => [] as string[]);

// PostgreSQL refuses a function call with more than 100 arguments, and drizzle
// builds each nested relation row with a single json_build_array call.
const POSTGRES_MAX_FUNCTION_ARGS = 100;

vi.mock("@dokploy/server/db", async () => {
	const { drizzle } = await import("drizzle-orm/postgres-js");
	const schema = await import("@dokploy/server/db/schema");
	const real = drizzle.mock({ schema });
	const record = (query: { toSQL: () => { sql: string } }) => {
		captured.push(query.toSQL().sql);
	};
	return {
		db: {
			query: {
				libredbStudio: {
					findFirst: (
						config: Parameters<typeof real.query.libredbStudio.findFirst>[0],
					) => {
						record(real.query.libredbStudio.findFirst(config));
						return Promise.resolve({ libredbStudioId: "studio-1" });
					},
					findMany: (
						config: Parameters<typeof real.query.libredbStudio.findMany>[0],
					) => {
						record(real.query.libredbStudio.findMany(config));
						return Promise.resolve([]);
					},
				},
			},
			select: real.select.bind(real),
		},
	};
});

const {
	findLibreDBStudioByApplicationId,
	findLibreDBStudioById,
	findLibreDBStudiosByEnvironment,
} = await import("@dokploy/server/services/libredb-studio");

const jsonBuildArrayArgumentCounts = (sql: string): number[] => {
	const counts: number[] = [];
	const marker = "json_build_array(";
	let start = sql.indexOf(marker);
	while (start !== -1) {
		let depth = 1;
		let args = 1;
		let quote: string | null = null;
		let empty = true;
		for (let i = start + marker.length; i < sql.length && depth > 0; i++) {
			const char = sql[i] as string;
			if (quote) {
				if (char === quote) quote = null;
				continue;
			}
			if (char === "'" || char === '"') {
				quote = char;
			} else if (char === "(") {
				depth++;
			} else if (char === ")") {
				depth--;
				continue;
			} else if (char === "," && depth === 1) {
				args++;
			}
			if (!/\s/.test(char)) empty = false;
		}
		counts.push(empty ? 0 : args);
		start = sql.indexOf(marker, start + marker.length);
	}
	return counts;
};

describe("LibreDB Studio service SQL", () => {
	it.each([
		["findLibreDBStudioById", () => findLibreDBStudioById("studio-1")],
		[
			"findLibreDBStudioByApplicationId",
			() => findLibreDBStudioByApplicationId("app-1"),
		],
		[
			"findLibreDBStudiosByEnvironment",
			() => findLibreDBStudiosByEnvironment("env-1"),
		],
	])(
		"%s passes PostgreSQL no function call with more than 100 arguments",
		async (_name, run) => {
			captured.length = 0;
			await run();
			expect(captured).toHaveLength(1);
			const counts = jsonBuildArrayArgumentCounts(captured[0] as string);
			expect(counts.length).toBeGreaterThan(0);
			expect(Math.max(...counts)).toBeLessThanOrEqual(
				POSTGRES_MAX_FUNCTION_ARGS,
			);
		},
	);
});
