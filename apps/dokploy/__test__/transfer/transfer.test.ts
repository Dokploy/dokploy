/**
 * Tests for transfer utilities
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { FileInfo } from "@dokploy/server/utils/transfer";
import { compareFileLists } from "@dokploy/server/utils/transfer";

describe("compareFileLists", () => {
	const createFile = (
		path: string,
		size: number,
		mtime: number,
		isDirectory = false,
	): FileInfo => ({
		path,
		size,
		mtime,
		mode: isDirectory ? "755" : "644",
		isDirectory,
	});

	test("should return empty array when both lists are empty", () => {
		const result = compareFileLists([], []);
		expect(result).toEqual([]);
	});

	test("should mark files as missing_target when only in source", () => {
		const source = [createFile("/file1.txt", 100, 1000)];
		const target: FileInfo[] = [];

		const result = compareFileLists(source, target);

		expect(result).toHaveLength(1);
		expect(result[0]?.status).toBe("missing_target");
		expect(result[0]?.path).toBe("/file1.txt");
	});

	test("should mark files as missing_source when only in target", () => {
		const source: FileInfo[] = [];
		const target = [createFile("/file2.txt", 200, 2000)];

		const result = compareFileLists(source, target);

		expect(result).toHaveLength(1);
		expect(result[0]?.status).toBe("missing_source");
		expect(result[0]?.path).toBe("/file2.txt");
	});

	test("should mark files as match when size and mtime are identical", () => {
		const source = [createFile("/same.txt", 100, 1000)];
		const target = [createFile("/same.txt", 100, 1000)];

		const result = compareFileLists(source, target);

		expect(result).toHaveLength(1);
		expect(result[0]?.status).toBe("match");
		expect(result[0]?.targetInfo).toBeDefined();
	});

	test("should mark files as newer_source when source mtime is greater", () => {
		const source = [createFile("/updated.txt", 100, 2000)];
		const target = [createFile("/updated.txt", 100, 1000)];

		const result = compareFileLists(source, target);

		expect(result).toHaveLength(1);
		expect(result[0]?.status).toBe("newer_source");
	});

	test("should mark files as newer_target when target mtime is greater", () => {
		const source = [createFile("/old.txt", 100, 1000)];
		const target = [createFile("/old.txt", 100, 2000)];

		const result = compareFileLists(source, target);

		expect(result).toHaveLength(1);
		expect(result[0]?.status).toBe("newer_target");
	});

	test("should mark files as conflict when same mtime but different size", () => {
		const source = [createFile("/conflict.txt", 100, 1000)];
		const target = [createFile("/conflict.txt", 200, 1000)];

		const result = compareFileLists(source, target);

		expect(result).toHaveLength(1);
		expect(result[0]?.status).toBe("conflict");
	});

	test("should handle mixed scenarios correctly", () => {
		const source = [
			createFile("/only-source.txt", 100, 1000),
			createFile("/match.txt", 200, 2000),
			createFile("/newer-source.txt", 300, 3000),
			createFile("/conflict.txt", 400, 4000),
		];
		const target = [
			createFile("/only-target.txt", 500, 5000),
			createFile("/match.txt", 200, 2000),
			createFile("/newer-source.txt", 300, 2000),
			createFile("/conflict.txt", 450, 4000),
		];

		const result = compareFileLists(source, target);

		expect(result).toHaveLength(5);

		const statusMap = new Map(result.map((r) => [r.path, r.status]));
		expect(statusMap.get("/only-source.txt")).toBe("missing_target");
		expect(statusMap.get("/only-target.txt")).toBe("missing_source");
		expect(statusMap.get("/match.txt")).toBe("match");
		expect(statusMap.get("/newer-source.txt")).toBe("newer_source");
		expect(statusMap.get("/conflict.txt")).toBe("conflict");
	});

	test("should handle directories correctly", () => {
		const source = [createFile("/dir", 0, 1000, true)];
		const target = [createFile("/dir", 0, 1000, true)];

		const result = compareFileLists(source, target);

		expect(result).toHaveLength(1);
		expect(result[0]?.status).toBe("match");
		expect(result[0]?.isDirectory).toBe(true);
	});

	test("should include targetInfo in result when file exists on target", () => {
		const source = [createFile("/file.txt", 100, 2000)];
		const target = [createFile("/file.txt", 100, 1000)];

		const result = compareFileLists(source, target);

		expect(result[0]?.targetInfo).toBeDefined();
		expect(result[0]?.targetInfo?.mtime).toBe(1000);
	});
});

describe("ServiceType", () => {
	// All supported service types for transfer
	const SERVICE_TYPES = [
		"application",
		"postgres",
		"mysql",
		"mariadb",
		"mongo",
		"redis",
		"compose",
	] as const;

	// Label mapping matching the transfer-service.tsx component
	const SERVICE_LABELS: Record<string, string> = {
		application: "Application",
		compose: "Compose",
		postgres: "PostgreSQL",
		mysql: "MySQL",
		mariadb: "MariaDB",
		mongo: "MongoDB",
		redis: "Redis",
	};

	test("should have all 7 service types defined", () => {
		expect(SERVICE_TYPES).toHaveLength(7);
	});

	test.each(SERVICE_TYPES)("service type '%s' should have a label", (type) => {
		expect(SERVICE_LABELS[type]).toBeDefined();
		expect(typeof SERVICE_LABELS[type]).toBe("string");
		expect(SERVICE_LABELS[type]?.length).toBeGreaterThan(0);
	});

	test("should include application service type", () => {
		expect(SERVICE_TYPES).toContain("application");
		expect(SERVICE_LABELS.application).toBe("Application");
	});

	test("should include compose service type", () => {
		expect(SERVICE_TYPES).toContain("compose");
		expect(SERVICE_LABELS.compose).toBe("Compose");
	});

	test("should include all database types", () => {
		const dbTypes = ["postgres", "mysql", "mariadb", "mongo", "redis"];
		for (const dbType of dbTypes) {
			expect(SERVICE_TYPES).toContain(dbType);
			expect(SERVICE_LABELS[dbType]).toBeDefined();
		}
	});

	test("database types should have proper display names", () => {
		expect(SERVICE_LABELS.postgres).toBe("PostgreSQL");
		expect(SERVICE_LABELS.mysql).toBe("MySQL");
		expect(SERVICE_LABELS.mariadb).toBe("MariaDB");
		expect(SERVICE_LABELS.mongo).toBe("MongoDB");
		expect(SERVICE_LABELS.redis).toBe("Redis");
	});
});

// ============================================================================
// Mocked Integration Tests
// ============================================================================

// Mock setup for execAsync
const mockExecAsync = vi.fn();
const mockExecAsyncRemote = vi.fn();
const mockFindServerById = vi.fn();

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: (...args: unknown[]) => mockExecAsync(...args),
	execAsyncRemote: (...args: unknown[]) => mockExecAsyncRemote(...args),
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: (...args: unknown[]) => mockFindServerById(...args),
}));

import { shouldSyncFile } from "@dokploy/server/utils/transfer";
import {
	scanVolume,
	scanBindMount,
	syncBindFile,
	syncVolumeFile,
} from "@dokploy/server/utils/transfer";
import type { FileCompareResult, MergeStrategy } from "@dokploy/server/utils/transfer";

describe("shouldSyncFile", () => {
	const createCompareResult = (
		status: FileCompareResult["status"],
		path = "/test.txt",
	): FileCompareResult => ({
		path,
		size: 100,
		mtime: 1000,
		mode: "644",
		isDirectory: false,
		status,
	});

	describe("with skip strategy", () => {
		const strategy: MergeStrategy = "skip";

		test("should not sync matching files", () => {
			expect(shouldSyncFile(createCompareResult("match"), strategy)).toBe(false);
		});

		test("should sync missing_target files", () => {
			expect(shouldSyncFile(createCompareResult("missing_target"), strategy)).toBe(true);
		});

		test("should not sync missing_source files", () => {
			expect(shouldSyncFile(createCompareResult("missing_source"), strategy)).toBe(false);
		});

		test("should not sync newer_source files with skip", () => {
			expect(shouldSyncFile(createCompareResult("newer_source"), strategy)).toBe(false);
		});

		test("should not sync newer_target files", () => {
			expect(shouldSyncFile(createCompareResult("newer_target"), strategy)).toBe(false);
		});

		test("should not sync conflicts with skip", () => {
			expect(shouldSyncFile(createCompareResult("conflict"), strategy)).toBe(false);
		});
	});

	describe("with overwrite strategy", () => {
		const strategy: MergeStrategy = "overwrite";

		test("should sync newer_source files", () => {
			expect(shouldSyncFile(createCompareResult("newer_source"), strategy)).toBe(true);
		});

		test("should sync newer_target files (source wins)", () => {
			expect(shouldSyncFile(createCompareResult("newer_target"), strategy)).toBe(true);
		});

		test("should sync conflicts", () => {
			expect(shouldSyncFile(createCompareResult("conflict"), strategy)).toBe(true);
		});
	});

	describe("with newer strategy", () => {
		const strategy: MergeStrategy = "newer";

		test("should sync newer_source files", () => {
			expect(shouldSyncFile(createCompareResult("newer_source"), strategy)).toBe(true);
		});

		test("should not sync newer_target files", () => {
			expect(shouldSyncFile(createCompareResult("newer_target"), strategy)).toBe(false);
		});

		test("should sync conflicts (compare as conflict resolution)", () => {
			expect(shouldSyncFile(createCompareResult("conflict"), strategy)).toBe(true);
		});
	});

	describe("with manual decisions", () => {
		test("should honor scoped decisions to avoid cross-mount path collisions", () => {
			const file = createCompareResult("newer_target", "/shared.txt");
			const decisions = {
				"mount-a:/shared.txt": "overwrite" as const,
				"mount-b:/shared.txt": "skip" as const,
			};
			expect(shouldSyncFile(file, "skip", decisions, "mount-a")).toBe(true);
			expect(shouldSyncFile(file, "overwrite", decisions, "mount-b")).toBe(false);
		});

		test("should respect manual skip decision", () => {
			const file = createCompareResult("newer_source", "/override.txt");
			const decisions = { "/override.txt": "skip" as const };
			expect(shouldSyncFile(file, "overwrite", decisions)).toBe(false);
		});

		test("should respect manual overwrite decision", () => {
			const file = createCompareResult("newer_target", "/force.txt");
			const decisions = { "/force.txt": "overwrite" as const };
			expect(shouldSyncFile(file, "skip", decisions)).toBe(true);
		});

		test("should use strategy when no manual decision exists", () => {
			const file = createCompareResult("newer_source", "/auto.txt");
			const decisions = { "/other.txt": "skip" as const };
			expect(shouldSyncFile(file, "overwrite", decisions)).toBe(true);
		});
	});
});

describe("scanVolume (mocked)", () => {
	beforeEach(() => {
		mockExecAsync.mockReset();
		mockExecAsyncRemote.mockReset();
	});

	test("should parse file list output correctly", async () => {
		mockExecAsync.mockResolvedValue({
			stdout: "f|/volume_data/file1.txt|100|1609459200|644\nf|/volume_data/file2.txt|200|1609459300|644\n",
		});

		const files = await scanVolume(null, "test-volume");

		expect(files).toHaveLength(2);
		expect(files[0]?.path).toBe("/file1.txt");
		expect(files[0]?.size).toBe(100);
		expect(files[0]?.mtime).toBe(1609459200);
		expect(files[0]?.isDirectory).toBe(false);
		expect(files[1]?.path).toBe("/file2.txt");
	});

	test("should handle directories", async () => {
		mockExecAsync.mockResolvedValue({
			stdout: "d|/volume_data/subdir|0|1609459200|755\n",
		});

		const files = await scanVolume(null, "test-volume");

		expect(files).toHaveLength(1);
		expect(files[0]?.isDirectory).toBe(true);
		expect(files[0]?.mode).toBe("755");
	});

	test("should use remote exec for non-null serverId", async () => {
		mockExecAsyncRemote.mockResolvedValue({
			stdout: "f|/volume_data/remote.txt|50|1609459200|644\n",
		});

		const files = await scanVolume("server-123", "remote-volume");

		expect(mockExecAsyncRemote).toHaveBeenCalledWith(
			"server-123",
			expect.stringContaining("docker run"),
		);
		expect(files).toHaveLength(1);
		expect(files[0]?.path).toBe("/remote.txt");
	});

	test("should handle empty volume", async () => {
		mockExecAsync.mockResolvedValue({ stdout: "" });

		const files = await scanVolume(null, "empty-volume");

		expect(files).toHaveLength(0);
	});

	test("should call emit callback for each file", async () => {
		mockExecAsync.mockResolvedValue({
			stdout: "f|/volume_data/a.txt|10|1000|644\nf|/volume_data/b.txt|20|2000|644\n",
		});
		const emit = vi.fn();

		await scanVolume(null, "test-volume", emit);

		expect(emit).toHaveBeenCalledTimes(2);
		expect(emit).toHaveBeenCalledWith(expect.objectContaining({ path: "/a.txt" }));
		expect(emit).toHaveBeenCalledWith(expect.objectContaining({ path: "/b.txt" }));
	});
});

describe("scanBindMount (mocked)", () => {
	beforeEach(() => {
		mockExecAsync.mockReset();
		mockExecAsyncRemote.mockReset();
	});

	test("should parse bind mount file list", async () => {
		mockExecAsync.mockResolvedValue({
			stdout: "f|/data/config.json|512|1609459200|644\nd|/data/logs|0|1609459100|755\n",
		});

		const files = await scanBindMount(null, "/data");

		expect(files).toHaveLength(2);
		expect(files[0]?.path).toBe("/config.json");
		expect(files[0]?.size).toBe(512);
		expect(files[1]?.path).toBe("/logs");
		expect(files[1]?.isDirectory).toBe(true);
	});

	test("should use remote exec for remote server", async () => {
		mockExecAsyncRemote.mockResolvedValue({
			stdout: "f|/app/data.db|1024|1609459200|644\n",
		});

		const files = await scanBindMount("server-456", "/app");

		expect(mockExecAsyncRemote).toHaveBeenCalledWith(
			"server-456",
			expect.stringContaining("find"),
		);
		expect(files).toHaveLength(1);
	});
});

describe("remote-to-remote sync helpers", () => {
	beforeEach(() => {
		mockExecAsync.mockReset();
		mockExecAsyncRemote.mockReset();
		mockFindServerById.mockReset();

		mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });
		mockExecAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
		mockFindServerById.mockImplementation(async (serverId: string) => {
			if (serverId === "source-server") {
				return {
					username: "root",
					ipAddress: "43.161.225.99",
					port: 22,
					sshKey: { privateKey: "SOURCE_PRIVATE_KEY" },
				};
			}

			if (serverId === "target-server") {
				return {
					username: "root",
					ipAddress: "101.32.14.86",
					port: 22,
					sshKey: { privateKey: "TARGET_PRIVATE_KEY" },
				};
			}

			throw new Error(`Unknown server id: ${serverId}`);
		});
	});

	test("syncVolumeFile should stream via Dokploy server for remote-to-remote", async () => {
		await syncVolumeFile(
			"source-server",
			"target-server",
			"source-volume",
			"target-volume",
			"/file.txt",
		);

		expect(mockExecAsync).toHaveBeenCalledTimes(1);
		const command = mockExecAsync.mock.calls[0]?.[0];
		expect(command).toContain("43.161.225.99");
		expect(command).toContain("101.32.14.86");
		expect(command).toContain("docker run --rm -v");
		expect(command).toContain("-i ");
	});

	test("syncBindFile should stream via Dokploy server for remote-to-remote", async () => {
		await syncBindFile(
			"source-server",
			"target-server",
			"/etc/dokploy/applications/source-app",
			"/etc/dokploy/applications/target-app",
			"/nested/config.json",
		);

		expect(mockExecAsyncRemote).toHaveBeenCalledWith(
			"target-server",
			expect.stringContaining("mkdir -p"),
		);
		expect(mockExecAsync).toHaveBeenCalledTimes(1);
		const command = mockExecAsync.mock.calls[0]?.[0];
		expect(command).toContain("tar cf - -C");
		expect(command).toContain("tar xf - -C");
		expect(command).toContain("43.161.225.99");
		expect(command).toContain("101.32.14.86");
		expect(command).toContain("-i ");
	});
});

describe("remote-to-local sync helpers", () => {
	beforeEach(() => {
		mockExecAsync.mockReset();
		mockExecAsyncRemote.mockReset();
		mockFindServerById.mockReset();

		mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });
		mockExecAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
		mockFindServerById.mockImplementation(async (serverId: string) => {
			if (serverId === "source-server") {
				return {
					username: "root",
					ipAddress: "43.161.225.99",
					port: 22,
					sshKey: { privateKey: "SOURCE_PRIVATE_KEY" },
				};
			}

			throw new Error(`Unknown server id: ${serverId}`);
		});
	});

	test("syncVolumeFile should stream from remote source to local target", async () => {
		await syncVolumeFile(
			"source-server",
			null,
			"source-volume",
			"target-volume",
			"/file.txt",
		);

		expect(mockFindServerById).toHaveBeenCalledTimes(1);
		expect(mockFindServerById).toHaveBeenCalledWith("source-server");
		expect(mockExecAsyncRemote).not.toHaveBeenCalled();
		expect(mockExecAsync).toHaveBeenCalledTimes(1);
		const command = mockExecAsync.mock.calls[0]?.[0];
		expect(command).toContain("43.161.225.99");
		expect(command).toContain("docker run --rm -i -v");
	});

	test("syncBindFile should stream from remote source to local target", async () => {
		await syncBindFile(
			"source-server",
			null,
			"/etc/dokploy/applications/source-app",
			"/etc/dokploy/applications/target-app",
			"/nested/config.json",
		);

		expect(mockFindServerById).toHaveBeenCalledTimes(1);
		expect(mockFindServerById).toHaveBeenCalledWith("source-server");
		expect(mockExecAsyncRemote).not.toHaveBeenCalled();
		expect(mockExecAsync).toHaveBeenCalledTimes(2);
		expect(mockExecAsync.mock.calls[0]?.[0]).toContain("mkdir -p");
		const command = mockExecAsync.mock.calls[1]?.[0];
		expect(command).toContain("43.161.225.99");
		expect(command).toContain("tar cf - -C");
		expect(command).toContain("tar xf - -C");
	});
});

describe("local-to-remote bind sync helper", () => {
	beforeEach(() => {
		mockExecAsync.mockReset();
		mockExecAsyncRemote.mockReset();
		mockFindServerById.mockReset();

		mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });
		mockExecAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
		mockFindServerById.mockImplementation(async (serverId: string) => {
			if (serverId === "target-server") {
				return {
					username: "root",
					ipAddress: "101.32.14.86",
					port: 22,
					sshKey: { privateKey: "TARGET_PRIVATE_KEY" },
				};
			}

			throw new Error(`Unknown server id: ${serverId}`);
		});
	});

	test("syncBindFile should use rsync with mtime preservation", async () => {
		await syncBindFile(
			null,
			"target-server",
			"/etc/dokploy/applications/source-app",
			"/etc/dokploy/applications/target-app",
			"/nested/config.json",
		);

		expect(mockExecAsyncRemote).toHaveBeenCalledWith(
			"target-server",
			expect.stringContaining("mkdir -p"),
		);
		expect(mockExecAsync).toHaveBeenCalledTimes(1);
		const command = mockExecAsync.mock.calls[0]?.[0];
		expect(command).toContain("rsync -az --times");
		expect(command).not.toContain("--checksum");
		expect(command).toContain("101.32.14.86");
	});
});

describe("local-to-local bind sync helper", () => {
	beforeEach(() => {
		mockExecAsync.mockReset();
		mockExecAsyncRemote.mockReset();
		mockFindServerById.mockReset();

		mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });
		mockExecAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	});

	test("syncBindFile should use rsync with mtime preservation", async () => {
		await syncBindFile(
			null,
			null,
			"/etc/dokploy/applications/source-app",
			"/etc/dokploy/applications/target-app",
			"/nested/config.json",
		);

		expect(mockExecAsyncRemote).not.toHaveBeenCalled();
		expect(mockExecAsync).toHaveBeenCalledTimes(2);
		expect(mockExecAsync.mock.calls[0]?.[0]).toContain("mkdir -p");

		const command = mockExecAsync.mock.calls[1]?.[0];
		expect(command).toContain("rsync -az --times");
		expect(command).not.toContain("--checksum");
	});
});
