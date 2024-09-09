import { findServerById } from "@/server/api/services/server";
import { Client } from "ssh2";
import { readSSHKey } from "../filesystem/ssh";

export const connectSSH = async (serverId: string) => {
	const server = await findServerById(serverId);
	if (!server.sshKeyId) throw new Error("No SSH key available for this server");

	const keys = await readSSHKey(server.sshKeyId);
	const client = new Client();

	return new Promise<Client>((resolve, reject) => {
		client
			.on("ready", () => resolve(client))
			.on("error", reject)
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: keys.privateKey,
				timeout: 99999,
			});
	});
};
