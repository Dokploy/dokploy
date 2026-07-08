import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
	APPLICATION_ENV_UPSERT_MAX_BODY_BYTES,
	ApplicationEnvUpsertBodyTooLargeError,
	readApplicationEnvUpsertJsonBody,
} from "../../server/api/utils/application-env-upsert-body";

const createRequest = (
	chunks: Array<Buffer | string>,
	headers: IncomingMessage["headers"] = {},
) => {
	const request = Readable.from(chunks) as IncomingMessage;
	request.headers = headers;

	return request;
};

describe("readApplicationEnvUpsertJsonBody", () => {
	it("parses a JSON body within the request size limit", async () => {
		await expect(
			readApplicationEnvUpsertJsonBody(
				createRequest(['{"applicationId":"app_1","variables":{"A":"B"}}']),
			),
		).resolves.toEqual({
			applicationId: "app_1",
			variables: {
				A: "B",
			},
		});
	});

	it("rejects oversized bodies while reading the stream", async () => {
		const request = createRequest([
			Buffer.alloc(APPLICATION_ENV_UPSERT_MAX_BODY_BYTES + 1),
		]);
		const pauseSpy = vi.spyOn(request, "pause");

		await expect(
			readApplicationEnvUpsertJsonBody(request),
		).rejects.toBeInstanceOf(ApplicationEnvUpsertBodyTooLargeError);
		expect(pauseSpy).toHaveBeenCalled();
	});

	it("rejects oversized bodies from content length before consuming chunks", async () => {
		const request = createRequest(['{"applicationId":"app_1"}'], {
			"content-length": `${APPLICATION_ENV_UPSERT_MAX_BODY_BYTES + 1}`,
		});
		const pauseSpy = vi.spyOn(request, "pause");

		await expect(
			readApplicationEnvUpsertJsonBody(request),
		).rejects.toMatchObject({
			statusCode: 413,
		});
		expect(pauseSpy).toHaveBeenCalled();
	});
});
