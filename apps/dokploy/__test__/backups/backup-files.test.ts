import { ExecError } from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findBackupById: vi.fn(),
	findDestinationById: vi.fn(),
	findServerById: vi.fn(),
	findMemberByUserId: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/services/backup", () => ({
	findBackupById: mocks.findBackupById,
}));
vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: mocks.findDestinationById,
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));
vi.mock("@dokploy/server/services/permission", () => ({
	findMemberByUserId: mocks.findMemberByUserId,
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));
vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<object>()),
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

const baseBackup = {
	backupId: "backup-1",
	destinationId: "dest-1",
	databaseType: "postgres",
	prefix: "db",
	appName: "web",
	postgresId: "pg-1",
	postgres: { appName: "pg-app", serverId: null },
};

const destination = {
	destinationId: "dest-1",
	organizationId: "org-1",
	bucket: "bucket",
	accessKey: "ak",
	secretAccessKey: "sk",
	region: "us-east-1",
	endpoint: "http://s3.local",
	provider: "Minio",
	additionalFlags: [],
};

const loadModule = async (isCloud: boolean) => {
	vi.resetModules();
	vi.doMock("@dokploy/server/constants", async (importOriginal) => ({
		...(await importOriginal<object>()),
		IS_CLOUD: isCloud,
	}));
	return await import("@dokploy/server/utils/backups/files");
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findBackupById.mockResolvedValue(baseBackup);
	mocks.findDestinationById.mockResolvedValue(destination);
	mocks.findServerById.mockResolvedValue({
		serverId: "server-1",
		organizationId: "org-1",
	});
	mocks.findMemberByUserId.mockResolvedValue({ role: "owner" });
	mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
});

describe("getBackupServerId", () => {
	it("returns the serverId of the backed up service", async () => {
		const { getBackupServerId } = await loadModule(false);
		const backup = baseBackup as Parameters<typeof getBackupServerId>[0];
		expect(getBackupServerId(backup)).toBeNull();
		for (const type of [
			"postgres",
			"mysql",
			"mariadb",
			"mongo",
			"libsql",
			"compose",
		]) {
			expect(
				getBackupServerId({ ...backup, [type]: { serverId: `srv-${type}` } }),
			).toBe(`srv-${type}`);
		}
	});
});

describe("resolveBackupAccess", () => {
	it("rejects backups without a server on cloud", async () => {
		const { resolveBackupAccess } = await loadModule(true);
		await expect(resolveBackupAccess(ctx, "backup-1")).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	});

	it("rejects a destination from another organization", async () => {
		const { resolveBackupAccess } = await loadModule(false);
		mocks.findDestinationById.mockResolvedValue({
			...destination,
			organizationId: "org-2",
		});
		await expect(resolveBackupAccess(ctx, "backup-1")).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(mocks.checkServicePermissionAndAccess).not.toHaveBeenCalled();
	});

	it("rejects a server from another organization", async () => {
		const { resolveBackupAccess } = await loadModule(false);
		mocks.findBackupById.mockResolvedValue({
			...baseBackup,
			postgres: { appName: "pg-app", serverId: "server-1" },
		});
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-2",
		});
		await expect(resolveBackupAccess(ctx, "backup-1")).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You don't have access to this server.",
		});
	});

	it("only lets owners and admins reach web-server backups", async () => {
		const { resolveBackupAccess } = await loadModule(false);
		mocks.findBackupById.mockResolvedValue({
			...baseBackup,
			databaseType: "web-server",
			postgresId: null,
			postgres: null,
		});
		mocks.findMemberByUserId.mockResolvedValue({ role: "member" });
		await expect(resolveBackupAccess(ctx, "backup-1")).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		mocks.findMemberByUserId.mockResolvedValue({ role: "admin" });
		await expect(resolveBackupAccess(ctx, "backup-1")).resolves.toMatchObject({
			serverId: null,
			path: ":s3:bucket/web/db/",
		});
	});
});

