import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { errorPathBox } = vi.hoisted(() => ({ errorPathBox: { value: "" } }));

vi.mock(
	"@dokploy/server/utils/process/remoteStream",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@dokploy/server/utils/process/remoteStream")
			>();
		return {
			...actual,
			openProcessStream: async (serverId: string | null, command: string) => {
				if (errorPathBox.value && command.includes(errorPathBox.value)) {
					const stdout = new Readable({ read() {} });
					process.nextTick(() => {
						stdout.emit("error", new Error("simulated read failure"));
					});
					return {
						stdin: new PassThrough(),
						stdout,
						stderr: new PassThrough(),
						exit: Promise.resolve(1),
						close: () => {},
					};
				}
				return actual.openProcessStream(serverId, command);
			},
		};
	},
);

let sessionToReturn: {
	session: { activeOrganizationId: string } | null;
	user: { id: string } | null;
} = {
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1" },
};

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(() => Promise.resolve(sessionToReturn)),
}));

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
		};
	},
);

const {
	createExportJob,
	issueDownloadToken,
	updateExportJob,
	peekDownloadToken,
	assertTransferPermission,
} = await import("@dokploy/server/services/project-export-import");
const handler = (
	await import("../../pages/api/project-export-import/download/[token]")
).default;

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "transfer-download-route-"));
	errorPathBox.value = "";
	sessionToReturn = {
		session: { activeOrganizationId: "org-1" },
		user: { id: "user-1" },
	};
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const buildReq = (
	method: string,
	token: string,
): { method: string; query: { token: string } } => ({
	method,
	query: { token },
});

const buildRes = () => {
	const stream = new PassThrough() as unknown as {
		statusCode: number;
		status: (code: number) => typeof stream;
		json: (body: unknown) => typeof stream;
		jsonBody?: unknown;
		setHeader: (key: string, value: unknown) => void;
		headers: Record<string, unknown>;
	} & PassThrough;
	stream.statusCode = 200;
	stream.headers = {};
	stream.status = vi.fn((code: number) => {
		stream.statusCode = code;
		return stream;
	}) as typeof stream.status;
	stream.json = vi.fn((body: unknown) => {
		stream.jsonBody = body;
		return stream;
	}) as typeof stream.json;
	stream.setHeader = vi.fn((key: string, value: unknown) => {
		stream.headers[key] = value;
	});
	return stream;
};

const drain = (stream: PassThrough): Promise<Buffer> =>
	new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		stream.on("data", (chunk) => chunks.push(chunk as Buffer));
		stream.on("end", () => resolve(Buffer.concat(chunks)));
		stream.on("error", reject);
	});

