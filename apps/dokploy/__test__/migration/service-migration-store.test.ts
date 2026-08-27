import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Overrides the global `@dokploy/server/db` mock (from `__test__/setup.ts`)
 * with one whose `insert().values().returning()` chain is controllable per
 * test, so the "second concurrent move for the same service" race can be
 * simulated by rejecting with a Postgres unique-violation-shaped error -
 * without needing a real database.
 */
const dbMocks = vi.hoisted(() => ({
	insertImpl: vi.fn(),
	valuesSpy: vi.fn(),
	setSpy: vi.fn(),
	whereSpy: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		insert: () => ({
			values: (data: unknown) => {
				dbMocks.valuesSpy(data);
				return { returning: () => dbMocks.insertImpl() };
			},
		}),
		delete: () => ({ where: () => Promise.resolve() }),
		update: () => ({
			set: (data: unknown) => {
				dbMocks.setSpy(data);
				return {
					where: (condition: unknown) => {
						dbMocks.whereSpy(condition);
						return Promise.resolve();
					},
				};
			},
		}),
		query: {
			serviceMigrations: {
				findFirst: () => Promise.resolve(undefined),
			},
		},
	},
	dbUrl: "postgres://mock",
}));

import {
	createPendingServiceMigration,
	isUniqueConstraintViolation,
	markServiceMigrationFailed,
	markServiceMigrationRollingBack,
} from "@dokploy/server/services/service-migration-store";

describe("isUniqueConstraintViolation", () => {
	it("recognizes a Postgres unique_violation SQLSTATE code", () => {
		expect(isUniqueConstraintViolation({ code: "23505" })).toBe(true);
	});

	it("rejects unrelated errors and shapes", () => {
		expect(isUniqueConstraintViolation(new Error("boom"))).toBe(false);
		expect(isUniqueConstraintViolation({ code: "23503" })).toBe(false);
		expect(isUniqueConstraintViolation(null)).toBe(false);
		expect(isUniqueConstraintViolation(undefined)).toBe(false);
	});
});

describe("createPendingServiceMigration", () => {
	beforeEach(() => {
		dbMocks.insertImpl.mockReset();
		dbMocks.valuesSpy.mockReset();
	});

	it("returns the inserted pending move record on success", async () => {
		dbMocks.insertImpl.mockResolvedValue([
			{ serviceMigrationId: "mig_1", postgresId: "pg_1", status: "preparing" },
		]);

		const row = await createPendingServiceMigration({
			serviceType: "postgres",
			id: "pg_1",
			sourceServerId: "server-a",
			targetServerId: "server-b",
		});

		expect(row.serviceMigrationId).toBe("mig_1");
	});

	it("persists the service-specific id column and durable volume names for the given service type", async () => {
		dbMocks.insertImpl.mockResolvedValue([
			{ serviceMigrationId: "mig_2", composeId: "compose_1" },
		]);

		await createPendingServiceMigration({
			serviceType: "compose",
			id: "compose_1",
			sourceServerId: "server-a",
			targetServerId: null,
			volumeNames: ["compose_app_data", "compose_app_cache"],
		});

		expect(dbMocks.valuesSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				composeId: "compose_1",
				serviceType: "compose",
				status: "preparing",
				sourceServerId: "server-a",
				targetServerId: null,
				volumeNames: ["compose_app_data", "compose_app_cache"],
				originalNetworkIds: [],
				originalStatus: undefined,
			}),
		);
	});

	it("converts a unique constraint violation (a second concurrent move) into a CONFLICT error", async () => {
		dbMocks.insertImpl.mockRejectedValue(
			Object.assign(
				new Error("duplicate key value violates unique constraint"),
				{ code: "23505" },
			),
		);

		await expect(
			createPendingServiceMigration({
				serviceType: "postgres",
				id: "pg_1",
				sourceServerId: "server-a",
				targetServerId: "server-b",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("rethrows unrelated insert failures instead of masking them as a conflict", async () => {
		dbMocks.insertImpl.mockRejectedValue(new Error("connection reset"));

		await expect(
			createPendingServiceMigration({
				serviceType: "postgres",
				id: "pg_1",
				sourceServerId: "server-a",
				targetServerId: "server-b",
			}),
		).rejects.toThrow("connection reset");
	});
});

describe("markServiceMigrationRollingBack", () => {
	beforeEach(() => {
		dbMocks.setSpy.mockReset();
	});

	it("sets status to 'rolling_back'", async () => {
		await markServiceMigrationRollingBack("mig_1");
		expect(dbMocks.setSpy).toHaveBeenCalledWith({ status: "rolling_back" });
	});
});

describe("markServiceMigrationFailed", () => {
	beforeEach(() => {
		dbMocks.setSpy.mockReset();
	});

	it("sets status to 'failed' and records the error, without deleting the row", async () => {
		await markServiceMigrationFailed({
			serviceMigrationId: "mig_1",
			error: "source restart failed: ECONNRESET",
		});
		expect(dbMocks.setSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "failed",
				error: "source restart failed: ECONNRESET",
			}),
		);
		const setArg = dbMocks.setSpy.mock.calls[0]?.[0] as { failedAt?: string };
		expect(typeof setArg.failedAt).toBe("string");
	});
});
