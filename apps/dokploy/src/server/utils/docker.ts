import { execAsync } from "@dokploy/server";

/** Returns if the current operating system is Windows Subsystem for Linux (WSL). */
export const isWSL = async () => {
	try {
		const { stdout } = await execAsync("uname -r");
		const isWSL = stdout.includes("microsoft");
		return isWSL;
	} catch {
		return false;
	}
};

/** Returns the Docker host IP address. */
export const getDockerHost = async (): Promise<string> => {
	if (process.env.NODE_ENV === "production") {
		if (process.platform === "linux" && !(await isWSL())) {
			try {
				// Try to get the Docker bridge IP first
				const { stdout } = await execAsync(
					"ip route | awk '/default/ {print $3}'",
				);

				const hostIp = stdout.trim();
				if (!hostIp) {
					throw new Error("Failed to get Docker host IP");
				}

				return hostIp;
			} catch (error) {
				console.error("Failed to get Docker host IP:", error);
				return "172.17.0.1"; // Default Docker bridge network IP
			}
		}

		return "host.docker.internal";
	}

	return "localhost";
};
