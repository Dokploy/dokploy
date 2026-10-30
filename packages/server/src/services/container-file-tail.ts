import { Writable } from "node:stream";
import { getRemoteDocker } from "../utils/servers/remote-docker";

export const CONTAINER_FILE_TAIL_MAX_LINES = 5000;
export const CONTAINER_FILE_TAIL_MAX_BYTES = 512 * 1024;
const READ_TIMEOUT_MS = 10_000;
const MAX_STDERR_BYTES = 8192;

export class ContainerFileTailError extends Error {
	constructor(
		public readonly code:
			| "INVALID_INPUT"
			| "INVALID_ENCODING"
			| "NOT_A_FILE"
			| "FILE_UNAVAILABLE"
			| "CONTAINER_UNAVAILABLE"
			| "UTILITY_UNAVAILABLE"
			| "READ_FAILED"
			| "READ_TIMEOUT"
			| "OUTPUT_TOO_LARGE",
		message: string,
	) {
		super(message);
		this.name = "ContainerFileTailError";
	}
}

// Read bytes first: tailing lines before applying a byte cap can transfer an
// arbitrarily large single line. No shell is involved, including on SSH hosts.
export const readContainerFileTail = async (
	containerId: string,
	filePath: string,
	lines = 200,
	maxBytes = 65536,
	serverId?: string,
) => {
	if (
		!Number.isInteger(lines) ||
		lines < 1 ||
		lines > CONTAINER_FILE_TAIL_MAX_LINES ||
		!Number.isInteger(maxBytes) ||
		maxBytes < 1 ||
		maxBytes > CONTAINER_FILE_TAIL_MAX_BYTES ||
		!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(containerId) ||
		!filePath.startsWith("/") ||
		filePath.length > 4096 ||
		filePath.includes("\0")
	) {
		throw new ContainerFileTailError(
			"INVALID_INPUT",
			"Invalid container, file path, or tail limits.",
		);
	}

	let stream: (NodeJS.ReadableStream & { destroy?: () => void }) | undefined;
	let timedOut = false;
	const abortController = new AbortController();
	let timer: ReturnType<typeof setTimeout>;
	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];
	const outputs: Writable[] = [];
	const timeoutError = new ContainerFileTailError(
		"READ_TIMEOUT",
		"The container took too long to read this file.",
	);
	const checkDeadline = () => {
		if (timedOut) throw timeoutError;
	};
	const deadline = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			timedOut = true;
			reject(timeoutError);
			abortController.abort();
			stream?.destroy?.();
		}, READ_TIMEOUT_MS);
	});

	const read = async () => {
		const docker = await getRemoteDocker(serverId);
		checkDeadline();
		const container = docker.getContainer(containerId);
		// Docker's HEAD archive endpoint returns metadata without reading the
		// file body. Reject pipes/devices before starting a potentially blocking
		// tail process. This header uses Go os.FileMode, not POSIX mode bits.
		const metadata = (await container
			.infoArchive({
				path: filePath,
				abortSignal: abortController.signal,
			})
			.catch((error: unknown) => {
				if ((error as { statusCode?: number } | null)?.statusCode === 404) {
					throw new ContainerFileTailError(
						"FILE_UNAVAILABLE",
						"The file or container could not be found, or Docker cannot inspect this mounted path.",
					);
				}
				throw error;
			})) as NodeJS.ReadableStream & { headers?: Record<string, string> };
		try {
			checkDeadline();
			const header = metadata.headers?.["x-docker-container-path-stat"];
			if (!header)
				throw new ContainerFileTailError(
					"READ_FAILED",
					"Docker did not return file metadata.",
				);
			const stat = JSON.parse(
				Buffer.from(header, "base64").toString("utf8"),
			) as { mode?: number; size?: number; linkTarget?: string };
			if (
				!Number.isInteger(stat.mode) ||
				typeof stat.size !== "number" ||
				stat.size < 0
			) {
				throw new ContainerFileTailError(
					"READ_FAILED",
					"Docker returned invalid file metadata.",
				);
			}
			if (((stat.mode! >>> 0) & 0x8f280000) !== 0 || stat.linkTarget) {
				throw new ContainerFileTailError(
					"NOT_A_FILE",
					"Only regular files can be tailed; directories, symlinks and special files are not supported.",
				);
			}
		} finally {
			metadata.resume();
		}
		const execution = await container.exec({
			Cmd: ["tail", "-c", String(maxBytes + 1), "--", filePath],
			AttachStdout: true,
			AttachStderr: true,
			Tty: false,
		});
		checkDeadline();
		stream = await execution.start({ hijack: true, stdin: false });
		if (timedOut) {
			stream.destroy?.();
			throw timeoutError;
		}

		await new Promise<void>((resolve, reject) => {
			const collector = (chunks: Buffer[], limit: number) => {
				let size = 0;
				const output = new Writable({
					write(chunk: Buffer, _encoding, callback) {
						size += chunk.length;
						if (size > limit) {
							const error = new ContainerFileTailError(
								"OUTPUT_TOO_LARGE",
								"The container returned more output than the read limit.",
							);
							reject(error);
							callback(error);
							return;
						}
						chunks.push(Buffer.from(chunk));
						callback();
					},
				});
				output.once("error", reject);
				outputs.push(output);
				return output;
			};
			const stdout = collector(stdoutChunks, maxBytes + 1);
			const stderr = collector(stderrChunks, MAX_STDERR_BYTES);
			stream?.once("error", reject);
			stream?.once("end", resolve);
			stream?.once("close", () => {
				if (!(stream as { readableEnded?: boolean }).readableEnded) {
					reject(
						new ContainerFileTailError(
							"READ_FAILED",
							"The container closed the file read unexpectedly.",
						),
					);
				}
			});
			docker.modem.demuxStream(stream as NodeJS.ReadableStream, stdout, stderr);
		});
		const inspection = await execution.inspect();
		checkDeadline();
		if (inspection.Running || inspection.ExitCode !== 0) {
			const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
			const missingUtility =
				inspection.ExitCode === 126 || inspection.ExitCode === 127;
			throw new ContainerFileTailError(
				missingUtility ? "UTILITY_UNAVAILABLE" : "READ_FAILED",
				missingUtility
					? "The container image does not provide the tail utility."
					: stderr || "The container could not read this file.",
			);
		}

		const buffer = Buffer.concat(stdoutChunks);
		const truncatedByBytes = buffer.length > maxBytes;
		let start = truncatedByBytes ? buffer.length - maxBytes : 0;
		// A byte window can begin inside a UTF-8 character. Discard only the
		// split prefix, preserving complete Unicode characters after it.
		if (truncatedByBytes) {
			while (start < buffer.length && ((buffer[start] ?? 0) & 0xc0) === 0x80)
				start++;
		}
		const byteStart = start;
		let remainingLines = lines;
		let end = buffer.length;
		if (buffer[end - 1] === 10) end--;
		for (let index = end - 1; index >= start; index--) {
			if (buffer[index] === 10 && --remainingLines === 0) {
				start = index + 1;
				break;
			}
		}
		const truncatedByLines = start > byteStart;
		let content: string;
		try {
			content = new TextDecoder("utf-8", { fatal: true }).decode(
				buffer.subarray(start),
			);
		} catch {
			// Replacement characters can expand invalid bytes past maxBytes.
			throw new ContainerFileTailError(
				"INVALID_ENCODING",
				"The selected file does not contain valid UTF-8 text.",
			);
		}
		return {
			content,
			truncated: truncatedByBytes || truncatedByLines,
			truncatedByBytes,
			truncatedByLines,
		};
	};

	try {
		return await Promise.race([read(), deadline]);
	} catch (error) {
		if (error instanceof ContainerFileTailError) throw error;
		const message = error instanceof Error ? error.message : String(error);
		if (/executable file not found|tail.*not found/i.test(message)) {
			throw new ContainerFileTailError(
				"UTILITY_UNAVAILABLE",
				"The container image does not provide the tail utility.",
			);
		}
		const status = (error as { statusCode?: number } | null)?.statusCode;
		if (status === 404 || status === 409) {
			throw new ContainerFileTailError(
				"CONTAINER_UNAVAILABLE",
				"The selected container is missing or is not running.",
			);
		}
		throw new ContainerFileTailError(
			"READ_FAILED",
			"Unable to read the container file.",
		);
	} finally {
		clearTimeout(timer!);
		stream?.destroy?.();
		for (const output of outputs) output.destroy();
	}
};
