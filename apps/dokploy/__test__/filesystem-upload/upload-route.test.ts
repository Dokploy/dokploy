import http, { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

// This route's oversized-upload safeguard used to call req.destroy(), which
// (per Node's docs) destroys the socket req and res share. A mocked
// req/res object can't catch that class of bug — it would happily record
// "res.json() was called" even though no real client could ever receive
// the response. These tests run the real handler behind a real HTTP
// server and assert on what an actual client observes.

const {
	validateRequestMock,
	getAuthorizedServiceFilesystemContainerMock,
	uploadFileToContainerDirectoryMock,
} = vi.hoisted(() => ({
	validateRequestMock: vi.fn(),
	getAuthorizedServiceFilesystemContainerMock: vi.fn(),
	uploadFileToContainerDirectoryMock: vi.fn(),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: validateRequestMock,
}));

vi.mock("@/server/api/utils/service-filesystem", () => ({
	FILESYSTEM_SERVICE_TYPES: [
		"application",
		"postgres",
		"mysql",
		"mariadb",
		"mongo",
		"redis",
		"compose",
	],
	getAuthorizedServiceFilesystemContainer:
		getAuthorizedServiceFilesystemContainerMock,
}));

vi.mock("@dokploy/server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@dokploy/server")>();
	return {
		...actual,
		// Kept small so the "oversized" test doesn't need to push megabytes.
		MAX_FILE_UPLOAD_BYTES: 20,
		uploadFileToContainerDirectory: uploadFileToContainerDirectoryMock,
	};
});

const { default: handler } = await import("@/pages/api/filesystem/upload");

const withServer = async (
	run: (baseUrl: string, server: Server) => Promise<void>,
): Promise<void> => {
	const server = createServer((req, res) => {
		const url = new URL(req.url ?? "", "http://localhost");
		(req as NextApiRequest).query = Object.fromEntries(
			url.searchParams.entries(),
		);
		const apiRes = res as NextApiResponse;
		apiRes.status = (code: number) => {
			res.statusCode = code;
			return apiRes;
		};
		apiRes.json = (body: unknown) => {
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify(body));
			return apiRes;
		};
		void handler(req as NextApiRequest, apiRes);
	});

	await new Promise<void>((resolve) => server.listen(0, resolve));
	try {
		const { port } = server.address() as AddressInfo;
		await run(`http://127.0.0.1:${port}`, server);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
};

const uploadParams = (overrides: Record<string, string> = {}) =>
	new URLSearchParams({
		serviceType: "application",
		serviceId: "app-1",
		containerId: "a".repeat(64),
		path: "/app",
		fileName: "upload.bin",
		...overrides,
	});

describe("POST /api/filesystem/upload", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		validateRequestMock.mockResolvedValue({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		});
		getAuthorizedServiceFilesystemContainerMock.mockResolvedValue({
			container: {},
		});
		uploadFileToContainerDirectoryMock.mockResolvedValue({
			name: "upload.bin",
			path: "/app/upload.bin",
			type: "file",
			size: 2,
		});
	});

	it("rejects an oversized upload with a structured 413 the client actually receives", async () => {
		await withServer(async (baseUrl) => {
			const response = await fetch(
				`${baseUrl}/api/filesystem/upload?${uploadParams()}`,
				{ method: "POST", body: "x".repeat(1000) },
			);

			expect(response.status).toBe(413);
			const body = await response.json();
			expect(body.message).toMatch(/limited to/i);
			expect(uploadFileToContainerDirectoryMock).not.toHaveBeenCalled();
		});
	});

	it("accepts an upload within the size cap", async () => {
		await withServer(async (baseUrl) => {
			const response = await fetch(
				`${baseUrl}/api/filesystem/upload?${uploadParams()}`,
				{ method: "POST", body: "hi" },
			);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.entry.name).toBe("upload.bin");
			expect(uploadFileToContainerDirectoryMock).toHaveBeenCalledWith(
				{},
				"/app",
				"upload.bin",
				Buffer.from("hi"),
			);
		});
	});

	it("rejects an unrecognized service type before touching the container", async () => {
		await withServer(async (baseUrl) => {
			const response = await fetch(
				`${baseUrl}/api/filesystem/upload?${uploadParams({ serviceType: "not-a-real-type" })}`,
				{ method: "POST", body: "hi" },
			);

			expect(response.status).toBe(400);
			expect(getAuthorizedServiceFilesystemContainerMock).not.toHaveBeenCalled();
		});
	});

	// MAX_FILE_UPLOAD_BYTES is mocked to 20 above; the check is `total > maxBytes`,
	// so exactly 20 bytes must succeed and 21 must not.
	it("accepts an upload of exactly the size cap", async () => {
		await withServer(async (baseUrl) => {
			const response = await fetch(
				`${baseUrl}/api/filesystem/upload?${uploadParams()}`,
				{ method: "POST", body: "x".repeat(20) },
			);

			expect(response.status).toBe(200);
			expect(uploadFileToContainerDirectoryMock).toHaveBeenCalledWith(
				{},
				"/app",
				"upload.bin",
				Buffer.from("x".repeat(20)),
			);
		});
	});

	it("rejects an upload exactly one byte over the size cap", async () => {
		await withServer(async (baseUrl) => {
			const response = await fetch(
				`${baseUrl}/api/filesystem/upload?${uploadParams()}`,
				{ method: "POST", body: "x".repeat(21) },
			);

			expect(response.status).toBe(413);
			expect(uploadFileToContainerDirectoryMock).not.toHaveBeenCalled();
		});
	});

	it("cleanly rejects once even when chunks keep arriving after the cap is crossed mid-stream", async () => {
		await withServer(async (baseUrl) => {
			const encoder = new TextEncoder();
			const body = new ReadableStream({
				async start(controller) {
					controller.enqueue(encoder.encode("x".repeat(15)));
					await new Promise((resolve) => setTimeout(resolve, 20));
					// crosses the 20-byte cap here
					controller.enqueue(encoder.encode("x".repeat(15)));
					await new Promise((resolve) => setTimeout(resolve, 20));
					// arrives after the request has already been rejected
					controller.enqueue(encoder.encode("x".repeat(15)));
					controller.close();
				},
			});

			const response = await fetch(
				`${baseUrl}/api/filesystem/upload?${uploadParams()}`,
				// @ts-expect-error -- Node's fetch requires duplex for a streamed body
				{ method: "POST", body, duplex: "half" },
			);

			expect(response.status).toBe(413);
			const responseBody = await response.json();
			expect(responseBody.message).toMatch(/limited to/i);
			expect(uploadFileToContainerDirectoryMock).not.toHaveBeenCalled();
		});
	});

	it("keeps the connection alive and reusable across sequential successful uploads", async () => {
		await withServer(async (baseUrl, server) => {
			let socketCount = 0;
			server.on("connection", () => {
				socketCount += 1;
			});
			const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });

			const doUpload = () =>
				new Promise<number>((resolve, reject) => {
					const req = http.request(
						`${baseUrl}/api/filesystem/upload?${uploadParams()}`,
						{ method: "POST", agent },
						(res) => {
							res.resume();
							res.on("end", () => resolve(res.statusCode ?? 0));
							res.on("error", reject);
						},
					);
					req.on("error", reject);
					req.end("hi");
				});

			try {
				expect(await doUpload()).toBe(200);
				expect(await doUpload()).toBe(200);
				// Both requests reused the same underlying TCP connection.
				expect(socketCount).toBe(1);
			} finally {
				agent.destroy();
			}
		});
	});
});