describe("listBackupFilesByBackupId", () => {
	it("lists on the service server sorted by ModTime", async () => {
		const { listBackupFilesByBackupId } = await loadModule(false);
		mocks.findBackupById.mockResolvedValue({
			...baseBackup,
			postgres: { appName: "pg-app", serverId: "server-1" },
		});
		mocks.execAsyncRemote.mockResolvedValue({
			stdout: JSON.stringify([
				{ Name: "first.sql.gz", ModTime: "2026-01-01T00:00:00Z" },
				{ Name: "third.sql.gz", ModTime: "2026-01-01T04:00:00+03:00" },
				{ Name: "second.sql.gz", ModTime: "2026-01-01T00:30:00Z" },
			]),
			stderr: "",
		});
		const files = await listBackupFilesByBackupId(ctx, "backup-1");
		expect(files.map((file) => file.Name)).toEqual([
			"third.sql.gz",
			"second.sql.gz",
			"first.sql.gz",
		]);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"pg-1",
			{ backup: ["read"] },
		);
		const [serverId, command] = mocks.execAsyncRemote.mock.calls[0] ?? [];
		expect(serverId).toBe("server-1");
		expect(command.replace(/\\/g, "")).toContain(
			"--use-server-modtime --include *.{sql.gz,bson.gz} :s3:bucket/pg-app/db/",
		);
		expect(mocks.execAsync).not.toHaveBeenCalled();
	});

	it("returns an empty list when the folder does not exist", async () => {
		const { listBackupFilesByBackupId } = await loadModule(false);
		mocks.execAsync.mockRejectedValue(
			new ExecError("Command execution failed", {
				command: "rclone",
				stderr: "ERROR : directory not found",
			}),
		);
		await expect(listBackupFilesByBackupId(ctx, "backup-1")).resolves.toEqual(
			[],
		);
	});
});

describe("getBackupDownloadUrl", () => {
	it.each(["../x.sql.gz", "a/b.sql.gz", ".hidden.sql.gz", "x.txt"])(
		"rejects %s",
		async (fileName) => {
			const { getBackupDownloadUrl } = await loadModule(false);
			await expect(
				getBackupDownloadUrl(ctx, "backup-1", fileName),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(mocks.execAsync).not.toHaveBeenCalled();
		},
	);

	it("returns the presigned url from rclone link", async () => {
		const { getBackupDownloadUrl } = await loadModule(false);
		mocks.execAsync.mockResolvedValue({
			stdout: "https://s3.local/bucket/pg-app/db/x.sql.gz?X-Amz-Signature=1\n",
			stderr: "",
		});
		await expect(
			getBackupDownloadUrl(ctx, "backup-1", "x.sql.gz"),
		).resolves.toEqual({
			url: "https://s3.local/bucket/pg-app/db/x.sql.gz?X-Amz-Signature=1",
		});
		const [command] = mocks.execAsync.mock.calls[0] ?? [];
		expect(command).toContain("rclone link --expire 15m");
		expect(command.replace(/\\/g, "")).toContain(
			":s3:bucket/pg-app/db/x.sql.gz",
		);
	});

	it("maps object not found to NOT_FOUND", async () => {
		const { getBackupDownloadUrl } = await loadModule(false);
		mocks.execAsync.mockRejectedValue(
			new ExecError("Command execution failed", {
				command: "rclone",
				stderr: "ERROR : object not found",
			}),
		);
		await expect(
			getBackupDownloadUrl(ctx, "backup-1", "x.sql.gz"),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("never logs the command on other failures", async () => {
		const { getBackupDownloadUrl } = await loadModule(false);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		mocks.execAsync.mockRejectedValue(
			new ExecError(
				"Command failed: rclone link --s3-secret-access-key=SUPERSECRET",
				{
					command: "rclone link --s3-secret-access-key=SUPERSECRET",
					stderr: "ERROR : AccessDenied",
				},
			),
		);
		await expect(
			getBackupDownloadUrl(ctx, "backup-1", "x.sql.gz"),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
			"SUPERSECRET",
		);
		consoleError.mockRestore();
	});
});