describe("transfer download route", () => {
	it("rejects unauthenticated requests", async () => {
		sessionToReturn = { session: null, user: null };
		const req = buildReq("GET", "any-token");
		const res = buildRes();

		await handler(req as any, res as any);

		expect(res.statusCode).toBe(401);
	});

	it("rejects an unknown token", async () => {
		const req = buildReq("GET", "does-not-exist");
		const res = buildRes();

		await handler(req as any, res as any);

		expect(res.statusCode).toBe(404);
	});

	it("rejects a non-owner/admin caller with a valid, same-org token", async () => {
		const job = createExportJob("export-forbidden-1", "user-1", "org-1");
		job.status = "done";
		job.bundle = { serverId: null, path: join(root, "bundle.tar.gz") };
		const token = issueDownloadToken("export-forbidden-1") as string;

		(assertTransferPermission as any).mockRejectedValueOnce(
			new (await import("@trpc/server")).TRPCError({
				code: "FORBIDDEN",
				message: "Only organization owners and admins can do that",
			}),
		);

		const req = buildReq("GET", token);
		const res = buildRes();
		await handler(req as any, res as any);

		expect(res.statusCode).toBe(403);
		expect(assertTransferPermission).toHaveBeenCalled();
	});

	it("rejects a token belonging to another organization", async () => {
		const job = createExportJob("export-1", "user-1", "org-2");
		job.status = "done";
		job.bundle = { serverId: null, path: join(root, "bundle.tar.gz") };
		const token = issueDownloadToken("export-1") as string;

		const req = buildReq("GET", token);
		const res = buildRes();
		await handler(req as any, res as any);

		expect(res.statusCode).toBe(404);
	});

	it("streams the bundle and invalidates the token on success, keeps it valid on failure retries", async () => {
		const bundlePath = join(root, "bundle.tar.gz");
		const content = Buffer.from(
			"fake bundle bytes, could be large in real life",
		);
		await writeFile(bundlePath, content);

		createExportJob("export-2", "user-1", "org-1");
		updateExportJob("export-2", {
			status: "done",
			bundle: { serverId: null, path: bundlePath },
		});
		const token = issueDownloadToken("export-2") as string;

		const req = buildReq("GET", token);
		const res = buildRes();

		const [, received] = await Promise.all([
			handler(req as any, res as any),
			drain(res),
		]);

		expect(received.equals(content)).toBe(true);
		expect(res.headers["Content-Type"]).toBe("application/gzip");
		expect(res.headers["Content-Length"]).toBe(content.length);
		expect(String(res.headers["Content-Disposition"])).toContain(
			"bundle.tar.gz",
		);

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(peekDownloadToken(token)).toBeUndefined();
	});

	it("keeps the token valid when the connection closes before the download finishes", async () => {
		const bundlePath = join(root, "bundle-disconnect.tar.gz");
		await writeFile(bundlePath, Buffer.alloc(1024 * 1024, 7));

		createExportJob("export-disconnect-1", "user-1", "org-1");
		updateExportJob("export-disconnect-1", {
			status: "done",
			bundle: { serverId: null, path: bundlePath },
		});
		const token = issueDownloadToken("export-disconnect-1") as string;

		const req = buildReq("GET", token);
		const res = buildRes();

		res.once("data", () => {
			res.destroy();
		});

		await handler(req as any, res as any);

		expect(peekDownloadToken(token)).toBeDefined();
	});

	it("destroys the response instead of hanging when the source stream errors mid-read", async () => {
		const bundlePath = join(root, "bundle-error.tar.gz");
		await writeFile(bundlePath, Buffer.from("will never actually be read"));
		errorPathBox.value = bundlePath;

		createExportJob("export-error-1", "user-1", "org-1");
		updateExportJob("export-error-1", {
			status: "done",
			bundle: { serverId: null, path: bundlePath },
		});
		const token = issueDownloadToken("export-error-1") as string;

		const req = buildReq("GET", token);
		const res = buildRes();

		await handler(req as any, res as any);

		expect(res.destroyed).toBe(true);
	});

	it("rejects a GET with a non-string token param", async () => {
		const req = { method: "GET", query: { token: ["a", "b"] } };
		const res = buildRes();
		await handler(req as any, res as any);
		expect(res.statusCode).toBe(400);
	});

	it("rejects non-GET methods", async () => {
		const req = buildReq("POST", "whatever");
		const res = buildRes();
		await handler(req as any, res as any);
		expect(res.statusCode).toBe(405);
	});

	it("does not buffer the whole file into memory while streaming a large bundle", async () => {
		const bundlePath = join(root, "large-bundle.tar.gz");
		const chunkSize = 1024 * 1024;
		const chunkCount = 50;
		const chunk = Buffer.alloc(chunkSize, 7);
		const { open } = await import("node:fs/promises");
		const handle = await open(bundlePath, "w");
		for (let i = 0; i < chunkCount; i++) {
			await handle.write(chunk);
		}
		await handle.close();

		createExportJob("export-large", "user-1", "org-1");
		updateExportJob("export-large", {
			status: "done",
			bundle: { serverId: null, path: bundlePath },
		});
		const token = issueDownloadToken("export-large") as string;

		const req = buildReq("GET", token);
		const res = buildRes();
		res.resume();

		if (global.gc) {
			global.gc();
		}
		const before = process.memoryUsage().heapUsed;

		await handler(
			req as unknown as Parameters<typeof handler>[0],
			res as unknown as Parameters<typeof handler>[1],
		);

		if (global.gc) {
			global.gc();
		}
		const after = process.memoryUsage().heapUsed;
		const grew = after - before;

		expect(grew).toBeLessThan((chunkSize * chunkCount) / 2);
	});
});
