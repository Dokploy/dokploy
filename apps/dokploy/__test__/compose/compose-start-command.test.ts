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
import {
	type DeployedComposeConfig,
	getDeployedComposeConfigCommand,
	getStartComposeCommand,
	parseDeployedComposeConfig,
} from "@dokploy/server/utils/builders/compose";
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

const deployedAt = (dir: string): DeployedComposeConfig => ({
	configFiles: [`${dir}/compose.yaml`, `${dir}/compose.override-prod.yaml`],
	workingDir: dir,
	envFiles: [],
});

const fakeDocker = () => {
	const root = mkdtempSync(join(tmpdir(), "dokploy-start-"));
	const bin = join(root, "bin");
	const log = join(root, "docker.log");
	const state = join(root, "state");
	const codeDir = join(root, ".docker", "compose", "compose-app", "code");
	mkdirSync(bin);
	mkdirSync(state);
	mkdirSync(codeDir, { recursive: true });
	for (const file of ["compose.yaml", "compose.override-prod.yaml"]) {
		writeFileSync(join(codeDir, file), "");
	}
	writeFileSync(
		join(bin, "docker"),
		`#!/bin/sh
echo "HOME=\${HOME:-} $*" >> ${log}
case "$*" in
	*" up "*) [ -f ${state}/up-fails ] && exit 1 ;;
esac
exit 0
`,
	);
	chmodSync(join(bin, "docker"), 0o755);
	vi.spyOn(process, "cwd").mockReturnValue(root);

	return {
		root,
		codeDir,
		deployed: deployedAt(codeDir),
		failUp: () => writeFileSync(join(state, "up-fails"), ""),
		run: (compose: Compose, config: DeployedComposeConfig | null) => {
			let exitCode = 0;
			try {
				execSync(getStartComposeCommand(compose, config), {
					shell: "/bin/sh",
					env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
					stdio: "ignore",
				});
			} catch (error: any) {
				exitCode = error.status;
			}
			const calls = existsSync(log)
				? readFileSync(log, "utf8").trim().split("\n")
				: [];
			return { exitCode, calls };
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

	it("starts the existing containers from the deployed files without recreating them", () => {
		const dir = docker.codeDir;
		const { exitCode, calls } = docker.run(
			{ ...baseCompose, command: OVERLAY_COMMAND },
			docker.deployed,
		);

		expect(exitCode).toBe(0);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toContain(
			`compose -p compose-app --project-directory ${dir} -f ${dir}/compose.yaml -f ${dir}/compose.override-prod.yaml up -d --no-recreate`,
		);
		expect(calls[0]).not.toMatch(/--build|--pull|--remove-orphans/);
		expect(calls[0]).not.toMatch(/^HOME= /);
	});

	it("passes the deployed env files", () => {
		const envFile = join(docker.codeDir, ".env");
		writeFileSync(envFile, "");

		const { calls } = docker.run(baseCompose, {
			...docker.deployed,
			envFiles: [envFile],
		});

		expect(calls[0]).toContain(`--env-file ${envFile} up -d --no-recreate`);
	});

	it("starts the existing containers without reading files when a deployed env file is gone", () => {
		const { exitCode, calls } = docker.run(baseCompose, {
			...docker.deployed,
			envFiles: [join(docker.codeDir, ".env")],
		});

		expect(exitCode).toBe(0);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatch(/compose -p compose-app start$/);
	});

	it("starts the existing containers without reading files when a deployed compose file is gone", () => {
		rmSync(join(docker.codeDir, "compose.override-prod.yaml"));

		const { calls } = docker.run(baseCompose, docker.deployed);

		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatch(/compose -p compose-app start$/);
	});

	it("falls back to compose start when the containers have no config labels", () => {
		const { calls } = docker.run(baseCompose, {
			configFiles: [],
			workingDir: "",
			envFiles: [],
		});

		expect(calls[0]).toMatch(/compose -p compose-app start$/);
	});

	it("recreates with the custom command, keeping its extra compose files, when no containers are left", () => {
		const { exitCode, calls } = docker.run(
			{ ...baseCompose, command: OVERLAY_COMMAND },
			null,
		);

		expect(exitCode).toBe(0);
		expect(calls[0]).toContain(OVERLAY_COMMAND);
		expect(calls[0]).not.toMatch(/^HOME= /);
	});

	it("recreates without building or pulling, so the deployed images are kept", () => {
		const { calls } = docker.run({ ...baseCompose, pullImages: true }, null);

		expect(calls[0]).toContain("compose -p compose-app");
		expect(calls[0]).not.toContain("--build");
		expect(calls[0]).not.toContain("--pull");
	});

	it("recreates with the same project directory as deploy when there are mounts", () => {
		const { calls } = docker.run(
			{
				...baseCompose,
				composePath: "deploy/compose.yaml",
				mounts: [{}],
			} as unknown as Compose,
			null,
		);

		expect(calls[0]).toContain(
			`--project-directory ${join(docker.root, ".docker", "compose", "compose-app", "code")}`,
		);
		expect(calls[0]).toContain("-f deploy/compose.yaml");
	});

	it("treats a whitespace-only command as no custom command", () => {
		const { calls } = docker.run({ ...baseCompose, command: "   " }, null);

		expect(calls[0]).toContain("compose -p compose-app");
	});

	it("fails when the containers cannot be started", () => {
		docker.failUp();

		expect(docker.run(baseCompose, docker.deployed).exitCode).not.toBe(0);
		expect(docker.run(baseCompose, null).exitCode).not.toBe(0);
	});

	it("does not need the custom command while containers exist", () => {
		const { exitCode } = docker.run(
			{ ...baseCompose, command: "compose up -d; touch /tmp/x" },
			docker.deployed,
		);

		expect(exitCode).toBe(0);
	});

	it("refuses to recreate with an invalid custom command", () => {
		expect(() =>
			getStartComposeCommand(
				{ ...baseCompose, command: "compose up -d; touch /tmp/x" },
				null,
			),
		).toThrow("Invalid characters in compose command");
	});

	it("restores the isolated network and its Traefik connection", () => {
		const { calls } = docker.run(
			{ ...baseCompose, isolatedDeployment: true },
			docker.deployed,
		);

		expect(calls.some((c) => c.includes("network inspect compose-app"))).toBe(
			true,
		);
		expect(calls.some((c) => c.includes("network connect compose-app"))).toBe(
			true,
		);
	});
});

describe("parseDeployedComposeConfig", () => {
	it("returns null when the project has no containers", () => {
		expect(parseDeployedComposeConfig("")).toBeNull();
		expect(parseDeployedComposeConfig("\n")).toBeNull();
	});

	it("reads the files of the newest container", () => {
		const stdout = [
			"/code/a.yaml,/code/b.yaml\t/code\t/code/.env",
			"/code/a.yaml\t/code\t",
		].join("\n");

		expect(parseDeployedComposeConfig(stdout)).toEqual({
			configFiles: ["/code/a.yaml", "/code/b.yaml"],
			workingDir: "/code",
			envFiles: ["/code/.env"],
		});
	});

	it("handles containers without compose labels", () => {
		expect(parseDeployedComposeConfig("\t\t\n")).toEqual({
			configFiles: [],
			workingDir: "",
			envFiles: [],
		});
	});
});

describe("startCompose", () => {
	const deployed = deployedAt("/etc/dokploy/compose/compose-app/code");
	const psOutput = `${deployed.configFiles.join(",")}\t${deployed.workingDir}\t\n`;

	beforeEach(() => {
		vi.mocked(execAsync).mockReset();
		vi.mocked(execAsyncRemote).mockReset();
		findFirst.mockReset();
	});

	it("reads the deployed config, then starts locally", async () => {
		findFirst.mockResolvedValue(baseCompose);
		vi.mocked(execAsync).mockResolvedValue({ stdout: psOutput, stderr: "" });

		await startCompose("compose-id");

		expect(vi.mocked(execAsync).mock.calls.map((c) => c[0])).toEqual([
			getDeployedComposeConfigCommand("compose-app"),
			getStartComposeCommand(baseCompose, deployed),
		]);
		expect(execAsyncRemote).not.toHaveBeenCalled();
	});

	it("reads the deployed config, then starts on the remote server", async () => {
		const remote = { ...baseCompose, serverId: "server-id" } as Compose;
		findFirst.mockResolvedValue(remote);
		vi.mocked(execAsyncRemote).mockResolvedValue({
			stdout: "",
			stderr: "",
		});

		await startCompose("compose-id");

		expect(vi.mocked(execAsyncRemote).mock.calls).toEqual([
			["server-id", getDeployedComposeConfigCommand("compose-app")],
			["server-id", getStartComposeCommand(remote, null)],
		]);
		expect(execAsync).not.toHaveBeenCalled();
	});

	it("does nothing on the server for stacks", async () => {
		findFirst.mockResolvedValue({ ...baseCompose, composeType: "stack" });

		await startCompose("compose-id");

		expect(execAsync).not.toHaveBeenCalled();
		expect(execAsyncRemote).not.toHaveBeenCalled();
	});
});
