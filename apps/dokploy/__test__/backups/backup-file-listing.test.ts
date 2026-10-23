import { execFileSync } from "node:child_process";
import { TRPCError } from "@trpc/server";
import { parse } from "shell-quote";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	destination: vi.fn(),
	server: vi.fn(),
	local: vi.fn(),
	remote: vi.fn(),
	permission: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({}));
vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: mocks.destination,
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.server,
}));
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.permission,
}));
vi.mock("@dokploy/server/lib/auth", () => ({}));
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.local,
	execAsyncRemote: mocks.remote,
}));
vi.mock("@dokploy/server/utils/backups/compose", () => ({}));
vi.mock("@dokploy/server/utils/restore", () => ({}));
vi.mock("@/server/utils/backup", () => ({}));
vi.mock("@/server/api/utils/audit", () => ({}));
vi.mock("@/server/api/utils/plan-limits", () => ({}));

import { backupRouter } from "@/server/api/routers/backup";
import {
	backupFileTimestamp,
	type RcloneFile,
	sortBackupFiles,
} from "@/server/api/utils/backup-file-pagination";

const file = (Path: string, IsDir = false, Size = 42): RcloneFile => ({
	Path,
	Name: Path.split("/").at(-1)!,
	Size,
	IsDir,
});
const inventory = Array.from({ length: 251 }, (_, i) =>
	file(
		`${new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString().replace(/[:.]/g, "-")}.sql.gz`,
	),
);
const query = { destinationId: "destination-a", search: "" };
const caller = (organizationId = "organization-a", authenticated = true) =>
	backupRouter.createCaller({
		user: authenticated ? { id: "user-a", role: "owner" } : null,
		session: authenticated ? { activeOrganizationId: organizationId } : null,
	} as Parameters<typeof backupRouter.createCaller>[0]);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.destination.mockResolvedValue({
		organizationId: "organization-a",
		bucket: "example-bucket",
		accessKey: "fixture-key",
		secretAccessKey: "fixture-secret",
		region: "example-region",
		endpoint: "https://storage.example.test",
	});
	mocks.server.mockResolvedValue({ organizationId: "organization-a" });
	mocks.local.mockResolvedValue({ stdout: JSON.stringify(inventory) });
	mocks.remote.mockResolvedValue({ stdout: JSON.stringify(inventory) });
	mocks.permission.mockResolvedValue(undefined);
});

describe("native backup ordering", () => {
	it.each([
		"2026-01-02T03-04-05-006Z.sql.gz",
		"2026-01-02T03-04-05-006Z.bson.gz",
		"webserver-backup-2026-01-02T03-04-05-006Z.zip",
		"volume-with-dashes-2026-01-02T03-04-05-006Z.tar",
	])("recognizes the exact UTC timestamp in %s", (name) => {
		expect(backupFileTimestamp(file(`nested/${name}`))).toBe(
			Date.UTC(2026, 0, 2, 3, 4, 5, 6),
		);
	});
	it.each([
		"2026-02-30T03-04-05-006Z.sql.gz",
		"2026-13-01T03-04-05-006Z.bson.gz",
		"2026-01-01T24-04-05-006Z.sql.gz",
		"2026-01-01T03-04-60-006Z.sql.gz",
		"prefix-2026-01-02T03-04-05-006Z.sql.gz",
		"2026-01-02T03:04:05.006Z.sql.gz",
		"webserver-backup-2026-01-02T03-04-05-006Z.zip.bak",
		"custom.sql.gz",
	])(
		"keeps invalid or nonstandard filename %s in the fallback group",
		(name) => {
			expect(backupFileTimestamp(file(name))).toBeNull();
		},
	);
	it("groups directories first, then timestamps, then fallback names with deterministic path ties", () => {
		const entries = [
			file("custom-A"),
			file("a", true),
			file("z", true),
			file("2026-01-01T00-00-00-000Z.sql.gz"),
			file("volume-2026-01-02T00-00-00-000Z.tar"),
			file("2026-01-02T00-00-00-000Z.sql.gz"),
			file("custom-z"),
		];
		const expected = [
			entries[2],
			entries[1],
			entries[4],
			entries[5],
			entries[3],
			entries[6],
			entries[0],
		];
		expect(sortBackupFiles(entries)).toEqual(expected);
		expect(sortBackupFiles([...entries].reverse())).toEqual(expected);
		expect(
			backupFileTimestamp(file("2026-01-02T00-00-00-000Z.sql.gz", true)),
		).toBeNull();
	});
	it("uses full-path Unicode codepoint order rather than locale or UTF-16 order", () => {
		const paths = [
			"a/2026-01-02T00-00-00-000Z.sql.gz",
			"z/2026-01-02T00-00-00-000Z.sql.gz",
			"\uE000",
			"😀",
		];
		expect(
			sortBackupFiles(paths.map((path) => file(path))).map(
				(entry) => entry.Path,
			),
		).toEqual([paths[1], paths[0], paths[3], paths[2]]);
	});
});

