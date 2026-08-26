import { randomUUID } from "node:crypto";
import {
	CommandChannelError,
	captureChannelCommandOutput,
	openCommandChannelPair,
	pipeCommandChannels,
	runChannelCommand,
} from "./channel";
import {
	buildCreateLeafDirectoryCommand,
	buildCreateVolumeCommand,
	buildDirectoryExportCommand,
	buildDirectoryImportCommand,
	buildEnsureParentDirectoryCommand,
	buildInspectVolumeCommand,
	buildReadVolumeMigrationTokenCommand,
	buildVolumeExportCommand,
	buildVolumeImportCommand,
} from "./commands";

/** Recognizes a `mkdir` (no `-p`) failure caused by the leaf path already existing, as opposed to any other failure (permissions, disk full, ...). */
const isDirectoryAlreadyExistsError = (error: unknown): boolean =>
	error instanceof CommandChannelError && /file exists/i.test(error.stderr);

/**
 * Streams a Docker volume's full contents from a source host to a target
 * host (either of which may be local or remote) without buffering the
 * archive in memory: a `tar -c` running against the source volume is piped
 * directly into a `tar -x` running against the (freshly created) target
 * volume.
 *
 * Requires the target volume to not already exist: transferring into an
 * existing volume would silently merge/overwrite unrelated data rather than
 * producing an exact copy of the source. This is enforced atomically, not
 * via a separate "does it exist?" check followed by a separate "create it"
 * call (which would leave a TOCTOU window for a concurrent move/process to
 * land in): `docker volume create` is idempotent, so this call always
 * creates-or-no-ops the volume tagged with a fresh, unique migration token,
 * then immediately reads the token label back. Only if the label read back
 * matches the token THIS call just wrote is the volume known to have been
 * created (not merely left alone) by this move - see `buildCreateVolumeCommand`.
 * `onTargetCreated` fires only once that ownership is confirmed, before the
 * potentially long-running transfer starts, so a caller can track exactly
 * which target artifacts this move is responsible for cleaning up on
 * failure - without ever risking deleting a volume that pre-existed on the
 * target.
 */
export const transferDockerVolume = async ({
	sourceServerId,
	sourceVolumeName,
	targetServerId,
	targetVolumeName,
	onTargetCreated,
}: {
	sourceServerId: string | null;
	sourceVolumeName: string;
	targetServerId: string | null;
	targetVolumeName: string;
	onTargetCreated?: () => void | Promise<void>;
}): Promise<void> => {
	const migrationToken = randomUUID();

	await runChannelCommand(
		sourceServerId,
		buildInspectVolumeCommand(sourceVolumeName),
		{ label: `verify source volume ${sourceVolumeName}` },
	);

	await runChannelCommand(
		targetServerId,
		buildCreateVolumeCommand(targetVolumeName, migrationToken),
		{ label: `create target volume ${targetVolumeName}` },
	);

	const storedToken = (
		await captureChannelCommandOutput(
			targetServerId,
			buildReadVolumeMigrationTokenCommand(targetVolumeName),
			{ label: `read migration token for target volume ${targetVolumeName}` },
		)
	).trim();

	if (storedToken !== migrationToken) {
		throw new Error(
			`Target Docker volume "${targetVolumeName}" already exists on the target server. Refusing to overwrite or merge into an existing volume - remove it first if this move should replace it.`,
		);
	}

	await onTargetCreated?.();

	const { source, destination } = await openCommandChannelPair({
		sourceServerId,
		sourceCommand: buildVolumeExportCommand(sourceVolumeName),
		targetServerId,
		targetCommand: buildVolumeImportCommand(targetVolumeName),
	});

	await pipeCommandChannels({
		source,
		destination,
		label: `transfer volume ${sourceVolumeName} -> ${targetVolumeName}`,
	});
};

/**
 * Streams a plain host directory's full contents from a source host to a
 * target host, creating the target directory as needed. Used for compose
 * project directories and file-mount directories (host filesystem paths
 * that Dokploy itself manages, not Docker volumes).
 *
 * Requires the target path to not already exist, for the same reason as
 * `transferDockerVolume` - see above. This is enforced atomically: the
 * parent directory is (harmlessly) ensured with `mkdir -p` first, then the
 * leaf itself is created with a plain `mkdir` (no `-p`), which fails with a
 * "File exists" error if the path is already there - a true create-or-fail
 * reservation, unlike a separate "does it exist?" check followed by a
 * separate "create it" call. `onTargetCreated` fires right after the leaf
 * is confirmed to have been newly created.
 */
export const transferDirectory = async ({
	sourceServerId,
	sourcePath,
	targetServerId,
	targetPath,
	onTargetCreated,
}: {
	sourceServerId: string | null;
	sourcePath: string;
	targetServerId: string | null;
	targetPath: string;
	onTargetCreated?: () => void | Promise<void>;
}): Promise<void> => {
	await runChannelCommand(
		targetServerId,
		buildEnsureParentDirectoryCommand(targetPath),
		{ label: `ensure parent directory for ${targetPath}` },
	);

	try {
		await runChannelCommand(
			targetServerId,
			buildCreateLeafDirectoryCommand(targetPath),
			{ label: `create target directory ${targetPath}` },
		);
	} catch (error) {
		if (isDirectoryAlreadyExistsError(error)) {
			throw new Error(
				`Target path "${targetPath}" already exists on the target server. Refusing to overwrite or merge into an existing directory - remove it first if this move should replace it.`,
			);
		}
		throw error;
	}

	await onTargetCreated?.();

	const { source, destination } = await openCommandChannelPair({
		sourceServerId,
		sourceCommand: buildDirectoryExportCommand(sourcePath),
		targetServerId,
		targetCommand: buildDirectoryImportCommand(targetPath),
	});

	await pipeCommandChannels({
		source,
		destination,
		label: `transfer directory ${sourcePath} -> ${targetPath}`,
	});
};
