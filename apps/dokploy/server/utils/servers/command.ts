import { execAsyncRemote } from "../process/execAsync";

export const executeCommand = async (serverId: string, command: string) => {
	try {
		await execAsyncRemote(serverId, command);
	} catch (err) {
		console.error("Execution error:", err);
		throw err;
	}
};
