import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	insertValues: vi.fn(),
	onConflictDoNothing: vi.fn(),
	updateSet: vi.fn(),
	updateWhere: vi.fn(),
	updateReturning: vi.fn(),
	deleteWhere: vi.fn(),
	selectRows: vi.fn(),
	appendFile: vi.fn(),
	execAsyncRemote: vi.fn(),
	updateApplicationStatus: vi.fn(),
	updateCompose: vi.fn(),
	updatePreviewDeployment: vi.fn(),
	findPreviewDeploymentById: vi.fn(),
}));

vi.mock("@dokploy/server/services/application", () => ({
	updateApplicationStatus: mocks.updateApplicationStatus,
}));

vi.mock("@dokploy/server/services/compose", () => ({
	updateCompose: mocks.updateCompose,
}));

vi.mock("@dokploy/server/services/preview-deployment", () => ({
	updatePreviewDeployment: mocks.updatePreviewDeployment,
	findPreviewDeploymentById: mocks.findPreviewDeploymentById,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		insert: () => ({
			values: (v: unknown) => {
				mocks.insertValues(v);
				return { onConflictDoNothing: mocks.onConflictDoNothing };
			},
		}),
		update: () => ({
			set: (v: unknown) => {
				mocks.updateSet(v);
				return {
					where: (w: unknown) => {
						mocks.updateWhere(w);
						const result = Promise.resolve(undefined) as Promise<unknown> & {
							returning: typeof mocks.updateReturning;
						};
						result.returning = mocks.updateReturning;
						return result;
					},
				};
			},
		}),
		delete: () => ({ where: mocks.deleteWhere }),
		select: () => ({
			from: () => ({ orderBy: () => mocks.selectRows() }),
		}),
	},
}));

vi.mock("node:fs/promises", () => ({ appendFile: mocks.appendFile }));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
}));

import {
	deleteQueueJobs,
	insertQueueJob,
	INTERRUPTED_DEPLOYMENT_MESSAGE,
	LOG_NOTE_TIMEOUT_MS,
	listQueueJobs,
	markInterruptedFromJournal,
	markInterruptedQueueDeployments,
	markQueueJobActive,
	requeueInterruptedQueueJobs,
} from "@dokploy/server/services/deployment-queue-journal";

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	mocks.updateApplicationStatus.mockReset().mockResolvedValue(undefined);
	mocks.updateCompose.mockReset().mockResolvedValue(undefined);
	mocks.updatePreviewDeployment.mockReset().mockResolvedValue(undefined);
	mocks.findPreviewDeploymentById.mockReset();
	mocks.onConflictDoNothing.mockResolvedValue(undefined);
	mocks.deleteWhere.mockResolvedValue(undefined);
	mocks.updateReturning.mockResolvedValue([]);
	mocks.appendFile.mockResolvedValue(undefined);
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	delete (globalThis as Record<symbol, unknown>)[
		Symbol.for("dokploy.interruptedQueueDeploymentsMarked")
	];
});

describe("journal row operations", () => {
	it("inserts a waiting row and tolerates a repeated id", async () => {
		await insertQueueJob("j1", { applicationId: "a" });
		expect(mocks.insertValues).toHaveBeenCalledWith({
			jobId: "j1",
			payload: { applicationId: "a" },
			state: "waiting",
		});
		expect(mocks.onConflictDoNothing).toHaveBeenCalledTimes(1);
	});

	it("flips a row to active with a start time", async () => {
		await markQueueJobActive("j1");
		expect(mocks.updateSet).toHaveBeenCalledWith({
			state: "active",
			startedAt: expect.any(Date),
		});
	});

	it("deletes by id, and does nothing for an empty list", async () => {
		await deleteQueueJobs(["j1", "j2"]);
		expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);
		await deleteQueueJobs([]);
		expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);
	});

	it("resets active rows to waiting and counts the attempt", async () => {
		await requeueInterruptedQueueJobs(["j1"]);
		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({ state: "waiting", startedAt: null }),
		);
		await requeueInterruptedQueueJobs([]);
		expect(mocks.updateSet).toHaveBeenCalledTimes(1);
	});

	it("lists rows oldest first", async () => {
		mocks.selectRows.mockResolvedValue([{ jobId: "j1" }]);
		await expect(listQueueJobs()).resolves.toEqual([{ jobId: "j1" }]);
	});
});

