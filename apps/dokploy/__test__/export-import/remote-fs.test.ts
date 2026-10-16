import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	copyDir,
	copyFile,
	escapeShellArg,
	exists,
	fileSize,
	readFile,
	remove,
	runToFile,
	writeFile as writeRemoteFile,
} from "@dokploy/server/services/project-export-import";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pipeMock } = vi.hoisted(() => ({ pipeMock: vi.fn() }));

vi.mock(
	"@dokploy/server/utils/process/remoteStream",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@dokploy/server/utils/process/remoteStream")
			>();
		return {
			...actual,
			pipeBetweenServers: (
				args: Parameters<typeof actual.pipeBetweenServers>[0],
			) =>
				args.source.serverId || args.target.serverId
					? pipeMock(args)
					: actual.pipeBetweenServers(args),
		};
	},
);

const local = (path: string) => ({ serverId: null, path });

describe("escapeShellArg", () => {
	it("wraps a plain value in single quotes", () => {
		expect(escapeShellArg("app-foo")).toBe("'app-foo'");
	});

	it("neutralizes an embedded single quote (command injection attempt)", () => {
		const malicious = "foo'; rm -rf / #";
		expect(escapeShellArg(malicious)).toBe("'foo'\\''; rm -rf / #'");
	});
});

describe("local transfers (serverId null on both sides)", () => {
	let base: string;

	beforeEach(async () => {
		base = await mkdtemp(join(tmpdir(), "transfer-remote-fs-"));
	});

	afterEach(async () => {
		await rm(base, { recursive: true, force: true });
	});

	it("copies a directory tree with copyDir, honouring excludes", async () => {
		const source = join(base, "source");
		await mkdir(join(source, "nested"), { recursive: true });
		await mkdir(join(source, "node_modules"), { recursive: true });
		await writeFile(join(source, "a.txt"), "hello");
		await writeFile(join(source, "nested", "b.txt"), "world");
		await writeFile(join(source, "node_modules", "x.js"), "skip me");

		const dest = join(base, "dest", "deep");
		await copyDir(local(source), local(dest), { exclude: ["node_modules"] });

		expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("hello");
		expect(readFileSync(join(dest, "nested", "b.txt"), "utf8")).toBe("world");
		expect(existsSync(join(dest, "node_modules"))).toBe(false);
	});

	it("copies a single file with copyFile, creating the parent directory", async () => {
		const source = join(base, "dump.sql");
		writeFileSync(source, Buffer.from([0, 1, 2, 255]));
		const dest = join(base, "out", "copied-dump.sql");

		await copyFile(local(source), local(dest));

		expect(readFileSync(dest)).toEqual(Buffer.from([0, 1, 2, 255]));
	});

	it("writes from memory and reads back with writeFile/readFile", async () => {
		const target = join(base, "nested", "it's.json");
		await writeRemoteFile(local(target), '{"a":1}');
		expect((await readFile(local(target))).toString()).toBe('{"a":1}');
		expect(await exists(local(target))).toBe(true);
		expect(await fileSize(local(target))).toBe(7);
	});

	it("captures a command's stdout into a file with runToFile", async () => {
		const target = join(base, "captured.txt");
		await runToFile(null, "printf 'abc'", local(target));
		expect(readFileSync(target, "utf8")).toBe("abc");
	});

	it("removes the target when the command fails in runToFile", async () => {
		const target = join(base, "partial.txt");
		await expect(
			runToFile(null, "printf 'abc'; exit 3", local(target)),
		).rejects.toThrow();
		expect(existsSync(target)).toBe(false);
	});

	it("remove is a no-op for a missing path and exists reports false", async () => {
		const target = join(base, "missing");
		await expect(remove(local(target))).resolves.toBeUndefined();
		expect(await exists(local(target))).toBe(false);
	});
});

describe("transfers between different servers go through pipeBetweenServers", () => {
	let base: string;

	beforeEach(async () => {
		base = await mkdtemp(join(tmpdir(), "transfer-remote-fs-ssh-"));
		pipeMock.mockReset();
	});

	afterEach(async () => {
		await rm(base, { recursive: true, force: true });
	});

	it("copyFile removes the local target when the remote side fails", async () => {
		const target = join(base, "app-one.yml");
		pipeMock.mockImplementation(async () => {
			writeFileSync(target, "partial");
			throw new Error("source exited with code 1: cat: No such file");
		});

		await expect(
			copyFile(
				{
					serverId: "server-1",
					path: "/etc/dokploy/traefik/dynamic/app-one.yml",
				},
				local(target),
			),
		).rejects.toThrow(/exited with code 1: cat: No such file/);
		expect(existsSync(target)).toBe(false);
		expect(pipeMock.mock.calls[0]?.[0].source).toEqual({
			serverId: "server-1",
			command: "cat '/etc/dokploy/traefik/dynamic/app-one.yml'",
		});
	});

	it("copyDir escapes the paths and the excludes on both ends", async () => {
		pipeMock.mockResolvedValue(0);
		await copyDir(
			{ serverId: "server-1", path: "/remote/dir" },
			{ serverId: "server-2", path: "/it's/local" },
			{ exclude: [".git", "it's"] },
		);
		expect(pipeMock.mock.calls[0]?.[0]).toEqual({
			source: {
				serverId: "server-1",
				command:
					"tar -czf - --exclude='.git' --exclude='it'\\''s' -C '/remote/dir' .",
			},
			target: {
				serverId: "server-2",
				command:
					"mkdir -p '/it'\\''s/local' && tar -xzf - -C '/it'\\''s/local'",
			},
		});
	});

	it("runToFile streams a command from one server into a file on another", async () => {
		pipeMock.mockResolvedValue(0);
		await runToFile("db-server", "pg_dump x | gzip", {
			serverId: "build-server",
			path: "/etc/dokploy/project-export-import/x/dumps/pg.sql.gz",
		});
		expect(pipeMock.mock.calls[0]?.[0]).toEqual({
			source: { serverId: "db-server", command: "pg_dump x | gzip" },
			target: {
				serverId: "build-server",
				command:
					"mkdir -p '/etc/dokploy/project-export-import/x/dumps' && cat > '/etc/dokploy/project-export-import/x/dumps/pg.sql.gz'",
			},
		});
	});
});
