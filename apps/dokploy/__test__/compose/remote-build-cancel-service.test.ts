import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsyncRemote: vi.fn(),
	appendFile: vi.fn(),
	returning: vi.fn(),
	updateSets: [] as any[],
	updateWheres: [] as any[],
	deploymentsFindFirst: vi.fn(),
	deploymentsFindMany: vi.fn(),
	composeFindFirst: vi.fn(),
	applicationsFindFirst: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ appendFile: mocks.appendFile }));
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
	execAsync: vi.fn(),
}));
vi.mock("@dokploy/server/db", () => {
	const update = vi.fn(() => ({
		set: (values: any) => {
			mocks.updateSets.push(values);
			const where = (condition: unknown) => {
				mocks.updateWheres.push(condition);
				const result: any = Promise.resolve([]);
				result.returning = mocks.returning;
				return result;
			};
			return { where };
		},
	}));
	return {
		db: {
			update,
			query: {
				deployments: {
					findFirst: mocks.deploymentsFindFirst,
					findMany: mocks.deploymentsFindMany,
				},
				compose: { findFirst: mocks.composeFindFirst },
				applications: { findFirst: mocks.applicationsFindFirst },
			},
		},
	};
});

import {
	assertBuildNotCancelled,
	assertDeploymentNotCancelled,
	cancelBuildServerDeployment,
	cancelBuildServerDeploymentById,
	cancelBuildServerDeploymentsForService,
	DeploymentCancelledError,
	isDeploymentCancelled,
	isDeploymentCancelledError,
	markDeploymentDoneUnlessCancelled,
	readServiceStatus,
	restoreServiceStatusIfUnchanged,
	runRemoteBuildScript,
	statusAfterCancelledDeploy,
	toCancelledErrorIfCancelled,
} from "@dokploy/server/services/deployment-cancel";
import { registerRemoteBuild } from "@dokploy/server/utils/process/remote-build-registry";
import { PgDialect } from "drizzle-orm/pg-core";

const PID_DIR = "/etc/dokploy/logs/.build-pids";

/** Commands sent to one host, in order. */
const commandsOn = (serverId: string) =>
	mocks.execAsyncRemote.mock.calls
		.filter((call) => call[0] === serverId)
		.map((call) => call[1] as string);

const killCommands = () =>
	mocks.execAsyncRemote.mock.calls
		.map((call) => call[1] as string)
		.filter((command) => command.includes("kill -s TERM"));

const decodedLogLines = () =>
	mocks.execAsyncRemote.mock.calls
		.map((call) => String(call[1]))
		.filter((command) => command.includes("base64 -d"))
		.map((command) =>
			Buffer.from(command.match(/echo "([^"]+)"/)?.[1] ?? "", "base64").toString(
				"utf8",
			),
		);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.updateSets.length = 0;
	mocks.updateWheres.length = 0;
	mocks.returning.mockResolvedValue([{ deploymentId: "dep-1" }]);
	mocks.execAsyncRemote.mockImplementation(async (_serverId, command: string) =>
		command.includes("kill -s TERM")
			? { stdout: "KILLED\n", stderr: "" }
			: { stdout: "", stderr: "" },
	);
});

