import { exec } from 'child_process';
import util from 'util';
import { BackupDestination, getUploadCommand } from './destination';

const execAsync = util.promisify(exec);

/**
 * Upload a backup to the specified destination.
 *
 * This function abstracts the actual upload mechanism.  It resolves when
 * the underlying command finishes successfully, otherwise it rejects with
 * the error output.
 *
 * @param destination Destination configuration
 * @param sourcePath  Path to the backup (file or directory) to upload
 */
export async function uploadBackup(
	destination: BackupDestination,
	sourcePath: string,
): Promise<void> {
	const command = getUploadCommand(destination, sourcePath);
	try {
		const { stdout, stderr } = await execAsync(command);
		if (stdout) {
			console.log(`[backup] ${destination.name} stdout:`, stdout);
		}
		if (stderr) {
			console.warn(`[backup] ${destination.name} stderr:`, stderr);
		}
	} catch (err: any) {
		// Preserve stack trace while adding context
		const message = `Failed to upload backup to destination "${destination.name}" using command "${command}": ${err.message}`;
		const error = new Error(message);
		(error as any).code = err.code;
		(error as any).stdout = err.stdout;
		(error as any).stderr = err.stderr;
		throw error;
	}
}
