import { beforeEach, describe, expect, it, vi } from "vitest";

const execMocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => execMocks);

import {
	buildCountRunningContainersCommand,
	countRunningContainers,
	runtimeExistsOnTarget,
} from "@dokploy/server/utils/migration/runtime";

describe("buildCountRunningContainersCommand", () => {
	it("filters by the Swarm service-name label for 'service'", () => {
		expect(buildCountRunningContainersCommand("service", "my-app")).toBe(
			"docker ps --filter label\\=com.docker.swarm.service.name\\=my-app --filter status=running --format '{{.ID}}'",
		);
	});

	it("filters by the stack namespace label for 'stack'", () => {
		expect(buildCountRunningContainersCommand("stack", "my-app")).toBe(
			"docker ps --filter label\\=com.docker.stack.namespace\\=my-app --filter status=running --format '{{.ID}}'",
		);
	});

	it("filters by the compose project label for 'docker-compose'", () => {
		expect(buildCountRunningContainersCommand("docker-compose", "my-app")).toBe(
			"docker ps --filter label\\=com.docker.compose.project\\=my-app --filter status=running --format '{{.ID}}'",
		);
	});
});

describe("countRunningContainers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("counts one ID per non-blank output line", async () => {
		execMocks.execAsync.mockResolvedValue({
			stdout: "abc123\ndef456\n",
			stderr: "",
		});
		await expect(
			countRunningContainers("service", "my-app", null),
		).resolves.toBe(2);
	});

	it("returns 0 for empty output (nothing running)", async () => {
		execMocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
		await expect(
			countRunningContainers("docker-compose", "my-app", null),
		).resolves.toBe(0);
	});

	it("propagates a failed inspection instead of treating it as zero containers", async () => {
		execMocks.execAsync.mockRejectedValue(
			new Error("Cannot connect to the Docker daemon"),
		);
		await expect(
			countRunningContainers("service", "my-app", null),
		).rejects.toThrow("Cannot connect to the Docker daemon");
	});

	it("propagates a dead SSH connection instead of treating it as zero containers", async () => {
		execMocks.execAsyncRemote.mockRejectedValue(new Error("ECONNREFUSED"));
		await expect(
			countRunningContainers("stack", "my-app", "server-a"),
		).rejects.toThrow("ECONNREFUSED");
		expect(execMocks.execAsync).not.toHaveBeenCalled();
	});
});

describe("runtimeExistsOnTarget", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("'service': treats a successful `docker service inspect` as existing", async () => {
		execMocks.execAsync.mockResolvedValue({ stdout: "[{}]", stderr: "" });
		await expect(
			runtimeExistsOnTarget("service", "my-app", null),
		).resolves.toBe(true);
	});

	it("'service': treats 'no such service' as absent, not an error", async () => {
		execMocks.execAsync.mockRejectedValue(new Error("no such service: my-app"));
		await expect(
			runtimeExistsOnTarget("service", "my-app", null),
		).resolves.toBe(false);
	});

	it("'service': propagates a genuine inspection failure", async () => {
		execMocks.execAsync.mockRejectedValue(new Error("permission denied"));
		await expect(
			runtimeExistsOnTarget("service", "my-app", null),
		).rejects.toThrow("permission denied");
	});

	it("'stack': treats 'nothing found in stack' as absent, not an error", async () => {
		execMocks.execAsync.mockRejectedValue(
			new Error("nothing found in stack: my-app"),
		);
		await expect(runtimeExistsOnTarget("stack", "my-app", null)).resolves.toBe(
			false,
		);
	});

	it("'stack': treats non-empty service list output as existing", async () => {
		execMocks.execAsync.mockResolvedValue({
			stdout: "svc1\nsvc2\n",
			stderr: "",
		});
		await expect(runtimeExistsOnTarget("stack", "my-app", null)).resolves.toBe(
			true,
		);
	});

	it("'docker-compose': treats any (even stopped) labeled container as existing", async () => {
		execMocks.execAsync.mockResolvedValue({ stdout: "abc123\n", stderr: "" });
		await expect(
			runtimeExistsOnTarget("docker-compose", "my-app", null),
		).resolves.toBe(true);
	});

	it("'docker-compose': treats empty output as absent", async () => {
		execMocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
		await expect(
			runtimeExistsOnTarget("docker-compose", "my-app", null),
		).resolves.toBe(false);
	});

	it("'docker-compose': propagates a genuine inspection failure", async () => {
		execMocks.execAsync.mockRejectedValue(new Error("daemon unreachable"));
		await expect(
			runtimeExistsOnTarget("docker-compose", "my-app", null),
		).rejects.toThrow("daemon unreachable");
	});
});
