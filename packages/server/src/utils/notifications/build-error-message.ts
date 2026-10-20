import { quote } from "shell-quote";
import { ExecError } from "../process/ExecError";
import { execAsync, execAsyncRemote } from "../process/execAsync";

const LOG_TAIL_LINES = 30;
const FALLBACK_MESSAGE = "Error building";

// The last lines of a build log, as shown in a build-failure notification.
export const formatBuildLogTail = (log: string, maxLines = LOG_TAIL_LINES) =>
	log.trim().split("\n").slice(-maxLines).join("\n").trim();

// Text for a build-failure notification. A failed build command reports the
// whole build script as its message (including SSH keys written for git
// clones), while its output went to the deployment log, so read that instead.
export const getBuildErrorMessage = async (
	error: unknown,
	logPath: string,
	serverId?: string | null,
): Promise<string> => {
	if (!(error instanceof ExecError)) {
		return (error instanceof Error && error.message) || FALLBACK_MESSAGE;
	}

	try {
		const command = `tail -n ${LOG_TAIL_LINES} ${quote([logPath])}`;
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);
		return formatBuildLogTail(stdout) || FALLBACK_MESSAGE;
	} catch {
		return FALLBACK_MESSAGE;
	}
};
