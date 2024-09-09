import { exec } from "node:child_process";
import util from "node:util";
import { connectSSH } from "../servers/connection";
export const execAsync = util.promisify(exec);

export const execAsyncRemote = async (
	serverId: string,
	command: string,
): Promise<{ stdout: string; stderr: string }> => {
	const client = await connectSSH(serverId);

	return new Promise((resolve, reject) => {
		client.exec(command, (err, stream) => {
			if (err) {
				client.end();
				return reject(err);
			}

			let stdout = "";
			let stderr = "";

			stream
				.on("data", (data: string) => {
					stdout += data.toString();
				})
				.on("close", (code, signal) => {
					client.end();
					if (code === 0) {
						resolve({ stdout, stderr });
					} else {
						reject(new Error(`Command exited with code ${code}`));
					}
				})
				.stderr.on("data", (data) => {
					stderr += data.toString();
				});
		});
	});
};
