import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	getStudioSeedPaths,
	removeStudioSeedDirectory,
	writeStudioSeed,
} from "@dokploy/server/utils/libredb-studio/writer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsyncRemote: vi.fn(),
	writeFileRemote: vi.fn(),
	rename: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return {
		...actual,
		execAsyncRemote: mocks.execAsyncRemote,
		writeFileRemote: mocks.writeFileRemote,
	};
});

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	mocks.rename.mockImplementation(actual.rename);
	return { ...actual, rename: mocks.rename };
});

const CONTENT = `${JSON.stringify(
	{
		version: "1",
		defaults: { managed: true, ssl: { mode: "disable" } },
		connections: [
			{
				id: "dokploy-postgres-1a2b3c4d5e6f",
				name: "Orders DB",
				type: "postgres",
				host: "demo-shop-orders-db-e6qmrw",
				port: 5432,
				database: "orders",
				user: "orders",
				password: "p@ss:w#rd%1",
				environment: "production",
				group: "Demo Shop / production",
				roles: ["*"],
			},
		],
	},
	null,
	2,
)}\n`;

const modeOf = (target: string) => fs.statSync(target).mode & 0o777;

describe("getStudioSeedPaths", () => {
	it("uses /etc/dokploy for a remote server", () => {
		expect(getStudioSeedPaths("studio-app", "server-1")).toEqual({
			parentDir: "/etc/dokploy/applications/studio-app/libredb-studio",
			seedDir: "/etc/dokploy/applications/studio-app/libredb-studio/seed",
			seedFile:
				"/etc/dokploy/applications/studio-app/libredb-studio/seed/seed-connections.json",
		});
	});

	it("uses the local applications path for the Dokploy host", () => {
		const base = path.join(process.cwd(), ".docker", "applications");
		expect(getStudioSeedPaths("studio-app", null)).toEqual({
			parentDir: path.join(base, "studio-app", "libredb-studio"),
			seedDir: path.join(base, "studio-app", "libredb-studio", "seed"),
			seedFile: path.join(
				base,
				"studio-app",
				"libredb-studio",
				"seed",
				"seed-connections.json",
			),
		});
	});
});

describe("writeStudioSeed on the Dokploy host", () => {
	let cwd: string;
	let previousUmask: number;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-studio-seed-"));
		vi.spyOn(process, "cwd").mockReturnValue(cwd);
		// A restrictive umask proves the modes are set explicitly.
		previousUmask = process.umask(0o077);
		mocks.rename.mockClear();
		mocks.execAsyncRemote.mockReset();
		mocks.writeFileRemote.mockReset();
	});

	afterEach(() => {
		process.umask(previousUmask);
		vi.restoreAllMocks();
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("writes the seed with the expected modes", async () => {
		await writeStudioSeed({
			appName: "studio-app",
			serverId: null,
			content: CONTENT,
		});

		const { parentDir, seedDir, seedFile } = getStudioSeedPaths(
			"studio-app",
			null,
		);
		expect(parentDir.startsWith(cwd)).toBe(true);
		expect(fs.readFileSync(seedFile, "utf8")).toBe(CONTENT);
		expect(modeOf(parentDir)).toBe(0o700);
		expect(modeOf(seedDir)).toBe(0o755);
		expect(modeOf(seedFile)).toBe(0o644);
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.writeFileRemote).not.toHaveBeenCalled();
	});

	it("replaces the seed with a single rename and leaves no temporary file", async () => {
		const { seedDir, seedFile } = getStudioSeedPaths("studio-app", null);
		await writeStudioSeed({
			appName: "studio-app",
			serverId: null,
			content: "first\n",
		});
		const firstInode = fs.statSync(seedFile).ino;
		mocks.rename.mockClear();

		await writeStudioSeed({
			appName: "studio-app",
			serverId: null,
			content: CONTENT,
		});

		expect(mocks.rename).toHaveBeenCalledOnce();
		const [from, to] = mocks.rename.mock.calls[0] ?? [];
		expect(path.dirname(String(from))).toBe(seedDir);
		expect(path.basename(String(from))).toMatch(
			/^\.seed-connections\.json\.[0-9a-f]{16}\.tmp$/,
		);
		expect(to).toBe(seedFile);
		expect(fs.readFileSync(seedFile, "utf8")).toBe(CONTENT);
		expect(fs.statSync(seedFile).ino).not.toBe(firstInode);
		expect(fs.readdirSync(seedDir)).toEqual(["seed-connections.json"]);
	});

	it("removes the seed file and keeps the directories when the content is empty", async () => {
		const { parentDir, seedDir, seedFile } = getStudioSeedPaths(
			"studio-app",
			null,
		);
		await writeStudioSeed({
			appName: "studio-app",
			serverId: null,
			content: CONTENT,
		});

		await writeStudioSeed({
			appName: "studio-app",
			serverId: null,
			content: "",
		});

		expect(fs.existsSync(seedFile)).toBe(false);
		expect(fs.readdirSync(seedDir)).toEqual([]);
		expect(modeOf(parentDir)).toBe(0o700);
		expect(modeOf(seedDir)).toBe(0o755);
	});

	it("creates the directories when there is nothing to remove", async () => {
		const { parentDir, seedDir } = getStudioSeedPaths("studio-app", null);

		await writeStudioSeed({
			appName: "studio-app",
			serverId: null,
			content: "",
		});

		expect(fs.readdirSync(seedDir)).toEqual([]);
		expect(modeOf(parentDir)).toBe(0o700);
		expect(modeOf(seedDir)).toBe(0o755);
	});

	it("removes the temporary file and rethrows when the rename fails", async () => {
		const { seedDir, seedFile } = getStudioSeedPaths("studio-app", null);
		fs.mkdirSync(seedFile, { recursive: true });

		await expect(
			writeStudioSeed({
				appName: "studio-app",
				serverId: null,
				content: CONTENT,
			}),
		).rejects.toMatchObject({ code: "EISDIR" });

		expect(fs.readdirSync(seedDir)).toEqual(["seed-connections.json"]);
	});

	it("removes only the Studio directory", async () => {
		const { parentDir } = getStudioSeedPaths("studio-app", null);
		await writeStudioSeed({
			appName: "studio-app",
			serverId: null,
			content: CONTENT,
		});
		const sibling = path.join(path.dirname(parentDir), "files");
		fs.mkdirSync(sibling);

		await removeStudioSeedDirectory({ appName: "studio-app", serverId: null });

		expect(fs.existsSync(parentDir)).toBe(false);
		expect(fs.existsSync(sibling)).toBe(true);
	});

	it("succeeds when the Studio directory does not exist", async () => {
		await expect(
			removeStudioSeedDirectory({ appName: "studio-app", serverId: null }),
		).resolves.toBeUndefined();
	});
});

