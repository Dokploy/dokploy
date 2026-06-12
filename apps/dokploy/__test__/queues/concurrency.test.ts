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

import { resolveBuildsConcurrency } from "../../server/queues/concurrency";
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

		it("clamps to 1 when there is no valid license", async () => {
			getWebServerSettings.mockResolvedValue({ buildsConcurrency: 10 });
			hasValidLicense.mockResolvedValue(false);

			await expect(resolveBuildsConcurrency(LOCAL_PARTITION)).resolves.toBe(1);
		});

		it("caps the configured value at 20 when licensed", async () => {
			getWebServerSettings.mockResolvedValue({ buildsConcurrency: 999 });
			hasValidLicense.mockResolvedValue(true);

			await expect(resolveBuildsConcurrency(LOCAL_PARTITION)).resolves.toBe(20);
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

		it("clamps to 1 when the server org is not licensed", async () => {
			findFirstServer.mockResolvedValue({
				buildsConcurrency: 8,
				organizationId: "org-1",
			});
			hasValidLicense.mockResolvedValue(false);

			await expect(resolveBuildsConcurrency("server-1")).resolves.toBe(1);
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