describe("markInterruptedQueueDeployments", () => {
	const active = (payload: Record<string, unknown>) => ({ payload });

	it("closes the running deployment as an error and writes the restart line to its log", async () => {
		mocks.updateReturning.mockResolvedValue([
			{ logPath: "/logs/app/a.log", serverId: null, buildServerId: null },
		]);

		const closed = await markInterruptedQueueDeployments([
			active({ applicationType: "application", applicationId: "a" }),
		]);

		expect(closed).toBe(1);
		expect(mocks.updateSet).toHaveBeenCalledWith({
			status: "error",
			errorMessage: INTERRUPTED_DEPLOYMENT_MESSAGE,
			finishedAt: expect.any(String),
		});
		expect(mocks.appendFile).toHaveBeenCalledWith(
			"/logs/app/a.log",
			`${INTERRUPTED_DEPLOYMENT_MESSAGE}\n`,
		);
		expect(INTERRUPTED_DEPLOYMENT_MESSAGE).toBe(
			"Interrupted by a Dokploy restart; re-queued",
		);
	});

	it("writes the line over SSH when the log lives on a remote server", async () => {
		mocks.updateReturning.mockResolvedValue([
			{
				logPath: "/etc/dokploy/logs/c.log",
				serverId: "srv",
				buildServerId: "build",
			},
		]);

		await markInterruptedQueueDeployments([
			active({ applicationType: "compose", composeId: "c", serverId: "srv" }),
		]);

		expect(mocks.appendFile).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"build",
			expect.stringContaining("/etc/dokploy/logs/c.log"),
		);
	});

	it("handles preview jobs and ignores payloads that name no service", async () => {
		mocks.updateReturning.mockResolvedValue([]);

		const closed = await markInterruptedQueueDeployments([
			active({
				applicationType: "application-preview",
				previewDeploymentId: "p",
			}),
			active({ applicationType: "application" }),
		]);

		expect(closed).toBe(0);
		// Only the preview job produced an UPDATE.
		expect(mocks.updateSet).toHaveBeenCalledTimes(1);
	});

	it("puts the service, compose or preview back to idle", async () => {
		await markInterruptedQueueDeployments([
			active({ applicationType: "application", applicationId: "a" }),
			active({ applicationType: "compose", composeId: "c" }),
			active({
				applicationType: "compose-preview",
				composeId: "c",
				previewDeploymentId: "p",
			}),
		]);

		expect(mocks.updateApplicationStatus).toHaveBeenCalledWith("a", "idle");
		expect(mocks.updateCompose).toHaveBeenCalledWith("c", {
			composeStatus: "idle",
		});
		expect(mocks.updatePreviewDeployment).toHaveBeenCalledWith("p", {
			previewStatus: "idle",
		});
	});

	it("resets the status even when the payload is not a runnable job", async () => {
		await markInterruptedQueueDeployments([
			active({ applicationId: "a", type: "garbage" }),
		]);
		expect(mocks.updateApplicationStatus).toHaveBeenCalledWith("a", "idle");
	});

	it("a failing status reset does not stop the marking", async () => {
		mocks.updateApplicationStatus.mockRejectedValue(new Error("db"));
		mocks.updateReturning.mockResolvedValue([
			{ logPath: "/logs/a.log", serverId: null, buildServerId: null },
		]);
		await expect(
			markInterruptedQueueDeployments([
				active({ applicationType: "application", applicationId: "a" }),
			]),
		).resolves.toBe(1);
	});

	it("derives a preview's log host like createDeploymentPreview does", async () => {
		mocks.updateReturning.mockResolvedValue([
			{
				logPath: "/logs/p.log",
				serverId: "app-server",
				buildServerId: null,
				previewDeploymentId: "p",
			},
		]);
		mocks.findPreviewDeploymentById.mockResolvedValue({
			application: { buildServerId: "build-srv", serverId: "app-server" },
			compose: null,
		});

		await markInterruptedQueueDeployments([
			active({
				applicationType: "application-preview",
				previewDeploymentId: "p",
			}),
		]);

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"build-srv",
			expect.stringContaining("/logs/p.log"),
		);
		expect(mocks.appendFile).not.toHaveBeenCalled();
	});

	it("skips the log write when a preview's host cannot be resolved", async () => {
		mocks.updateReturning.mockResolvedValue([
			{
				logPath: "/logs/p.log",
				serverId: null,
				buildServerId: null,
				previewDeploymentId: "p",
			},
		]);
		mocks.findPreviewDeploymentById.mockRejectedValue(new Error("not found"));

		await expect(
			markInterruptedQueueDeployments([
				active({
					applicationType: "application-preview",
					previewDeploymentId: "p",
				}),
			]),
		).resolves.toBe(1);
		expect(mocks.appendFile).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("bounds every log write and runs them in parallel, so unreachable servers cost one timeout", async () => {
		vi.useFakeTimers();
		try {
			mocks.updateReturning.mockResolvedValue([
				{ logPath: "/logs/1.log", serverId: "s1", buildServerId: null },
				{ logPath: "/logs/2.log", serverId: "s2", buildServerId: null },
				{ logPath: "/logs/3.log", serverId: "s3", buildServerId: null },
			]);
			mocks.execAsyncRemote.mockReturnValue(new Promise(() => {})); // hangs

			const done = markInterruptedQueueDeployments([
				active({ applicationType: "application", applicationId: "a" }),
			]);
			await vi.advanceTimersByTimeAsync(LOG_NOTE_TIMEOUT_MS + 10);

			await expect(done).resolves.toBe(3);
			expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(3);
		} finally {
			vi.useRealTimers();
		}
	});

	it("a log write failure does not stop the marking", async () => {
		mocks.updateReturning.mockResolvedValue([
			{ logPath: "/logs/a.log", serverId: null, buildServerId: null },
		]);
		mocks.appendFile.mockRejectedValue(new Error("ENOENT"));

		await expect(
			markInterruptedQueueDeployments([
				active({ applicationType: "application", applicationId: "a" }),
			]),
		).resolves.toBe(1);
	});
});

