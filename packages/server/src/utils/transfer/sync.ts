/**
 * Data sync utilities for transfer (READ-ONLY on source)
 */
import { findServerById } from "@dokploy/server/services/server";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
	buildRsyncSshTransport,
	buildSshExecCommand,
	createTemporaryPrivateKeyFile,
	getServerPrivateKey,
	shellEscape,
} from "../process/ssh";
import type {
	FileCompareResult,
	MergeStrategy,
	MountTransferConfig,
	TransferStatus,
} from "./types";

async function runTransferPipe(
	sourceServerId: string | null,
	targetServerId: string | null,
	sourceCommand: string,
	targetCommand: string,
): Promise<void> {
	if (sourceServerId && targetServerId) {
		// Remote -> Remote sync via Dokploy server stream
		const sourceServer = await findServerById(sourceServerId);
		const targetServer = await findServerById(targetServerId);
		const sourcePrivateKey = getServerPrivateKey(
			sourceServer.sshKey?.privateKey,
			"Source server",
		);
		const targetPrivateKey = getServerPrivateKey(
			targetServer.sshKey?.privateKey,
			"Target server",
		);
		const sourceKey = await createTemporaryPrivateKeyFile(sourcePrivateKey);
		const targetKey = await createTemporaryPrivateKeyFile(targetPrivateKey);

		try {
			const fullCommand = `${buildSshExecCommand(
				sourceServer,
				sourceKey.keyPath,
				sourceCommand,
			)} | ${buildSshExecCommand(targetServer, targetKey.keyPath, targetCommand)}`;
			await execAsync(fullCommand);
		} finally {
			await sourceKey.cleanup();
			await targetKey.cleanup();
		}
		return;
	}

	if (sourceServerId && !targetServerId) {
		// Remote -> Local
		const sourceServer = await findServerById(sourceServerId);
		const sourcePrivateKey = getServerPrivateKey(
			sourceServer.sshKey?.privateKey,
			"Source server",
		);
		const sourceKey = await createTemporaryPrivateKeyFile(sourcePrivateKey);

		try {
			const fullCommand = `${buildSshExecCommand(
				sourceServer,
				sourceKey.keyPath,
				sourceCommand,
			)} | ${targetCommand}`;
			await execAsync(fullCommand);
		} finally {
			await sourceKey.cleanup();
		}
		return;
	}

	if (!sourceServerId && targetServerId) {
		// Local -> Remote
		const targetServer = await findServerById(targetServerId);
		const targetPrivateKey = getServerPrivateKey(
			targetServer.sshKey?.privateKey,
			"Target server",
		);
		const targetKey = await createTemporaryPrivateKeyFile(targetPrivateKey);

		try {
			const pipedCommand = `${sourceCommand} | ${buildSshExecCommand(
				targetServer,
				targetKey.keyPath,
				targetCommand,
			)}`;
			await execAsync(pipedCommand);
		} finally {
			await targetKey.cleanup();
		}
		return;
	}

	// Local -> Local
	await execAsync(`${sourceCommand} | ${targetCommand}`);
}

/**
 * Build a scoped key for manual conflict decisions.
 */
export function buildDecisionKey(scope: string, filePath: string): string {
	return `${scope}:${filePath}`;
}

/**
 * Determine if a file should be synced based on merge strategy
 */
export function shouldSyncFile(
	file: FileCompareResult,
	strategy: MergeStrategy,
	manualDecisions?: Record<string, "skip" | "overwrite">,
	decisionScope?: string,
): boolean {
	// Directories are created implicitly by tar/rsync when syncing files.
	// Treat them as non-syncable to avoid false conflict handling on directory mtimes.
	if (file.isDirectory) {
		return false;
	}

	// Check manual decision first
	if (manualDecisions) {
		const scopedKey =
			decisionScope && buildDecisionKey(decisionScope, file.path);
		const manualDecision =
			(file.decisionKey && manualDecisions[file.decisionKey]) ||
			(scopedKey ? manualDecisions[scopedKey] : undefined) ||
			manualDecisions[file.path];
		if (manualDecision) {
			return manualDecision === "overwrite";
		}
	}

	switch (file.status) {
		case "match":
			return false; // Already identical

		case "missing_target":
			return true; // Always copy missing files

		case "missing_source":
			return false; // Never touch files only on target

		case "newer_source":
			return strategy !== "skip";

		case "newer_target":
			return strategy === "overwrite";

		case "conflict":
			return strategy === "overwrite" || strategy === "newer";

		default:
			return false;
	}
}

