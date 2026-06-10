import { runRuntimeMigrations } from "./run-migrations";

export const migration = async () => {
	await runRuntimeMigrations();
};
