import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	composeProjectDirectory,
	composeSnapshotArgs,
	composeSnapshotFiles,
	getWriteComposeSnapshotCommand,
	readComposeSnapshot,
	type SnapshotCompose,
	writeSnapshotReplicas,
} from "@dokploy/server/services/scaling/compose-snapshot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

const { execAsyncRemoteMock } = vi.hoisted(() => ({
	execAsyncRemoteMock: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importActual) => ({
	...(await importActual<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsyncRemote: execAsyncRemoteMock,
}));

const compose = (
	overrides: Partial<SnapshotCompose> = {},
): SnapshotCompose => ({
	appName: `snapshot-test-${process.pid}`,
	serverId: null,
	sourceType: "github",
	composePath: "./deploy/docker-compose.yml",
	composeType: "docker-compose",
	createEnvFile: true,
	command: "",
	...overrides,
});

const { COMPOSE_PATH } = paths(false);

describe("getWriteComposeSnapshotCommand", () => {
	it("copies the converted file and env next to code/ and moves them into place", () => {
		const target = compose();
		const files = composeSnapshotFiles(target);
		const command = getWriteComposeSnapshotCommand(target, false);

		expect(files.dir).toBe(join(COMPOSE_PATH, target.appName, ".dokploy"));
		expect(command).toContain(
			join(COMPOSE_PATH, target.appName, "code", "deploy/docker-compose.yml"),
		);
		expect(command).toContain(
			join(COMPOSE_PATH, target.appName, "code", "deploy", ".env"),
		);
		expect(command).toMatch(/mv -f .*compose\.yml\.tmp/);
		expect(command).toMatch(/mv -f .*meta\.json\.tmp/);
		// The deploy log must not gain another base64 write: tests elsewhere
		// rely on it to prove no .env is written when createEnvFile is off.
		expect(command).not.toContain("base64 -d >");
	});

	it("records the project directory compose resolved relative paths against", () => {
		const target = compose();
		const codeDir = join(COMPOSE_PATH, target.appName, "code");
		expect(composeProjectDirectory(target, false)).toBe(
			join(codeDir, "deploy"),
		);
		expect(composeProjectDirectory(target, true)).toBe(codeDir);
		expect(composeProjectDirectory(compose({ sourceType: "raw" }), false)).toBe(
			codeDir,
		);
	});

	it("uses the auto-loaded .env of the project directory without createEnvFile", () => {
		const target = compose({ createEnvFile: false });
		const command = getWriteComposeSnapshotCommand(target, true);
		expect(command).toContain(
			join(COMPOSE_PATH, target.appName, "code", ".env"),
		);
	});

	it("removes any snapshot when the compose uses a custom command", () => {
		const target = compose({ command: "compose up -d" });
		const command = getWriteComposeSnapshotCommand(target, false);
		expect(command.trim()).toMatch(/^rm -rf /);
		expect(command).toContain(".dokploy");
	});
});

describe("reading and updating the snapshot", () => {
	const target = compose();
	const files = composeSnapshotFiles(target);

	beforeEach(() => {
		mkdirSync(files.dir, { recursive: true });
		writeFileSync(
			files.meta,
			JSON.stringify({
				version: 1,
				composeType: "docker-compose",
				projectDirectory: "/srv/app",
			}),
		);
		writeFileSync(
			files.compose,
			"services:\n  web:\n    image: nginx\n    scale: 2\n  db:\n    image: postgres\n",
		);
	});

	afterEach(() => {
		rmSync(join(COMPOSE_PATH, target.appName), {
			recursive: true,
			force: true,
		});
	});

	it("reads a local snapshot", async () => {
		const snapshot = await readComposeSnapshot(target);
		expect(snapshot?.projectDirectory).toBe("/srv/app");
		expect(Object.keys(snapshot?.spec.services ?? {})).toEqual(["web", "db"]);
		expect(composeSnapshotArgs(target, snapshot!)).toEqual([
			"compose",
			"-p",
			target.appName,
			"--project-directory",
			"/srv/app",
			"-f",
			files.compose,
			"--env-file",
			files.env,
		]);
	});

	it("returns null when there is no snapshot or its metadata is unknown", async () => {
		rmSync(files.meta);
		expect(await readComposeSnapshot(target)).toBeNull();
		writeFileSync(files.meta, JSON.stringify({ version: 9 }));
		expect(await readComposeSnapshot(target)).toBeNull();
	});

	it("writes a live scale back so Start keeps it", async () => {
		const snapshot = await readComposeSnapshot(target);
		await writeSnapshotReplicas(target, snapshot!, "web", 5);
		const saved = parse(readFileSync(files.compose, "utf8"));
		expect(saved.services.web).toEqual({
			image: "nginx",
			deploy: { replicas: 5 },
		});
		expect(saved.services.db).toEqual({ image: "postgres" });
	});
});

describe("remote snapshots", () => {
	beforeEach(() => execAsyncRemoteMock.mockReset());

	it("reads both files in one SSH call", async () => {
		const meta = Buffer.from(
			JSON.stringify({
				version: 1,
				composeType: "stack",
				projectDirectory: "/etc/dokploy/compose/app/code",
			}),
		).toString("base64");
		const yaml = Buffer.from("services:\n  api:\n    image: a\n").toString(
			"base64",
		);
		execAsyncRemoteMock.mockResolvedValue({
			stdout: `${meta}\n${yaml}\n`,
			stderr: "",
		});

		const snapshot = await readComposeSnapshot(
			compose({ appName: "app", serverId: "srv-1" }),
		);

		expect(execAsyncRemoteMock).toHaveBeenCalledTimes(1);
		expect(snapshot?.composeType).toBe("stack");
		expect(snapshot?.files.compose).toBe(
			join(paths(true).COMPOSE_PATH, "app", ".dokploy", "compose.yml"),
		);
		expect(Object.keys(snapshot?.spec.services ?? {})).toEqual(["api"]);
	});

	it("treats an empty answer as no snapshot", async () => {
		execAsyncRemoteMock.mockResolvedValue({ stdout: "", stderr: "" });
		expect(
			await readComposeSnapshot(compose({ appName: "app", serverId: "srv-1" })),
		).toBeNull();
	});
});
