import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	scheduleJob: vi.fn(),
	studioFindMany: vi.fn(),
	runLibreDBStudioSync: vi.fn(),
}));

vi.mock("node-schedule", () => ({
	scheduleJob: mocks.scheduleJob,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { libredbStudio: { findMany: mocks.studioFindMany } },
	},
}));

vi.mock("@dokploy/server/utils/libredb-studio/sync", () => ({
	runLibreDBStudioSync: mocks.runLibreDBStudioSync,
	loadLibreDBStudioScope: vi.fn(),
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
	updateApplication: vi.fn(),
}));

vi.mock("@dokploy/server/utils/builders", () => ({
	mechanizeDockerContainer: vi.fn(),
}));

const { initLibreDBStudioReconcileJob } = await import(
	"@dokploy/server/services/libredb-studio"
);

let errorSpy: ReturnType<typeof vi.spyOn>;

const registeredJob = () => {
	initLibreDBStudioReconcileJob();
	const job = mocks.scheduleJob.mock.calls[0]?.[2];
	if (typeof job !== "function") {
		throw new Error("the reconcile job was not registered");
	}
	return job as () => Promise<void>;
};

beforeEach(() => {
	vi.clearAllMocks();
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
	mocks.runLibreDBStudioSync.mockResolvedValue({
		changed: false,
		scope: {
			application: { networkIds: [] },
			coverage: { requiredNetworkIds: [] },
		},
	});
});

afterEach(() => {
	errorSpy.mockRestore();
});

describe("initLibreDBStudioReconcileJob", () => {
	it("registers a job that runs every five minutes", () => {
		initLibreDBStudioReconcileJob();

		expect(mocks.scheduleJob).toHaveBeenCalledWith(
			"libredb-studio-reconcile",
			"*/5 * * * *",
			expect.any(Function),
		);
	});

	it("syncs every Studio when the job fires", async () => {
		mocks.studioFindMany.mockResolvedValue([
			{ libredbStudioId: "studio-1" },
			{ libredbStudioId: "studio-2" },
		]);

		await registeredJob()();

		expect(mocks.runLibreDBStudioSync).toHaveBeenNthCalledWith(
			1,
			"studio-1",
			{},
		);
		expect(mocks.runLibreDBStudioSync).toHaveBeenNthCalledWith(
			2,
			"studio-2",
			{},
		);
	});

	it("logs a reconcile failure instead of rejecting", async () => {
		mocks.studioFindMany.mockRejectedValue(new Error("database down"));

		await expect(registeredJob()()).resolves.toBeUndefined();

		expect(errorSpy).toHaveBeenCalledWith(
			"[libredb-studio] Reconcile job failed:",
			expect.objectContaining({ message: "database down" }),
		);
	});
});
