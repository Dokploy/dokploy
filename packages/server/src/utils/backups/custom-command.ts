import type { Compose } from "@dokploy/server/services/compose";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
	type ComposeBackupInput,
	getCustomBackupCommand,
} from "./compose-command";
import { redactBackupError } from "./redact";
import { getComposeContainerCommand } from "./utils";

/** A save always runs this again, so a stale browser test cannot authorize a change. */
export const testCustomBackup = async (
	compose: Compose,
	backup: ComposeBackupInput,
) => {
	const script = `set -eo pipefail;
CONTAINER_ID=$(${getComposeContainerCommand(compose.appName, backup.serviceName ?? "", compose.composeType)});
if [ -z "$CONTAINER_ID" ]; then echo 'The selected service must be running before testing a backup' >&2; exit 1; fi;
${getCustomBackupCommand(backup, 300)} | wc -c`;
	try {
		const result = compose.serverId
			? await execAsyncRemote(compose.serverId, script)
			: await execAsync(script, { shell: "/bin/bash" });
		const bytes = Number(result.stdout.trim());
		if (!Number.isFinite(bytes) || bytes <= 0)
			throw new Error("The command produced no backup data");
		return { bytes };
	} catch (error) {
		// Never forward an exec Error.message: it includes the entire command.
		const stderr =
			error &&
			typeof error === "object" &&
			"stderr" in error &&
			typeof error.stderr === "string"
				? error.stderr
				: "";
		throw new Error(
			`Backup test failed. No configuration was saved. Check the selected service, database credentials and command. ${redactBackupError(stderr, backup)}`.trim(),
		);
	}
};
