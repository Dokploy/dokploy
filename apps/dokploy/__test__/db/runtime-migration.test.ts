import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const db = { id: "db" };
	const sql = { end: vi.fn().mockResolvedValue(undefined) };

	return {
		db,
		drizzle: vi.fn(() => db),
		logger: {
			error: vi.fn(),
			log: vi.fn(),
		},
		migrate: vi.fn().mockResolvedValue(undefined),
		postgres: vi.fn(() => sql),
		sql,
	};
});

vi.mock("@dokploy/server/db/constants", () => ({
	dbUrl: "postgres://dokploy:test@localhost:5432/dokploy",
}));

vi.mock("postgres", () => ({
	default: mocks.postgres,
}));

vi.mock("drizzle-orm/postgres-js", () => ({
	drizzle: mocks.drizzle,
}));

vi.mock("drizzle-orm/postgres-js/migrator", () => ({
	migrate: mocks.migrate,
}));

import { runRuntimeMigrations } from "../../server/db/run-migrations";

describe("runtime migrations", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.sql.end.mockResolvedValue(undefined);
		mocks.migrate.mockResolvedValue(undefined);
	});

	test("runs the default migration folder and closes the connection once", async () => {
		await runRuntimeMigrations({ logger: mocks.logger });

		expect(mocks.postgres).toHaveBeenCalledWith(
			"postgres://dokploy:test@localhost:5432/dokploy",
			{ max: 1 },
		);
		expect(mocks.drizzle).toHaveBeenCalledWith(mocks.sql);
		expect(mocks.migrate).toHaveBeenCalledWith(mocks.db, {
			migrationsFolder: "drizzle",
		});
		expect(mocks.logger.log).toHaveBeenCalledWith("Migration complete");
		expect(mocks.logger.error).not.toHaveBeenCalled();
		expect(mocks.sql.end).toHaveBeenCalledTimes(1);
	});

	test("supports an explicit migration folder", async () => {
		await runRuntimeMigrations({
			logger: mocks.logger,
			migrationsFolder: "/app/drizzle",
		});

		expect(mocks.migrate).toHaveBeenCalledWith(mocks.db, {
			migrationsFolder: "/app/drizzle",
		});
		expect(mocks.sql.end).toHaveBeenCalledTimes(1);
	});

	test("rejects migration failures and still closes the connection once", async () => {
		const error = new Error("migration boom");
		mocks.migrate.mockRejectedValueOnce(error);

		await expect(runRuntimeMigrations({ logger: mocks.logger })).rejects.toBe(
			error,
		);

		expect(mocks.logger.error).toHaveBeenCalledWith("Migration failed", error);
		expect(mocks.logger.log).not.toHaveBeenCalled();
		expect(mocks.sql.end).toHaveBeenCalledTimes(1);
	});
});
