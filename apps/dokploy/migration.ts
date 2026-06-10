import { runRuntimeMigrations } from "./server/db/run-migrations";

try {
	await runRuntimeMigrations();
} catch {
	process.exit(1);
}
