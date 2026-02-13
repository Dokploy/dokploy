import { createDomain, updateDomainById } from "@dokploy/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	baseDomainInput,
	mockExistingDomain,
	mockExistingDomainWithPath,
	mockOtherDomain,
	mockOtherDomainWithPath,
} from "./domain-conflict.helpers";

vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		transaction: vi.fn(),
		update: vi.fn(),
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

	describe("createDomain", () => {
		it("should throw CONFLICT error for duplicate domain without path (non-cloud)", async () => {
			const { db } = await import("@dokploy/server/db");

			vi.mocked(db.query.domains.findFirst).mockResolvedValue(mockExistingDomain);

			await expect(
				createDomain({
					...baseDomainInput,
					host: "example.com",
					path: null,
				}),
			).rejects.toThrow("Host 'example.com' is already in use");
		});

		it("should throw CONFLICT error for duplicate domain with path (non-cloud)", async () => {
			const { db } = await import("@dokploy/server/db");

			vi.mocked(db.query.domains.findFirst).mockResolvedValue(mockExistingDomainWithPath);

			await expect(
				createDomain({
					...baseDomainInput,
					host: "example.com",
					path: "/api",
				}),
			).rejects.toThrow("Host 'example.com' with path '/api' is already in use");
		});
	});


	describe("updateDomainById", () => {
		it("should throw CONFLICT error for duplicate domain without path (non-cloud)", async () => {
			const { db } = await import("@dokploy/server/db");

			vi.mocked(db.query.domains.findFirst).mockResolvedValue(mockOtherDomain);

			await expect(
				updateDomainById("domain-id", {
					host: "example.com",
					path: null,
				}),
			).rejects.toThrow("Host 'example.com' is already in use");
		});

		it("should throw CONFLICT error for duplicate domain with path (non-cloud)", async () => {
			const { db } = await import("@dokploy/server/db");

			vi.mocked(db.query.domains.findFirst).mockResolvedValue(mockOtherDomainWithPath);

			await expect(
				updateDomainById("domain-id", {
					host: "example.com",
					path: "/api",
				}),
			).rejects.toThrow("Host 'example.com' with path '/api' is already in use");
		});
	});
});
