import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeploymentJob } from "../../../server/queues/queue-types";

// `deploy()` forwards cloud deployment jobs to the remote apps/api service via
// `fetch`. Every call site invokes it fire-and-forget and relies solely on a
// `.catch((error) => console.error("Background deployment failed:", error))`
// block to surface failures. Because `fetch` resolves for HTTP error statuses,
// the helper MUST reject on any non-2xx response — otherwise failures (e.g.
// `apps/api` returning 500 when `inngest.send` throws) resolve silently and the
// `Background deployment failed:` log line never fires on the dokploy-app side.

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
}));

import { findServerById } from "@dokploy/server/services/server";
import { deploy } from "@/server/utils/deploy";

const ACTIVE_SERVER = { serverId: "server-1", serverStatus: "active" } as const;

const job = (
	overrides: { applicationId?: string; serverId?: string } = {},
): DeploymentJob => ({
	applicationId: overrides.applicationId ?? "app-1",
	titleLog: "deploy",
	descriptionLog: "",
	type: "deploy",
	applicationType: "application",
	serverId: overrides.serverId ?? "server-1",
});

/** Build a minimal fetch Response stub with the given status and JSON body. */
const jsonResponse = (status: number, body: unknown) => {
	const json = vi.fn(async () => body);
	return {
		ok: status >= 200 && status < 300,
		status,
		json,
	} as unknown as Response;
};

/** Build a Response whose `json()` rejects (e.g. non-JSON / empty body). */
const badJsonResponse = (status: number) => {
	const json = vi.fn(async () => {
		throw new SyntaxError("Unexpected token < in JSON");
	});
	return {
		ok: status >= 200 && status < 300,
		status,
		json,
	} as unknown as Response;
};

const lastFetchRequest = () => vi.mocked(globalThis.fetch).mock.calls[0];
const lastFetchArgs = () => {
	const call = lastFetchRequest();
	return { url: call?.[0], init: call?.[1] };
};