describe("backup router listing contract", () => {
	it("traverses all 251 entries once in bounded newest-first pages despite shuffled enumeration", async () => {
		const seen: RcloneFile[] = [];
		let cursor: string | undefined;
		const sizes: number[] = [];
		do {
			mocks.local.mockResolvedValueOnce({
				stdout: JSON.stringify(
					seen.length % 100 ? [...inventory].reverse() : inventory,
				),
			});
			const page = await caller().listBackupFilesPage({ ...query, cursor });
			sizes.push(page.items.length);
			seen.push(...page.items);
			cursor = page.nextCursor ?? undefined;
		} while (cursor);
		expect(sizes).toEqual([50, 50, 50, 50, 50, 1]);
		expect(seen).toEqual([...inventory].reverse());
		expect(new Set(seen.map((entry) => entry.Path)).size).toBe(251);
		expect(mocks.permission).toHaveBeenCalledTimes(6);
		expect(mocks.destination).toHaveBeenCalledTimes(6);
	});
	it("retains the legacy array, original enumeration order, full fields and 100 cap", async () => {
		const result = await caller().listBackupFiles(query);
		expect(Array.isArray(result)).toBe(true);
		expect(result).toEqual(inventory.slice(0, 100));
	});
	it("preserves provider fields for legacy callers while pages return fingerprinted metadata only", async () => {
		mocks.local.mockResolvedValue({
			stdout: JSON.stringify([
				{ ...inventory[0], ProviderOnly: "legacy-value" },
			]),
		});
		const legacy = await caller().listBackupFiles(query);
		expect(legacy[0]).toHaveProperty("ProviderOnly", "legacy-value");
		const page = await caller().listBackupFilesPage(query);
		expect(page.items[0]).not.toHaveProperty("ProviderOnly");
		expect(page.items[0]).toMatchObject(inventory[0]!);
	});
	it.each(["listBackupFiles", "listBackupFilesPage"] as const)(
		"%s searches the full directory inventory before slicing",
		async (procedure) => {
			const result = await caller()[procedure]({
				...query,
				search: "/nested//hourly/2026-01-01T04-10",
			});
			const items = Array.isArray(result) ? result : result.items;
			expect(items).toEqual([
				{ ...inventory[250], Path: `nested//hourly/${inventory[250]!.Path}` },
			]);
			expect(parse(mocks.local.mock.calls[0]![0])).toContain(
				":s3:example-bucket/nested//hourly/",
			);
		},
	);
	it("supports full path matching and case-insensitive date/name searches", async () => {
		const page = await caller().listBackupFilesPage({
			...query,
			search: "ARCHIVE/archive",
		});
		expect(page.items).toHaveLength(50);
		expect(page.items.every((entry) => entry.Path.startsWith("ARCHIVE/"))).toBe(
			true,
		);
	});
	it("returns an explicit empty/end page", async () => {
		const page = await caller().listBackupFilesPage({
			...query,
			search: "no-match",
		});
		expect(page).toEqual({ items: [], nextCursor: null });
	});
	it.each([0, -1, 101, 1.5])(
		"rejects invalid page limit %s before enumeration",
		async (limit) => {
			await expect(
				caller().listBackupFilesPage({ ...query, limit }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(mocks.local).not.toHaveBeenCalled();
		},
	);
	it.each(["not-json", "!", "", "x".repeat(513)])(
		"rejects malformed or oversized cursors",
		async (cursor) => {
			await expect(
				caller().listBackupFilesPage({ ...query, cursor }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		},
	);
	it.each([
		{ search: "2026" },
		{ destinationId: "destination-b" },
		{ serverId: "server-b" },
		{ limit: 100 },
	])("rejects a cursor from a different query scope %j", async (change) => {
		const first = await caller().listBackupFilesPage(query);
		await expect(
			caller().listBackupFilesPage({
				...query,
				...change,
				cursor: first.nextCursor!,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
	it("binds continuation to organization even when the destination is reassigned", async () => {
		const first = await caller().listBackupFilesPage(query);
		mocks.destination.mockResolvedValue({
			organizationId: "organization-b",
			bucket: "example-bucket",
		});
		await expect(
			caller("organization-b").listBackupFilesPage({
				...query,
				cursor: first.nextCursor!,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
	it.each(["arrival", "deletion", "size", "hash"])(
		"requires refresh after a listing %s",
		async (change) => {
			const first = await caller().listBackupFilesPage(query);
			const changed = inventory.map((entry) => ({ ...entry }));
			if (change === "arrival")
				changed.push(file("2026-02-01T00-00-00-000Z.sql.gz"));
			if (change === "deletion") changed.pop();
			if (change === "size") changed[0]!.Size++;
			if (change === "hash") changed[0]!.Hashes = { MD5: "new-hash" };
			mocks.local.mockResolvedValue({ stdout: JSON.stringify(changed) });
			await expect(
				caller().listBackupFilesPage({ ...query, cursor: first.nextCursor! }),
			).rejects.toMatchObject({ code: "CONFLICT" });
			const refreshed = await caller().listBackupFilesPage(query);
			expect(refreshed.items).toEqual(sortBackupFiles(changed).slice(0, 50));
		},
	);
	it("rejects invalid offsets even in an otherwise valid cursor", async () => {
		const first = await caller().listBackupFilesPage(query);
		const cursor = JSON.parse(
			Buffer.from(first.nextCursor!, "base64url").toString(),
		);
		for (const offset of [-1, 0, 1.5, 1, 1000]) {
			const encoded = Buffer.from(
				JSON.stringify({ ...cursor, offset }),
			).toString("base64url");
			await expect(
				caller().listBackupFilesPage({ ...query, cursor: encoded }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
	});
	it("checks authentication and backup read permission before listing", async () => {
		await expect(
			caller("organization-a", false).listBackupFilesPage(query),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		mocks.permission.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
		await expect(caller().listBackupFilesPage(query)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mocks.permission).toHaveBeenCalledWith(expect.anything(), {
			backup: ["read"],
		});
		expect(mocks.local).not.toHaveBeenCalled();
	});
	it("rechecks destination and server access on continuation", async () => {
		const first = await caller().listBackupFilesPage({
			...query,
			serverId: "server-a",
		});
		mocks.server.mockResolvedValue({ organizationId: "organization-b" });
		await expect(
			caller().listBackupFilesPage({
				...query,
				serverId: "server-a",
				cursor: first.nextCursor!,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		mocks.destination.mockResolvedValue({ organizationId: "organization-b" });
		await expect(
			caller().listBackupFilesPage({
				...query,
				serverId: "server-a",
				cursor: first.nextCursor!,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.remote).toHaveBeenCalledTimes(1);
		expect(mocks.local).not.toHaveBeenCalled();
	});
	it("retains shell quoting, remote execution and metadata cost flags", async () => {
		const prefix = "folder ' ; $(echo unsafe)`x`";
		await caller().listBackupFilesPage({
			...query,
			serverId: "server-a",
			search: `${prefix}/`,
		});
		expect(mocks.remote.mock.calls[0]![0]).toBe("server-a");
		const command = mocks.remote.mock.calls[0]![1] as string;
		const args = execFileSync(
			"/bin/sh",
			["-c", `set -- ${command}; printf '%s\\n' "$@"`],
			{ encoding: "utf8" },
		)
			.trimEnd()
			.split("\n");
		expect(args).toContain(`:s3:example-bucket/${prefix}/`);
		expect(args).toContain("--no-mimetype");
		expect(args).toContain("--no-modtime");
		expect(mocks.local).not.toHaveBeenCalled();
	});
	it("returns retryable listing errors without command or raw provider output", async () => {
		mocks.local.mockRejectedValueOnce(
			new Error("rclone --secret=do-not-return"),
		);
		await expect(caller().listBackupFilesPage(query)).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			message: "Unable to list backup files. Please retry.",
		});
		for (const stdout of ["invalid-json", "null", "{}", '[{"Path":3}]']) {
			mocks.local.mockResolvedValueOnce({ stdout });
			await expect(caller().listBackupFilesPage(query)).rejects.toMatchObject({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to parse backup files list",
			});
		}
	});
});
