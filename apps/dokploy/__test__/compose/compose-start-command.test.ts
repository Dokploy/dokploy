import { execSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCompose } from "@dokploy/server/services/compose";
import { getStartComposeCommand } from "@dokploy/server/utils/builders/compose";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();

vi.mock("@dokploy/server/db", () => {
	const chain: any = {
		set: vi.fn(() => chain),
		where: vi.fn(() => chain),
		returning: vi.fn().mockResolvedValue([{}]),
	};
	return {
		db: {
			update: vi.fn(() => chain),
			query: { compose: { findFirst: (...args: any[]) => findFirst(...args) } },
		},
	};
});

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	ExecError: class ExecError extends Error {},
}));

type Compose = Parameters<typeof getStartComposeCommand>[0];

const baseCompose = {
	composeId: "compose-id",
	appName: "compose-app",
	composeType: "docker-compose",
	sourceType: "git",
	composePath: "compose.yaml",
	command: "",
	createEnvFile: true,
	pullImages: false,
	isolatedDeployment: false,
	serverId: null,
	mounts: [],
	domains: [],
} as unknown as Compose;

const OVERLAY_COMMAND =
	"compose -f compose.yaml -f compose.override-prod.yaml up -d --remove-orphans";

// Runs the generated script against a fake `docker` that records every call,
// so the tests cover the shell branching itself, not just the string.
const fakeDocker = () => {
	const root = mkdtempSync(join(tmpdir(), "dokploy-start-"));
	const bin = join(root, "bin");
	const log = join(root, "docker.log");
	const state = join(root, "state");
	mkdirSync(bin);
	mkdirSync(state);
	mkdirSync(join(root, ".docker", "compose", "compose-app", "code"), {
		recursive: true,
	});
	writeFileSync(
		join(bin, "docker"),
		`#!/bin/sh
echo "HOME=\${HOME:-} $*" >> ${log}
case "$1" in
	ps) [ -f ${state}/has-containers ] && echo 3f2a1b ;;
	compose)
		case "$*" in
			*" start") [ -f ${state}/start-fails ] && exit 1 ;;
			*" up "*) [ -f ${state}/up-fails ] && exit 1 ;;
		esac ;;
esac
exit 0
`,
	);
	chmodSync(join(bin, "docker"), 0o755);
	vi.spyOn(process, "cwd").mockReturnValue(root);

	return {
		root,
		set: (flag: "has-containers" | "start-fails" | "up-fails") =>
			writeFileSync(join(state, flag), ""),
		run: (compose: Compose) => {
			let exitCode = 0;
			let stderr = "";
			try {
				execSync(getStartComposeCommand(compose), {
					shell: "/bin/sh",
					env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
					stdio: ["ignore", "ignore", "pipe"],
				});
			} catch (error: any) {
				exitCode = error.status;
				stderr = String(error.stderr);
			}
			const calls = existsSync(log)
				? readFileSync(log, "utf8").trim().split("\n")
				: [];
			return { exitCode, stderr, calls };
		},
	};
};