describe("cancelBuildServerDeployment", () => {
	const target = {
		deploymentId: "dep-1",
		logPath: "/etc/dokploy/logs/app/app-1.log",
		logServerId: "serving-1",
		buildServerId: "build-1",
	};

	it("kills only this deployment's build, on the build server", async () => {
		const outcome = await cancelBuildServerDeployment(target);

		expect(outcome).toEqual({
			status: "cancelled",
			result: "KILLED",
			warning: undefined,
		});
		expect(killCommands()).toHaveLength(1);
		expect(commandsOn("build-1")).toHaveLength(1);
		const [kill] = killCommands();
		expect(kill).toContain(`'${PID_DIR}/dep-1.pid'`);
		expect(kill).toContain("id='dep-1'");
		// Nothing broad: no pattern kill, no other deployment's file.
		expect(kill).not.toMatch(/pkill|killall|pgrep|docker (kill|stop)/);
		expect(kill).not.toContain(".build-pids/dep-2");
		// The serving host is only used to write the log line, never to kill.
		expect(commandsOn("serving-1").every((c) => !c.includes("kill"))).toBe(true);
	});

	it("claims the deployment atomically before it kills anything", async () => {
		const order: string[] = [];
		mocks.returning.mockImplementationOnce(async () => {
			order.push("claim");
			return [{ deploymentId: "dep-1" }];
		});
		mocks.execAsyncRemote.mockImplementation(async (_s, command: string) => {
			if (command.includes("kill -s TERM")) order.push("kill");
			return { stdout: "KILLED\n", stderr: "" };
		});

		await cancelBuildServerDeployment(target);

		expect(order).toEqual(["claim", "kill"]);
		expect(mocks.updateSets[0]).toMatchObject({ status: "cancelled" });
	});

	it("does nothing for a deployment that is not running any more", async () => {
		mocks.returning.mockResolvedValueOnce([]);

		const outcome = await cancelBuildServerDeployment(target);

		expect(outcome).toEqual({ status: "not-running" });
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("writes the outcome to the deployment log on the log host", async () => {
		await cancelBuildServerDeployment(target);

		const lines = decodedLogLines().join("\n");
		expect(lines).toContain("Deployment cancelled by user");
		expect(lines).toContain("Build stopped on the build server");
		expect(commandsOn("serving-1").some((c) => c.includes("app-1.log"))).toBe(
			true,
		);
	});

	it("writes to the local log when the log lives on this Dokploy host", async () => {
		await cancelBuildServerDeployment({ ...target, logServerId: null });

		expect(mocks.appendFile).toHaveBeenCalled();
		expect(mocks.appendFile.mock.calls[0]?.[0]).toBe(target.logPath);
		expect(mocks.execAsyncRemote.mock.calls.every((c) => c[0] === "build-1")).toBe(
			true,
		);
	});

	it("still cancels locally, with a warning, when the build server is unreachable", async () => {
		mocks.execAsyncRemote.mockImplementation(async (serverId: string) => {
			if (serverId === "build-1") throw new Error("connect ETIMEDOUT");
			return { stdout: "", stderr: "" };
		});
		const abort = vi.fn();
		const unregister = registerRemoteBuild("dep-1", abort);

		const outcome = await cancelBuildServerDeployment(target);
		unregister();

		expect(outcome.status).toBe("cancelled");
		if (outcome.status !== "cancelled") return;
		expect(outcome.result).toBe("UNREACHABLE");
		expect(outcome.warning).toContain("Could not reach the build server");
		expect(outcome.warning).toContain("ETIMEDOUT");
		// The queue slot is released: the local connection waiting on the build
		// is dropped even though the server never answered.
		expect(abort).toHaveBeenCalledTimes(1);
		expect(decodedLogLines().join("\n")).toContain("may keep running");
		expect(mocks.updateSets.some((set) => set.errorMessage)).toBe(true);
	});

	it("warns when the process survived SIGKILL", async () => {
		mocks.execAsyncRemote.mockImplementation(async (_s, command: string) =>
			command.includes("kill -s TERM")
				? { stdout: "FAILED\n", stderr: "" }
				: { stdout: "", stderr: "" },
		);

		const outcome = await cancelBuildServerDeployment(target);

		expect(outcome).toMatchObject({ status: "cancelled", result: "FAILED" });
		expect((outcome as any).warning).toContain("did not stop");
	});

	it("warns, and signals nothing, when the build server cannot identify the process", async () => {
		mocks.execAsyncRemote.mockImplementation(async (_s, command: string) =>
			command.includes("kill -s TERM")
				? { stdout: "UNVERIFIED\n", stderr: "" }
				: { stdout: "", stderr: "" },
		);

		const outcome = await cancelBuildServerDeployment(target);

		expect(outcome).toMatchObject({ status: "cancelled", result: "UNVERIFIED" });
		expect((outcome as any).warning).toContain("may still be running");
	});

	it("says nothing was running when the pid file is gone (and no build is starting)", async () => {
		mocks.execAsyncRemote.mockImplementation(async (_s, command: string) =>
			command.includes("kill -s TERM")
				? { stdout: "NONE\n", stderr: "" }
				: { stdout: "", stderr: "" },
		);

		const outcome = await cancelBuildServerDeployment(target);

		expect(outcome).toMatchObject({ status: "cancelled", result: "NONE" });
		expect((outcome as any).warning).toBeUndefined();
		expect(killCommands()).toHaveLength(1);
		expect(decodedLogLines().join("\n")).toContain("No build was running");
	});

	it("looks again when a build step is starting in this process but has no pid file yet", async () => {
		let kills = 0;
		mocks.execAsyncRemote.mockImplementation(async (_s, command: string) => {
			if (!command.includes("kill -s TERM")) return { stdout: "", stderr: "" };
			kills++;
			return { stdout: kills === 1 ? "NONE\n" : "KILLED\n", stderr: "" };
		});
		const unregister = registerRemoteBuild("dep-1", () => {});

		const outcome = await cancelBuildServerDeployment(target);
		unregister();

		expect(kills).toBe(2);
		expect(outcome).toMatchObject({ status: "cancelled", result: "KILLED" });
	}, 15000);

	it("does not call it finished when a command of this deployment is still running but left no pid file", async () => {
		mocks.execAsyncRemote.mockImplementation(async (_s, command: string) =>
			command.includes("kill -s TERM")
				? { stdout: "NONE\n", stderr: "" }
				: { stdout: "", stderr: "" },
		);
		const unregister = registerRemoteBuild("dep-1", () => {});

		const outcome = await cancelBuildServerDeployment(target);
		unregister();

		expect(outcome).toMatchObject({ status: "cancelled", result: "NONE" });
		const warning = (outcome as any).warning as string;
		expect(warning).toContain("pid file was not found");
		expect(warning).toContain("may still be running");
		const log = decodedLogLines().join("\n");
		expect(log).toContain("pid file was not found");
		expect(log).not.toContain("No build was running");
		expect(mocks.updateSets).toContainEqual({ errorMessage: warning });
	}, 15000);
});

describe("markDeploymentDoneUnlessCancelled", () => {
	it("a build-server deployment is marked done only while it is not cancelled", async () => {
		mocks.returning.mockResolvedValueOnce([{ deploymentId: "dep-1" }]);
		await expect(markDeploymentDoneUnlessCancelled("dep-1")).resolves.toBe(
			true,
		);
		expect(mocks.updateSets).toContainEqual(
			expect.objectContaining({ status: "done" }),
		);

		// The cancel got there first: the conditional update matches no row.
		mocks.returning.mockResolvedValueOnce([]);
		await expect(markDeploymentDoneUnlessCancelled("dep-1")).resolves.toBe(
			false,
		);
	});
});

describe("service status helpers", () => {
	const sqlOf = (condition: unknown) =>
		new PgDialect().sqlToQuery(condition as any);

	it("readServiceStatus selects just the status column", async () => {
		mocks.applicationsFindFirst.mockResolvedValue({ applicationStatus: "done" });
		mocks.composeFindFirst.mockResolvedValue({ composeStatus: "error" });

		expect(await readServiceStatus({ applicationId: "a1" })).toBe("done");
		expect(await readServiceStatus({ composeId: "c1" })).toBe("error");

		expect(mocks.applicationsFindFirst.mock.calls[0]?.[0].columns).toEqual({
			applicationStatus: true,
		});
		expect(mocks.composeFindFirst.mock.calls[0]?.[0].columns).toEqual({
			composeStatus: true,
		});
		mocks.applicationsFindFirst.mockResolvedValue(undefined);
		expect(await readServiceStatus({ applicationId: "gone" })).toBeUndefined();
	});

	it("restoreServiceStatusIfUnchanged only moves a service that is still in the settled status", async () => {
		mocks.returning.mockResolvedValueOnce([{ applicationId: "a1" }]);
		await expect(
			restoreServiceStatusIfUnchanged({ applicationId: "a1" }, "done", "idle"),
		).resolves.toBe(true);

		expect(mocks.updateSets).toEqual([{ applicationStatus: "idle" }]);
		// The WHERE names both the service and the status it must still be in.
		const where = sqlOf(mocks.updateWheres[0]);
		expect(where.sql).toContain('"applicationId"');
		expect(where.sql).toContain('"applicationStatus"');
		expect(where.params).toEqual(["a1", "done"]);
	});

	it("a Stop or Start in between (status no longer the settled one) matches no row", async () => {
		mocks.returning.mockResolvedValueOnce([]);

		await expect(
			restoreServiceStatusIfUnchanged({ composeId: "c1" }, "done", "error"),
		).resolves.toBe(false);

		expect(mocks.updateSets).toEqual([{ composeStatus: "error" }]);
		const where = sqlOf(mocks.updateWheres[0]);
		expect(where.sql).toContain('"composeStatus"');
		expect(where.params).toEqual(["c1", "done"]);
	});

	it("writes nothing when the status is already the wanted one", async () => {
		await expect(
			restoreServiceStatusIfUnchanged({ composeId: "c1" }, "done", "done"),
		).resolves.toBe(false);

		expect(mocks.updateSets).toHaveLength(0);
	});
});

describe("toCancelledErrorIfCancelled", () => {
	it("turns the failure of a build whose deployment was cancelled into the cancellation", async () => {
		mocks.deploymentsFindFirst.mockResolvedValue({ status: "cancelled" });

		const result = await toCancelledErrorIfCancelled(
			"dep-1",
			new Error("Remote build was cancelled: cancelled by user"),
		);

		expect(result).toBeInstanceOf(DeploymentCancelledError);
	});

	it("leaves every failure of a deployment that was not cancelled alone", async () => {
		mocks.deploymentsFindFirst.mockResolvedValue({ status: "running" });
		const failure = new Error("docker build failed");

		expect(await toCancelledErrorIfCancelled("dep-1", failure)).toBe(failure);
	});

	it("keeps an existing cancellation as it is, without reading anything", async () => {
		const existing = new DeploymentCancelledError();

		expect(await toCancelledErrorIfCancelled("dep-1", existing)).toBe(existing);
		expect(mocks.deploymentsFindFirst).not.toHaveBeenCalled();
	});
});

describe("hostile ids", () => {
	it("keeps a hostile deployment id inside quotes in the kill command", async () => {
		const id = "x'; touch /tmp/pwned; echo '";
		await cancelBuildServerDeployment({
			deploymentId: id,
			logPath: "/l.log",
			logServerId: null,
			buildServerId: "build-1",
		});

		const [kill] = killCommands();
		expect(kill).toContain("id='x'\\''; touch /tmp/pwned; echo '\\'''");
		expect(kill).not.toMatch(/(^|\n)touch /);
	});
});

describe("cancelBuildServerDeploymentsForService", () => {
	it("compose without a build server: not handled here (the caller keeps its behaviour)", async () => {
		mocks.composeFindFirst.mockResolvedValue({ buildServerId: null, serverId: null });

		const result = await cancelBuildServerDeploymentsForService({
			type: "compose",
			composeId: "c1",
		});

		expect(result).toEqual({ usesBuildServer: false, cancelled: 0, warnings: [] });
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.deploymentsFindMany).not.toHaveBeenCalled();
	});

	it("compose with a build server: cancels each running deployment there, logs on the serving host", async () => {
		mocks.composeFindFirst.mockResolvedValue({
			buildServerId: "build-1",
			serverId: "serving-1",
		});
		mocks.deploymentsFindMany.mockResolvedValue([
			{ deploymentId: "dep-1", logPath: "/l/1.log" },
		]);

		const result = await cancelBuildServerDeploymentsForService({
			type: "compose",
			composeId: "c1",
		});

		expect(result).toEqual({ usesBuildServer: true, cancelled: 1, warnings: [] });
		expect(commandsOn("build-1")).toHaveLength(1);
		expect(commandsOn("serving-1").some((c) => c.includes("/l/1.log"))).toBe(true);
	});

	it("application without a build-server deployment: untouched", async () => {
		mocks.deploymentsFindMany.mockResolvedValue([
			{ deploymentId: "dep-1", logPath: "/l/1.log", buildServerId: null },
		]);

		const result = await cancelBuildServerDeploymentsForService({
			type: "application",
			applicationId: "a1",
		});

		expect(result).toEqual({ usesBuildServer: false, cancelled: 0, warnings: [] });
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.updateSets).toHaveLength(0);
	});

	it("application built on a build server: the log is on the build server too", async () => {
		mocks.deploymentsFindMany.mockResolvedValue([
			{ deploymentId: "dep-1", logPath: "/l/1.log", buildServerId: "build-1" },
		]);

		const result = await cancelBuildServerDeploymentsForService({
			type: "application",
			applicationId: "a1",
		});

		expect(result).toEqual({ usesBuildServer: true, cancelled: 1, warnings: [] });
		expect(mocks.execAsyncRemote.mock.calls.every((c) => c[0] === "build-1")).toBe(
			true,
		);
	});

	it("collects a warning per unreachable build server", async () => {
		mocks.composeFindFirst.mockResolvedValue({
			buildServerId: "build-1",
			serverId: null,
		});
		mocks.deploymentsFindMany.mockResolvedValue([
			{ deploymentId: "dep-1", logPath: "/l/1.log" },
		]);
		mocks.execAsyncRemote.mockRejectedValue(new Error("no route"));

		const result = await cancelBuildServerDeploymentsForService({
			type: "compose",
			composeId: "c1",
		});

		expect(result.cancelled).toBe(1);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain("no route");
	});
});

