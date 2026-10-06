import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findVolumeBackupById: vi.fn(),
	findServerById: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/services/volume-backups", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/volume-backups")
	>()),
	findVolumeBackupById: mocks.findVolumeBackupById,
}));

vi.mock("@dokploy/server/services/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/services/server")>()),
	findServerById: mocks.findServerById,
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

import {
	createDeploymentError,
	createDeploymentVolumeBackup,
} from "@dokploy/server/services/deployment";

describe("createDeploymentError", () => {
	it("keeps the generic message and appends the underlying error", () => {
		const cause = new Error("ENOSPC: no space left on device");

		const error = createDeploymentError(cause);

		expect(error).toBeInstanceOf(TRPCError);
		expect(error.code).toBe("BAD_REQUEST");
		expect(error.message).toBe(
			"Error creating the deployment: ENOSPC: no space left on device",
		);
		expect(error.cause).toBe(cause);
	});

	it("stringifies a non-Error value", () => {
		const error = createDeploymentError("boom");

		expect(error.message).toBe("Error creating the deployment: boom");
		// tRPC wraps a non-Error cause into an Error.
		expect((error.cause as Error).message).toBe("boom");
	});

	it("supports a different base message", () => {
		const error = createDeploymentError(
			new Error("db down"),
			"Error creating the backup",
		);

		expect(error.message).toBe("Error creating the backup: db down");
	});
});

describe("createDeploymentVolumeBackup", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findVolumeBackupById.mockResolvedValue({
			appName: "vol-backup-1",
			application: { serverId: "server-1" },
			compose: null,
		});
		mocks.findServerById.mockResolvedValue({ serverId: "server-1" });
	});

	it("surfaces the underlying failure instead of only the generic message", async () => {
		const cause = new Error("ssh: connect to host 10.0.0.5 port 22: refused");
		mocks.execAsyncRemote.mockRejectedValue(cause);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const error = await createDeploymentVolumeBackup({
			volumeBackupId: "vb-1",
			title: "Volume backup",
			description: "scheduled",
		} as Parameters<typeof createDeploymentVolumeBackup>[0]).catch((e) => e);

		logSpy.mockRestore();
		expect(error).toBeInstanceOf(TRPCError);
		expect(error.code).toBe("BAD_REQUEST");
		expect(error.message).toBe(
			"Error creating the deployment: ssh: connect to host 10.0.0.5 port 22: refused",
		);
		expect(error.cause).toBe(cause);
	});
});