describe("getStartComposeCommand", () => {
	let docker: ReturnType<typeof fakeDocker>;

	beforeEach(() => {
		docker = fakeDocker();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		rmSync(docker.root, { recursive: true, force: true });
	});

	it("restarts the stopped containers without re-running the compose command", () => {
		docker.set("has-containers");

		const { exitCode, calls } = docker.run({
			...baseCompose,
			command: OVERLAY_COMMAND,
		});

		expect(exitCode).toBe(0);
		expect(calls.some((c) => c.endsWith("compose -p compose-app start"))).toBe(
			true,
		);
		expect(calls.some((c) => c.includes(" up "))).toBe(false);
	});

	it("recreates with the custom command, keeping its extra compose files, when no containers are left", () => {
		const { exitCode, calls } = docker.run({
			...baseCompose,
			command: OVERLAY_COMMAND,
		});

		expect(exitCode).toBe(0);
		expect(calls.some((c) => c.endsWith(" start"))).toBe(false);
		const up = calls.find((c) => c.includes(" up "));
		expect(up).toContain(OVERLAY_COMMAND);
		expect(up).not.toMatch(/^HOME= /);
	});

	it("reports a failed start instead of recreating the containers", () => {
		docker.set("has-containers");
		docker.set("start-fails");

		const { exitCode, calls } = docker.run({
			...baseCompose,
			command: OVERLAY_COMMAND,
		});

		expect(exitCode).not.toBe(0);
		expect(calls.some((c) => c.includes(" up "))).toBe(false);
	});

	it("fails when recreating fails", () => {
		docker.set("up-fails");

		const { exitCode } = docker.run(baseCompose);

		expect(exitCode).not.toBe(0);
	});

	it("recreates with the same project directory as deploy when there are mounts", () => {
		const { calls } = docker.run({
			...baseCompose,
			composePath: "deploy/compose.yaml",
			mounts: [{}],
		} as unknown as Compose);

		const up = calls.find((c) => c.includes(" up "));
		expect(up).toContain(
			`--project-directory ${join(docker.root, ".docker", "compose", "compose-app", "code")}`,
		);
		expect(up).toContain("-f deploy/compose.yaml");
	});

	it("recreates without building or pulling, so the deployed images are kept", () => {
		const { calls } = docker.run({ ...baseCompose, pullImages: true });

		const up = calls.find((c) => c.includes(" up "));
		expect(up).toContain("compose -p compose-app");
		expect(up).not.toContain("--build");
		expect(up).not.toContain("--pull");
	});

	it("treats a whitespace-only command as no custom command", () => {
		const { calls } = docker.run({ ...baseCompose, command: "   " });

		expect(calls.find((c) => c.includes(" up "))).toContain(
			"compose -p compose-app",
		);
	});

	it("still restarts existing containers when the saved custom command is invalid", () => {
		docker.set("has-containers");

		const { exitCode } = docker.run({
			...baseCompose,
			command: "compose up -d; touch /tmp/x",
		});

		expect(exitCode).toBe(0);
	});

	it("refuses to recreate with an invalid custom command", () => {
		const { exitCode, stderr, calls } = docker.run({
			...baseCompose,
			command: "compose up -d; touch /tmp/x",
		});

		expect(exitCode).not.toBe(0);
		expect(stderr).toContain("Invalid characters in compose command");
		expect(calls.some((c) => c.includes(" up "))).toBe(false);
	});

	it("restores the isolated network and its Traefik connection", () => {
		docker.set("has-containers");

		const { calls } = docker.run({ ...baseCompose, isolatedDeployment: true });

		expect(calls.some((c) => c.includes("network inspect compose-app"))).toBe(
			true,
		);
		expect(calls.some((c) => c.includes("network connect compose-app"))).toBe(
			true,
		);
	});
});

describe("startCompose", () => {
	beforeEach(() => {
		vi.mocked(execAsync).mockReset();
		vi.mocked(execAsyncRemote).mockReset();
		findFirst.mockReset();
	});

	it("runs the start command locally", async () => {
		findFirst.mockResolvedValue(baseCompose);

		await startCompose("compose-id");

		expect(vi.mocked(execAsync).mock.calls[0]?.[0]).toBe(
			getStartComposeCommand(baseCompose),
		);
		expect(execAsyncRemote).not.toHaveBeenCalled();
	});

	it("runs the start command on the remote server", async () => {
		const remote = { ...baseCompose, serverId: "server-id" } as Compose;
		findFirst.mockResolvedValue(remote);

		await startCompose("compose-id");

		expect(execAsyncRemote).toHaveBeenCalledWith(
			"server-id",
			getStartComposeCommand(remote),
		);
		expect(execAsync).not.toHaveBeenCalled();
	});

	it("does nothing on the server for stacks", async () => {
		findFirst.mockResolvedValue({ ...baseCompose, composeType: "stack" });

		await startCompose("compose-id");

		expect(execAsync).not.toHaveBeenCalled();
		expect(execAsyncRemote).not.toHaveBeenCalled();
	});
});
