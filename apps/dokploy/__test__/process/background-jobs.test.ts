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
		[
			"an ExecError for a command that exited non-zero",
			new ExecError("Remote command failed with exit code 1: no such file", {
				command: "cat /nope",
				serverId: "srv-1",
				exitCode: 1,
			}),
		],
		[
			"a duplicate-copy ExecError that exited non-zero",
			Object.assign(new Error("Command failed with exit code 2"), {
				name: "ExecError",
				command: "ls",
				exitCode: 2,
			}),
		],
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

	it("treats an ExecError without an exit code (connection failure) as environmental", () => {
		for (const message of [
			"SSH connection closed before the command finished",
			"Remote command execution failed: Channel open failure",
			"Authentication failed: Invalid SSH private key.",
		]) {
			expect(
				isEnvironmentError(
					new ExecError(message, { command: "x", serverId: "srv-1" }),
				),
			).toBe(true);
		}
	});

	it("recognises an ExecError from a duplicate module copy by name", () => {
		const copy = Object.assign(new Error("Remote command stream error"), {
			name: "ExecError",
			command: "x",
		});
		expect(isEnvironmentError(copy)).toBe(true);
	});

	it("still treats a non-zero exit as environmental when its message names a connection failure", () => {
		const error = new ExecError(
			"Remote command failed with exit code 255: ssh: connect to host 10.0.0.2 port 22: EHOSTUNREACH",
			{ command: "x", serverId: "srv-1", exitCode: 255 },
		);
		expect(isEnvironmentError(error)).toBe(true);
	});

	it("walks originalError, context.originalError and AggregateError.errors", () => {
		const offline = Object.assign(new Error("connect"), {
			code: "EHOSTUNREACH",
		});
		const exited = (extra: Record<string, unknown>) =>
			Object.assign(new Error("wrapper"), extra);

		expect(isEnvironmentError(exited({ originalError: offline }))).toBe(true);
		expect(
			isEnvironmentError(exited({ context: { originalError: offline } })),
		).toBe(true);
		expect(
			isEnvironmentError(new AggregateError([new Error("x"), offline], "many")),
		).toBe(true);
		expect(
			isEnvironmentError(
				new AggregateError([new Error("x"), new Error("y")], "many"),
			),
		).toBe(false);
	});

	it("stops at the depth cap", () => {
		let error: unknown = Object.assign(new Error("deep"), {
			code: "EHOSTUNREACH",
		});
		for (let i = 0; i < 10; i++) {
			error = new Error(`level ${i}`, { cause: error });
		}
		expect(isEnvironmentError(error)).toBe(false);
	});

	it("survives cycles through originalError and errors", () => {
		const a = new Error("a") as Error & Record<string, unknown>;
		const b = new AggregateError([a], "b") as AggregateError &
			Record<string, unknown>;
		a.originalError = b;
		expect(isEnvironmentError(a)).toBe(false);
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

	it("reports an ExecError for a command that exited non-zero", async () => {
		const reporter = vi.fn();
		setBackgroundErrorReporter(reporter);
		const failed = new ExecError("Remote command failed with exit code 1", {
			command: "docker system prune -f",
			serverId: "srv-1",
			exitCode: 1,
		});

		await runBackgroundJob("cleanup", async () => {
			throw failed;
		});

		expect(reporter).toHaveBeenCalledWith(failed, {
			handler: "backgroundJob",
			label: "cleanup",
		});
	});

	it("shares the reporter between module copies", async () => {
		const reporter = vi.fn();
		setBackgroundErrorReporter(reporter);

		// A second, independent copy of the module, like the one a bundled deep
		// import creates next to the `@dokploy/server` barrel.
		vi.resetModules();
		const copy = await import("@dokploy/server/utils/process/background");
		expect(copy.setBackgroundErrorReporter).not.toBe(
			setBackgroundErrorReporter,
		);

		const bug = new TypeError("copy bug");
		copy.reportUnexpectedError(bug, { handler: "wss", label: "x" });
		expect(reporter).toHaveBeenCalledWith(bug, { handler: "wss", label: "x" });

		// And the other direction: a reporter set through the copy is seen by the
		// original.
		const second = vi.fn();
		copy.setBackgroundErrorReporter(second);
		const another = new TypeError("another bug");
		await runBackgroundJob("cleanup", async () => {
			throw another;
		});
		expect(second).toHaveBeenCalledWith(another, {
			handler: "backgroundJob",
			label: "cleanup",
		});
		expect(reporter).toHaveBeenCalledTimes(1);
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
		try {
			await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled(), {
				timeout: 3000,
			});
		} finally {
			job?.cancel();
		}
		// An unhandled rejection is emitted once the microtask queue drains.
		await new Promise((resolve) => setImmediate(resolve));

		expect(errorSpy).toHaveBeenCalledWith(
			"cron failed",
			{ serverId: "srv-1" },
			expect.stringContaining("Timed out while waiting for handshake"),
		);
		expect(unhandled).toEqual([]);
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
