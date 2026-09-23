/**
 * Backup destination utilities.
 *
 * This module defines the supported destination types and provides helpers
 * to generate the appropriate command line for a backup operation.
 *
 * The current implementation supports:
 *  - Local filesystem paths
 *  - Rclone remote destinations (any remote supported by rclone)
 *
 * Adding a new destination type only requires extending the `DestinationType`
 * enum and implementing the `getBackupCommand` logic for the new type.
 */

export enum DestinationType {
	/** Store backups on the local filesystem of the Dokploy host */
	LOCAL = 'local',
	/** Use rclone to copy backups to any remote supported by rclone */
	RCLONE = 'rclone',
}

/**
 * Configuration required for a local destination.
 */
export interface LocalDestinationConfig {
	/** Absolute path on the host where backups should be stored */
	path: string;
}

/**
 * Configuration required for an rclone destination.
 *
 * The `remote` field must be a valid rclone remote name (as defined in the
 * rclone config file) optionally followed by a path, e.g. `gdrive:backups`.
 */
export interface RcloneDestinationConfig {
	/** The rclone remote identifier (e.g. `gdrive:backups`) */
	remote: string;
	/** Optional additional flags for the rclone command */
	flags?: string[];
}

/**
 * Union type for all supported destination configurations.
 */
export type DestinationConfig = LocalDestinationConfig | RcloneDestinationConfig;

/**
 * Represents a backup destination.
 */
export interface BackupDestination {
	/** Unique identifier (uuid) */
	id: string;
	/** Human‑readable name */
	name: string;
	/** Destination type */
	type: DestinationType;
	/** Configuration specific to the chosen type */
	config: DestinationConfig;
}

/**
 * Generate a shell command that copies the given `sourcePath` to the provided
 * `destination`. The command is returned as a string and can be executed via
 * `child_process.exec` or similar.
 *
 * @param destination The destination where the backup should be stored.
 * @param sourcePath  Absolute path of the backup data to be uploaded.
 * @returns           A shell command string.
 *
 * @throws If the destination type is unknown or the configuration is invalid.
 */
export function getBackupCommand(
	destination: BackupDestination,
	sourcePath: string,
): string {
	if (!sourcePath) {
		throw new Error('sourcePath must be a non‑empty string');
	}

	switch (destination.type) {
		case DestinationType.LOCAL: {
			const cfg = destination.config as LocalDestinationConfig;
			if (!cfg.path) {
				throw new Error('Local destination requires a path');
			}
			// Ensure the target directory exists and copy recursively.
			// Using `mkdir -p` makes the operation idempotent.
			return `mkdir -p "${cfg.path}" && cp -a "${sourcePath}/." "${cfg.path}/"`;
		}
		case DestinationType.RCLONE: {
			const cfg = destination.config as RcloneDestinationConfig;
			if (!cfg.remote) {
				throw new Error('Rclone destination requires a remote');
			}
			const flags = cfg.flags?.length ? cfg.flags.join(' ') + ' ' : '';
			// rclone copy preserves timestamps and permissions by default.
			return `rclone copy ${flags}"${sourcePath}" "${cfg.remote}"`;
		}
		default:
			// Exhaustiveness check – if a new enum value is added without
			// handling it here, TypeScript will raise an error.
			const _exhaustiveCheck: never = destination.type;
			throw new Error(`Unsupported destination type: ${_exhaustiveCheck}`);
	}
}
