import { execAsync, execAsyncRemote } from "./execAsync";

export const killProcessWithFallback = async (
	pid: number | string | null | undefined,
	serverId?: string | null,
) => {
	if (pid) {
		try {
			const command = `kill -9 ${pid}`;
			if (serverId) {
				await execAsyncRemote(serverId, command);
			} else {
				await execAsync(command);
			}
		} catch (error) {
			console.warn(
				`kill ${pid} failed (process likely already exited):`,
				error,
			);
		}
	} else {
		try {
			const command = `pkill -2 -f "docker build"`;
			if (serverId) {
				await execAsyncRemote(serverId, command);
			} else {
				await execAsync(command);
			}
		} catch (error) {
			console.warn("Fallback pkill failed:", error);
		}
	}
};
