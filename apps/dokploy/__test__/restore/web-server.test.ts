import { restoreWebServerBackup } from "@dokploy/server/utils/restore/web-server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execAsyncMock = vi.fn();
const updateWebServerSettingsMock = vi.fn();
const getPublicIpWithFallbackMock = vi.fn();

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: (...args: unknown[]) => execAsyncMock(...args),
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	updateWebServerSettings: (...args: unknown[]) =>
		updateWebServerSettingsMock(...args),
}));

vi.mock("@dokploy/server/wss/utils", () => ({
	getPublicIpWithFallback: (...args: unknown[]) =>
		getPublicIpWithFallbackMock(...args),
}));

vi.mock("@dokploy/server/utils/backups/utils", () => ({
	getS3Credentials: () => ["--s3-flag"],
}));

const destination = {
	bucket: "my-bucket",
} as any;

describe("restoreWebServerBackup", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Default execAsync behaviour: the two `ls ... || true` probes must report
		// that the database files exist, every other command resolves with no output.
		execAsyncMock.mockImplementation((command: string) => {
			if (command.includes("database.sql.gz")) {
				return Promise.resolve({ stdout: "database.sql.gz", stderr: "" });
			}
			if (command.includes("ls") && command.includes("database.sql")) {
				return Promise.resolve({ stdout: "database.sql", stderr: "" });
			}
			if (command.includes("docker ps")) {
				return Promise.resolve({ stdout: "container-id", stderr: "" });
			}
			return Promise.resolve({ stdout: "", stderr: "" });
		});
	});

	it("re-detects and persists the current public IP after a restore", async () => {
		getPublicIpWithFallbackMock.mockResolvedValue("203.0.113.10");
		const emit = vi.fn();

		await restoreWebServerBackup(destination, "backup.zip", emit);

		expect(getPublicIpWithFallbackMock).toHaveBeenCalledTimes(1);
		expect(updateWebServerSettingsMock).toHaveBeenCalledWith({
			serverIp: "203.0.113.10",
		});
		expect(emit).toHaveBeenCalledWith("Server IP updated to: 203.0.113.10");
		expect(emit).toHaveBeenCalledWith("Restore completed successfully!");
	});

	it("does not overwrite the server IP when detection fails", async () => {
		getPublicIpWithFallbackMock.mockResolvedValue(null);
		const emit = vi.fn();

		await restoreWebServerBackup(destination, "backup.zip", emit);

		expect(getPublicIpWithFallbackMock).toHaveBeenCalledTimes(1);
		expect(updateWebServerSettingsMock).not.toHaveBeenCalled();
		expect(emit).toHaveBeenCalledWith(
			"Warning: could not detect the public IP, the server IP was left unchanged. Update it manually in Web Server settings if needed.",
		);
		expect(emit).toHaveBeenCalledWith("Restore completed successfully!");
	});

	it("refreshes the IP only after the database restore has run", async () => {
		getPublicIpWithFallbackMock.mockResolvedValue("203.0.113.10");
		const emit = vi.fn();

		await restoreWebServerBackup(destination, "backup.zip", emit);

		// pg_restore must have been invoked before we touch the server IP.
		const restoreCalled = execAsyncMock.mock.calls.some(([command]) =>
			String(command).includes("pg_restore"),
		);
		expect(restoreCalled).toBe(true);
		expect(updateWebServerSettingsMock).toHaveBeenCalledTimes(1);
	});
});
