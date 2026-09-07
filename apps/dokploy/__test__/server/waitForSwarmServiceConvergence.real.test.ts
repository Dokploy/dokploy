import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ServiceConvergenceError,
	waitForSwarmServiceConvergence,
} from "@dokploy/server/utils/docker/utils";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

// Real-Docker end-to-end test. Gate on Swarm manager availability so the
// suite is a no-op in environments without a local swarm (CI unit runners).
const isSwarmManager = () => {
	try {
		execSync("docker node ls", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

const skip = !isSwarmManager();

const testImage = "busybox:latest";
const uniqueSuffix = () => randomBytes(4).toString("hex");
const createdServices: string[] = [];

const ensureImage = () => {
	execSync(
		`docker image inspect ${testImage} >/dev/null 2>&1 || docker pull ${testImage}`,
		{
			stdio: "ignore",
		},
	);
};

const createService = (
	name: string,
	command: string[],
	extra: string[] = [],
): string => {
	const args = [
		"service",
		"create",
		"--name",
		name,
		"--detach",
		"--stop-grace-period=1s",
		...extra,
		testImage,
		...command,
	];
	execSync(`docker ${args.map((a) => `"${a}"`).join(" ")}`, {
		stdio: "ignore",
	});
	createdServices.push(name);
	return name;
};

const removeService = (name: string) => {
	try {
		execSync(`docker service rm ${name}`, { stdio: "ignore" });
	} catch {
		// ignore
	}
};

const updateServiceCommand = (name: string, command: string) => {
	execSync(`docker service update --args "${command}" --detach ${name}`, {
		stdio: "ignore",
	});
};

const servicePsErrors = (name: string): string => {
	try {
		return execSync(
			`docker service ps ${name} --no-trunc --filter desired-state=shutdown --format '{{.Error}}'`,
			{ stdio: ["ignore", "pipe", "ignore"] },
		)
			.toString()
			.trim();
	} catch {
		return "";
	}
};

describe.skipIf(skip)("waitForSwarmServiceConvergence (real swarm)", () => {
	beforeAll(() => {
		ensureImage();
	});

	afterEach(() => {
		for (const name of createdServices.splice(0)) {
			removeService(name);
		}
	});

	it("hard failure surfaces the real container error after convergence timeout", async () => {
		const name = `itest-conv-fail-${uniqueSuffix()}`;
		// exit 127 pre-start: container never reaches "running".
		createService(name, ["/nonexistent-cmd"], ["--label", "itest=true"]);

		let thrown: ServiceConvergenceError | undefined;
		try {
			await waitForSwarmServiceConvergence(name, null, {
				timeoutMs: 20_000,
				intervalMs: 1_000,
			});
		} catch (error) {
			if (error instanceof ServiceConvergenceError) thrown = error;
			else throw error;
		}

		if (!thrown) {
			throw new Error("expected ServiceConvergenceError to be thrown");
		}
		expect(thrown).toBeInstanceOf(ServiceConvergenceError);
		expect(thrown.message).toContain("did not converge within 20000ms");
		expect(thrown.message).toContain("0/1 tasks running");
		// Real container error (no such file) must be surfaced, not a
		// misleading replacement state such as "new" / "preparing" / "ready"
		// / "unknown" (the symptom in the bug report).
		expect(thrown.message).toMatch(
			/no such file|executable file not found|not found/i,
		);
		expect(thrown.message).not.toMatch(
			/last state: (unknown|new|preparing|ready)\)/i,
		);
	}, 60_000);

	it("cross-check: surfaced error matches docker service ps --no-trunc", async () => {
		const name = `itest-conv-xcheck-${uniqueSuffix()}`;
		createService(name, ["/nonexistent-cmd"], ["--label", "itest=true"]);

		let thrown: ServiceConvergenceError | undefined;
		try {
			await waitForSwarmServiceConvergence(name, null, {
				timeoutMs: 20_000,
				intervalMs: 1_000,
			});
		} catch (error) {
			if (error instanceof ServiceConvergenceError) thrown = error;
			else throw error;
		}
		if (!thrown)
			throw new Error("expected ServiceConvergenceError to be thrown");

		// Give swarm a moment to settle the failed task's Status.Err into ps.
		await new Promise((r) => setTimeout(r, 1500));
		const psErrors = servicePsErrors(name);
		const errorLines = psErrors
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean);
		expect(errorLines.length).toBeGreaterThan(0);
		// At least one real error phrase reported by `docker service ps` must
		// also appear in the surfaced convergence message (both derive from the
		// task's Status.Err). A distinctive shared token ("not found", "No such
		// file", "executable") is sufficient.
		const msg = thrown.message.toLowerCase();
		const shared = errorLines.some((line) => {
			const l = line.toLowerCase();
			return (
				(l.includes("not found") && msg.includes("not found")) ||
				(l.includes("no such file") && msg.includes("no such file")) ||
				(l.includes("executable") && msg.includes("executable")) ||
				(line.length > 8 && msg.includes(l))
			);
		});
		expect(
			shared,
			`surface message was:\n${thrown.message}\nps errors:\n${psErrors}`,
		).toBe(true);
	}, 60_000);

	it("happy-path deploy returns success without throwing", async () => {
		const name = `itest-conv-ok-${uniqueSuffix()}`;
		createService(name, ["sleep", "3600"], ["--label", "itest=true"]);

		await expect(
			waitForSwarmServiceConvergence(name, null, {
				timeoutMs: 30_000,
				intervalMs: 1_000,
			}),
		).resolves.toBeUndefined();
	}, 60_000);

	it("transient recovery still converges within the timeout window", async () => {
		// A service that fails until a host-side marker file appears, then runs.
		// Models a transient failure (e.g. a dependency that becomes available).
		// The convergence function must return success (not throw) once a task
		// reaches "running", exercising the unchanged success short-circuit.
		const name = `itest-conv-transient-${uniqueSuffix()}`;
		const hostDir = mkdtempSync(join(tmpdir(), "itest-marker-"));
		try {
			createService(
				name,
				["sh", "-c", "if [ ! -f /data/ready ]; then exit 1; fi; sleep 3600"],
				[
					"--label",
					"itest=true",
					"--restart-condition",
					"any",
					"--restart-delay",
					"2s",
					"--restart-max-attempts",
					"0",
					"--mount",
					`type=bind,source=${hostDir},target=/data`,
				],
			);

			// Let the service fail a couple of times, then "recover" the
			// dependency by creating the marker file.
			await new Promise((r) => setTimeout(r, 4000));
			writeFileSync(join(hostDir, "ready"), "1");

			const start = Date.now();
			await expect(
				waitForSwarmServiceConvergence(name, null, {
					timeoutMs: 45_000,
					intervalMs: 1_000,
				}),
			).resolves.toBeUndefined();
			const elapsed = Date.now() - start;
			// Converges well before the 45s timeout once the marker appears.
			expect(elapsed).toBeLessThan(45_000);
		} finally {
			removeService(name);
			rmSync(hostDir, { recursive: true, force: true });
		}
	}, 90_000);

	it("stale-failure isolation: a redeploy surfaces the new failure, not the old one", async () => {
		// Create a service that fails with error A (command /bad-cmd-a), let
		// failed tasks accumulate, then update the command to /bad-cmd-b so
		// new tasks fail with error B. listTasks now carries both A and B
		// failed tasks. The surfaced error must be from the most recent
		// failure (B), not the stale A — the timestamp-sort refinement.
		const name = `itest-conv-stale-${uniqueSuffix()}`;
		try {
			createService(name, ["/bad-cmd-a"], ["--label", "itest=true"]);
			// Let a couple of A-failed tasks accumulate.
			await new Promise((r) => setTimeout(r, 5_000));
			updateServiceCommand(name, "/bad-cmd-b");
			// Let B-failed tasks (more recent) accumulate.
			await new Promise((r) => setTimeout(r, 5_000));

			let thrown: ServiceConvergenceError | undefined;
			try {
				await waitForSwarmServiceConvergence(name, null, {
					timeoutMs: 12_000,
					intervalMs: 1_000,
				});
			} catch (error) {
				if (error instanceof ServiceConvergenceError) thrown = error;
				else throw error;
			}
			if (!thrown)
				throw new Error("expected ServiceConvergenceError to be thrown");

			expect(thrown).toBeInstanceOf(ServiceConvergenceError);
			expect(thrown.message).toContain("bad-cmd-b");
			expect(thrown.message).not.toContain("bad-cmd-a");
		} finally {
			removeService(name);
		}
	}, 90_000);
});