describe("cancelBuildServerDeploymentById", () => {
	it("returns null for a deployment that does not build on a build server", async () => {
		mocks.deploymentsFindFirst.mockResolvedValue({
			deploymentId: "dep-1",
			logPath: "/l.log",
			buildServerId: null,
			applicationId: "a1",
			composeId: null,
		});

		expect(await cancelBuildServerDeploymentById("dep-1")).toBeNull();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("returns null for a compose without a build server", async () => {
		mocks.deploymentsFindFirst.mockResolvedValue({
			deploymentId: "dep-1",
			logPath: "/l.log",
			buildServerId: null,
			applicationId: null,
			composeId: "c1",
		});
		mocks.composeFindFirst.mockResolvedValue({ buildServerId: null, serverId: null });

		expect(await cancelBuildServerDeploymentById("dep-1")).toBeNull();
	});

	it("cancels a compose deployment on the compose's build server", async () => {
		mocks.deploymentsFindFirst.mockResolvedValue({
			deploymentId: "dep-1",
			logPath: "/l.log",
			buildServerId: null,
			applicationId: null,
			composeId: "c1",
		});
		mocks.composeFindFirst.mockResolvedValue({
			buildServerId: "build-1",
			serverId: "serving-1",
		});

		const outcome = await cancelBuildServerDeploymentById("dep-1");

		expect(outcome).toMatchObject({ status: "cancelled", result: "KILLED" });
		expect(commandsOn("build-1")).toHaveLength(1);
	});
});

describe("runRemoteBuildScript", () => {
	it("without a build server is exactly the plain command (two arguments)", async () => {
		await runRemoteBuildScript("serving-1", "docker build .", {
			deploymentId: "dep-1",
		});
		await runRemoteBuildScript("serving-1", "docker build .", {
			deploymentId: "dep-1",
			buildServerId: null,
		});

		expect(mocks.execAsyncRemote.mock.calls).toEqual([
			["serving-1", "docker build ."],
			["serving-1", "docker build ."],
		]);
		expect(mocks.deploymentsFindFirst).not.toHaveBeenCalled();
	});

	it("with a build server launches the script cancelable for this deployment", async () => {
		mocks.deploymentsFindFirst.mockResolvedValue({ status: "running" });

		await runRemoteBuildScript("build-1", "docker build .", {
			deploymentId: "dep-1",
			buildServerId: "build-1",
		});

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"build-1",
			"docker build .",
			undefined,
			{ cancelable: { pidFile: `${PID_DIR}/dep-1.pid`, deploymentId: "dep-1" } },
		);
	});

	it("the failure caused by a cancel is the cancellation, any other failure stays itself", async () => {
		const cancelledByUser = new Error("Remote build was cancelled: cancelled by user");
		mocks.execAsyncRemote.mockRejectedValueOnce(cancelledByUser);
		mocks.deploymentsFindFirst
			.mockResolvedValueOnce({ status: "running" })
			.mockResolvedValueOnce({ status: "cancelled" });

		await expect(
			runRemoteBuildScript("build-1", "docker build .", {
				deploymentId: "dep-1",
				buildServerId: "build-1",
			}),
		).rejects.toMatchObject({ deploymentCancelled: true });

		const failure = new Error("docker build failed");
		mocks.execAsyncRemote.mockRejectedValueOnce(failure);
		mocks.deploymentsFindFirst.mockResolvedValue({ status: "running" });

		await expect(
			runRemoteBuildScript("build-1", "docker build .", {
				deploymentId: "dep-1",
				buildServerId: "build-1",
			}),
		).rejects.toBe(failure);
	});

	it("does not start a build for a deployment cancelled while it was queued", async () => {
		mocks.deploymentsFindFirst.mockResolvedValue({ status: "cancelled" });

		await expect(
			runRemoteBuildScript("build-1", "docker build .", {
				deploymentId: "dep-1",
				buildServerId: "build-1",
			}),
		).rejects.toMatchObject({ deploymentCancelled: true });
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});
});

describe("cancel checkpoints", () => {
	it("assertBuildNotCancelled ignores deployments without a build server", async () => {
		mocks.deploymentsFindFirst.mockResolvedValue({ status: "cancelled" });

		await expect(
			assertBuildNotCancelled({ deploymentId: "dep-1", buildServerId: null }),
		).resolves.toBeUndefined();
		expect(mocks.deploymentsFindFirst).not.toHaveBeenCalled();
	});

	it("assertBuildNotCancelled stops a build-server deployment cancelled after its build ended", async () => {
		mocks.deploymentsFindFirst.mockResolvedValue({ status: "cancelled" });

		await expect(
			assertBuildNotCancelled({ deploymentId: "dep-1", buildServerId: "b" }),
		).rejects.toBeInstanceOf(DeploymentCancelledError);
	});

	it("assertDeploymentNotCancelled lets a running deployment through", async () => {
		mocks.deploymentsFindFirst.mockResolvedValue({ status: "running" });

		await expect(assertDeploymentNotCancelled("dep-1")).resolves.toBeUndefined();
		await expect(assertDeploymentNotCancelled(undefined)).resolves.toBeUndefined();
	});

	it("a failed lookup never counts as cancelled and never masks the real error", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		mocks.deploymentsFindFirst.mockRejectedValue(new Error("db down"));

		expect(await isDeploymentCancelled("dep-1")).toBe(false);
		warn.mockRestore();
	});

	it("recognises its error by property, so a second module copy still matches", () => {
		expect(isDeploymentCancelledError(new DeploymentCancelledError())).toBe(true);
		expect(
			isDeploymentCancelledError(
				Object.assign(new Error("x"), { deploymentCancelled: true }),
			),
		).toBe(true);
		expect(isDeploymentCancelledError(new Error("boom"))).toBe(false);
		expect(isDeploymentCancelledError(null)).toBe(false);
	});

	it("a cancelled service returns to done when it deployed before, idle when it never did", async () => {
		mocks.deploymentsFindFirst.mockResolvedValueOnce({ deploymentId: "old" });
		expect(await statusAfterCancelledDeploy({ composeId: "c1" })).toBe("done");

		mocks.deploymentsFindFirst.mockResolvedValueOnce(undefined);
		expect(await statusAfterCancelledDeploy({ applicationId: "a1" })).toBe(
			"idle",
		);
	});
});
