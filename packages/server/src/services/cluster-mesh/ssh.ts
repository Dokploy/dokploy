import { quote } from "shell-quote";
import { Client } from "ssh2";

export interface SshTarget {
	host: string;
	port: number;
	username: string;
	privateKey: string;
}

export class SshCommandError extends Error {
	constructor(
		message: string,
		readonly exitCode: number | null,
		readonly output: string,
	) {
		super(message);
		this.name = "SshCommandError";
	}
}

const tail = (text: string, lines = 15) =>
	text.trim().split("\n").slice(-lines).join("\n");

/**
 * Runs a bash script on a host that is not (or not yet) a Dokploy server.
 * Secrets go through `input` (stdin), never the script, and errors carry
 * the remote output but not the script text.
 */
export const execOverSsh = (
	target: SshTarget,
	body: string,
	{
		input,
		onData,
		timeoutMs = 15 * 60_000,
	}: {
		input?: string;
		onData?: (chunk: string) => void;
		timeoutMs?: number;
	} = {},
): Promise<{ stdout: string; stderr: string }> =>
	new Promise((resolve, reject) => {
		const conn = new Client();
		let stdout = "";
		let stderr = "";
		// Both streams in arrival order: the lines that explain a failure come
		// last, on either stream (get.docker.com prints its errors on stdout).
		let output = "";
		let settled = false;
		const finish = (error: Error | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			conn.end();
			if (error) reject(error);
			else resolve({ stdout, stderr });
		};
		const timer = setTimeout(
			() =>
				finish(
					new SshCommandError(
						`Timed out after ${Math.round(timeoutMs / 1000)} seconds on ${target.host}`,
						null,
						tail(output),
					),
				),
			timeoutMs,
		);

		conn
			.once("ready", () => {
				conn.exec(`bash -c ${quote([body])}`, (error, stream) => {
					if (error) {
						finish(error);
						return;
					}
					stream
						.on("close", (code: number | null) => {
							if (code === 0) {
								finish(null);
								return;
							}
							const lastLines = tail(output);
							finish(
								new SshCommandError(
									`Command failed on ${target.host} (exit ${code})${lastLines ? `:\n${lastLines}` : ""}`,
									code,
									lastLines,
								),
							);
						})
						.on("data", (data: Buffer) => {
							const text = data.toString();
							stdout += text;
							output += text;
							onData?.(text);
						})
						.stderr.on("data", (data: Buffer) => {
							const text = data.toString();
							stderr += text;
							output += text;
							onData?.(text);
						});
					stream.end(input ?? "");
				});
			})
			.on("error", (error) => {
				finish(
					new SshCommandError(
						error.level === "client-authentication"
							? `SSH to ${target.username}@${target.host}:${target.port} was refused: the key is not authorized for that user.`
							: `Cannot connect to ${target.host}:${target.port} over SSH: ${error.message}`,
						null,
						"",
					),
				);
			})
			.connect({
				host: target.host,
				port: target.port,
				username: target.username,
				privateKey: target.privateKey,
				readyTimeout: 20_000,
			});
	});
