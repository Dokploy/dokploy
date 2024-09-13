import { exec } from "node:child_process";
import util from "node:util";
import { findServerById } from "@/server/api/services/server";
import { readSSHKey } from "../filesystem/ssh";
import { Client } from "ssh2";
export const execAsync = util.promisify(exec);

export const execAsyncRemote = async (
	serverId: string | null,
	command: string,
): Promise<{ stdout: string; stderr: string }> => {
	if (!serverId) return { stdout: "", stderr: "" };
	const server = await findServerById(serverId);
	if (!server.sshKeyId) throw new Error("No SSH key available for this server");

	const keys = await readSSHKey(server.sshKeyId);

	const conn = new Client();
	let stdout = "";
	let stderr = "";
	return new Promise((resolve, reject) => {
		conn
			.once("ready", () => {
				console.log("Client :: ready");
				conn.exec(command, (err, stream) => {
					if (err) throw err;
					stream
						.on("close", (code, signal) => {
							console.log(
								`Stream :: close :: code: ${code}, signal: ${signal}`,
							);
							conn.end();
							if (code === 0) {
								resolve({ stdout, stderr });
							} else {
								reject(new Error(`Command exited with code ${code}`));
							}
						})
						.on("data", (data: string) => {
							stdout += data.toString();
						})
						.stderr.on("data", (data) => {
							stderr += data.toString();
						});
				});
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: keys.privateKey,
				timeout: 99999,
			});

		// client.exec(command, (err, stream) => {
		// 	if (err) {
		// 		client.end();
		// 		return reject(err);
		// 	}

		// 	let stdout = "";
		// 	let stderr = "";

		// 	stream
		// 		.on("data", (data: string) => {
		// 			stdout += data.toString();
		// 		})
		// 		.on("close", (code, signal) => {
		// 			client.end();
		// 			if (code === 0) {
		// 				resolve({ stdout, stderr });
		// 			} else {
		// 				reject(new Error(`Command exited with code ${code}`));
		// 			}
		// 		})
		// 		.stderr.on("data", (data) => {
		// 			stderr += data.toString();
		// 		});
		// });
	});
};
