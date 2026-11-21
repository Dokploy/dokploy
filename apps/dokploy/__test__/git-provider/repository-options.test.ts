import { describe, expect, it } from "vitest";
import {
	groupRepositories,
	parseRepositoryDate,
	type RepositoryOption,
	toGithubRepositoryOption,
} from "@/utils/repository-options";

const option = (
	name: string,
	overrides: Partial<RepositoryOption> = {},
): RepositoryOption => ({
	value: `acme/${name}`,
	name,
	owner: "acme",
	visibility: "private",
	isFork: false,
	isArchived: false,
	lastActivityAt: null,
	...overrides,
});

const names = (entries: { option: RepositoryOption }[]) =>
	entries.map((entry) => entry.option.name);

describe("groupRepositories", () => {
	it("lists the most recently active repositories first", () => {
		const { active } = groupRepositories(
			[
				option("old", { lastActivityAt: "2024-01-01T00:00:00Z" }),
				option("newest", { lastActivityAt: "2026-11-01T00:00:00Z" }),
				option("recent", { lastActivityAt: "2026-06-01T00:00:00Z" }),
			],
			(repo) => repo,
		);

		expect(names(active)).toEqual(["newest", "recent", "old"]);
	});

	it("moves archived repositories into their own group, keeping recency order", () => {
		const { active, archived } = groupRepositories(
			[
				option("legacy-api", {
					isArchived: true,
					lastActivityAt: "2023-01-01T00:00:00Z",
				}),
				option("api", { lastActivityAt: "2026-01-01T00:00:00Z" }),
				option("old-blog", {
					isArchived: true,
					lastActivityAt: "2025-01-01T00:00:00Z",
				}),
			],
			(repo) => repo,
		);

		expect(names(active)).toEqual(["api"]);
		expect(names(archived)).toEqual(["old-blog", "legacy-api"]);
	});

	it("puts repositories without a usable date last, alphabetically", () => {
		const { active } = groupRepositories(
			[
				option("zeta"),
				option("broken", { lastActivityAt: "not-a-date" }),
				option("dated", { lastActivityAt: "2020-01-01T00:00:00Z" }),
				option("alpha"),
			],
			(repo) => repo,
		);

		expect(names(active)).toEqual(["dated", "alpha", "broken", "zeta"]);
	});

	it("keeps the original repository next to its option", () => {
		const repo = { id: 7, label: "api" };
		const { active } = groupRepositories([repo], (r) => option(r.label));

		expect(active[0]?.repository).toBe(repo);
	});
});

describe("parseRepositoryDate", () => {
	it("returns null for missing or invalid dates", () => {
		expect(parseRepositoryDate(null)).toBeNull();
		expect(parseRepositoryDate("not-a-date")).toBeNull();
		expect(parseRepositoryDate("2026-01-01T00:00:00Z")?.toISOString()).toBe(
			"2026-01-01T00:00:00.000Z",
		);
	});
});

describe("toGithubRepositoryOption", () => {
	const githubRepo = (
		overrides: Record<string, unknown>,
	): Parameters<typeof toGithubRepositoryOption>[0] =>
		({
			name: "api",
			owner: { login: "acme" },
			private: false,
			visibility: "public",
			fork: false,
			archived: false,
			pushed_at: "2026-01-01T00:00:00Z",
			...overrides,
		}) as unknown as Parameters<typeof toGithubRepositoryOption>[0];

	it("maps GitHub status fields", () => {
		expect(
			toGithubRepositoryOption(
				githubRepo({ private: true, visibility: "private", fork: true }),
			),
		).toEqual({
			value: "acme/api",
			name: "api",
			owner: "acme",
			visibility: "private",
			isFork: true,
			isArchived: false,
			lastActivityAt: "2026-01-01T00:00:00Z",
		});
	});

	it("keeps GitHub Enterprise internal visibility", () => {
		expect(
			toGithubRepositoryOption(
				githubRepo({ private: true, visibility: "internal" }),
			).visibility,
		).toBe("internal");
	});

	it("falls back to the private flag when visibility is missing", () => {
		expect(
			toGithubRepositoryOption(
				githubRepo({ private: true, visibility: undefined }),
			).visibility,
		).toBe("private");
	});
});
