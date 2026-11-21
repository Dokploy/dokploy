import { dbUrl } from "@dokploy/server/db";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const sql = postgres(dbUrl, { max: 1 });
const db = drizzle(sql);

try {
	await migrate(db, { migrationsFolder: "drizzle" });
	console.log("Migration complete");
} catch (error) {
	console.error("Migration failed", error);
	throw error;
} finally {
	await sql.end();
}
