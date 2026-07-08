import type { IncomingMessage } from "node:http";

export const APPLICATION_ENV_UPSERT_MAX_BODY_BYTES = 1024 * 1024;

export class ApplicationEnvUpsertBodyTooLargeError extends Error {
	statusCode = 413;

	constructor() {
		super("Application ENV upsert request body is too large");
		this.name = "ApplicationEnvUpsertBodyTooLargeError";
	}
}

const getContentLength = (req: IncomingMessage) => {
	const contentLength = req.headers["content-length"];
	const value = Array.isArray(contentLength) ? contentLength[0] : contentLength;

	if (!value) {
		return null;
	}

	const parsed = Number.parseInt(value, 10);

	return Number.isFinite(parsed) ? parsed : null;
};

export const readApplicationEnvUpsertJsonBody = async (
	req: IncomingMessage,
): Promise<unknown> =>
	new Promise((resolve, reject) => {
		let settled = false;
		let receivedBytes = 0;
		const chunks: Buffer[] = [];

		const cleanup = () => {
			req.off("data", onData);
			req.off("end", onEnd);
			req.off("error", onError);
		};

		const resolveOnce = (value: unknown) => {
			if (settled) {
				return;
			}

			settled = true;
			cleanup();
			resolve(value);
		};

		const rejectOnce = (error: Error) => {
			if (settled) {
				return;
			}

			settled = true;
			cleanup();
			reject(error);
		};

		const rejectBodyTooLarge = () => {
			req.pause();
			rejectOnce(new ApplicationEnvUpsertBodyTooLargeError());
		};

		const contentLength = getContentLength(req);
		if (
			contentLength !== null &&
			contentLength > APPLICATION_ENV_UPSERT_MAX_BODY_BYTES
		) {
			rejectBodyTooLarge();
			return;
		}

		function onData(chunk: Buffer | string) {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			receivedBytes += buffer.byteLength;

			if (receivedBytes > APPLICATION_ENV_UPSERT_MAX_BODY_BYTES) {
				rejectBodyTooLarge();
				return;
			}

			chunks.push(buffer);
		}

		function onEnd() {
			const body = Buffer.concat(chunks).toString("utf8");

			if (!body) {
				resolveOnce({});
				return;
			}

			try {
				resolveOnce(JSON.parse(body));
			} catch (error) {
				rejectOnce(error as Error);
			}
		}

		function onError(error: Error) {
			rejectOnce(error);
		}

		req.on("data", onData);
		req.on("end", onEnd);
		req.on("error", onError);
	});
