import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { streamBox } = vi.hoisted(() => ({
	streamBox: { content: Buffer.from("bundle bytes"), exitCode: 0 },
}));

vi.mock(
	"@dokploy/server/services/project-export-import",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@dokploy/server/services/project-export-import")
			>();
		const { PassThrough: Pass } = await import("node:stream");
		return {
			...actual,
			assertTransferPermission: vi.fn(async () => ({ role: "owner" })),
			findOrganizationDestination: vi.fn(
				async (destinationId: string, organizationId: string) => {
					if (destinationId === "dest-1" && organizationId === "org-1") {
						return { destinationId, bucket: "b", organizationId };
					}
					throw new Error("Destination not found");
				},
			),
			listBundles: vi.fn(async () => [
				{
					key: `${actual.EXPORTS_DIRECTORY}/p-1.dokploy.tar.gz`,
					size: streamBox.content.length,
					modTime: "2024-01-01T00:00:00.000Z",
				},
			]),
			streamBundleFromDestination: vi.fn(async () => {
				const stdout = new Pass();
				const stdin = new Pass();
				stdin.resume();
				process.nextTick(() => stdout.end(streamBox.content));
				return {
					stdin,
					stdout,
					stderr: new Pass(),
					exit: Promise.resolve(streamBox.exitCode),
					close: () => {},
				};
			}),
		};
	},
);

const { assertTransferPermission, EXPORTS_DIRECTORY } = await import(
	"@dokploy/server/services/project-export-import"
);
const handler = (await import("../../pages/api/project-export-import/bundle"))
	.default;

const buildReq = (query: Record<string, string>, method = "GET") => ({
	method,
	query,
	headers: {},
});

const buildRes = () => {
	const body = new PassThrough();
	const chunks: Buffer[] = [];
	body.on("data", (chunk) => chunks.push(chunk as Buffer));
	const res = body as unknown as PassThrough & {
		statusCode: number;
		jsonBody?: unknown;
		headers: Record<string, unknown>;
		status: (code: number) => typeof res;
		json: (value: unknown) => void;
		setHeader: (key: string, value: unknown) => void;
		body: () => Buffer;
	};
	res.statusCode = 200;
	res.headers = {};
	res.status = (code) => {
		res.statusCode = code;
		return res;
	};
	res.json = (value) => {
		res.jsonBody = value;
		res.end();
	};
	res.setHeader = (key, value) => {
		res.headers[key] = value;
	};
	res.body = () => Buffer.concat(chunks);
	return res;
};

const goodKey = `${EXPORTS_DIRECTORY}/p-1.dokploy.tar.gz`;

beforeEach(() => {
	sessionToReturn = {
		session: { activeOrganizationId: "org-1" },
		user: { id: "user-1" },
	};
	streamBox.exitCode = 0;
});

describe("bundle download route", () => {
	it("rejects unauthenticated requests", async () => {
		sessionToReturn = { session: null, user: null };
		const res = buildRes();
		await handler(
			buildReq({ destinationId: "dest-1", key: goodKey }) as any,
			res as any,
		);
		expect(res.statusCode).toBe(401);
	});

	it("rejects keys outside the exports directory or with the wrong extension", async () => {
		for (const key of [
			"backups/prod.sql.gz",
			`${EXPORTS_DIRECTORY}/../secret.dokploy.tar.gz`,
			`${EXPORTS_DIRECTORY}/notes.txt`,
		]) {
			const res = buildRes();
			await handler(
				buildReq({ destinationId: "dest-1", key }) as any,
				res as any,
			);
			expect(res.statusCode).toBe(400);
		}
	});

	it("rejects a non-owner caller", async () => {
		vi.mocked(assertTransferPermission).mockRejectedValueOnce(
			new Error("Only organization owners and admins can do that"),
		);
		const res = buildRes();
		await handler(
			buildReq({ destinationId: "dest-1", key: goodKey }) as any,
			res as any,
		);
		expect(res.statusCode).toBe(403);
	});

	it("returns 404 for a destination outside the organization", async () => {
		const res = buildRes();
		await handler(
			buildReq({ destinationId: "dest-other", key: goodKey }) as any,
			res as any,
		);
		expect(res.statusCode).toBe(404);
	});

	it("returns 404 for a bundle that is not in the listing", async () => {
		const res = buildRes();
		await handler(
			buildReq({
				destinationId: "dest-1",
				key: `${EXPORTS_DIRECTORY}/missing.dokploy.tar.gz`,
			}) as any,
			res as any,
		);
		expect(res.statusCode).toBe(404);
	});

	it("streams the object with the right headers", async () => {
		const res = buildRes();
		await handler(
			buildReq({ destinationId: "dest-1", key: goodKey }) as any,
			res as any,
		);
		expect(res.statusCode).toBe(200);
		expect(res.headers["Content-Length"]).toBe(streamBox.content.length);
		expect(res.headers["Content-Disposition"]).toContain("p-1.dokploy.tar.gz");
		expect(res.body().equals(streamBox.content)).toBe(true);
	});

	it("answers with a JSON error when listing the destination fails", async () => {
		const { listBundles } = await import(
			"@dokploy/server/services/project-export-import"
		);
		vi.mocked(listBundles).mockRejectedValueOnce(new Error("bad credentials"));
		const res = buildRes();
		await handler(
			buildReq({ destinationId: "dest-1", key: goodKey }) as any,
			res as any,
		);
		expect(res.statusCode).toBe(502);
	});
});
