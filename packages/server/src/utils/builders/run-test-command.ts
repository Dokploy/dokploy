import { encodeBase64 } from "@dokploy/server/utils/docker/utils";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import type { ApplicationNested } from "./index";
import { getImageName } from "./index";

export const TEST_EXIT_MARKER = "QC_TEST_EXIT_CODE";

// Appends to the same shell script that clones+builds the app, so its
// output lands in the existing deployment log via the caller's redirection.
// Runs the app's own test command inside the image just built (Option 1:
// reuses Docker, no separate CI engine) and records the exit code via a
// marker line so it can be parsed back out of the log afterwards.
export const getTestExecCommand = async (
	application: ApplicationNested,
): Promise<string> => {
	if (!application.testExecEnabled || !application.testCommand) {
		return "";
	}

	const imageName = await getImageName(application);
	const encodedCommand = encodeBase64(application.testCommand);
	const runTests = `docker run --rm ${imageName} sh -c "$(echo ${encodedCommand} | base64 -d)"`;
	// Capture the exit code explicitly instead of letting `set -e` abort
	// immediately, so the marker line always gets written before we decide
	// (based on testExecFailurePolicy) whether to actually fail the build.
	const abortOnFailure =
		application.testExecFailurePolicy === "closed"
			? "if [ $__TEST_EXIT -ne 0 ]; then exit $__TEST_EXIT; fi;"
			: "";

	return `echo "== Tests ==" ; ${runTests}; __TEST_EXIT=$?; echo "${TEST_EXIT_MARKER}:$__TEST_EXIT"; ${abortOnFailure}`;
};

const parseTestExecExitCode = (log: string): number | null => {
	const match = log.match(new RegExp(`${TEST_EXIT_MARKER}:(-?\\d+)`));
	return match?.[1] ? Number(match[1]) : null;
};

// Reads the marker line back out of the deployment log (local or remote
// server) to know whether the test-exec step ran and what it exited with.
export const readTestExecExitCode = async (
	logPath: string,
	serverId?: string | null,
): Promise<number | null> => {
	const command = `grep -o '${TEST_EXIT_MARKER}:[-0-9]*' ${logPath} | tail -n1`;
	try {
		const result = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);
		return parseTestExecExitCode(result.stdout);
	} catch {
		return null;
	}
};
