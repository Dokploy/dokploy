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
	deploymentId: string,
): Promise<string> => {
	if (
		!application.testExecEnabled ||
		application.testExecSource === "generated" ||
		!application.testCommand
	) {
		return "";
	}

	const imageName = await getImageName(application);
	const encodedCommand = encodeBase64(application.testCommand);
	// `|| __TEST_EXIT=$?` keeps the enclosing `set -e` from aborting before the
	// marker line is written; the exit is re-raised below only when the policy
	// says tests must block the deploy.
	const runTests = `__TEST_EXIT=0; docker run --rm ${imageName} sh -c "$(echo ${encodedCommand} | base64 -d)" || __TEST_EXIT=$?`;
	const abortOnFailure =
		application.testExecFailurePolicy === "closed"
			? "if [ $__TEST_EXIT -ne 0 ]; then exit $__TEST_EXIT; fi;"
			: "";

	return `echo "== Tests ==" ; ${runTests}; echo "${TEST_EXIT_MARKER}:${deploymentId}:$__TEST_EXIT"; ${abortOnFailure}`;
};

// The deployment id is part of the marker so a line printed by the tests
// themselves can't be mistaken for the real exit code.
const parseTestExecExitCode = (
	log: string,
	deploymentId: string,
): number | null => {
	const match = log.match(
		new RegExp(`${TEST_EXIT_MARKER}:${deploymentId}:(-?\\d+)`),
	);
	return match?.[1] ? Number(match[1]) : null;
};

// Reads the marker line back out of the deployment log (local or remote
// server) to know whether the test-exec step ran and what it exited with.
export const readTestExecExitCode = async (
	logPath: string,
	deploymentId: string,
	serverId?: string | null,
): Promise<number | null> => {
	const command = `grep -o '${TEST_EXIT_MARKER}:${deploymentId}:[-0-9]*' ${logPath} | tail -n1`;
	try {
		const result = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);
		return parseTestExecExitCode(result.stdout, deploymentId);
	} catch {
		return null;
	}
};
