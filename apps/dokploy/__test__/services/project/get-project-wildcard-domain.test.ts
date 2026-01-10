import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProjectWildcardDomain } from "@dokploy/server";

// Mock the database
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			projects: {
				findFirst: vi.fn(),
			},
		},
	},
}));

import { db } from "@dokploy/server/db";

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("getProjectWildcardDomain", () => {
	it("returns the project wildcard when set", async () => {
		vi.mocked(db.query.projects.findFirst).mockResolvedValue({
			wildcardDomain: "*.project.example.com",
			useOrganizationWildcard: true,
			organization: { wildcardDomain: "*.org.example.com" },
		} as never);

		const result = await getProjectWildcardDomain("project-1");

		expect(result).toBe("*.project.example.com");
		expect(db.query.projects.findFirst).toHaveBeenCalledWith({
			where: expect.anything(),
			with: { organization: true },
		});
	});

	it("falls back to the organization's wildcard when inheritance is enabled", async () => {
		vi.mocked(db.query.projects.findFirst).mockResolvedValue({
			wildcardDomain: null,
			useOrganizationWildcard: true,
			organization: { wildcardDomain: "*.org.example.com" },
		} as never);

		const result = await getProjectWildcardDomain("project-2");

		expect(result).toBe("*.org.example.com");
	});

	it("returns null when neither project nor organization wildcards are available", async () => {
		vi.mocked(db.query.projects.findFirst).mockResolvedValue({
			wildcardDomain: null,
			useOrganizationWildcard: false,
			organization: { wildcardDomain: "*.org.example.com" },
		} as never);

		const result = await getProjectWildcardDomain("project-3");

		expect(result).toBeNull();
	});
});
