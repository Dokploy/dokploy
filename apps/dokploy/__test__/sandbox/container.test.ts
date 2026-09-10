import {
	buildSandboxContainerOptions,
	getSandboxNetworkName,
	parseSandboxEnvVars,
	parseSandboxUser,
	SANDBOX_INTERNET_NETWORK,
	SANDBOX_ISOLATED_NETWORK,
} from "@dokploy/server/utils/sandbox/container";
import { describe, expect, it } from "vitest";

const spec = {
	sandboxId: "sb_1",
	projectId: "proj_1",
	environmentId: "env_1",
	image: "python:3.12-slim",
	cpu: 1.5,
	memoryMb: 512,
	pidsLimit: 256,
	networkMode: "isolated" as const,
	envVars: "FOO=bar\n# comment\n\nBAZ=qux=1\ninvalid",
	workdir: "/home/user",
	user: "1000:1000",
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
		expect(options.HostConfig?.LogConfig?.Config?.["max-size"]).toBe("10m");
		expect(options.User).toBe("1000:1000");
	});

	it("keeps the container alive with a portable command", () => {
		const options = buildSandboxContainerOptions(spec);
		expect(options.Entrypoint).toEqual([""]);
		expect(options.Cmd).toEqual(["tail", "-f", "/dev/null"]);
		expect(options.WorkingDir).toBe("/home/user");
	});

	it("sets the labels used by the reaper and reconcile", () => {
		const options = buildSandboxContainerOptions(spec);
		expect(options.name).toBe("dokploy-sandbox-sb_1");
		expect(options.Labels).toEqual({
			"dokploy.sandbox": "true",
			"dokploy.sandboxId": "sb_1",
			"dokploy.projectId": "proj_1",
			"dokploy.environmentId": "env_1",
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
