import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const returning = vi.fn();
	const chain = {
		set: () => chain,
		where: () => chain,
		values: () => chain,
		from: () => chain,
		returning,
	};
	return {
		chain,
		returning,
		studioFindMany: vi.fn(),
		runLibreDBStudioSync: vi.fn(),
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: {
		insert: vi.fn(() => mocks.chain),
		update: vi.fn(() => mocks.chain),
		delete: vi.fn(() => mocks.chain),
		select: vi.fn(() => mocks.chain),
		query: {
			environments: { findMany: vi.fn(async () => []) },
			libredbStudio: { findMany: mocks.studioFindMany },
		},
	},
}));

vi.mock("@dokploy/server/utils/libredb-studio/sync", () => ({
	runLibreDBStudioSync: mocks.runLibreDBStudioSync,
	loadLibreDBStudioScope: vi.fn(),
}));

const { createPostgres } = await import("@dokploy/server/services/postgres");

const input = {
	name: "Orders DB",
	appName: "orders-db",
	databaseName: "orders",
	databaseUser: "orders",
	databasePassword: "orders-pass",
	dockerImage: "postgres:18",
	environmentId: "env-1",
};

const row = { postgresId: "pg-1", environmentId: "env-1", serverId: null };

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
	mocks.returning.mockResolvedValue([row]);
	mocks.studioFindMany.mockResolvedValue([
		{ libredbStudioId: "studio-1", application: { serverId: null } },
	]);
});

afterEach(() => {
	errorSpy.mockRestore();
	vi.useRealTimers();
});

describe("a failing LibreDB Studio sync", () => {
	it("does not fail the database operation that scheduled it", async () => {
		mocks.runLibreDBStudioSync.mockRejectedValue(
			new Error("seed write failed"),
		);

		await expect(createPostgres(input)).resolves.toBe(row);
		expect(mocks.runLibreDBStudioSync).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1000);

		await vi.waitFor(() =>
			expect(errorSpy).toHaveBeenCalledWith(
				"[libredb-studio] Seed sync failed for Studio studio-1:",
				expect.objectContaining({ message: "seed write failed" }),
			),
		);
	});

	it("does not fail the database operation when scheduling itself fails", async () => {
		const timerSpy = vi
			.spyOn(globalThis, "setTimeout")
			.mockImplementation(() => {
				throw new Error("no timers");
			});

		await expect(createPostgres(input)).resolves.toBe(row);

		expect(errorSpy).toHaveBeenCalledWith(
			"[libredb-studio] Could not schedule a seed sync:",
			expect.objectContaining({ message: "no timers" }),
		);
		timerSpy.mockRestore();
	});
});
