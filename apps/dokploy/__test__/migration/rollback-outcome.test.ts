import { beforeEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({
	deleteServiceMigration: vi.fn(),
	markServiceMigrationFailed: vi.fn(),
}));

vi.mock("@dokploy/server/services/service-migration-store", () => storeMocks);

import {
	buildRollbackFailureMessage,
	resolveServiceMigrationAfterRollback,
} from "@dokploy/server/utils/migration/rollback-outcome";

describe("buildRollbackFailureMessage", () => {
	it("returns just the original error message when rollback fully succeeded", () => {
		expect(
			buildRollbackFailureMessage({
				originalError: new Error("target deploy failed"),
				cleanupErrors: [],
				restartError: null,
			}),
		).toBe("target deploy failed");
	});

	it("folds in cleanup errors", () => {
		const message = buildRollbackFailureMessage({
			originalError: new Error("target deploy failed"),
			cleanupErrors: [new Error("a"), new Error("b")],
			restartError: null,
		});
		expect(message).toContain("target deploy failed");
		expect(message).toContain("2 target cleanup step(s) failed");
	});

	it("folds in the source restart error - it must never be silently dropped", () => {
		const message = buildRollbackFailureMessage({
			originalError: new Error("target deploy failed"),
			cleanupErrors: [],
			restartError: new Error("ECONNRESET"),
		});
		expect(message).toContain("target deploy failed");
		expect(message).toContain("restarting the source service failed");
		expect(message).toContain("ECONNRESET");
	});
});

describe("resolveServiceMigrationAfterRollback", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("deletes the lock row when cleanup succeeded and no restart was needed/failed", async () => {
		const error = await resolveServiceMigrationAfterRollback({
			serviceMigrationId: "mig_1",
			originalError: new Error("boom"),
			cleanupErrors: [],
			restartError: null,
		});

		expect(storeMocks.deleteServiceMigration).toHaveBeenCalledWith("mig_1");
		expect(storeMocks.markServiceMigrationFailed).not.toHaveBeenCalled();
		expect(error.message).toBe("boom");
		expect(error.cause).toBeInstanceOf(Error);
	});

	it("retains the row as 'failed' instead of deleting it when cleanup failed", async () => {
		const error = await resolveServiceMigrationAfterRollback({
			serviceMigrationId: "mig_1",
			originalError: new Error("boom"),
			cleanupErrors: [new Error("volume rm failed")],
			restartError: null,
		});

		expect(storeMocks.deleteServiceMigration).not.toHaveBeenCalled();
		expect(storeMocks.markServiceMigrationFailed).toHaveBeenCalledWith(
			expect.objectContaining({ serviceMigrationId: "mig_1" }),
		);
		expect(error.message).toContain("target cleanup step(s) failed");
	});

	it("retains the row as 'failed' instead of deleting it when the source restart failed, even if cleanup succeeded", async () => {
		const error = await resolveServiceMigrationAfterRollback({
			serviceMigrationId: "mig_1",
			originalError: new Error("boom"),
			cleanupErrors: [],
			restartError: new Error("source did not come back up"),
		});

		expect(storeMocks.deleteServiceMigration).not.toHaveBeenCalled();
		expect(storeMocks.markServiceMigrationFailed).toHaveBeenCalledWith(
			expect.objectContaining({
				serviceMigrationId: "mig_1",
				error: expect.stringContaining("source did not come back up"),
			}),
		);
		expect(error.message).toContain("source did not come back up");
	});
});
