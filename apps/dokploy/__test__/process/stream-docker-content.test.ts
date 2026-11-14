import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { quote } from "shell-quote";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	root: "",
	commands: [] as string[],
	real: false,
	fail: false,
}));
vi.mock("@dokploy/server/constants", async (original) => ({
	...(await original<any>()),
	paths: () => ({ BASE_PATH: state.root }),
}));
vi.mock("@dokploy/server/db", () => ({ db: {} }));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: async () => ({
		serverId: "fixture",
		ipAddress: "127.0.0.1",
		port: 2226,
		username: "dokployer",
		sshKeyId: "key",
		sshKey: { privateKey: readFileSync(env.STREAM_CONTENT_SSH_KEY!, "utf8") },
	}),
}));
vi.mock("@dokploy/server/utils/process/execAsync", async (original) => {
	const actual = await original<any>();
	const run = async (
		server: string | null,
		command: string,
		onData?: any,
		input?: string | Buffer,
	) => {
		state.commands.push(command);
		if (state.fail && command.includes("docker "))
			throw new actual.ExecError("Docker failed", {
				command,
				stderr: "synthetic Docker permission denied",
				exitCode: 1,
			});
		if (state.real)
			return server
				? actual.execAsyncRemote(server, command, onData, input)
				: actual.execAsync(command);
		const result = spawnSync("sh", ["-c", command], {
			input,
			encoding: "utf8",
			env: { ...env, PATH: `${state.root}/bin:${env.PATH}` },
		});
		if (result.status !== 0)
			throw new actual.ExecError("shell failed", {
				command,
				stderr: result.stderr,
				exitCode: result.status,
			});
		return { stdout: result.stdout, stderr: result.stderr };
	};
	return {
		...actual,
		execAsync: (command: string) => run(null, command),
		execAsyncRemote: run,
	};
});

import {
	CONTAINER_FILE_SIZE_LIMIT,
	uploadFileToContainer,
	writeContainerFile,
} from "@dokploy/server/services/docker";
import { writeVolumeFile } from "@dokploy/server/services/docker-volume";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";

const cap = ((CONTAINER_FILE_SIZE_LIMIT * 2) / 4) * 3;
const hash = (content: Buffer | string) =>
	createHash("sha256").update(content).digest("hex");