describe("writeStudioSeed on a remote server", () => {
	const parentDir = "/etc/dokploy/applications/studio-app/libredb-studio";
	const seedDir = `${parentDir}/seed`;
	const seedFile = `${seedDir}/seed-connections.json`;
	const ensureDirectories = `mkdir -p ${seedDir} && chmod 700 ${parentDir} && chmod 755 ${seedDir}`;

	beforeEach(() => {
		mocks.rename.mockClear();
		mocks.execAsyncRemote.mockReset();
		mocks.writeFileRemote.mockReset();
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.writeFileRemote.mockResolvedValue(undefined);
	});

	it("uploads a temporary file over SFTP and moves it into place", async () => {
		await writeStudioSeed({
			appName: "studio-app",
			serverId: "server-1",
			content: CONTENT,
		});

		expect(mocks.writeFileRemote).toHaveBeenCalledOnce();
		const [serverId, temporaryFile, uploaded] =
			mocks.writeFileRemote.mock.calls[0] ?? [];
		expect(serverId).toBe("server-1");
		expect(temporaryFile).toMatch(
			/^\/etc\/dokploy\/applications\/studio-app\/libredb-studio\/seed\/\.seed-connections\.json\.[0-9a-f]{16}\.tmp$/,
		);
		expect(uploaded).toBe(CONTENT);

		expect(mocks.execAsyncRemote.mock.calls).toEqual([
			["server-1", ensureDirectories],
			[
				"server-1",
				`chmod 644 ${temporaryFile} && mv -f ${temporaryFile} ${seedFile}`,
			],
		]);
		const [ensureOrder, moveOrder] =
			mocks.execAsyncRemote.mock.invocationCallOrder;
		const [uploadOrder] = mocks.writeFileRemote.mock.invocationCallOrder;
		expect(ensureOrder).toBeLessThan(uploadOrder as number);
		expect(uploadOrder).toBeLessThan(moveOrder as number);
		expect(mocks.rename).not.toHaveBeenCalled();
	});

	it("never puts the content in a shell command", async () => {
		await writeStudioSeed({
			appName: "studio-app",
			serverId: "server-1",
			content: CONTENT,
		});

		const encoded = Buffer.from(CONTENT, "utf8").toString("base64");
		for (const [, command] of mocks.execAsyncRemote.mock.calls) {
			expect(command).not.toContain("p@ss:w#rd%1");
			expect(command).not.toContain("dokploy-postgres-1a2b3c4d5e6f");
			expect(command).not.toContain(encoded.slice(0, 40));
		}
	});

	it("quotes paths that contain shell metacharacters", async () => {
		await writeStudioSeed({
			appName: "studio app; touch pwned",
			serverId: "server-1",
			content: CONTENT,
		});

		const quotedParent =
			"'/etc/dokploy/applications/studio app; touch pwned/libredb-studio'";
		const quotedSeedDir =
			"'/etc/dokploy/applications/studio app; touch pwned/libredb-studio/seed'";
		expect(mocks.execAsyncRemote.mock.calls[0]).toEqual([
			"server-1",
			`mkdir -p ${quotedSeedDir} && chmod 700 ${quotedParent} && chmod 755 ${quotedSeedDir}`,
		]);
		const [, moveCommand] = mocks.execAsyncRemote.mock.calls[1] ?? [];
		expect(moveCommand).toMatch(
			/^chmod 644 '[^']+\.tmp' && mv -f '[^']+\.tmp' '[^']+\/seed-connections\.json'$/,
		);
	});

	it("removes the remote seed file and keeps the directories when the content is empty", async () => {
		await writeStudioSeed({
			appName: "studio-app",
			serverId: "server-1",
			content: "",
		});

		expect(mocks.execAsyncRemote.mock.calls).toEqual([
			["server-1", `${ensureDirectories} && rm -f ${seedFile}`],
		]);
		expect(mocks.writeFileRemote).not.toHaveBeenCalled();
	});

	it("removes the remote temporary file and rethrows when the move fails", async () => {
		const failure = new Error("Remote command failed with exit code 1");
		mocks.execAsyncRemote
			.mockResolvedValueOnce({ stdout: "", stderr: "" })
			.mockRejectedValueOnce(failure)
			.mockResolvedValueOnce({ stdout: "", stderr: "" });

		await expect(
			writeStudioSeed({
				appName: "studio-app",
				serverId: "server-1",
				content: CONTENT,
			}),
		).rejects.toBe(failure);

		const [, temporaryFile] = mocks.writeFileRemote.mock.calls[0] ?? [];
		expect(mocks.execAsyncRemote).toHaveBeenLastCalledWith(
			"server-1",
			`rm -f ${temporaryFile}`,
		);
	});

	it("keeps the move failure when the remote cleanup also fails", async () => {
		const failure = new Error("Remote command failed with exit code 1");
		const cleanupFailure = new Error("SSH connection lost");
		mocks.execAsyncRemote
			.mockResolvedValueOnce({ stdout: "", stderr: "" })
			.mockRejectedValueOnce(failure)
			.mockRejectedValueOnce(cleanupFailure);

		const rejection = await writeStudioSeed({
			appName: "studio-app",
			serverId: "server-1",
			content: CONTENT,
		}).catch((error: unknown) => error);

		expect(rejection).toBeInstanceOf(AggregateError);
		expect(rejection).toMatchObject({
			message: failure.message,
			cause: failure,
			errors: [failure, cleanupFailure],
		});
		const [, temporaryFile] = mocks.writeFileRemote.mock.calls[0] ?? [];
		expect(mocks.execAsyncRemote).toHaveBeenLastCalledWith(
			"server-1",
			`rm -f ${temporaryFile}`,
		);
	});

	it("removes the remote temporary file and rethrows when the upload fails", async () => {
		const failure = new Error("SFTP session failed: no subsystem");
		mocks.writeFileRemote.mockRejectedValueOnce(failure);

		await expect(
			writeStudioSeed({
				appName: "studio-app",
				serverId: "server-1",
				content: CONTENT,
			}),
		).rejects.toBe(failure);

		const [, temporaryFile] = mocks.writeFileRemote.mock.calls[0] ?? [];
		expect(mocks.execAsyncRemote.mock.calls).toEqual([
			["server-1", ensureDirectories],
			["server-1", `rm -f ${temporaryFile}`],
		]);
	});

	it("removes the remote Studio directory", async () => {
		await removeStudioSeedDirectory({
			appName: "studio-app",
			serverId: "server-1",
		});

		expect(mocks.execAsyncRemote.mock.calls).toEqual([
			["server-1", `rm -rf ${parentDir}`],
		]);
	});
});
