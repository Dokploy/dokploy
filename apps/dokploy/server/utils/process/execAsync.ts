import { exec } from "node:child_process";
import util from "node:util";
import { findServerById } from "@/server/api/services/server";
import { Client } from "ssh2";
import { readSSHKey } from "../filesystem/ssh";
export const execAsync = util.promisify(exec);

export const execAsyncRemote = async (
	serverId: string | null,
	command: string,
): Promise<{ stdout: string; stderr: string }> => {
	if (!serverId) return { stdout: "", stderr: "" };
	const server = await findServerById(serverId);
	if (!server.sshKeyId) throw new Error("No SSH key available for this server");

	const keys = await readSSHKey(server.sshKeyId);

	let stdout = "";
	let stderr = "";
	return new Promise((resolve, reject) => {
		const conn = new Client();

		sleep(1000);
		conn
			.once("ready", () => {
				console.log("Client :: ready");
				conn
					.exec(command, (err, stream) => {
						if (err) throw err;
						stream
							.on("close", (code: number, signal: string) => {
								console.log(
									`Stream :: close :: code: ${code}, signal: ${signal}`,
								);
								conn.end();
								if (code === 0) {
									resolve({ stdout, stderr });
								} else {
									reject(
										new Error(
											`Command exited with code ${code}. Stderr: ${stderr}, command: ${command}`,
										),
									);
								}
							})
							.on("data", (data: string) => {
								stdout += data.toString();
							})
							.stderr.on("data", (data) => {
								stderr += data.toString();
							});
					})
					.on("keyboard-interactive", () => {
						console.log("Warning: Keyboard interactive, closing connection");
						conn.end();
						reject(
							new Error(
								"Password requested. Invalid SSH key or authentication issue.",
							),
						);
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

export const sleep = (ms: number) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};
