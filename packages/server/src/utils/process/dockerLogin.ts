import {
	getSafeRegistryLoginCommand,
	type RegistryLoginData,
} from "@dokploy/server/db/schema";
import { execAsync, execAsyncRemote } from "./execAsync";

/**
 * Logs Docker into a registry on `serverId`, or on this host without one.
 * The password travels on the command's stdin: it must never be part of a
 * command line, which every user on the host can read through `ps`.
 */
export const runDockerLogin = async (
	data: RegistryLoginData,
	serverId?: string | null,
): Promise<void> => {
	const { command, stdin } = getSafeRegistryLoginCommand(data);
	if (serverId) {
		await execAsyncRemote(serverId, command, undefined, { stdin });
	} else {
		await execAsync(command, { stdin });
	}
};
