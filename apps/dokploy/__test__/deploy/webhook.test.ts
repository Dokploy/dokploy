import crypto from "node:crypto";
import httpMocks from "node-mocks-http";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "@/pages/api/deploy/[refreshToken]";
import { db } from "@/server/db";

vi.mock("@/server/db", () => ({
	db: {
		query: {
			applications: {
				findFirst: vi.fn(),
			},
		},
	},
}));

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: {
		add: vi.fn(),
	},
}));

describe("Deployment Webhook Signature Verification", () => {
	const refreshToken = "test-refresh-token";
	const webhookSecret = "test-secret";

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should return 401 Unauthorized if the signature is invalid", async () => {
		const requestBody = { test: "payload" };
		const stringifiedBody = JSON.stringify(requestBody);
		const signature =
			"sha256=" +
			crypto
				.createHmac("sha256", "this-is-the-wrong-secret")
				.update(stringifiedBody)
				.digest("hex");

		const req = httpMocks.createRequest({
			method: "POST",
			url: `/api/deploy/${refreshToken}`,
			headers: {
				"x-github-event": "push",
				"x-hub-signature-256": signature,
			},
			query: {
				refreshToken,
			},
		});

		const res = httpMocks.createResponse();

		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			webhookSecret,
			autoDeploy: true,
		} as any);

		const handlerPromise = handler(req as any, res as any);
		req.emit("data", Buffer.from(stringifiedBody));
		req.emit("end");
		await handlerPromise;

		expect(res.statusCode).toBe(401);
		expect(res._getJSONData()).toEqual({ message: "Unauthorized" });
	});

	it("should succeed with a valid signature", async () => {
		const requestBody = {
			test: "payload",
			head_commit: { id: "some-hash" },
			ref: "refs/heads/main",
		};
		const stringifiedBody = JSON.stringify(requestBody);
		const signature =
			"sha256=" +
			crypto
				.createHmac("sha256", webhookSecret)
				.update(stringifiedBody)
				.digest("hex");

		const req = httpMocks.createRequest({
			method: "POST",
			url: `/api/deploy/${refreshToken}`,
			headers: {
				"x-github-event": "push",
				"x-hub-signature-256": signature,
			},
			query: {
				refreshToken,
			},
		});

		const res = httpMocks.createResponse();

		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			webhookSecret,
			autoDeploy: true,
			sourceType: "github",
			branch: "main",
		} as any);

		const handlerPromise = handler(req as any, res as any);
		req.emit("data", Buffer.from(stringifiedBody));
		req.emit("end");
		await handlerPromise;

		expect(res.statusCode).toBe(200);
		expect(res._getJSONData()).toEqual({
			message: "Application deployed successfully",
		});
	});

    it("should succeed if no secret is configured", async () => {
		const requestBody = {
			test: "payload",
			head_commit: { id: "some-hash" },
			ref: "refs/heads/main",
		};
		const stringifiedBody = JSON.stringify(requestBody);

		const req = httpMocks.createRequest({
			method: "POST",
			url: `/api/deploy/${refreshToken}`,
			headers: {
				"x-github-event": "push",
			},
			query: {
				refreshToken,
			},
		});

		const res = httpMocks.createResponse();

		// Mock application without webhookSecret
		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			webhookSecret: null,
			autoDeploy: true,
			sourceType: "github",
			branch: "main",
		} as any);

		const handlerPromise = handler(req as any, res as any);
		req.emit("data", Buffer.from(stringifiedBody));
		req.emit("end");
		await handlerPromise;

		expect(res.statusCode).toBe(200);
		expect(res._getJSONData()).toEqual({
			message: "Application deployed successfully",
		});
	});
});