/**
 * Sync a single file from source to target (volume)
 */
export async function syncVolumeFile(
	sourceServerId: string | null,
	targetServerId: string | null,
	sourceVolume: string,
	targetVolume: string,
	filePath: string,
	emit?: (log: string) => void,
): Promise<void> {
	emit?.(`Syncing ${filePath}...`);

	// Use docker to stream a compressed tar archive through SSH/local shell.
	// SOURCE: docker run -v vol:/data alpine tar czf - file
	// TARGET: docker run -i -v vol:/data alpine tar xzf -
	const sourceCommand = `docker run --rm -v ${shellEscape(
		`${sourceVolume}:/volume_data:ro`,
	)} alpine tar czf - -C /volume_data ${shellEscape(`.${filePath}`)}`;
	const targetCommand = `docker run --rm -i -v ${shellEscape(
		`${targetVolume}:/volume_data`,
	)} alpine tar xzf - -C /volume_data`;

	await runTransferPipe(
		sourceServerId,
		targetServerId,
		sourceCommand,
		targetCommand,
	);
}

/**
 * Sync many files from a source volume to a target volume in a single tar stream.
 * This is significantly faster than syncing file-by-file for large volumes.
 */
export async function syncVolumeFilesBatch(
	sourceServerId: string | null,
	targetServerId: string | null,
	sourceVolume: string,
	targetVolume: string,
	filePaths: string[],
): Promise<void> {
	if (filePaths.length === 0) return;

	const relativePaths = filePaths.map((filePath) => `.${filePath}`);
	const encodedFileList = Buffer.from(relativePaths.join("\n"), "utf8").toString(
		"base64",
	);

	const sourceCommand = `docker run --rm -v ${shellEscape(
		`${sourceVolume}:/volume_data:ro`,
	)} alpine sh -c ${shellEscape(
		`echo ${shellEscape(encodedFileList)} | base64 -d > /tmp/files.txt && tar czf - -C /volume_data -T /tmp/files.txt`,
	)}`;
	const targetCommand = `docker run --rm -i -v ${shellEscape(
		`${targetVolume}:/volume_data`,
	)} alpine tar xzf - -C /volume_data`;

	await runTransferPipe(
		sourceServerId,
		targetServerId,
		sourceCommand,
		targetCommand,
	);
}

/**
 * Sync a whole volume using a single compressed tar stream.
 */
export async function syncVolumeArchive(
	sourceServerId: string | null,
	targetServerId: string | null,
	sourceVolume: string,
	targetVolume: string,
): Promise<void> {
	const sourceCommand = `docker run --rm -v ${shellEscape(
		`${sourceVolume}:/volume_data:ro`,
	)} alpine tar czf - -C /volume_data .`;
	const targetCommand = `docker run --rm -i -v ${shellEscape(
		`${targetVolume}:/volume_data`,
	)} alpine tar xzf - -C /volume_data`;

	await runTransferPipe(
		sourceServerId,
		targetServerId,
		sourceCommand,
		targetCommand,
	);
}

/**
 * Sync a single file from source to target (bind mount)
 */
