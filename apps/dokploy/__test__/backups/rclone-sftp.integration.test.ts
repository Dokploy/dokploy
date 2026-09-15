import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { RCLONE_DESTINATION_PROVIDERS } from "@dokploy/server/db/validations/destination";
import { getRclonePathAndFlags } from "@dokploy/server/utils/backups/utils";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

type Destination = Parameters<typeof getRclonePathAndFlags>[0];

const IMAGE = "atmoz/sftp:latest";
const CONTAINER_NAME = `dokploy-sftp-it-${process.pid}`;
const HOST_PORT = 2222 + (process.pid % 1000);
const SFTP_USER = "dokploy-test";
const SFTP_PASSWORD = "1234";

const isDockerAvailable = async () => {
	try {
		await execFileAsync("docker", ["info"]);
		return true;
	} catch {
		return false;
	}
};

const dockerAvailable = await isDockerAvailable();
const describeIntegration = dockerAvailable ? describe : describe.skip;

const destination = (
	bucket: string,
	knownHostsFile: string,
	password = "",
): Destination =>
	({
		provider: RCLONE_DESTINATION_PROVIDERS.SFTP,
		endpoint: "127.0.0.1",
		accessKey: SFTP_USER,
		secretAccessKey: password,
		// The implementation carries the SFTP port in `region`.
		region: String(HOST_PORT),
		bucket,
		additionalFlags: [`--sftp-known-hosts-file=${knownHostsFile}`],
	}) as unknown as Destination;

describe("rclone remote path formatting (no server required)", () => {
	test("keeps an absolute SFTP base path absolute", async () => {
		const result = await getRclonePathAndFlags(
			destination("/backups/", "unused"),
		);
		expect(result.path).toBe(":sftp:/backups");
	});

	test("keeps a slash-less SFTP base path home-relative", async () => {
		const result = await getRclonePathAndFlags(
			destination("backups", "unused"),
		);
		expect(result.path).toBe(":sftp:backups");
	});
});