describe("deploy", () => {
	beforeEach(() => {
		vi.stubEnv("SERVER_URL", "http://api.test");
		vi.stubEnv("API_KEY", "secret-key");
		vi.mocked(findServerById).mockResolvedValue(ACTIVE_SERVER as never);
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	describe("happy path", () => {
		it("returns the parsed JSON body on a 200", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				jsonResponse(200, {
					message: "Deployment Added to Inngest Queue",
					serverId: "server-1",
				}),
			);

			const data = await deploy(job());

			expect(data).toEqual({
				message: "Deployment Added to Inngest Queue",
				serverId: "server-1",
			});
		});

		it("returns the parsed body on any 2xx status", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				jsonResponse(201, { message: "accepted" }),
			);

			const data = await deploy(job());

			expect(data).toEqual({ message: "accepted" });
		});

		it("posts the job to {SERVER_URL}/deploy with the API key header and body", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				jsonResponse(200, { message: "ok" }),
			);
			const input = job({ applicationId: "app-9" });

			await deploy(input);

			const { url, init } = lastFetchArgs();
			expect(url).toBe("http://api.test/deploy");
			expect(init?.method).toBe("POST");
			expect(init?.headers).toEqual({
				"Content-Type": "application/json",
				"X-API-Key": "secret-key",
			});
			expect(init?.body).toBe(JSON.stringify(input));
		});
	});

	describe("non-2xx responses reject (the bug fix)", () => {
		it("rejects on a 500 carrying a JSON body with `message` (inngest.send failure)", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				jsonResponse(500, {
					message: "Failed to queue deployment",
					error: "inngest rate-limited",
				}),
			);

			await expect(deploy(job())).rejects.toThrow("Failed to queue deployment");
		});

		it("surfaces the response `message` field in the thrown error", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				jsonResponse(500, {
					message: "Inngest is down",
					error: "connection refused",
				}),
			);

			await expect(deploy(job())).rejects.toThrow("Inngest is down");
		});

		it("rejects on a 403 carrying a JSON body (API-key mismatch)", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				jsonResponse(403, { message: "Invalid API Key" }),
			);

			await expect(deploy(job())).rejects.toThrow("Invalid API Key");
		});

		it("rejects on a 400 with the @hono/zod-validator body shape (schema drift)", async () => {
			// `@hono/zod-validator` returns the raw safeParse result on failure:
			// `{ success: false, error: { issues: [...] } }` — no `message` field,
			// so the helper must fall back to its default message.
			vi.mocked(globalThis.fetch).mockResolvedValue(
				jsonResponse(400, {
					success: false,
					error: { issues: [{ path: ["serverId"], message: "required" }] },
				}),
			);

			await expect(deploy(job())).rejects.toThrow("Failed to queue deployment");
		});

		it("rejects on every non-2xx status (exhaustive class coverage)", async () => {
			for (const status of [400, 401, 403, 404, 409, 422, 500, 502, 503, 504]) {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce(
					jsonResponse(status, { message: `http-${status}` }),
				);
				await expect(deploy(job())).rejects.toThrow(`http-${status}`);
			}
		});

		it("falls back to the default message when the body has no `message` field", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				jsonResponse(500, { error: "boom" }),
			);

			await expect(deploy(job())).rejects.toThrow("Failed to queue deployment");
		});

		it("falls back to the default message when the error body is not JSON", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(badJsonResponse(500));

			await expect(deploy(job())).rejects.toThrow("Failed to queue deployment");
		});

		it("rejects (does not resolve) so caller `.catch` blocks fire", async () => {
			// Simulates the fire-and-forget call sites:
			// `deploy(jobData).catch((error) => console.error("Background deployment failed:", error))`
			vi.mocked(globalThis.fetch).mockResolvedValue(
				jsonResponse(500, { message: "inngest send failed" }),
			);

			const caught: unknown[] = [];
			await deploy(job()).catch((error) => {
				caught.push(error);
			});

			expect(caught).toHaveLength(1);
			expect(String(caught[0])).toContain("inngest send failed");
		});
	});

	describe("network-level errors (pre-existing behaviour, regression guard)", () => {
		it("rethrows when fetch itself rejects (DNS / ECONNREFUSED / TCP reset)", async () => {
			vi.mocked(globalThis.fetch).mockRejectedValue(new Error("fetch failed"));

			await expect(deploy(job())).rejects.toThrow("fetch failed");
		});
	});

	describe("pre-fetch guard (regression guard)", () => {
		it("rejects before fetch when the server is inactive", async () => {
			vi.mocked(findServerById).mockResolvedValue({
				...ACTIVE_SERVER,
				serverStatus: "inactive",
			} as never);
			vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, {}));

			await expect(deploy(job())).rejects.toThrow("Server is inactive");
			expect(globalThis.fetch).not.toHaveBeenCalled();
		});

		it("looks up the server by jobData.serverId before fetching", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, {}));
			const input = job({ serverId: "server-42" });

			await deploy(input);

			expect(findServerById).toHaveBeenCalledWith("server-42");
		});
	});

	describe("error-body consumption (regression guard against double-read bugs)", () => {
		it("reads the body once on a non-2xx response (no second success-path read)", async () => {
			const res = jsonResponse(500, { message: "fail" });
			vi.mocked(globalThis.fetch).mockResolvedValue(res);

			await expect(deploy(job())).rejects.toThrow("fail");
			// Only the error-branch read runs; the success-path `result.json()` is
			// unreachable on non-2xx after the guard.
			expect(res.json).toHaveBeenCalledTimes(1);
		});

		it("reads the body once on a 2xx response", async () => {
			const res = jsonResponse(200, { message: "ok" });
			vi.mocked(globalThis.fetch).mockResolvedValue(res);

			await deploy(job());

			expect(res.json).toHaveBeenCalledTimes(1);
		});
	});
});
