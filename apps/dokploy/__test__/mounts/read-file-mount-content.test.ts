import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-file-mount-"));

vi.mock("@dokploy/server/constants", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/constants")
	>("@dokploy/server/constants");
	return {
		...actual,
		paths: (isServer = false) => {
			const BASE_PATH = path.join(baseDir, isServer ? "remote" : "local");
			return {
				...actual.paths(isServer),
				BASE_PATH,
				APPLICATIONS_PATH: `${BASE_PATH}/applications`,
				COMPOSE_PATH: `${BASE_PATH}/compose`,
			};
		},
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: { query: { mounts: { findFirst: vi.fn() } } },
}));

// Runs the "remote" command locally so the SSH branch is exercised for real.
vi.mock("@dokploy/server/utils/process/execAsync", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/process/execAsync")
	>("@dokploy/server/utils/process/execAsync");
	return {
		...actual,
		execAsyncRemote: vi.fn((_serverId: string, command: string) =>
			actual.execAsync(command),
		),
	};
});

import { db } from "@dokploy/server/db";
import { readFileMountContent } from "@dokploy/server/services/mount";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";

const filesDir = (serverId: string | null = null) =>
	path.join(
		baseDir,
		serverId ? "remote" : "local",
		"compose",
		"my-app",
		"files",
	);

const mockMount = (overrides: Record<string, unknown> = {}) => {
	vi.mocked(db.query.mounts.findFirst).mockResolvedValue({
		mountId: "mount-1",
		type: "file",
		filePath: "app.env",
		serviceType: "compose",
		compose: { serverId: null, appName: "my-app" },
		...overrides,
	} as never);
};

const writeFile = (
	relativePath: string,
	content: string,
	serverId?: string,
) => {
	const fullPath = path.join(filesDir(serverId), relativePath);
	fs.mkdirSync(path.dirname(fullPath), { recursive: true });
	fs.writeFileSync(fullPath, content);
	return fullPath;
};

beforeEach(() => {
	fs.rmSync(path.join(baseDir, "local"), { recursive: true, force: true });
	fs.rmSync(path.join(baseDir, "remote"), { recursive: true, force: true });
	vi.clearAllMocks();
});

afterAll(() => {
	fs.rmSync(baseDir, { recursive: true, force: true });
});

describe("readFileMountContent", () => {
	it("returns what the container wrote, not the stored copy", async () => {
		const written = "API_KEY='a b'\nLLM_PROVIDER=ollama\n\n";
		writeFile("app.env", written);
		mockMount({ content: "API_KEY=old\n" });

		expect(await readFileMountContent("mount-1")).toBe(written);
	});

	it("returns an empty string for an empty file", async () => {
		writeFile("app.env", "");
		mockMount();

		expect(await readFileMountContent("mount-1")).toBe("");
	});

	it("returns null when the file doesn't exist on disk", async () => {
		mockMount();

		expect(await readFileMountContent("mount-1")).toBeNull();
	});

	it("doesn't follow symlinks out of the files directory", async () => {
		const secret = path.join(baseDir, "secret.txt");
		fs.writeFileSync(secret, "host secret");
		fs.mkdirSync(filesDir(), { recursive: true });
		fs.symlinkSync(secret, path.join(filesDir(), "app.env"));
		mockMount();

		expect(await readFileMountContent("mount-1")).toBeNull();
	});

	it("doesn't read paths that escape the files directory", async () => {
		writeFile("../outside.env", "outside");
		mockMount({ filePath: "../outside.env" });

		expect(await readFileMountContent("mount-1")).toBeNull();
	});

	// Root can read any file, so this only applies to non-root SSH users.
	it.skipIf(process.getuid?.() === 0)(
		"returns null instead of an empty string when the file can't be read",
		async () => {
			fs.chmodSync(writeFile("app.env", "SECRET=1\n"), 0o000);
			mockMount();

			expect(await readFileMountContent("mount-1")).toBeNull();
		},
	);

	it("reads the file on the remote server for remote services", async () => {
		writeFile("app.env", "REMOTE=1\n", "server-1");
		mockMount({ compose: { serverId: "server-1", appName: "my-app" } });

		expect(await readFileMountContent("mount-1")).toBe("REMOTE=1\n");
		expect(execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			expect.stringContaining("base64"),
		);
	});
});
