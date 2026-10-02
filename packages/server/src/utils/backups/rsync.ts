import { ExecError } from "../process/ExecError";
import { execAsync } from "../process/execAsync";

/**
 * rsync exits with 24 when a file disappeared between building the file list and
 * transferring it ("some files vanished before they could be transferred").
 * Everything else was copied, so it is a warning rather than a failure.
 * --ignore-errors does not cover it, it only applies to errors reported while
 * deleting.
 */
export const RSYNC_VANISHED_EXIT_CODE = 24;

const MAX_LOGGED_VANISHED_PATHS = 10;

const isVanishedFilesWarning = (error: unknown): error is ExecError =>
	error instanceof ExecError && error.exitCode === RSYNC_VANISHED_EXIT_CODE;

const extractVanishedPaths = (stderr?: string) =>
	(stderr ?? "")
		.split("\n")
		.map((line) => line.match(/file has vanished: "(.+)"/)?.[1])
		.filter((path): path is string => path !== undefined);

const describeVanishedPaths = (error: ExecError) => {
	const paths = extractVanishedPaths(error.stderr);
	if (paths.length === 0) {
		return "";
	}
	const listed = paths.slice(0, MAX_LOGGED_VANISHED_PATHS);
	const remaining = paths.length - listed.length;
	const lines = listed.map((path) => `  ${path}`);
	if (remaining > 0) {
		lines.push(`  ...and ${remaining} more`);
	}
	return `${lines.join("\n")}\n`;
};

/**
 * Runs an rsync command, retrying it once when rsync reports vanished files.
 *
 * The retry is an incremental pass over an almost complete copy, so it is cheap
 * and it picks up anything that was rewritten while the first pass ran. Vanished
 * files on the retry as well mean the source tree keeps churning - typically a
 * live database directory inside the copied path, e.g. a Postgres checkpoint
 * purging pg_logical/snapshots/*.snap - and those transient omissions are not
 * worth failing the whole backup for. Each pass logs the first
 * MAX_LOGGED_VANISHED_PATHS vanished paths plus a count of the rest, so the
 * omissions stay visible without flooding the deployment log.
 */
export const runRsyncWithVanishedRetry = async (
	command: string,
	log: (message: string) => void,
) => {
	try {
		await execAsync(command);
		return;
	} catch (error) {
		if (!isVanishedFilesWarning(error)) {
			throw error;
		}
		log(
			`Some files vanished while copying (rsync exit ${RSYNC_VANISHED_EXIT_CODE}):\n${describeVanishedPaths(
				error,
			)}Retrying the copy once\n`,
		);
	}

	try {
		await execAsync(command);
	} catch (error) {
		if (!isVanishedFilesWarning(error)) {
			throw error;
		}
		log(
			`Files vanished on the retry as well, continuing without them:\n${describeVanishedPaths(
				error,
			)}`,
		);
	}
};
