import { findServerById } from "@/server/api/services/server";
import { readSSHKey } from "../filesystem/ssh";
import { Client } from "ssh2";

export const executeCommand = async (serverId: string, command: string) => {
	const server = await findServerById(serverId);

	if (!server.sshKeyId) return;
	const keys = await readSSHKey(server.sshKeyId);
	const client = new Client();
	return new Promise<void>((resolve, reject) => {
		client
			.on("ready", () => {
				console.log("Client :: ready", command);
				client.exec(command, (err, stream) => {
					if (err) {
						console.error("Execution error:", err);
						reject(err);
						return;
					}
					stream
						.on("close", (code, signal) => {
							client.end();
							if (code === 0) {
								resolve();
							} else {
								reject(new Error(`Command exited with code ${code}`));
							}
						})
						.on("data", (data: string) => {})
						.stderr.on("data", (data) => {});
				});
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: keys.privateKey,
				timeout: 99999,
			});
	});
};
