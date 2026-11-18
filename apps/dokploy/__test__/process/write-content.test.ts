import { spawn } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	open,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { env } from "node:process";
import {
	createContentStaging,
	stageContent,
	writeContentToPath,
} from "@dokploy/server/utils/filesystem/write-content";
import {
	ExecError,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ root: "" }));

vi.mock("@dokploy/server/constants", () => ({
	paths: () => ({ BASE_PATH: state.root }),
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (original) => ({
	...(await original<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsyncRemote: vi.fn(),
}));

vi.mock("node:fs/promises", async (original) => {
	const actual = await original<typeof import("node:fs/promises")>();
	return { ...actual, open: vi.fn(actual.open), rm: vi.fn(actual.rm) };
});

beforeEach(async () => {
	vi.resetAllMocks();
	vi.mocked(execAsyncRemote).mockResolvedValue({ stdout: "", stderr: "" });
	state.root = await mkdtemp(join(tmpdir(), "dokploy content 's-"));
});

afterEach(async () => {
	await rm(state.root, { recursive: true, force: true });
});

const runShell = (command: string, input: string | Buffer = "") =>
	new Promise<{ code: number | null; stdout: string; stderr: string }>(
		(resolve, reject) => {
			const child = spawn("sh", ["-c", command], {
				env: { ...env, TMPDIR: state.root },
			});
			let stdout = "";
			let stderr = "";
			child.stdout.on("data", (data) => {
				stdout += data.toString();
			});
			child.stderr.on("data", (data) => {
				stderr += data.toString();
			});
			child.on("error", reject);
			child.stdin.on("error", reject);
			child.on("close", (code) => resolve({ code, stdout, stderr }));
			child.stdin.end(input);
		},
	);

const executeRemoteLocally = () => {
	vi.mocked(execAsyncRemote).mockImplementation(
		async (_serverId, command, _onData, input) => {
			const result = await runShell(command, input);
			if (result.code !== 0) {
				throw new ExecError("Shell transfer failed", {
					command,
					exitCode: result.code ?? undefined,
					stderr: result.stderr,
				});
			}
			return { stdout: result.stdout, stderr: result.stderr };
		},
	);
};

describe("writeContentToPath", () => {
	it.each(["patch", "patch's $(touch INJECTED)"])(
		"quotes diagnostic labels: %s",
		async (label) => {
			const path = join(state.root, "destination");
			await writeContentToPath("remote", path, "complete content", { label });
			const [, command] = vi.mocked(execAsyncRemote).mock.calls[0]!;
			const result = await runShell(command, "partial");
			expect(result.code).toBe(1);
			expect(result.stderr).toContain(`Incomplete ${label} transfer`);
			expect(await readdir(state.root)).toEqual([]);
		},
	);
	it.each(["", "é🙂\nexact UTF-8\n", "synthetic".repeat(300000)])(
		"writes exact local content (case %#)",
		async (content) => {
			const path = join(state.root, "destination");
			await writeFile(path, "previous longer contents");
			await writeContentToPath(null, path, content);
			expect((await readFile(path)).equals(Buffer.from(content))).toBe(true);
			expect(execAsyncRemote).not.toHaveBeenCalled();
		},
	);

	it("treats undefined serverId as local and applies mode to an existing inode", async () => {
		const path = join(state.root, "destination");
		await writeFile(path, "previous");
		const previous = await stat(path);
		await writeContentToPath(undefined, path, "private", { mode: 0o600 });
		const written = await stat(path);
		expect(written.mode & 0o777).toBe(0o600);
		expect(written.ino).toBe(previous.ino);
		expect(await readFile(path, "utf8")).toBe("private");
	});

	it.each(["", "é🙂\n"])(
		"appends exact local content (case %#)",
		async (content) => {
			const path = join(state.root, "destination");
			await writeFile(path, "previous\n");
			await writeContentToPath(null, path, content, {
				append: true,
				mode: 0o750,
			});
			expect(await readFile(path, "utf8")).toBe(`previous\n${content}`);
			expect((await stat(path)).mode & 0o777).toBe(0o750);
		},
	);

	it("creates a local append target", async () => {
		const path = join(state.root, "new destination");
		await writeContentToPath(null, path, "new", { append: true });
		expect(await readFile(path, "utf8")).toBe("new");
	});

	it("propagates local write errors", async () => {
		await expect(
			writeContentToPath(null, join(state.root, "missing", "file"), "content"),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it.each([null, "remote"])(
		"rejects invalid mode before writing (server=%s)",
		async (serverId) => {
			const path = join(state.root, "destination");
			await expect(
				writeContentToPath(serverId, path, "content", { mode: -1 }),
			).rejects.toThrow("Invalid file mode");
			expect(execAsyncRemote).not.toHaveBeenCalled();
			expect(await readdir(state.root)).toEqual([]);
		},
	);

	it.each(["", "é🙂\n", "synthetic".repeat(300000)])(
		"sends only exact stdin with UTF-8 byte count remotely (case %#)",
		async (content) => {
			const path = join(state.root, "destination's file");
			await writeContentToPath("remote", path, content);
			const [serverId, command, onData, input] =
				vi.mocked(execAsyncRemote).mock.calls[0]!;
			expect(serverId).toBe("remote");
			expect(onData).toBeUndefined();
			expect(input).toBe(content);
			if (content) expect(command).not.toContain(content);
			expect(command).not.toContain("base64");
			expect(command).toContain(
				`[ "$size" -eq ${Buffer.byteLength(content)} ]`,
			);
			expect(command).toContain("2>/dev/null || mktemp");
			expect(command).toContain("trap 'rc=$?");
			expect(command).toContain("HUP INT TERM PIPE");
			expect(command.endsWith(`cat "$tmp" > ${quote([path])}`)).toBe(true);
		},
	);

	it("appends remotely and applies octal mode after the write", async () => {
		const path = join(state.root, "destination");
		await writeContentToPath("remote", path, "secret", {
			append: true,
			mode: 0o750,
		});
		const [, command] = vi.mocked(execAsyncRemote).mock.calls[0]!;
		expect(
			command.endsWith(
				`cat "$tmp" >> ${quote([path])}; chmod 750 ${quote([path])}`,
			),
		).toBe(true);
		expect(command).not.toContain("secret");
	});

	it("preserves remote ExecError identity and stderr", async () => {
		const error = new ExecError("Remote write failed", {
			command: "cat > /destination",
			stderr: "Permission denied",
			exitCode: 1,
		});
		vi.mocked(execAsyncRemote).mockRejectedValueOnce(error);
		await expect(
			writeContentToPath("remote", "/destination", "secret"),
		).rejects.toBe(error);
		expect(error.stderr).toBe("Permission denied");
	});
});

describe("stageContent", () => {
	it("makes unredirected staging stderr available to deployment error logging", async () => {
		const scope = createContentStaging("remote");
		const error = new ExecError("Remote command failed", {
			command: "mktemp /staging/content.XXXXXX",
			stderr: "Permission denied",
		});
		vi.mocked(execAsyncRemote).mockRejectedValueOnce(error);
		await expect(scope.stage("secret")).rejects.toMatchObject({
			message: "Remote command failed: Permission denied",
			cause: error,
		});
		await scope.cleanup();
	});
	it.each(["", "é🙂\n", "synthetic".repeat(300000)])(
		"stages exact local content in private unique files (case %#)",
		async (content) => {
			const directory = join(state.root, ".staging");
			await mkdir(directory);
			await chmod(directory, 0o755);
			const first = await stageContent(null, content);
			const second = await stageContent(undefined, content);
			expect(dirname(first.path)).toBe(directory);
			expect(first.path).not.toBe(second.path);
			expect((await readFile(first.path)).equals(Buffer.from(content))).toBe(
				true,
			);
			expect((await stat(directory)).mode & 0o777).toBe(0o700);
			expect((await stat(first.path)).mode & 0o777).toBe(0o600);
			await Promise.all([first.cleanup(), first.cleanup(), first.cleanup()]);
			expect(rm).toHaveBeenCalledExactlyOnceWith(first.path, { force: true });
			await second.cleanup();
			expect(await readdir(directory)).toEqual([]);
		},
	);

	it("never throws from local cleanup", async () => {
		const staged = await stageContent(null, "secret");
		vi.mocked(rm).mockRejectedValueOnce(new Error("cleanup failed"));
		await expect(staged.cleanup()).resolves.toBeUndefined();
		await expect(staged.cleanup()).resolves.toBeUndefined();
		expect(rm).toHaveBeenCalledExactlyOnceWith(staged.path, { force: true });
	});

	it("removes a local staging file if writing fails", async () => {
		const actual =
			await vi.importActual<typeof import("node:fs/promises")>(
				"node:fs/promises",
			);
		const error = new Error("write failed");
		vi.mocked(open).mockImplementationOnce(async (path, flags, mode) => {
			const file = await actual.open(path, flags, mode);
			vi.spyOn(file, "writeFile").mockRejectedValueOnce(error);
			return file;
		});
		await expect(stageContent(null, "secret")).rejects.toBe(error);
		expect(await readdir(join(state.root, ".staging"))).toEqual([]);
	});

	it("propagates local staging-directory errors", async () => {
		await writeFile(join(state.root, ".staging"), "not a directory");
		await expect(stageContent(null, "secret")).rejects.toMatchObject({
			code: "EEXIST",
		});
	});

	it.each(["", "é🙂\n", "synthetic".repeat(300000)])(
		"stages remote stdin securely and cleans up once (case %#)",
		async (content) => {
			const path = join(state.root, ".staging", "content.ABC123");
			vi.mocked(execAsyncRemote).mockResolvedValueOnce({
				stdout: `${path}\n`,
				stderr: "",
			});
			const staged = await stageContent("remote", content);
			expect(staged.path).toBe(path);
			const [, command, , input] = vi.mocked(execAsyncRemote).mock.calls[0]!;
			expect(input).toBe(content);
			if (content) expect(command).not.toContain(content);
			expect(command).toContain("umask 077;");
			expect(command).toContain(`chmod 700 ${quote([dirname(path)])}`);
			expect(command).toContain('chmod 600 "$tmp"');
			expect(command).toContain(
				`[ "$size" -eq ${Buffer.byteLength(content)} ]`,
			);
			expect(command).not.toContain("|| mktemp");
			await Promise.all([staged.cleanup(), staged.cleanup()]);
			expect(execAsyncRemote).toHaveBeenCalledTimes(2);
			expect(execAsyncRemote).toHaveBeenLastCalledWith(
				"remote",
				`rm -f ${quote([path])}`,
			);
		},
	);

	it("never throws from remote cleanup", async () => {
		vi.mocked(execAsyncRemote).mockResolvedValueOnce({
			stdout: "/staged/file\n",
			stderr: "",
		});
		const staged = await stageContent("remote", "secret");
		vi.mocked(execAsyncRemote).mockRejectedValueOnce(
			new Error("connection lost"),
		);
		await expect(staged.cleanup()).resolves.toBeUndefined();
		await expect(staged.cleanup()).resolves.toBeUndefined();
		expect(execAsyncRemote).toHaveBeenCalledTimes(2);
	});

	it("preserves a remote staging failure", async () => {
		const error = new ExecError("Remote staging failed", {
			command: "mktemp /staging/content.XXXXXX",
			stderr: "Permission denied",
		});
		vi.mocked(execAsyncRemote).mockRejectedValueOnce(error);
		await expect(stageContent("remote", "secret")).rejects.toBe(error);
	});
});

describe("generated scripts under real sh", () => {
	it.each([false, true])(
		"writes multi-MB UTF-8 exactly, preserving the inode (append=%s)",
		async (append) => {
			executeRemoteLocally();
			const path = join(state.root, "destination's file");
			const content = "é🙂 synthetic content\n".repeat(100000);
			await writeFile(path, "previous\n");
			const before = await stat(path);
			await writeContentToPath("remote", path, content, {
				append,
				mode: 0o750,
			});
			expect(await readFile(path, "utf8")).toBe(
				`${append ? "previous\n" : ""}${content}`,
			);
			const after = await stat(path);
			expect(after.ino).toBe(before.ino);
			expect(after.mode & 0o777).toBe(0o750);
			expect(await readdir(state.root)).toEqual(["destination's file"]);
		},
	);

	it.each([false, true])(
		"leaves the destination untouched on truncated stdin (append=%s)",
		async (append) => {
			const path = join(state.root, "destination");
			const content = "é🙂 content\n".repeat(10000);
			await writeFile(path, "previous\n");
			await writeContentToPath("remote", path, content, {
				append,
				mode: 0o600,
			});
			const [, command] = vi.mocked(execAsyncRemote).mock.calls[0]!;
			const before = await stat(path);
			const result = await runShell(command, content.slice(0, 10000));
			expect(result.code).toBe(1);
			expect(result.stderr).toContain("Incomplete compose transfer");
			expect(await readFile(path, "utf8")).toBe("previous\n");
			const after = await stat(path);
			expect(after.ino).toBe(before.ino);
			expect(after.mode).toBe(before.mode);
			expect(await readdir(state.root)).toEqual(["destination"]);
		},
	);

	it.each([false, true])(
		"rejects destination failures and removes fallback staging (append=%s)",
		async (append) => {
			executeRemoteLocally();
			await expect(
				writeContentToPath(
					"remote",
					join(state.root, "missing", "file"),
					"content",
					{ append },
				),
			).rejects.toBeInstanceOf(ExecError);
			expect(await readdir(state.root)).toEqual([]);
		},
	);

	it("retains successful staged content until cleanup", async () => {
		executeRemoteLocally();
		const content = "é🙂 secret\n".repeat(10000);
		const staged = await stageContent("remote", content);
		expect(await readFile(staged.path, "utf8")).toBe(content);
		expect((await stat(dirname(staged.path))).mode & 0o777).toBe(0o700);
		expect((await stat(staged.path)).mode & 0o777).toBe(0o600);
		await Promise.all([staged.cleanup(), staged.cleanup()]);
		expect(await readdir(dirname(staged.path))).toEqual([]);
	});

	it("removes truncated staged content", async () => {
		await stageContent("remote", "é🙂 secret\n".repeat(10000));
		const [, command] = vi.mocked(execAsyncRemote).mock.calls[0]!;
		const result = await runShell(command, "partial");
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("Incomplete content transfer");
		expect(await readdir(join(state.root, ".staging"))).toEqual([]);
	});
});
