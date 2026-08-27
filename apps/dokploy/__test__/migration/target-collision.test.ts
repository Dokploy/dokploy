import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `transferDockerVolume`/`transferDirectory` shell out to local/remote
 * commands via `./channel`. Mocking that module lets these tests exercise
 * the atomic target-absence enforcement (the actual bug being fixed: a
 * separate "does the target already exist?" check followed by a separate
 * "create it" call, which leaves a TOCTOU window another process/move could
 * land in between) without ever running Docker or SSH.
 */
const channelMocks = vi.hoisted(() => ({
	captureChannelCommandOutput: vi.fn(),
	openCommandChannelPair: vi.fn(),
	pipeCommandChannels: vi.fn(),
	runChannelCommand: vi.fn(),
	CommandChannelError: class CommandChannelError extends Error {
		constructor(
			message: string,
			public command: string,
			public exitCode: number | null,
			public stderr: string,
		) {
			super(message);
			this.name = "CommandChannelError";
		}
	},
}));

vi.mock("@dokploy/server/utils/migration/channel", () => channelMocks);

import {
	transferDirectory,
	transferDockerVolume,
} from "@dokploy/server/utils/migration/transfer";

describe("transferDockerVolume target-absence enforcement", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("refuses to transfer into an already-existing target volume (create no-ops, label doesn't match)", async () => {
		channelMocks.runChannelCommand.mockResolvedValue(undefined);
		// The volume already existed, so `docker volume create` was a no-op
		// and the label read back belongs to whatever created it before -
		// never this call's freshly generated token.
		channelMocks.captureChannelCommandOutput.mockResolvedValue(
			"some-other-migration-token\n",
		);
		const onTargetCreated = vi.fn();

		await expect(
			transferDockerVolume({
				sourceServerId: null,
				sourceVolumeName: "app-data",
				targetServerId: null,
				targetVolumeName: "app-data",
				onTargetCreated,
			}),
		).rejects.toThrow(/already exists/i);

		expect(channelMocks.runChannelCommand).toHaveBeenCalledTimes(2);
		expect(onTargetCreated).not.toHaveBeenCalled();
		expect(channelMocks.openCommandChannelPair).not.toHaveBeenCalled();
		expect(channelMocks.pipeCommandChannels).not.toHaveBeenCalled();
	});

	it("creates the target volume and transfers only once the migration-token label round-trips", async () => {
		channelMocks.runChannelCommand.mockResolvedValue(undefined);
		channelMocks.captureChannelCommandOutput.mockImplementation(async () => {
			// Simulate the label actually written by the create call: echo
			// back the token embedded in the (mocked) create command
			// invocation by reading it off the last runChannelCommand call.
			const lastCreateCall = channelMocks.runChannelCommand.mock.calls.at(
				-1,
			)?.[1] as string;
			const match = /token\\?=([\w-]+)/.exec(lastCreateCall ?? "");
			return `${match?.[1] ?? ""}\n`;
		});
		channelMocks.openCommandChannelPair.mockResolvedValue({
			source: {},
			destination: {},
		});
		channelMocks.pipeCommandChannels.mockResolvedValue(undefined);
		const onTargetCreated = vi.fn();

		await transferDockerVolume({
			sourceServerId: null,
			sourceVolumeName: "app-data",
			targetServerId: null,
			targetVolumeName: "app-data",
			onTargetCreated,
		});

		expect(channelMocks.runChannelCommand).toHaveBeenCalledTimes(2);
		expect(onTargetCreated).toHaveBeenCalledTimes(1);
		expect(channelMocks.pipeCommandChannels).toHaveBeenCalledTimes(1);
	});

	it("does not transfer when the create step itself fails", async () => {
		channelMocks.runChannelCommand.mockRejectedValue(
			new Error("ssh connection failed"),
		);

		await expect(
			transferDockerVolume({
				sourceServerId: "server-a",
				sourceVolumeName: "app-data",
				targetServerId: "server-b",
				targetVolumeName: "app-data",
			}),
		).rejects.toThrow("ssh connection failed");

		expect(channelMocks.captureChannelCommandOutput).not.toHaveBeenCalled();
		expect(channelMocks.openCommandChannelPair).not.toHaveBeenCalled();
	});
});

describe("transferDirectory target-absence enforcement", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("refuses to transfer into an already-existing target directory (leaf mkdir fails with File exists)", async () => {
		channelMocks.runChannelCommand
			.mockResolvedValueOnce(undefined) // ensure-parent succeeds
			.mockRejectedValueOnce(
				new channelMocks.CommandChannelError(
					"create target directory /app failed (exit code 1): mkdir: cannot create directory '/app': File exists",
					"create target directory /app",
					1,
					"mkdir: cannot create directory '/app': File exists",
				),
			);
		const onTargetCreated = vi.fn();

		await expect(
			transferDirectory({
				sourceServerId: null,
				sourcePath: "/etc/dokploy/compose/app",
				targetServerId: null,
				targetPath: "/etc/dokploy/compose/app",
				onTargetCreated,
			}),
		).rejects.toThrow(/already exists/i);

		expect(onTargetCreated).not.toHaveBeenCalled();
		expect(channelMocks.openCommandChannelPair).not.toHaveBeenCalled();
	});

	it("propagates a genuine (non-collision) leaf-creation failure as-is", async () => {
		const permissionError = new channelMocks.CommandChannelError(
			"create target directory /app-2 failed (exit code 1): mkdir: Permission denied",
			"create target directory /app-2",
			1,
			"mkdir: Permission denied",
		);
		channelMocks.runChannelCommand
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(permissionError);

		await expect(
			transferDirectory({
				sourceServerId: null,
				sourcePath: "/etc/dokploy/compose/app",
				targetServerId: null,
				targetPath: "/etc/dokploy/compose/app-2",
			}),
		).rejects.toBe(permissionError);

		expect(channelMocks.openCommandChannelPair).not.toHaveBeenCalled();
	});

	it("ensures the parent then atomically creates the leaf and transfers once both succeed", async () => {
		channelMocks.runChannelCommand.mockResolvedValue(undefined);
		channelMocks.openCommandChannelPair.mockResolvedValue({
			source: {},
			destination: {},
		});
		channelMocks.pipeCommandChannels.mockResolvedValue(undefined);
		const onTargetCreated = vi.fn();

		await transferDirectory({
			sourceServerId: null,
			sourcePath: "/etc/dokploy/compose/app",
			targetServerId: null,
			targetPath: "/etc/dokploy/compose/app-2",
			onTargetCreated,
		});

		expect(channelMocks.runChannelCommand).toHaveBeenCalledTimes(2);
		expect(onTargetCreated).toHaveBeenCalledTimes(1);
		expect(channelMocks.pipeCommandChannels).toHaveBeenCalledTimes(1);
	});
});