export async function syncBindFile(
	sourceServerId: string | null,
	targetServerId: string | null,
	sourcePath: string,
	targetPath: string,
	filePath: string,
	emit?: (log: string) => void,
): Promise<void> {
	emit?.(`Syncing ${filePath}...`);

	const sourceFullPath = `${sourcePath}${filePath}`;
	const targetFullPath = `${targetPath}${filePath}`;

	// Ensure target directory exists
	const targetDir =
		targetFullPath.substring(0, targetFullPath.lastIndexOf("/")) || "/";
	if (targetServerId) {
		await execAsyncRemote(targetServerId, `mkdir -p ${shellEscape(targetDir)}`);
	} else {
		await execAsync(`mkdir -p ${shellEscape(targetDir)}`);
	}

	if (sourceServerId && targetServerId) {
		// Remote -> Remote bind sync via Dokploy server stream
		const sourceServer = await findServerById(sourceServerId);
		const targetServer = await findServerById(targetServerId);
		const sourcePrivateKey = getServerPrivateKey(
			sourceServer.sshKey?.privateKey,
			"Source server",
		);
		const targetPrivateKey = getServerPrivateKey(
			targetServer.sshKey?.privateKey,
			"Target server",
		);
		const sourceKey = await createTemporaryPrivateKeyFile(sourcePrivateKey);
		const targetKey = await createTemporaryPrivateKeyFile(targetPrivateKey);

		try {
			const sourceCommand = `tar cf - -C ${shellEscape(sourcePath)} ${shellEscape(
				`.${filePath}`,
			)}`;
			const targetCommand = `mkdir -p ${shellEscape(
				targetDir,
			)} && tar xf - -C ${shellEscape(targetPath)}`;
			const pipedCommand = `${buildSshExecCommand(
				sourceServer,
				sourceKey.keyPath,
				sourceCommand,
			)} | ${buildSshExecCommand(targetServer, targetKey.keyPath, targetCommand)}`;
			await execAsync(pipedCommand);
		} finally {
			await sourceKey.cleanup();
			await targetKey.cleanup();
		}
		return;
	}

	if (sourceServerId && !targetServerId) {
		// Remote -> Local
		const sourceServer = await findServerById(sourceServerId);
		const sourcePrivateKey = getServerPrivateKey(
			sourceServer.sshKey?.privateKey,
			"Source server",
		);
		const sourceKey = await createTemporaryPrivateKeyFile(sourcePrivateKey);

		try {
			const sourceCommand = `tar cf - -C ${shellEscape(sourcePath)} ${shellEscape(
				`.${filePath}`,
			)}`;
			const targetCommand = `mkdir -p ${shellEscape(
				targetDir,
			)} && tar xf - -C ${shellEscape(targetPath)}`;
			const pipedCommand = `${buildSshExecCommand(
				sourceServer,
				sourceKey.keyPath,
				sourceCommand,
			)} | ${targetCommand}`;
			await execAsync(pipedCommand);
		} finally {
			await sourceKey.cleanup();
		}
		return;
	}

	if (!sourceServerId && targetServerId) {
		// Local -> Remote via rsync
		const targetServer = await findServerById(targetServerId);
		const targetPrivateKey = getServerPrivateKey(
			targetServer.sshKey?.privateKey,
			"Target server",
		);
		const targetKey = await createTemporaryPrivateKeyFile(targetPrivateKey);
		const rsyncSshTransport = buildRsyncSshTransport(
			targetServer.port,
			targetKey.keyPath,
		);
		try {
			// Keep source mtimes on target because scan/compare relies on mtime semantics.
			const rsyncCommand = `rsync -az --times -e ${shellEscape(
				rsyncSshTransport,
			)} ${shellEscape(sourceFullPath)} ${shellEscape(
				`${targetServer.username}@${targetServer.ipAddress}:${targetFullPath}`,
			)}`;
			await execAsync(rsyncCommand);
		} finally {
			await targetKey.cleanup();
		}
		return;
	}

	// Local -> Local
	await execAsync(
		`rsync -az --times ${shellEscape(sourceFullPath)} ${shellEscape(targetFullPath)}`,
	);
}

/**
 * Sync all files for a mount with progress updates
 */
