import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileAsync = promisify(execFile);

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findManyPatches: vi.fn(),
	paths: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	paths: mocks.paths,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			patch: {
				findFirst: vi.fn(),
				findMany: mocks.findManyPatches,
			},
		},
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
}));

vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: mocks.findComposeById,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { apiCreatePatch } = await import("@dokploy/server/db/schema");
const { createPatch, generateApplyPatchesCommand } = await import(
	"@dokploy/server/services/patch"
);
const { readPatchRepoFile } = await import(
	"@dokploy/server/services/patch-repo"
);

describe("generateApplyPatchesCommand path safety", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.paths.mockReturnValue({
			APPLICATIONS_PATH: "/srv/dokploy/applications",
			COMPOSE_PATH: "/srv/dokploy/compose",
			PATCH_REPOS_PATH: "/srv/dokploy/patch-repos",
		});
		mocks.findApplicationById.mockResolvedValue({
			appName: "app",
			buildServerId: null,
			serverId: null,
		});
		mocks.findComposeById.mockResolvedValue({
			appName: "compose",
			serverId: null,
		});
	});

	it("rejects traversal patch paths before shell command generation", async () => {
		mocks.findManyPatches.mockResolvedValue([
			{
				enabled: true,
				filePath: "../.env",
				type: "update",
				content: "SECRET=value",
			},
		]);

		await expect(
			generateApplyPatchesCommand({
				id: "app-1",
				type: "application",
				serverId: null,
			}),
		).rejects.toThrow("Invalid file path");
	});

	it("rejects command substitution patch paths before shell command generation", async () => {
		mocks.findManyPatches.mockResolvedValue([
			{
				enabled: true,
				filePath: "src/$(id).ts",
				type: "update",
				content: "export const value = true;",
			},
		]);

		await expect(
			generateApplyPatchesCommand({
				id: "app-1",
				type: "application",
				serverId: null,
			}),
		).rejects.toThrow("Invalid file path");
	});

	it("generates commands only under the service code directory for safe paths", async () => {
		mocks.findManyPatches.mockResolvedValue([
			{
				enabled: true,
				filePath: "/pages/[id].tsx",
				type: "update",
				content: "export const value = true;",
			},
		]);

		const command = await generateApplyPatchesCommand({
			id: "app-1",
			type: "application",
			serverId: null,
		});

		expect(command).toContain("/srv/dokploy/applications/app/code/pages");
		expect(command).toContain("id");
		expect(command).not.toContain("$(id)");
		expect(command).not.toContain("../");
	});

	it("blocks patch writes through repository symlink parents", async () => {
		const rootPath = await fs.mkdtemp(
			path.join(os.tmpdir(), "dokploy-patch-path-"),
		);

		try {
			mocks.paths.mockReturnValue({
				APPLICATIONS_PATH: path.join(rootPath, "applications"),
				COMPOSE_PATH: path.join(rootPath, "compose"),
				PATCH_REPOS_PATH: path.join(rootPath, "patch-repos"),
			});
			const codePath = path.join(rootPath, "applications", "app", "code");
			const outsidePath = path.join(rootPath, "outside");
			await fs.mkdir(codePath, { recursive: true });
			await fs.mkdir(outsidePath);
			await fs.symlink(outsidePath, path.join(codePath, "escape"));
			mocks.findApplicationById.mockResolvedValue({
				appName: "app",
				buildServerId: null,
				serverId: null,
			});
			mocks.findManyPatches.mockResolvedValue([
				{
					enabled: true,
					filePath: "escape/pwned.txt",
					type: "update",
					content: "SECRET=value",
				},
			]);

			const command = await generateApplyPatchesCommand({
				id: "app-1",
				type: "application",
				serverId: null,
			});

			await expect(execFileAsync("sh", ["-c", command])).rejects.toThrow();
			await expect(
				fs.readFile(path.join(outsidePath, "pwned.txt"), "utf8"),
			).rejects.toThrow();
		} finally {
			await fs.rm(rootPath, { force: true, recursive: true });
		}
	});

	it("blocks patch deletes through repository symlink parents", async () => {
		const rootPath = await fs.mkdtemp(
			path.join(os.tmpdir(), "dokploy-patch-delete-"),
		);

		try {
			mocks.paths.mockReturnValue({
				APPLICATIONS_PATH: path.join(rootPath, "applications"),
				COMPOSE_PATH: path.join(rootPath, "compose"),
				PATCH_REPOS_PATH: path.join(rootPath, "patch-repos"),
			});
			const codePath = path.join(rootPath, "applications", "app", "code");
			const outsidePath = path.join(rootPath, "outside");
			const outsideFile = path.join(outsidePath, "victim.txt");
			await fs.mkdir(codePath, { recursive: true });
			await fs.mkdir(outsidePath);
			await fs.writeFile(outsideFile, "do-not-delete");
			await fs.symlink(outsidePath, path.join(codePath, "escape"));
			mocks.findApplicationById.mockResolvedValue({
				appName: "app",
				buildServerId: null,
				serverId: null,
			});
			mocks.findManyPatches.mockResolvedValue([
				{
					enabled: true,
					filePath: "escape/victim.txt",
					type: "delete",
					content: "",
				},
			]);

			const command = await generateApplyPatchesCommand({
				id: "app-1",
				type: "application",
				serverId: null,
			});

			await expect(execFileAsync("sh", ["-c", command])).rejects.toThrow();
			await expect(fs.readFile(outsideFile, "utf8")).resolves.toBe(
				"do-not-delete",
			);
		} finally {
			await fs.rm(rootPath, { force: true, recursive: true });
		}
	});

	it("adds the same symlink guard to remote patch commands", async () => {
		mocks.findApplicationById.mockResolvedValue({
			appName: "app",
			buildServerId: "server-1",
			serverId: "server-1",
		});
		mocks.findManyPatches.mockResolvedValue([
			{
				enabled: true,
				filePath: "src/index.ts",
				type: "delete",
				content: "",
			},
		]);

		const command = await generateApplyPatchesCommand({
			id: "app-1",
			type: "application",
			serverId: "server-1",
		});

		expect(command).toContain('real_parent="$(cd "$parent" && pwd -P)"');
		expect(command).toContain('if [ -L "$file" ]; then');
		expect(command).toContain("rm -f --");
	});
});

