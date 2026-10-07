import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sentry DOKPLOY-COMMUNITY-1B (and the background variant of -22): a cron
 * callback or fire-and-forget call that talks to a remote server over SSH and
 * rejects ("SSH connection error: Timed out while waiting for handshake",
 * EHOSTUNREACH) used to reach the process-wide `unhandledRejection` handler
 * with no context. node-schedule, setInterval and a bare `void promise` all
 * drop the promise they are handed.
 */

const mocks = vi.hoisted(() => ({
	cleanupAll: vi.fn(),
	sendDockerCleanupNotifications: vi.fn(),
	scheduleJob: vi.fn(),
	removeJob: vi.fn(),
	schedule: vi.fn(),
}));

vi.mock("node-schedule", () => ({
	scheduleJob: mocks.scheduleJob,
	scheduledJobs: {},
}));

vi.mock("@dokploy/server", async () => {
	const background = await import("@dokploy/server/utils/process/background");
	return {
		...background,
		CLEANUP_CRON_JOB: "0 0 * * *",
		IS_CLOUD: false,
		cleanupAll: mocks.cleanupAll,
		sendDockerCleanupNotifications: mocks.sendDockerCleanupNotifications,
	};
});

vi.mock("@/server/utils/backup", () => ({
	schedule: mocks.schedule,
	removeJob: mocks.removeJob,
}));

import {
	backgroundJob,
	isEnvironmentError,
	runBackgroundJob,
	setBackgroundErrorReporter,
} from "@dokploy/server/utils/process/background";
import { ExecError } from "@dokploy/server/utils/process/execAsync";
import { applyDockerCleanupSchedule } from "@/server/utils/docker-cleanup";

const sshTimeout = () =>
	new ExecError("SSH connection error: Timed out while waiting for handshake", {
		command: "docker system prune -f",
		serverId: "srv-1",
	});

let unhandled: unknown[];
const onUnhandled = (reason: unknown) => {
	unhandled.push(reason);
};
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	unhandled = [];
	process.on("unhandledRejection", onUnhandled);
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	vi.clearAllMocks();
});

afterEach(() => {
	setBackgroundErrorReporter(undefined);
	process.off("unhandledRejection", onUnhandled);
	errorSpy.mockRestore();
});

