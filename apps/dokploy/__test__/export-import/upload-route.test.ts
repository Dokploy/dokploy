import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let sessionToReturn: {
	session: { activeOrganizationId: string } | null;
	user: { id: string } | null;
} = {
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1" },
};

let transferPathToReturn = "";

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(() => Promise.resolve(sessionToReturn)),
}));

const { maxUploadBytesBox, remoteBox } = vi.hoisted(() => ({
	maxUploadBytesBox: { value: 10 * 1024 * 1024 * 1024 },
	remoteBox: {
		commands: [] as string[],
		received: [] as Buffer[],
		stdin: undefined as undefined | { destroyed: boolean },
		exitCode: null as number | null,
	},
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return {
		...actual,
		execAsyncRemote: vi.fn(async () => ({ stdout: "", stderr: "" })),
	};
});

vi.mock(
	"@dokploy/server/utils/process/remoteStream",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@dokploy/server/utils/process/remoteStream")
			>();
		const { PassThrough: Pass } = await import("node:stream");
		return {
			...actual,
			openProcessStream: async (serverId: string | null, command: string) => {
				if (!serverId) return actual.openProcessStream(serverId, command);
				remoteBox.commands.push(command);
				const stdin = new Pass();
				const stdout = new Pass();
				const stderr = new Pass();
				remoteBox.stdin = stdin;
				stdin.on("data", (chunk: Buffer) => remoteBox.received.push(chunk));
				const failWith = remoteBox.exitCode;
				const exit =
					failWith === null
						? new Promise<number>((resolve) => {
								stdin.on("finish", () => resolve(0));
								stdin.on("close", () => resolve(0));
							})
						: Promise.resolve(failWith);
				return {
					stdin,
					stdout,
					stderr,
					exit,
					close: () => stdin.destroy(),
				};
			},
		};
	},
);

vi.mock(
	"@dokploy/server/services/project-export-import",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@dokploy/server/services/project-export-import")
			>();
		return {
			...actual,
			assertTransferPermission: vi.fn(async () => ({ role: "owner" })),
			findOrganizationServerId: vi.fn(
				async (serverId: string | undefined, organizationId: string) => {
					if (!serverId) return null;
					if (serverId === "server-1" && organizationId === "org-1") {
						return "server-1";
					}
					throw new Error("Server not found");
				},
			),
			get TRANSFER_MAX_UPLOAD_BYTES() {
				return maxUploadBytesBox.value;
			},
		};
	},
);

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/constants")>();
	return {
		...actual,
		paths: (isServer?: boolean) => ({
			...actual.paths(isServer),
			PROJECT_EXPORT_IMPORT_PATH: transferPathToReturn,
		}),
	};
});

const { getImportJob } = await import(
	"@dokploy/server/services/project-export-import"
);
const handler = (await import("../../pages/api/project-export-import/upload"))
	.default;

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "transfer-upload-route-"));
	transferPathToReturn = root;
	maxUploadBytesBox.value = 10 * 1024 * 1024 * 1024;
	remoteBox.exitCode = null;
	sessionToReturn = {
		session: { activeOrganizationId: "org-1" },
		user: { id: "user-1" },
	};
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const buildRes = () => {
	const stream = new PassThrough() as unknown as {
		statusCode: number;
		status: (code: number) => typeof stream;
		json: (body: unknown) => typeof stream;
		jsonBody?: unknown;
	} & PassThrough;
	stream.statusCode = 200;
	stream.status = vi.fn((code: number) => {
		stream.statusCode = code;
		return stream;
	}) as typeof stream.status;
	stream.json = vi.fn((body: unknown) => {
		stream.jsonBody = body;
		return stream;
	}) as typeof stream.json;
	return stream;
};

const buildMultipartReq = (
	fileContent: Buffer,
	fileName = "bundle.dokploy.tar.gz",
) => {
	const boundary = "----dokployTestBoundary";
	const head = Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="bundle"; filename="${fileName}"\r\nContent-Type: application/gzip\r\n\r\n`,
	);
	const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
	const body = Buffer.concat([head, fileContent, tail]);

	const stream = new PassThrough() as unknown as PassThrough & {
		method: string;
		headers: Record<string, string>;
	};
	stream.method = "POST";
	stream.headers = {
		"content-type": `multipart/form-data; boundary=${boundary}`,
		"content-length": String(body.length),
	};
	stream.end(body);
	return stream;
};

const buildTwoFileMultipartReq = (first: Buffer, second: Buffer) => {
	const boundary = "----dokployTestBoundary";
	const part = (name: string, content: Buffer) =>
		Buffer.concat([
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}.tar.gz"\r\nContent-Type: application/gzip\r\n\r\n`,
			),
			content,
			Buffer.from("\r\n"),
		]);
	const body = Buffer.concat([
		part("bundle", first),
		part("bundle2", second),
		Buffer.from(`--${boundary}--\r\n`),
	]);

	const stream = new PassThrough() as unknown as PassThrough & {
		method: string;
		headers: Record<string, string>;
	};
	stream.method = "POST";
	stream.headers = {
		"content-type": `multipart/form-data; boundary=${boundary}`,
		"content-length": String(body.length),
	};
	stream.end(body);
	return stream;
};

