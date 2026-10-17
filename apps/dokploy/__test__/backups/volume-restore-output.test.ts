import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execAsyncStream } from "@dokploy/server/utils/process/execAsync";
import { restoreVolume } from "@dokploy/server/utils/volume-backups/restore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ paths: vi.fn() }));

vi.mock("@dokploy/server", () => ({
	findApplicationById: vi.fn().mockResolvedValue({ appName: "test-app" }),
	findComposeById: vi.fn().mockResolvedValue({
		appName: "test-compose",
		composeType: "docker-compose",
	}),
	findDestinationById: vi.fn().mockResolvedValue({ bucket: "test-bucket" }),
	getS3Credentials: vi.fn().mockReturnValue([]),
	paths: mocks.paths,
}));

vi.mock("@dokploy/server/services/server", () => ({ findServerById: vi.fn() }));

const fixture = mkdtempSync(path.join(tmpdir(), "dokploy-volume-restore-"));
const source = path.join(fixture, "source");
const restored = path.join(fixture, "restored");
const backups = path.join(fixture, "backups");
const bin = path.join(fixture, "bin");
const volumeName = "test-volume";
const archiveName = "backup.tar";
const archive = path.join(backups, volumeName, archiveName);

beforeAll(() => {
	for (const directory of [source, restored, bin, path.dirname(archive)]) {
		mkdirSync(directory, { recursive: true });
	}
	mocks.paths.mockReturnValue({ VOLUME_BACKUPS_PATH: backups });

	// Verbose extraction of these filenames exceeds exec's default 1 MiB limit.
	for (let index = 0; index < 10_000; index++) {
		const filename = `image_${index}_${"x".repeat(120)}.jpg`;
		writeFileSync(path.join(source, filename), `image fixture ${index}\n`);
	}
	execFileSync("tar", ["cf", archive, "-C", source, "."]);

	// Stub the transport only: the generated command still runs the real tar
	// through execAsyncStream, including both shell layers and exit statuses.
	writeFileSync(
		path.join(bin, "docker"),
		`#!/bin/bash
case "$1" in
  volume) exit 0 ;;
  run)
    while [ "$#" -gt 0 ] && [ "$1" != "bash" ]; do shift; done
    shift 2
    volume_path=/volume_data
    backup_path=/backup
    script=\${1/$volume_path/$RESTORE_DIR}
    script=\${script/$backup_path/$BACKUP_DIR}
    exec bash -c "$script"
    ;;
  *) exit 1 ;;
esac
`,
		{ mode: 0o755 },
	);
	writeFileSync(path.join(bin, "rclone"), "#!/bin/sh\nexit 0\n", {
		mode: 0o755,
	});
});

afterAll(() => rmSync(fixture, { recursive: true, force: true }));

const executeRestore = async (
	serviceType: "application" | "compose",
	backupFileName = archiveName,
) => {
	const command = await restoreVolume(
		"test-service",
		"test-destination",
		volumeName,
		backupFileName,
		"",
		serviceType,
	);
	const environment = globalThis.process.env;
	return execAsyncStream(command, undefined, {
		env: {
			...environment,
			PATH: `${bin}:${environment.PATH}`,
			RESTORE_DIR: restored,
			BACKUP_DIR: path.dirname(archive),
		},
	});
};

describe("volume restore output", () => {
	it.each(["application", "compose"] as const)(
		"restores a large %s archive without exceeding the output buffer",
		async (serviceType) => {
			rmSync(restored, { recursive: true, force: true });
			mkdirSync(restored);
			const result = await executeRestore(serviceType);

			expect(result.stdout).toContain("Volume restore completed ✅");
			expect(readdirSync(restored)).toHaveLength(10_000);
			for (const filename of readdirSync(source)) {
				const expected = path.join(source, filename);
				const actual = path.join(restored, filename);
				expect(readFileSync(actual)).toEqual(readFileSync(expected));
				expect(statSync(actual).mode & 0o777).toBe(
					statSync(expected).mode & 0o777,
				);
			}
		},
		30_000,
	);

	it("preserves extraction errors instead of reporting success", async () => {
		await expect(
			executeRestore("application", "missing.tar"),
		).rejects.toMatchObject({
			exitCode: expect.any(Number),
			stdout: expect.not.stringContaining("Volume restore completed ✅"),
		});
	});
});