export async function syncMount(
	mount: MountTransferConfig,
	files: FileCompareResult[],
	sourceServerId: string | null,
	targetServerId: string | null,
	strategy: MergeStrategy,
	manualDecisions: Record<string, "skip" | "overwrite"> | undefined,
	signal: AbortSignal,
	emit: (status: Partial<TransferStatus>) => void,
	waitForResume?: () => Promise<void>,
): Promise<{ success: boolean; errors: string[] }> {
	const filesToSync = files.filter((f) =>
		shouldSyncFile(f, strategy, manualDecisions, mount.mountId),
	);

	const errors: string[] = [];
	let processedFiles = 0;
	let transferredBytes = 0;

	emit({
		state: "syncing",
		totalFiles: filesToSync.length,
		processedFiles: 0,
		totalBytes: filesToSync.reduce((sum, f) => sum + f.size, 0),
		transferredBytes: 0,
	});

	if (mount.mountType === "volume") {
		const directoryCount = filesToSync.filter((file) => file.isDirectory).length;
		if (directoryCount > 0) {
			processedFiles += directoryCount;
			emit({ processedFiles });
		}

		const filesToCopy = filesToSync.filter((file) => !file.isDirectory);
		const batchSize = 500;
		for (let i = 0; i < filesToCopy.length; i += batchSize) {
			if (waitForResume) {
				await waitForResume();
			}

			if (signal.aborted) {
				emit({ state: "cancelled" });
				return { success: false, errors: ["Transfer cancelled by user"] };
			}

			const batch = filesToCopy.slice(i, i + batchSize);
			const batchPaths = batch.map((file) => file.path);
			const batchBytes = batch.reduce((sum, file) => sum + file.size, 0);

			try {
				emit({ currentFile: batch[0]?.path });
				await syncVolumeFilesBatch(
					sourceServerId,
					targetServerId,
					mount.sourcePath,
					mount.targetPath,
					batchPaths,
				);

				transferredBytes += batchBytes;
				processedFiles += batch.length;
				emit({
					processedFiles,
					transferredBytes,
				});
			} catch (error) {
				// Batch mode is an optimization, so we gracefully fall back to per-file sync.
				for (const file of batch) {
					if (waitForResume) {
						await waitForResume();
					}

					if (signal.aborted) {
						emit({ state: "cancelled" });
						return { success: false, errors: ["Transfer cancelled by user"] };
					}

					try {
						emit({ currentFile: file.path });
						await syncVolumeFile(
							sourceServerId,
							targetServerId,
							mount.sourcePath,
							mount.targetPath,
							file.path,
						);

						transferredBytes += file.size;
						processedFiles++;

						emit({
							processedFiles,
							transferredBytes,
						});
					} catch (fileError) {
						const errorMsg = `Failed to sync ${file.path}: ${
							fileError instanceof Error ? fileError.message : "Unknown error"
						}`;
						errors.push(errorMsg);
					}
				}

				if (error instanceof Error) {
					console.warn(
						`Volume batch sync failed for ${mount.sourcePath}, falling back to per-file mode: ${error.message}`,
					);
				}
			}
		}

		emit({
			state: errors.length > 0 ? "error" : "completed",
			processedFiles,
			transferredBytes,
			errors,
		});

		return {
			success: errors.length === 0,
			errors,
		};
	}

	for (const file of filesToSync) {
		if (waitForResume) {
			await waitForResume();
		}

		if (signal.aborted) {
			emit({ state: "cancelled" });
			return { success: false, errors: ["Transfer cancelled by user"] };
		}

		// Skip directories (they're created automatically)
		if (file.isDirectory) {
			processedFiles++;
			continue;
		}

		try {
			emit({ currentFile: file.path });

			await syncBindFile(
				sourceServerId,
				targetServerId,
				mount.sourcePath,
				mount.targetPath,
				file.path,
			);

			transferredBytes += file.size;
			processedFiles++;

			emit({
				processedFiles,
				transferredBytes,
			});
		} catch (error) {
			const errorMsg = `Failed to sync ${file.path}: ${error instanceof Error ? error.message : "Unknown error"}`;
			errors.push(errorMsg);
		}
	}

	emit({
		state: errors.length > 0 ? "error" : "completed",
		processedFiles,
		transferredBytes,
		errors,
	});

	return {
		success: errors.length === 0,
		errors,
	};
}