// Lets any pending rejection reach the process-level handler.
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("runBackgroundJob", () => {
	it("resolves instead of rejecting when the job fails over SSH", async () => {
		await expect(
			runBackgroundJob(
				"test job",
				async () => {
					throw sshTimeout();
				},
				{ serverId: "srv-1" },
			),
		).resolves.toBeUndefined();

		expect(errorSpy).toHaveBeenCalledTimes(1);
		const [message, context, detail] = errorSpy.mock.calls[0] as [
			string,
			unknown,
			string,
		];
		expect(message).toBe("test job failed");
		expect(context).toEqual({ serverId: "srv-1" });
		expect(detail).toContain("Timed out while waiting for handshake");
		await settle();
		expect(unhandled).toEqual([]);
	});

	it("also contains a job that throws synchronously", async () => {
		await expect(
			runBackgroundJob("sync job", () => {
				throw new Error("boom");
			}),
		).resolves.toBeUndefined();
		expect(errorSpy).toHaveBeenCalledTimes(1);
	});

	it("does not log when the job succeeds", async () => {
		const job = vi.fn().mockResolvedValue("ok");
		await runBackgroundJob("ok job", job);
		expect(job).toHaveBeenCalledTimes(1);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("backgroundJob returns a callback that never rejects", async () => {
		const wrapped = backgroundJob("wrapped", async () => {
			throw sshTimeout();
		});
		await expect(wrapped()).resolves.toBeUndefined();
		await settle();
		expect(unhandled).toEqual([]);
	});
});

describe("isEnvironmentError", () => {
	it.each([
		["an ExecError", sshTimeout()],
		[
			"an ssh2 error with a level",
			Object.assign(new Error("All configured authentication methods failed"), {
				level: "client-authentication",
			}),
		],
		...[
			"ECONNREFUSED",
			"EHOSTUNREACH",
			"ENETUNREACH",
			"EHOSTDOWN",
			"ETIMEDOUT",
			"ECONNRESET",
			"EPIPE",
		].map((code) => [
			`a ${code} system error`,
			Object.assign(new Error(`connect ${code}`), { code }),
		]),
		["an SSH connection error message", new Error("SSH connection error: x")],
		[
			"a handshake timeout message",
			new Error("Timed out while waiting for handshake"),
		],
		[
			"an environment error buried in the cause chain",
			new Error("wrapper", {
				cause: new Error("middle", {
					cause: Object.assign(new Error("connect"), { code: "EHOSTUNREACH" }),
				}),
			}),
		],
	] as [string, unknown][])(
		"treats %s as an environment error",
		(_name, error) => {
			expect(isEnvironmentError(error)).toBe(true);
		},
	);

	it.each([
		["a TypeError", new TypeError("x is not a function")],
		["a plain Error", new Error("boom")],
		[
			"an unrelated error code",
			Object.assign(new Error("nope"), { code: "ENOENT" }),
		],
		["a string", "SSH is great"],
		["undefined", undefined],
	] as [string, unknown][])("treats %s as a bug", (_name, error) => {
		expect(isEnvironmentError(error)).toBe(false);
	});

	it("survives a cyclic cause chain", () => {
		const a = new Error("a") as Error & { cause?: unknown };
		const b = new Error("b") as Error & { cause?: unknown };
		a.cause = b;
		b.cause = a;
		expect(isEnvironmentError(a)).toBe(false);
	});
});

describe("reporting of unexpected errors", () => {
	it("does not report an offline server, only logs it", async () => {
		const reporter = vi.fn();
		setBackgroundErrorReporter(reporter);

		await runBackgroundJob("cleanup", async () => {
			throw sshTimeout();
		});

		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(reporter).not.toHaveBeenCalled();
	});

	it("reports a programmer error with the backgroundJob tag, and still resolves", async () => {
		const reporter = vi.fn();
		setBackgroundErrorReporter(reporter);
		const bug = new TypeError("Cannot read properties of undefined");

		await expect(
			backgroundJob(
				"cleanup",
				async () => {
					throw bug;
				},
				{ serverId: "srv-1" },
			)(),
		).resolves.toBeUndefined();

		expect(errorSpy).toHaveBeenCalledWith(
			"cleanup failed",
			{ serverId: "srv-1" },
			"Cannot read properties of undefined",
		);
		expect(reporter).toHaveBeenCalledTimes(1);
		expect(reporter).toHaveBeenCalledWith(bug, {
			handler: "backgroundJob",
			label: "cleanup",
		});
	});

	it("never rejects when the reporter itself throws", async () => {
		setBackgroundErrorReporter(() => {
			throw new Error("sentry down");
		});

		await expect(
			runBackgroundJob("cleanup", () => {
				throw new Error("boom");
			}),
		).resolves.toBeUndefined();
	});

	it("only logs when no reporter is registered", async () => {
		await expect(
			runBackgroundJob("cleanup", () => {
				throw new Error("boom");
			}),
		).resolves.toBeUndefined();
		expect(errorSpy).toHaveBeenCalledTimes(1);
	});
});
describe("node-schedule callbacks", () => {
	it("a rejecting job guarded by backgroundJob leaves no unhandled rejection", async () => {
		// Use the real scheduler: only it can show what happens to the promise
		// the callback returns.
		const real =
			await vi.importActual<typeof import("node-schedule")>("node-schedule");
		const fired = new Promise<void>((resolve) => {
			real.scheduleJob("probe", new Date(Date.now() + 100), () => resolve());
		});
		const job = real.scheduleJob(
			new Date(Date.now() + 100),
			backgroundJob(
				"cron",
				async () => {
					throw sshTimeout();
				},
				{ serverId: "srv-1" },
			),
		);
		expect(job).not.toBeNull();
		await fired;
		await settle();
		job?.cancel();

		expect(unhandled).toEqual([]);
		expect(errorSpy).toHaveBeenCalledWith(
			"cron failed",
			{ serverId: "srv-1" },
			expect.stringContaining("Timed out while waiting for handshake"),
		);
	});
});

describe("docker cleanup schedule for a remote server", () => {
	it("contains a failing cleanup instead of rejecting", async () => {
		await applyDockerCleanupSchedule("srv-1", "org-1", true);

		expect(mocks.scheduleJob).toHaveBeenCalledTimes(1);
		const callback = mocks.scheduleJob.mock
			.calls[0]?.[2] as () => Promise<void>;
		mocks.cleanupAll.mockRejectedValue(sshTimeout());

		await expect(callback()).resolves.toBeUndefined();
		await settle();
		expect(unhandled).toEqual([]);
		expect(mocks.sendDockerCleanupNotifications).not.toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalledWith(
			"Docker cleanup failed",
			{ serverId: "srv-1" },
			expect.stringContaining("Timed out while waiting for handshake"),
		);
	});

	it("contains a failing notification send as well", async () => {
		await applyDockerCleanupSchedule("srv-1", "org-1", true);
		const callback = mocks.scheduleJob.mock
			.calls[0]?.[2] as () => Promise<void>;
		mocks.cleanupAll.mockResolvedValue(undefined);
		mocks.sendDockerCleanupNotifications.mockRejectedValue(
			new Error("smtp down"),
		);

		await expect(callback()).resolves.toBeUndefined();
		expect(mocks.cleanupAll).toHaveBeenCalledWith("srv-1");
		expect(mocks.sendDockerCleanupNotifications).toHaveBeenCalledWith("org-1");
	});
});