describe("patch service ownership boundary", () => {
	it("rejects create payloads that bind both application and compose ids", async () => {
		const payload = {
			applicationId: "app-1",
			composeId: "compose-1",
			filePath: "src/index.ts",
			content: "export const value = true;",
			type: "update" as const,
		};

		expect(apiCreatePatch.safeParse(payload).success).toBe(false);
		await expect(createPatch(payload)).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});
});

describe("readPatchRepoFile path safety", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.paths.mockReturnValue({
			APPLICATIONS_PATH: "/srv/dokploy/applications",
			COMPOSE_PATH: "/srv/dokploy/compose",
			PATCH_REPOS_PATH: "/srv/dokploy/patch-repos",
		});
		mocks.findApplicationById.mockResolvedValue({
			appName: "app",
			buildServerId: null,
			serverId: null,
		});
		mocks.findComposeById.mockResolvedValue({
			appName: "compose",
			serverId: null,
		});
	});

	it("rejects git metadata paths inside the patch repo", async () => {
		await expect(
			readPatchRepoFile("app-1", "application", ".git/config"),
		).rejects.toThrow("Invalid patch repo file path");

		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("reads safe common tracked paths from HEAD blobs instead of filesystem cat", async () => {
		mocks.execAsync.mockResolvedValue({ stdout: "export const value = true;" });

		await expect(
			readPatchRepoFile("app-1", "application", "src/@types/index.d.ts"),
		).resolves.toBe("export const value = true;");

		const command = mocks.execAsync.mock.calls[0]?.[0] as string;
		expect(command).toContain("git show");
		expect(command.replace(/\\/g, "")).toContain("src/@types/index.d.ts");
		expect(command).not.toContain("cat ");
	});
});
