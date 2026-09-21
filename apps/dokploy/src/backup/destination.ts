/**
 * Backup destination handling.
 *
 * This module defines the supported destination types and provides a
 * utility to generate the appropriate upload command for a given
 * destination.  At the moment we support:
 *
 * - `local`   – simple copy to a local directory.
 * - `rclone`  – use the `rclone` binary to copy to any remote supported
 *               by rclone (FTP, SFTP, Google Drive, OneDrive, etc.).
 *
 * Adding a new destination type only requires extending the
 * `DestinationType` enum and implementing the command generation logic
 * in `getUploadCommand`.
 */

export type DestinationType = 'local' | 'rclone';

/**
 * Configuration for a backup destination.
 *
 * The shape of `config` depends on the `type`:
 *
 * - `local`   – `{ path: string }`
 * - `rclone`  – `{ remote: string; remotePath: string; flags?: string[] }`
 */
export interface BackupDestination {
	/** Unique identifier (e.g. UUID) */
	id: string;
	/** Human‑readable name */
	name: string;
	/** Destination type */
	type: DestinationType;
	/** Type‑specific configuration */
	config: Record<string, unknown>;
}

/**
 * Generate a shell command that uploads `sourcePath` to the given destination.
 *
 * The command is returned as a string that can be executed via `exec` or
 * `spawn`.  Errors from the command are not handled here – callers should
 * capture the exit code / stderr.
 *
 * @param destination Destination definition
 * @param sourcePath  Absolute path of the backup file/folder to upload
 * @returns           Shell command string
 */
export function getUploadCommand(
	destination: BackupDestination,
	sourcePath: string,
): string {
	switch (destination.type) {
		case 'local': {
			const cfg = destination.config as { path: string };
			if (!cfg.path) {
				throw new Error('Local destination requires a "path" config property.');
			}
			// Ensure trailing slash for rsync‑style copy
			const target = cfg.path.endsWith('/') ? cfg.path : `${cfg.path}/`;
			// Use `cp -a` to preserve attributes; fallback to `rsync` if available
			return `cp -a "${sourcePath}" "${target}"`;
		}
		case 'rclone': {
			const cfg = destination.config as {
				remote: string;
				remotePath: string;
				flags?: string[];
			};
			if (!cfg.remote || !cfg.remotePath) {
				throw new Error(
					'Rclone destination requires "remote" and "remotePath" config properties.',
				);
			}
			const flags = cfg.flags?.join(' ') ?? '';
			// Example: rclone copy /path/to/backup remote:folder --progress
			return `rclone copy "${sourcePath}" "${cfg.remote}:${cfg.remotePath}" ${flags}`.trim();
		}
		default:
			// Exhaustiveness check – if a new type is added without handling,
			// TypeScript will raise an error.
			const _exhaustiveCheck: never = destination.type;
			throw new Error(`Unsupported destination type: ${_exhaustiveCheck}`);
	}
}