describe("transfer upload route", () => {
	it("rejects unauthenticated requests", async () => {
		sessionToReturn = { session: null, user: null };
		const req = buildMultipartReq(Buffer.from("irrelevant"));
		const res = buildRes();

		await handler(req as any, res as any);

		expect(res.statusCode).toBe(401);
	});

	it("rejects non-POST methods", async () => {
		const req = { method: "GET" };
		const res = buildRes();
		await handler(req as any, res as any);
		expect(res.statusCode).toBe(405);
	});

	it("streams the uploaded bundle to disk and creates an import job", async () => {
		const content = Buffer.from("fake bundle bytes for the upload route test");
		const req = buildMultipartReq(content);
		const res = buildRes();

		await handler(req as any, res as any);

		expect(res.statusCode).toBe(200);
		const importId = (res.jsonBody as { importId: string }).importId;
		expect(importId).toBeDefined();

		const job = getImportJob(importId);
		expect(job?.status).toBe("uploaded");
		expect(job?.bundle?.path).toBeDefined();

		const written = await readFile(job?.bundle?.path as string);
		expect(written.equals(content)).toBe(true);
	});

	it("does not buffer the whole file into memory while receiving a large upload", async () => {
		sessionToReturn = {
			session: { activeOrganizationId: "org-1" },
			user: { id: "user-2" },
		};
		const chunkSize = 1024 * 1024;
		const chunkCount = 50;
		const chunk = Buffer.alloc(chunkSize, 7);
		const content = Buffer.concat(Array(chunkCount).fill(chunk));
		const req = buildMultipartReq(content);
		const res = buildRes();

		if (global.gc) {
			global.gc();
		}
		const before = process.memoryUsage().heapUsed;

		await handler(req as any, res as any);

		if (global.gc) {
			global.gc();
		}
		const after = process.memoryUsage().heapUsed;
		const grew = after - before;

		expect(res.statusCode).toBe(200);
		expect(grew).toBeLessThan(content.length / 2);
	});

	it("rejects an upload with more than one file field instead of silently overwriting the first", async () => {
		sessionToReturn = {
			session: { activeOrganizationId: "org-1" },
			user: { id: "user-two-files" },
		};
		const first = Buffer.from("first file's real content");
		const second = Buffer.from("second file's content");
		const req = buildTwoFileMultipartReq(first, second);
		const res = buildRes();

		await handler(req as any, res as any);

		expect(res.statusCode).toBe(400);
		expect((res.jsonBody as { message: string }).message).toContain(
			"more than one file",
		);
	});

	it("destroys the request instead of continuing to drain it once the size limit is hit", async () => {
		sessionToReturn = {
			session: { activeOrganizationId: "org-1" },
			user: { id: "user-over-limit" },
		};
		maxUploadBytesBox.value = 10;
		const req = buildMultipartReq(Buffer.alloc(1000, 9));
		const res = buildRes();

		await handler(req as any, res as any);

		expect(res.statusCode).toBe(413);
		expect((req as unknown as PassThrough).destroyed).toBe(true);
	});
});

describe("upload to a remote server", () => {
	let counter = 0;
	beforeEach(() => {
		counter += 1;
		sessionToReturn = {
			session: { activeOrganizationId: "org-1" },
			user: { id: `remote-user-${counter}` },
		};
		remoteBox.commands = [];
		remoteBox.received = [];
		remoteBox.stdin = undefined;
	});

	it("streams the file into a cat process on the chosen server", async () => {
		const content = Buffer.from("remote bundle bytes");
		const req = buildMultipartReq(content) as unknown as {
			query?: Record<string, string>;
		};
		req.query = { serverId: "server-1" };
		const res = buildRes();

		await handler(req as any, res as any);

		expect(res.statusCode).toBe(200);
		const { importId, serverId } = res.jsonBody as {
			importId: string;
			serverId: string;
		};
		expect(serverId).toBe("server-1");
		expect(Buffer.concat(remoteBox.received).equals(content)).toBe(true);
		expect(remoteBox.commands.some((c) => c.includes("cat > '"))).toBe(true);
		expect(getImportJob(importId)?.bundle?.serverId).toBe("server-1");
		expect(existsSync(join(transferPathToReturn, importId))).toBe(false);
	});

	it("rejects a server outside the organization", async () => {
		const req = buildMultipartReq(Buffer.from("x")) as unknown as {
			query?: Record<string, string>;
		};
		req.query = { serverId: "someone-elses-server" };
		const res = buildRes();

		await handler(req as any, res as any);

		expect(res.statusCode).toBe(400);
		expect(remoteBox.commands).toHaveLength(0);
	});

	it("closes the remote writer when the upload has no file field", async () => {
		const boundary = "----dokployTestBoundary";
		const body = Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nhello\r\n--${boundary}--\r\n`,
		);
		const stream = new PassThrough() as unknown as PassThrough & {
			method: string;
			headers: Record<string, string>;
			query: Record<string, string>;
		};
		stream.method = "POST";
		stream.headers = {
			"content-type": `multipart/form-data; boundary=${boundary}`,
			"content-length": String(body.length),
		};
		stream.query = { serverId: "server-1" };
		stream.end(body);
		const res = buildRes();

		await handler(stream as any, res as any);

		expect(res.statusCode).toBe(400);
		expect((res.jsonBody as { message: string }).message).toBe(
			"No file field found in the upload",
		);
		expect(remoteBox.stdin?.destroyed).toBe(true);
	});

	it("fails fast when the remote writer exits before the file arrives", async () => {
		remoteBox.exitCode = 1;
		const stalled = new PassThrough() as unknown as PassThrough & {
			method: string;
			headers: Record<string, string>;
			query: Record<string, string>;
		};
		stalled.method = "POST";
		stalled.headers = {
			"content-type": "multipart/form-data; boundary=----dokployTestBoundary",
		};
		stalled.query = { serverId: "server-1" };
		const res = buildRes();

		await handler(stalled as any, res as any);

		expect(res.statusCode).toBe(400);
		expect((res.jsonBody as { message: string }).message).toMatch(
			/Writing the bundle on the server failed/,
		);
	}, 5_000);
});
