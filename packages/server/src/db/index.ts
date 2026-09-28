import { and, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { dbUrl } from "./constants";
import * as schema from "./schema";

export { and, eq };
export * from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

// Este módulo se evalúa varias veces por proceso (copias duplicadas por
// esbuild y los chunks de Next); el cache en globalThis garantiza un solo
// pool de conexiones por proceso.
const globalForDb = globalThis as unknown as {
	db?: Database;
};

if (!globalForDb.db) {
	globalForDb.db = drizzle(postgres(dbUrl), {
		schema,
	});
}

export const db: Database = globalForDb.db;

export { dbUrl };
