import {
	buildSandboxContainerOptions,
	buildSandboxLifetimeCommand,
	getSandboxExpiry,
	getSandboxNetworkName,
	parseSandboxEnvVars,
	parseSandboxUser,
	SANDBOX_ACTIVITY_FILE,
	SANDBOX_INTERNET_NETWORK,
	SANDBOX_ISOLATED_NETWORK,
	toSandboxTimeoutSeconds,
	withSandboxActivity,
} from "@dokploy/server/utils/sandbox/container";
import { describe, expect, it } from "vitest";

const spec = {
	sandboxId: "sb_1",
	organizationId: "org_1",
	image: "python:3.12-slim",
	cpu: 1.5,
	memoryMb: 512,
	pidsLimit: 256,
	networkMode: "isolated" as const,
	envVars: "FOO=bar\n# comment\n\nBAZ=qux=1\ninvalid",
	workdir: "/home/user",
	user: "1000:1000",
	timeoutMs: 300_000,
	deadlineAt: new Date("2026-10-21T12:00:00.000Z"),
};

describe("buildSandboxContainerOptions", () => {
	it("applies cpu, memory and pids limits", () => {
		const options = buildSandboxContainerOptions(spec);
		expect(options.HostConfig?.NanoCpus).toBe(1_500_000_000);
		expect(options.HostConfig?.Memory).toBe(512 * 1024 * 1024);
		expect(options.HostConfig?.MemorySwap).toBe(512 * 1024 * 1024);
		expect(options.HostConfig?.PidsLimit).toBe(256);
	});

	it("hardens the container", () => {
		const options = buildSandboxContainerOptions(spec);
		expect(options.HostConfig?.CapDrop).toEqual(["ALL"]);
		expect(options.HostConfig?.SecurityOpt).toEqual(["no-new-privileges"]);
		expect(options.HostConfig?.RestartPolicy).toEqual({ Name: "no" });
		expect(options.HostConfig?.AutoRemove).toBe(true);
		expect(options.HostConfig?.LogConfig?.Config?.["max-size"]).toBe("10m");
		expect(options.User).toBe("1000:1000");
	});

	it("runs the lifetime command under an init", () => {
		const options = buildSandboxContainerOptions(spec);
		expect(options.Entrypoint).toEqual([""]);
		expect(options.Cmd).toEqual(
			buildSandboxLifetimeCommand(spec.deadlineAt, spec.timeoutMs),
		);
		expect(options.HostConfig?.Init).toBe(true);
		expect(options.WorkingDir).toBe("/home/user");
	});

	it("labels the container as a sandbox", () => {
		const options = buildSandboxContainerOptions(spec);
		expect(options.name).toBe("dokploy-sandbox-sb_1");
		expect(options.Labels).toEqual({
			"dokploy.sandbox": "true",
			"dokploy.sandboxId": "sb_1",
			"dokploy.organizationId": "org_1",
		});
	});

	it("selects the isolated or internet network and never dokploy-network", () => {
		expect(buildSandboxContainerOptions(spec).HostConfig?.NetworkMode).toBe(
			SANDBOX_ISOLATED_NETWORK,
		);
		expect(
			buildSandboxContainerOptions({ ...spec, networkMode: "internet" })
				.HostConfig?.NetworkMode,
		).toBe(SANDBOX_INTERNET_NETWORK);
		expect(getSandboxNetworkName("isolated")).not.toBe("dokploy-network");
		expect(getSandboxNetworkName("internet")).not.toBe("dokploy-network");
	});

	it("passes env vars and HOME, skipping comments and malformed lines", () => {
		const options = buildSandboxContainerOptions(spec);
		expect(options.Env).toEqual(["HOME=/home/user", "FOO=bar", "BAZ=qux=1"]);
	});

	it("omits User when the image default should be used", () => {
		const options = buildSandboxContainerOptions({ ...spec, user: null });
		expect(options).not.toHaveProperty("User");
	});
});

describe("parseSandboxEnvVars", () => {
	it("returns an empty list for empty input", () => {
		expect(parseSandboxEnvVars(null)).toEqual([]);
		expect(parseSandboxEnvVars("")).toEqual([]);
	});
});

describe("parseSandboxUser", () => {
	it("parses uid:gid", () => {
		expect(parseSandboxUser("1000:1000")).toEqual({ uid: 1000, gid: 1000 });
		expect(parseSandboxUser("1001")).toEqual({ uid: 1001, gid: 1001 });
	});

	it("rejects named users", () => {
		expect(parseSandboxUser("node")).toBeNull();
		expect(parseSandboxUser(null)).toBeNull();
	});
});

describe("buildSandboxLifetimeCommand", () => {
	const [shell, flag, script = ""] = buildSandboxLifetimeCommand(
		new Date("2026-10-21T12:00:00.999Z"),
		90_500,
	);

	it("sleeps in the main process until the absolute deadline", () => {
		expect([shell, flag]).toEqual(["sh", "-c"]);
		expect(script.trim().split("\n").at(-1)).toBe(
			"exec sleep $(( 1792584000 - $(date +%s) ))",
		);
	});

	it("seeds the idle timeout in whole seconds", () => {
		expect(script).toContain("echo 91 2>/dev/null > /tmp/.dokploy-timeout");
	});

	it("runs the idle watcher in the background and kills the main sleep", () => {
		expect(script).toContain(") &");
		expect(script).toContain("while sleep 5; do");
		expect(script).toContain("kill $$");
	});
});

describe("getSandboxExpiry", () => {
	const now = new Date("2026-10-21T10:00:00.000Z");

	it("adds the idle timeout to now", () => {
		const deadline = new Date("2026-10-22T10:00:00.000Z");
		expect(getSandboxExpiry(now, 300_000, deadline)).toEqual(
			new Date("2026-10-21T10:05:00.000Z"),
		);
	});

	it("never goes past the hard deadline", () => {
		const deadline = new Date("2026-10-21T10:02:00.000Z");
		expect(getSandboxExpiry(now, 300_000, deadline)).toEqual(deadline);
	});
});

describe("withSandboxActivity", () => {
	it("marks activity with a builtin before the command", () => {
		expect(withSandboxActivity("ls -la")).toBe(
			`echo 1 2>/dev/null > ${SANDBOX_ACTIVITY_FILE}; ls -la`,
		);
	});
});

describe("toSandboxTimeoutSeconds", () => {
	it("rounds up so the idle timeout is never shorter than asked", () => {
		expect(toSandboxTimeoutSeconds(10_000)).toBe(10);
		expect(toSandboxTimeoutSeconds(10_001)).toBe(11);
	});
});
