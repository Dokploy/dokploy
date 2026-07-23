import { dbUrl } from "@dokploy/server/db";
import * as schema from "@dokploy/server/db/schema";
import { seedDevelopmentProjectData } from "@dokploy/server/services/development-seed";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const sql = postgres(dbUrl, { max: 1 });
const database = drizzle(sql, { schema });

try {
	await seedDevelopmentProjectData({ database });
} finally {
	await sql.end();
}
