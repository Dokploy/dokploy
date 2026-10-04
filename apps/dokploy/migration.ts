import { dbUrl } from "@dokploy/server/db";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { migrateLibreDBStudio } from "./server/db/libredb-studio-migration";

const sql = postgres(dbUrl, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder: "drizzle" })
	.then(async () => {
		console.log("Migration complete");
		await migrateLibreDBStudio(db);
		sql.end();
	})
	.catch((error) => {
		console.log("Migration failed", error);
	})
	.finally(() => {
		sql.end();
	});
