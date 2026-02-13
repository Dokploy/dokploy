import { createDomain } from "@dokploy/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { baseDomainInput } from "./domain-conflict.helpers";

vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: true,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		transaction: vi.fn(),
		query: {
			domains: {
				findFirst: vi.fn(),
			},
		},
	},
}));

vi.mock("@dokploy/server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@dokploy/server")>();
	return {
		...actual,
		findApplicationById: vi.fn(),
		manageDomain: vi.fn(),
	};
});

describe("Domain Conflict Validation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should allow duplicate domains in cloud environment", async () => {
		const { db } = await import("@dokploy/server/db");

		vi.mocked(db.transaction).mockResolvedValue({
			domainId: "new-domain",
			host: "example.com",
			path: null,
		} as any);

		await expect(
			createDomain({
				...baseDomainInput,
				host: "example.com",
				path: null,
			}),
		).resolves.toBeDefined();
	});
});