describe("markInterruptedFromJournal", () => {
	it("only looks at active rows, and only once per process", async () => {
		mocks.selectRows.mockResolvedValue([
			{
				jobId: "j1",
				state: "active",
				payload: { applicationType: "application", applicationId: "a" },
			},
			{
				jobId: "j2",
				state: "waiting",
				payload: { applicationType: "application", applicationId: "b" },
			},
		]);
		mocks.updateReturning.mockResolvedValue([
			{ logPath: "/logs/a.log", serverId: null, buildServerId: null },
		]);

		await expect(markInterruptedFromJournal()).resolves.toBe(1);
		expect(mocks.updateSet).toHaveBeenCalledTimes(1);

		await expect(markInterruptedFromJournal()).resolves.toBe(0);
		expect(mocks.updateSet).toHaveBeenCalledTimes(1);
	});

	it("never throws when the journal table cannot be read, and may retry later", async () => {
		mocks.selectRows.mockRejectedValue(
			new Error('relation "deployment_queue_job" does not exist'),
		);
		await expect(markInterruptedFromJournal()).resolves.toBe(0);

		mocks.selectRows.mockResolvedValue([]);
		await expect(markInterruptedFromJournal()).resolves.toBe(0);
		expect(mocks.selectRows).toHaveBeenCalledTimes(2);
	});
});
