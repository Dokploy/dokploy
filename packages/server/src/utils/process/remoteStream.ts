import { spawn } from "node:child_process";
import { findServerById } from "@dokploy/server/services/server";
import { Client } from "ssh2";
import { sshKeepalive } from "./execAsync";

export interface ProcessStream {
	stdin: NodeJS.WritableStream;
	stdout: NodeJS.ReadableStream;
	stderr: NodeJS.ReadableStream;
	exit: Promise<number>;
	close: () => void;
}

export const openProcessStream = async (
	serverId: string | null,
	command: string,
): Promise<ProcessStream> => {
	if (!serverId) {
		const child = spawn("sh", ["-c", command]);
		const exit = new Promise<number>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", (code) => resolve(code ?? 1));
		});
		return {
			stdin: child.stdin,
			stdout: child.stdout,
			stderr: child.stderr,
			exit,
			close: () => child.kill(),
		};
	}

	const server = await findServerById(serverId);
	if (!server.sshKeyId) throw new Error("No SSH key available for this server");

	return new Promise((resolve, reject) => {
		const conn = new Client();
		conn
			.once("ready", () => {
				conn.exec(command, (err, stream) => {
					if (err) {
						conn.end();
						reject(err);
						return;
					}
					let exitCode = 1;
					stream.once("exit", (code: number | null) => {
						exitCode = code ?? 1;
					});
					const exit = new Promise<number>((resolveExit) => {
						stream.once("close", () => {
							conn.end();
							resolveExit(exitCode);
						});
					});
					resolve({
						stdin: stream,
						stdout: stream,
						stderr: stream.stderr,
						exit,
						close: () => {
							stream.close();
							conn.end();
						},
					});
				});
			})
			.once("error", (err) => {
				conn.end();
				reject(err);
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
				readyTimeout: 30_000,
				...sshKeepalive,
			});
	});
};

const collectOutput = (stream: NodeJS.ReadableStream) => {
	const chunks: string[] = [];
	stream.on("data", (chunk) => chunks.push(chunk.toString()));
	return () => chunks.join("").trim();
};

export const pipeBetweenServers = async ({
	source,
	target,
	onProgress,
}: {
	source: { serverId: string | null; command: string };
	target: { serverId: string | null; command: string };
	onProgress?: (bytes: number) => void;
}) => {
	const to = await openProcessStream(target.serverId, target.command);
	const targetError = collectOutput(to.stderr);
	to.stdout.resume();
	to.stdin.on("error", () => {});

	const from = await openProcessStream(source.serverId, source.command);
	const sourceError = collectOutput(from.stderr);
	let bytes = 0;
	from.stdout.on("data", (chunk: Buffer) => {
		bytes += chunk.length;
		onProgress?.(bytes);
	});
	from.stdout.on("error", () => {});

	let sourceStopped = false;
	const stopSource = () => {
		if (sourceStopped) return;
		sourceStopped = true;
		from.stdout.unpipe(to.stdin);
		from.stdout.resume();
		from.close();
	};

	if (to.stdin.writable) {
		from.stdout.pipe(to.stdin);
	} else {
		stopSource();
	}

	const targetExit = to.exit
		.then((code) => {
			if (code !== 0) {
				throw new Error(`target exited with code ${code}: ${targetError()}`);
			}
			return code;
		})
		.catch((error) => {
			stopSource();
			throw error;
		});

	const [sourceCode] = await Promise.all([from.exit, targetExit]);
	if (sourceCode !== 0) {
		throw new Error(`source exited with code ${sourceCode}: ${sourceError()}`);
	}
	return bytes;
};
