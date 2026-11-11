import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execMocks = vi.hoisted(() => ({
	execAsync: vi.fn((_command: string) =>
		Promise.resolve({ stdout: "ROOT:x:0:0", stderr: "" }),
	),
	execAsyncRemote: vi.fn((_serverId: string, _command: string) =>
		Promise.resolve({ stdout: "", stderr: "" }),
	),
}));
vi.mock("@dokploy/server/utils/process/execAsync", () => execMocks);

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(() =>
		Promise.resolve({ appName: "app1", serverId: null, buildServerId: null }),
	),
}));
vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: vi.fn(() =>
		Promise.resolve({ appName: "c1", serverId: null }),
	),
}));

const { readPatchRepoFile } = await import(
	"@dokploy/server/services/patch-repo"
);

beforeEach(() => vi.clearAllMocks());

describe("patch.readRepoFile path traversal", () => {
	it("rejects a filePath that escapes the patch-repos directory with ../", async () => {
		await expect(
			readPatchRepoFile(
				"a",
				"application",
				"../../../../../../../../../../etc/passwd",
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		// No shell command is built when the path is rejected.
		expect(execMocks.execAsync).not.toHaveBeenCalled();
	});

	it("still reads a normal file inside the repo", async () => {
		const out = await readPatchRepoFile("a", "application", "Dockerfile");
		expect(execMocks.execAsync).toHaveBeenCalledTimes(1);
		const command = execMocks.execAsync.mock.calls[0]?.[0] ?? "";
		const { PATCH_REPOS_PATH } = paths(false);
		expect(command).toContain(join(PATCH_REPOS_PATH, "application", "app1"));
		expect(command).toMatch(/--filters HEAD\\?:Dockerfile/);
		expect(out).toBe("ROOT:x:0:0");
	});
});
