import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const where = vi.fn().mockResolvedValue(undefined);
	const set = vi.fn(() => ({ where }));
	return {
		findMany: vi.fn(),
		update: vi.fn(() => ({ set })),
		set,
		scheduleJob: vi.fn(),
		getPublicIp: vi.fn().mockResolvedValue("203.0.113.1"),
		fetch: vi.fn(),
	};
});

vi.mock("@dokploy/server/db/index", () => ({
	db: {
		query: { user: { findMany: mocks.findMany } },
		update: mocks.update,
	},
}));

vi.mock("@dokploy/server/db/schema/user", () => ({
	user: {
		id: "id",
		licenseKey: "licenseKey",
		enableEnterpriseFeatures: "enableEnterpriseFeatures",
		isValidEnterpriseLicense: "isValidEnterpriseLicense",
	},
}));

vi.mock("node-schedule", () => ({ scheduleJob: mocks.scheduleJob }));

vi.mock("@dokploy/server/wss/utils", () => ({
	getPublicIpWithFallback: mocks.getPublicIp,
}));

const shared = await import("@dokploy/server/utils/enterprise");
const app = await import("@/server/utils/enterprise");
const cron = await import("@dokploy/server/utils/crons/enterprise");

const operations = [
	["validate", shared.validateLicenseKey],
	["activate", shared.activateLicenseKey],
	["deactivate", shared.deactivateLicenseKey],
] as const;

beforeEach(() => {
	vi.clearAllMocks();
	mocks.fetch.mockReset();
	vi.stubGlobal("fetch", mocks.fetch);
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("shared license server client", () => {
	it("shares the validator between app helpers and scheduled checks", () => {
		expect(app.validateLicenseKey).toBe(shared.validateLicenseKey);
		expect(cron.validateLicenseKey).toBe(shared.validateLicenseKey);
		expect(app.activateLicenseKey).toBe(shared.activateLicenseKey);
		expect(app.deactivateLicenseKey).toBe(shared.deactivateLicenseKey);
		expect(cron.LICENSE_KEY_URL).toBe(shared.LICENSE_KEY_URL);
	});

	it.each(operations)(
		"posts the key and public IP to the %s endpoint and returns the backend result",
		async (action, operation) => {
			const response = { valid: false, message: "Backend result" };
			mocks.fetch.mockResolvedValue(Response.json(response));

			const result = await operation("license-1");

			expect(mocks.getPublicIp).toHaveBeenCalledOnce();
			expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(
				`${shared.LICENSE_KEY_URL}/licenses/${action}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ licenseKey: "license-1", ip: "203.0.113.1" }),
				},
			);
			expect(result).toEqual(action === "validate" ? false : response);
		},
	);

	it.each([true, false])(
		"returns the server's valid=%s decision",
		async (valid) => {
			mocks.fetch.mockResolvedValue(Response.json({ valid }));
			await expect(cron.validateLicenseKey("license-1")).resolves.toBe(valid);
		},
	);

	it.each(operations)(
		"preserves the backend error for %s",
		async (_action, operation) => {
			mocks.fetch.mockResolvedValue(
				Response.json({ message: "License expired" }, { status: 400 }),
			);
			await expect(operation("license-1")).rejects.toThrow("License expired");
		},
	);

	it.each(operations)(
		"uses the %s fallback error for non-JSON responses",
		async (action, operation) => {
			mocks.fetch.mockResolvedValue(
				new Response("Unavailable", { status: 503 }),
			);
			await expect(operation("license-1")).rejects.toThrow(
				`Failed to ${action} license key`,
			);
		},
	);

	it.each(operations)(
		"reports an unreachable server for %s",
		async (_action, operation) => {
			mocks.fetch.mockRejectedValue(new Error("fetch failed"));
			await expect(operation("license-1")).rejects.toThrow(
				"Could not reach the license server. Check your connection or try again later.",
			);
		},
	);

	it.each(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"])(
		"recognizes a nested %s network error",
		async (code) => {
			mocks.fetch.mockRejectedValue(
				new Error("Network error", { cause: { code } }),
			);
			await expect(shared.validateLicenseKey("license-1")).rejects.toThrow(
				"Could not reach the license server. Check your connection or try again later.",
			);
		},
	);

	it("propagates unexpected errors instead of accepting the license", async () => {
		const failure = new Error("Unexpected failure");
		mocks.fetch.mockRejectedValue(failure);
		await expect(shared.validateLicenseKey("license-1")).rejects.toBe(failure);
	});

	it("rejects malformed JSON instead of accepting the license", async () => {
		mocks.fetch.mockResolvedValue(new Response("not JSON"));
		await expect(shared.validateLicenseKey("license-1")).rejects.toBeInstanceOf(
			SyntaxError,
		);
	});
});

describe("scheduled validation", () => {
	it.each([true, false])(
		"applies the backend's valid=%s decision",
		async (valid) => {
			mocks.findMany.mockResolvedValue([
				{
					id: "owner-1",
					firstName: "Owner",
					lastName: "",
					licenseKey: "license-1",
					isValidEnterpriseLicense: true,
				},
			]);
			mocks.fetch.mockResolvedValue(Response.json({ valid }));

			await cron.initEnterpriseBackupCronJobs();
			const callback = mocks.scheduleJob.mock
				.calls[0]?.[2] as () => Promise<void>;
			await callback();

			expect(mocks.fetch).toHaveBeenCalledOnce();
			if (valid) {
				expect(mocks.update).not.toHaveBeenCalled();
			} else {
				expect(mocks.set).toHaveBeenCalledExactlyOnceWith({
					isValidEnterpriseLicense: false,
				});
			}
		},
	);
});
