import path from "node:path";
import { quote } from "shell-quote";

/**
 * Docker volume names and Docker itself are strict about which characters
 * are allowed (`[a-zA-Z0-9][a-zA-Z0-9_.-]*`). Rejecting anything else here -
 * even though `quote()` would also neutralize shell metacharacters - gives a
 * clear, early error instead of silently shell-escaping a suspicious value.
 */
const DOCKER_VOLUME_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export const assertSafeDockerVolumeName = (volumeName: string): void => {
	if (!volumeName || !DOCKER_VOLUME_NAME_REGEX.test(volumeName)) {
		throw new Error(`Unsafe or invalid Docker volume name: "${volumeName}"`);
	}
};

/** The image used to run the throwaway tar containers for volume transfers. */
const TAR_IMAGE = "busybox";

/**
 * Builds the command that creates a tar stream of a Docker volume's
 * contents on stdout. Meant to be piped directly into
 * `buildVolumeImportCommand`'s stdin (locally or over SSH) - never written to
 * a temp file or buffered in memory.
 */
export const buildVolumeExportCommand = (volumeName: string): string => {
	assertSafeDockerVolumeName(volumeName);
	return `docker run --rm -i -v ${quote([`${volumeName}:/from:ro`])} ${TAR_IMAGE} tar -cf - -C /from .`;
};

export const buildInspectVolumeCommand = (volumeName: string): string => {
	assertSafeDockerVolumeName(volumeName);
	return `docker volume inspect ${quote([volumeName])}`;
};

/** Builds the command that extracts a tar stream (read from stdin) into a Docker volume. */
export const buildVolumeImportCommand = (volumeName: string): string => {
	assertSafeDockerVolumeName(volumeName);
	return `docker run --rm -i -v ${quote([`${volumeName}:/to`])} ${TAR_IMAGE} tar -xf - -C /to`;
};

/**
 * Migration tokens are generated internally (see `transfer.ts`, via
 * `randomUUID()`), never taken from user input, but are still validated
 * before being embedded in a shell command as defense in depth.
 */
const MIGRATION_TOKEN_REGEX = /^[a-zA-Z0-9-]+$/;

export const assertSafeMigrationToken = (token: string): void => {
	if (!token || !MIGRATION_TOKEN_REGEX.test(token)) {
		throw new Error(`Unsafe or invalid migration token: "${token}"`);
	}
};

/**
 * The label written on the target volume by `buildCreateVolumeCommand`, and
 * read back by `buildReadVolumeMigrationTokenCommand` to atomically confirm
 * ownership - see the doc comment on `buildCreateVolumeCommand` for why this
 * pair is what actually closes the "does the target already exist" race.
 */
const MIGRATION_TOKEN_LABEL_KEY = "dokploy.migration.token";

/**
 * Builds the command that creates a Docker volume tagged with a unique
 * per-transfer `migrationToken` label.
 *
 * `docker volume create` is idempotent: if a volume with this name already
 * exists, the command still exits 0 but does NOT touch that volume's
 * existing labels. That is exactly what makes the following two-step
 * sequence a race-free replacement for a separate "does it exist?" check
 * followed by a separate "create it" call (which has a TOCTOU window
 * another process/move could land in between):
 *   1. Run this command with a fresh, unique `migrationToken`.
 *   2. Read the label back with `buildReadVolumeMigrationTokenCommand`.
 * Only if the label read back matches the token THIS call just wrote can
 * the caller be sure it (and not something/someone else) owns the volume -
 * see `transfer.ts`'s `transferDockerVolume`.
 */
export const buildCreateVolumeCommand = (
	volumeName: string,
	migrationToken: string,
): string => {
	assertSafeDockerVolumeName(volumeName);
	assertSafeMigrationToken(migrationToken);
	return `docker volume create --label ${quote([`${MIGRATION_TOKEN_LABEL_KEY}=${migrationToken}`])} ${quote([volumeName])}`;
};

/**
 * Builds the command that prints the migration-token label actually stored
 * on a volume (empty if the volume has no such label - e.g. it pre-existed
 * this move). See `buildCreateVolumeCommand` for how this pair together
 * atomically detects a pre-existing target volume.
 */
export const buildReadVolumeMigrationTokenCommand = (
	volumeName: string,
): string => {
	assertSafeDockerVolumeName(volumeName);
	return `docker volume inspect ${quote([volumeName])} --format ${quote([`{{index .Labels "${MIGRATION_TOKEN_LABEL_KEY}"}}`])}`;
};

/**
 * Builds the command that creates a tar stream of a directory's contents on
 * stdout (used for compose project directories and file-mount directories -
 * plain host paths, not Docker volumes).
 */
export const buildDirectoryExportCommand = (directoryPath: string): string => {
	return `tar -cf - -C ${quote([directoryPath])} .`;
};

/**
 * Builds the command that ensures a directory's PARENT exists, without
 * touching the leaf path itself. Always safe to run first - creating an
 * already-existing parent tree is a no-op - since the leaf's atomic
 * creation is handled separately by `buildCreateLeafDirectoryCommand`.
 */
export const buildEnsureParentDirectoryCommand = (
	directoryPath: string,
): string => {
	return `mkdir -p ${quote([path.dirname(directoryPath)])}`;
};

/**
 * Builds the command that atomically creates the LEAF directory: no `-p`,
 * so `mkdir` fails with a non-zero exit (and a "File exists" stderr) if the
 * path is already there. This is a true create-or-fail reservation, unlike
 * a separate "does it exist?" check followed by a separate "create it"
 * call, which leaves a TOCTOU window another process/move could land in
 * between. Callers must run `buildEnsureParentDirectoryCommand` first so
 * only the leaf itself - the thing actually being reserved - can fail on
 * collision.
 */
export const buildCreateLeafDirectoryCommand = (
	directoryPath: string,
): string => {
	return `mkdir ${quote([directoryPath])}`;
};

/** Builds the command that extracts a tar stream (read from stdin) into an (already created) directory. */
export const buildDirectoryImportCommand = (directoryPath: string): string => {
	return `tar -xf - -C ${quote([directoryPath])}`;
};