let container: string;
let volume: string;
beforeEach(async () => {
	state.root = await mkdtemp(
		join(env.STREAM_CONTENT_ROOT || tmpdir(), "docker-content-"),
	);
	state.real = !!env.STREAM_CONTENT_SSH_KEY;
	state.fail = false;
	state.commands = [];
	container = `stream-file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	volume = `${container}-volume`;
	await mkdir(join(state.root, "bin"));
	await writeFile(join(state.root, "bin/docker"), "#!/bin/sh\nexit 0\n", {
		mode: 0o755,
	});
	if (state.real) {
		await execAsync(`docker run -d --name ${container} busybox:1.36 sleep 300`);
		await execAsync(`docker volume create ${volume}`);
	}
});
afterEach(async () => {
	state.fail = false;
	if (state.real) {
		await execAsync(`docker rm -f ${container}`);
		await execAsync(`docker volume rm ${volume}`);
	}
	await rm(state.root, { recursive: true, force: true });
});
describe("stream Docker file content", () => {
	for (const remote of [false, true])
		for (const site of ["upload", "container", "volume"] as const) {
			const server = remote ? "fixture" : undefined;
			const run = (command: string) =>
				remote ? execAsyncRemote("fixture", command) : execAsync(command);
			const save = (content: string | Buffer, path = "/file.txt") =>
				site === "upload"
					? uploadFileToContainer(
							container,
							Buffer.from(content),
							"source.bin",
							path,
							server,
						)
					: site === "container"
						? writeContainerFile(container, path, String(content), server)
						: writeVolumeFile(volume, path, String(content), server);
			const read = () =>
				site === "volume"
					? `docker run --rm -v ${volume}:/__volume busybox`
					: `docker exec ${container}`;
			it(`${site} remote=${remote}: exact empty, normal, 160 KiB and unchanged editor cap`, async () => {
				for (const content of [
					"",
					"normal é '$ ` \\ \n",
					`synthetic-private-${"x".repeat(160 * 1024)}`,
					"x".repeat(cap),
				]) {
					await save(content);
					if (state.real) {
						const { stdout } = await run(
							`${read()} sha256sum ${site === "volume" ? "/__volume/file.txt" : "/file.txt"}`,
						);
						expect(stdout.split(" ")[0]).toBe(hash(content));
					}
				}
				if (site === "upload") {
					const binary = Buffer.from(
						Array.from({ length: 160 * 1024 }, (_, i) => i % 256),
					);
					await save(binary);
					if (state.real)
						expect(
							(
								await run(`docker exec ${container} sha256sum /file.txt`)
							).stdout.split(" ")[0],
						).toBe(hash(binary));
				} else
					await expect(save("x".repeat(cap + 1))).rejects.toThrow("max 512KB");
				for (const command of state.commands) {
					expect(Buffer.byteLength(command)).toBeLessThan(10000);
					expect(command).not.toContain("synthetic-private-");
				}
				expect(await readdir(join(state.root, ".staging"))).toEqual([]);
			}, 120000);
			it.skipIf(!env.STREAM_CONTENT_SSH_KEY)(
				`${site} remote=${remote}: canary mode/owner/inode/symlink parity`,
				async () => {
					const prefix = read();
					for (const kind of ["new", "existing", "symlink"]) {
						const base = site === "volume" ? "/__volume" : "";
						await run(
							`${prefix} sh -c ${quote([`rm -f ${base}/file.txt ${base}/legacy.txt ${base}/pin ${base}/legacy-pin`])} `,
						);
						if (kind !== "new")
							await run(
								`${prefix} sh -c ${quote([`echo prior > ${base}/target; echo prior > ${base}/legacy-target; chmod 646 ${base}/target ${base}/legacy-target; chown 1234:1235 ${base}/target ${base}/legacy-target; ln ${base}/target ${base}/pin; ln ${base}/legacy-target ${base}/legacy-pin; ${kind === "symlink" ? `ln -s target ${base}/file.txt; ln -s legacy-target ${base}/legacy.txt` : `mv ${base}/target ${base}/file.txt; mv ${base}/legacy-target ${base}/legacy.txt`}`])}`,
							);
						const snapshot = async (name: string) =>
							(
								await run(`${prefix} stat -Lc '%a:%u:%g:%i' ${base}/${name}`)
							).stdout
								.trim()
								.split(":");
						const before = kind === "new" ? [] : await snapshot("file.txt");
						const oldBefore =
							kind === "new" ? [] : await snapshot("legacy.txt");
						const b64 = Buffer.from("small é\n").toString("base64");
						if (site === "volume")
							await run(
								`docker run --rm -v ${volume}:/__volume busybox sh -c ${quote([`printf '%s' ${b64} | base64 -d > /__volume/legacy.txt`])}`,
							);
						else {
							const temp = join(state.root, "canary-file");
							await run(
								`printf '%s' ${b64} | base64 -d > ${quote([temp])}; docker cp ${quote([temp])} ${container}:/legacy.txt; rm -f ${quote([temp])}`,
							);
						}
						await save("small é\n");
						const actual = await snapshot("file.txt");
						const legacy = await snapshot("legacy.txt");
						expect(actual.slice(0, 3)).toEqual(legacy.slice(0, 3));
						expect(actual[3] === before[3]).toBe(legacy[3] === oldBefore[3]);
						const links = (
							await run(
								`${prefix} sh -c ${quote([`test -L ${base}/file.txt; a=$?; test -L ${base}/legacy.txt; b=$?; echo "$a:$b"`])}`,
							)
						).stdout
							.trim()
							.split(":");
						expect(links[0]).toBe(links[1]);
					}
				},
				120000,
			);
			it(`${site} remote=${remote}: failure surfaces and staging cleanup`, async () => {
				state.fail = true;
				await expect(save("synthetic-private-payload")).rejects.toThrow(
					site === "upload"
						? "synthetic Docker permission denied"
						: "Docker failed",
				);
				state.fail = false;
				expect(await readdir(join(state.root, ".staging"))).toEqual([]);
			});
		}
	it.skipIf(!env.STREAM_CONTENT_SSH_KEY).each([false, true])(
		"actual Docker copy failure cleans both temporary files (remote=%s)",
		async (remote) => {
			const missing = `${container}-missing`;
			await expect(
				uploadFileToContainer(
					missing,
					Buffer.from("synthetic-private-payload"),
					"probe.bin",
					"/file",
					remote ? "fixture" : undefined,
				),
			).rejects.toThrow(/No such container|not found/);
			const command = state.commands.find(
				(command) => command.includes("docker cp") && command.includes(missing),
			)!;
			const temporary = command.match(
				/> (\/tmp\/dokploy-upload[^;]+); docker cp/,
			)![1]!;
			if (remote) await execAsyncRemote("fixture", `test ! -e ${temporary}`);
			else await execAsync(`test ! -e ${temporary}`);
			expect(await readdir(join(state.root, ".staging"))).toEqual([]);
		},
	);
	it("retains upload validation before staging", async () => {
		const before = state.commands.length;
		await expect(
			uploadFileToContainer("bad;id", Buffer.from("x"), "x", "/x"),
		).rejects.toThrow("Invalid container ID");
		await expect(
			uploadFileToContainer("valid", Buffer.from("x"), "x", "/bad;path"),
		).rejects.toThrow("Invalid destination path");
		expect(state.commands).toHaveLength(before);
	});
});
