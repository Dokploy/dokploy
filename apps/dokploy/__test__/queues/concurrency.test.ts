import { beforeEach, describe, expect, it, vi } from "vitest";

const hasValidLicense = vi.fn();
const getWebServerSettings = vi.fn();
const findFirstOrg = vi.fn();
const findFirstServer = vi.fn();

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			organization: {
				findFirst: (...args: unknown[]) => findFirstOrg(...args),
			},
			server: {
				findFirst: (...args: unknown[]) => findFirstServer(...args),
			},
		},
	},
}));

vi.mock("@dokploy/server/db/schema", () => ({
	organization: {},
	server: {},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: (...args: unknown[]) => hasValidLicense(...args),
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: (...args: unknown[]) => getWebServerSettings(...args),
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import {
	assertBuildsConcurrencyAllowed,
	resolveBuildsConcurrency,
} from "../../server/queues/concurrency";
import { LOCAL_PARTITION } from "../../server/queues/in-memory-queue";

describe("resolveBuildsConcurrency (enterprise gating)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		findFirstOrg.mockResolvedValue({ id: "org-1" });
	});

	describe("local web server partition", () => {
		it("returns the configured concurrency when licensed", async () => {
			getWebServerSettings.mockResolvedValue({ buildsConcurrency: 5 });
			hasValidLicense.mockResolvedValue(true);

			await expect(resolveBuildsConcurrency(LOCAL_PARTITION)).resolves.toBe(5);
		});

		it("clamps to the free max (2) when there is no valid license", async () => {
			getWebServerSettings.mockResolvedValue({ buildsConcurrency: 10 });
			hasValidLicense.mockResolvedValue(false);

			await expect(resolveBuildsConcurrency(LOCAL_PARTITION)).resolves.toBe(2);
		});

		it("allows the free max (2) without a license", async () => {
			getWebServerSettings.mockResolvedValue({ buildsConcurrency: 2 });
			hasValidLicense.mockResolvedValue(false);

			await expect(resolveBuildsConcurrency(LOCAL_PARTITION)).resolves.toBe(2);
		});

		it("does not cap the value when licensed (N allowed)", async () => {
			getWebServerSettings.mockResolvedValue({ buildsConcurrency: 999 });
			hasValidLicense.mockResolvedValue(true);

			await expect(resolveBuildsConcurrency(LOCAL_PARTITION)).resolves.toBe(
				999,
			);
		});

		it("defaults to 1 when settings are missing", async () => {
			getWebServerSettings.mockResolvedValue(undefined);
			hasValidLicense.mockResolvedValue(true);

			await expect(resolveBuildsConcurrency(LOCAL_PARTITION)).resolves.toBe(1);
		});
	});

	describe("remote server partition", () => {
		it("returns the server concurrency when its org is licensed", async () => {
			findFirstServer.mockResolvedValue({
				buildsConcurrency: 4,
				organizationId: "org-1",
			});
			hasValidLicense.mockResolvedValue(true);

			await expect(resolveBuildsConcurrency("server-1")).resolves.toBe(4);
			expect(hasValidLicense).toHaveBeenCalledWith("org-1");
		});

		it("clamps to the free max (2) when the server org is not licensed", async () => {
			findFirstServer.mockResolvedValue({
				buildsConcurrency: 8,
				organizationId: "org-1",
			});
			hasValidLicense.mockResolvedValue(false);

			await expect(resolveBuildsConcurrency("server-1")).resolves.toBe(2);
		});

		it("defaults to 1 for an unknown server", async () => {
			findFirstServer.mockResolvedValue(undefined);

			await expect(resolveBuildsConcurrency("ghost")).resolves.toBe(1);
		});
	});

	it("falls back to 1 if resolution throws", async () => {
		getWebServerSettings.mockRejectedValue(new Error("db down"));

		await expect(resolveBuildsConcurrency(LOCAL_PARTITION)).resolves.toBe(1);
	});
});

describe("assertBuildsConcurrencyAllowed", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("allows up to the free max (2) without checking the license", async () => {
		await expect(
			assertBuildsConcurrencyAllowed(2, "org-1"),
		).resolves.toBeUndefined();
		expect(hasValidLicense).not.toHaveBeenCalled();
	});

	it("allows more than 2 when licensed", async () => {
		hasValidLicense.mockResolvedValue(true);
		await expect(
			assertBuildsConcurrencyAllowed(5, "org-1"),
		).resolves.toBeUndefined();
	});

	it("rejects more than 2 without a license", async () => {
		hasValidLicense.mockResolvedValue(false);
		await expect(assertBuildsConcurrencyAllowed(3, "org-1")).rejects.toThrow(
			/enterprise license/i,
		);
	});
});