describeIntegration("rclone SFTP integration (real server via Docker)", () => {
	const containerHome = `/home/${SFTP_USER}`;
	let workDir = "";
	let knownHostsFile = "";
	let payloadFile = "";
	let payloadMd5 = "";

	const docker = (args: string[]) => execFileAsync("docker", args);

	const containerHasFile = async (filePath: string) => {
		try {
			await docker(["exec", CONTAINER_NAME, "test", "-f", filePath]);
			return true;
		} catch {
			return false;
		}
	};

	const waitForHostKey = async (timeoutMs: number) => {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			try {
				const { stdout } = await execFileAsync("ssh-keyscan", [
					"-T",
					"3",
					"-p",
					String(HOST_PORT),
					"127.0.0.1",
				]);
				if (stdout.includes("ssh-ed25519") || stdout.includes("ssh-rsa")) {
					return stdout;
				}
			} catch {
				// Server not ready yet; retry until the deadline.
			}
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		throw new Error("SFTP container did not become ready in time");
	};

	beforeAll(async () => {
		if (!dockerAvailable) return;
		const rcloneCheck = await execFileAsync("rclone", ["version"]).catch(
			() => null,
		);
		if (!rcloneCheck) {
			throw new Error(
				"Docker is available but rclone is not installed; install it (https://rclone.org/install/) to run the SFTP integration tests",
			);
		}

		workDir = await mkdtemp(path.join(tmpdir(), "dokploy-sftp-it-"));
		knownHostsFile = path.join(workDir, "known_hosts");

		// The default atmoz/sftp sshd_config uses `ChrootDirectory %h`, which
		// collapses absolute and home-relative paths into the same directory.
		// Mount a minimal chroot-free config so the test can distinguish the
		// two, which is exactly what the fix under test is about.
		const sshdConfigPath = path.join(workDir, "sshd_config");
		await writeFile(
			sshdConfigPath,
			"Subsystem sftp internal-sftp\nPermitRootLogin no\n",
			"utf8",
		);

		await docker([
			"run",
			"-d",
			"--rm",
			"--name",
			CONTAINER_NAME,
			"-p",
			`${HOST_PORT}:22`,
			"-v",
			`${sshdConfigPath}:/etc/ssh/sshd_config`,
			IMAGE,
			`${SFTP_USER}:${SFTP_PASSWORD}`,
		]);

		const hostKeys = await waitForHostKey(45_000);
		await writeFile(knownHostsFile, hostKeys, "utf8");

		// Absolute paths resolve against the real container filesystem, so the
		// target directory must exist and be writable by the SFTP user.
		await docker([
			"exec",
			CONTAINER_NAME,
			"sh",
			"-c",
			`mkdir -p /backups && chown ${SFTP_USER}:${SFTP_USER} /backups`,
		]);

		payloadFile = path.join(workDir, "backup.tar");
		await writeFile(payloadFile, randomUUID() + randomUUID(), "utf8");
		payloadMd5 = createHash("md5")
			.update(await readFile(payloadFile))
			.digest("hex");
	}, 60_000);

	afterAll(async () => {
		if (!dockerAvailable) return;
		await docker(["rm", "-f", CONTAINER_NAME]).catch(() => undefined);
		if (workDir) await rm(workDir, { recursive: true, force: true });
	});

	test("home-relative bucket uploads land in the user home, not at the root", async () => {
		const { flags, path: remotePath } = await getRclonePathAndFlags(
			destination("backups", knownHostsFile, SFTP_PASSWORD),
			"service/backup.tar",
		);
		expect(remotePath).toBe(":sftp:backups/service/backup.tar");

		await execFileAsync("rclone", [
			"copyto",
			payloadFile,
			remotePath,
			...flags,
		]);

		expect(
			await containerHasFile(`${containerHome}/backups/service/backup.tar`),
		).toBe(true);
		expect(await containerHasFile("/backups/service")).toBe(false);
	}, 30_000);

	test("absolute bucket uploads land at the server root (regression guard)", async () => {
		const { flags, path: remotePath } = await getRclonePathAndFlags(
			destination("/backups/", knownHostsFile, SFTP_PASSWORD),
			"service/backup.tar",
		);
		expect(remotePath).toBe(":sftp:/backups/service/backup.tar");

		await execFileAsync("rclone", [
			"copyto",
			payloadFile,
			remotePath,
			...flags,
		]);

		expect(await containerHasFile("/backups/service/backup.tar")).toBe(true);
		expect(await containerHasFile(`${containerHome}/backups/service`)).toBe(
			false,
		);
	}, 30_000);

	test("absolute path roundtrip preserves the payload byte for byte", async () => {
		const { flags, path: remotePath } = await getRclonePathAndFlags(
			destination("/backups/", knownHostsFile, SFTP_PASSWORD),
			"service/backup.tar",
		);
		const restoredFile = path.join(workDir, "restored.tar");
		await execFileAsync("rclone", [
			"copyto",
			remotePath,
			restoredFile,
			...flags,
		]);

		const restoredMd5 = createHash("md5")
			.update(await readFile(restoredFile))
			.digest("hex");
		expect(restoredMd5).toBe(payloadMd5);
	}, 30_000);

	test("empty bucket resolves home-relative and can upload a marker", async () => {
		const { flags, path: remotePath } = await getRclonePathAndFlags(
			destination("", knownHostsFile, SFTP_PASSWORD),
			"", // empty child -> ":sftp:" (the user home)
		);
		expect(remotePath).toBe(":sftp:");

		await execFileAsync("rclone", [
			"copyto",
			payloadFile,
			":sftp:marker-it.txt",
			...flags,
		]);
		expect(await containerHasFile(`${containerHome}/marker-it.txt`)).toBe(true);
	}, 30_000);
});
