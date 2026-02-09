import { describe, expect, it } from "vitest";

// Type definitions matching the project structure
type Environment = {
	environmentId: string;
	name: string;
	isDefault: boolean;
};

type Project = {
	projectId: string;
	name: string;
	environments: Environment[];
};

/**
 * Helper function that selects the appropriate environment for a user
 * This matches the logic used in search-command.tsx and show.tsx
 */
function selectAccessibleEnvironment(
	project: Project | null | undefined,
): Environment | null {
	if (!project || !project.environments || project.environments.length === 0) {
		return null;
	}

	// Find default environment from accessible environments, or fall back to first accessible environment
	const defaultEnvironment =
		project.environments.find((environment) => environment.isDefault) ||
		project.environments[0];

	return defaultEnvironment || null;
}

describe("Environment Access Fallback", () => {
	describe("selectAccessibleEnvironment", () => {
		it("should return default environment when user has access to it", () => {
			const project: Project = {
				projectId: "proj-1",
				name: "Test Project",
				environments: [
					{
						environmentId: "env-prod",
						name: "production",
						isDefault: true,
					},
					{
						environmentId: "env-dev",
						name: "development",
						isDefault: false,
					},
				],
			};

			const result = selectAccessibleEnvironment(project);

			expect(result).not.toBeNull();
			expect(result?.environmentId).toBe("env-prod");
			expect(result?.isDefault).toBe(true);
		});

		it("should return first accessible environment when user doesn't have access to default", () => {
			// Simulating filtered environments (user only has access to development)
			const project: Project = {
				projectId: "proj-1",
				name: "Test Project",
				environments: [
					// Note: production is not in the list because user doesn't have access
					{
						environmentId: "env-dev",
						name: "development",
						isDefault: false,
					},
					{
						environmentId: "env-staging",
						name: "staging",
						isDefault: false,
					},
				],
			};

			const result = selectAccessibleEnvironment(project);

			expect(result).not.toBeNull();
			expect(result?.environmentId).toBe("env-dev");
			expect(result?.name).toBe("development");
		});

		it("should return first environment when no default is marked but environments exist", () => {
			const project: Project = {
				projectId: "proj-1",
				name: "Test Project",
				environments: [
					{
						environmentId: "env-dev",
						name: "development",
						isDefault: false,
					},
					{
						environmentId: "env-staging",
						name: "staging",
						isDefault: false,
					},
				],
			};

			const result = selectAccessibleEnvironment(project);

			expect(result).not.toBeNull();
			expect(result?.environmentId).toBe("env-dev");
		});

		it("should return null when project has no accessible environments", () => {
			const project: Project = {
				projectId: "proj-1",
				name: "Test Project",
				environments: [],
			};

			const result = selectAccessibleEnvironment(project);

			expect(result).toBeNull();
		});

		it("should return null when project is null", () => {
			const result = selectAccessibleEnvironment(null);

			expect(result).toBeNull();
		});

		it("should return null when project is undefined", () => {
			const result = selectAccessibleEnvironment(undefined);

			expect(result).toBeNull();
		});

		it("should handle project with single accessible environment", () => {
			const project: Project = {
				projectId: "proj-1",
				name: "Test Project",
				environments: [
					{
						environmentId: "env-dev",
						name: "development",
						isDefault: false,
					},
				],
			};

			const result = selectAccessibleEnvironment(project);

			expect(result).not.toBeNull();
			expect(result?.environmentId).toBe("env-dev");
		});

		it("should prioritize default environment even when it's not first in the array", () => {
			const project: Project = {
				projectId: "proj-1",
				name: "Test Project",
				environments: [
					{
						environmentId: "env-dev",
						name: "development",
						isDefault: false,
					},
					{
						environmentId: "env-staging",
						name: "staging",
						isDefault: false,
					},
					{
						environmentId: "env-prod",
						name: "production",
						isDefault: true,
					},
				],
			};

			const result = selectAccessibleEnvironment(project);

			expect(result).not.toBeNull();
			expect(result?.environmentId).toBe("env-prod");
			expect(result?.isDefault).toBe(true);
		});

		it("should handle multiple default environments by returning the first one found", () => {
			// Edge case: multiple environments marked as default (shouldn't happen, but test it)
			const project: Project = {
				projectId: "proj-1",
				name: "Test Project",
				environments: [
					{
						environmentId: "env-prod-1",
						name: "production-1",
						isDefault: true,
					},
					{
						environmentId: "env-prod-2",
						name: "production-2",
						isDefault: true,
					},
				],
			};

			const result = selectAccessibleEnvironment(project);

			expect(result).not.toBeNull();
			expect(result?.isDefault).toBe(true);
			// Should return the first default found
			expect(result?.environmentId).toBe("env-prod-1");
		});

		it("should work correctly when user has access to multiple environments including default", () => {
			const project: Project = {
				projectId: "proj-1",
				name: "Test Project",
				environments: [
					{
						environmentId: "env-prod",
						name: "production",
						isDefault: true,
					},
					{
						environmentId: "env-dev",
						name: "development",
						isDefault: false,
					},
					{
						environmentId: "env-staging",
						name: "staging",
						isDefault: false,
					},
				],
			};

			const result = selectAccessibleEnvironment(project);

			expect(result).not.toBeNull();
			expect(result?.environmentId).toBe("env-prod");
			expect(result?.isDefault).toBe(true);
		});

		it("should handle real-world scenario: user with only development access", () => {
			// This simulates the exact bug we're fixing:
			// User has access to development but not production (default)
			// The filtered environments array only contains development
			const project: Project = {
				projectId: "proj-1",
				name: "My Project",
				environments: [
					// Only development is accessible (production was filtered out)
					{
						environmentId: "env-dev-123",
						name: "development",
						isDefault: false,
					},
				],
			};

			const result = selectAccessibleEnvironment(project);

			expect(result).not.toBeNull();
			expect(result?.environmentId).toBe("env-dev-123");
			expect(result?.name).toBe("development");
			// Should not be null even though it's not the default
		});
	});

	describe("Environment selection edge cases", () => {
		it("should handle project with environments property as undefined", () => {
			const project = {
				projectId: "proj-1",
				name: "Test Project",
				environments: undefined,
			} as unknown as Project;

			const result = selectAccessibleEnvironment(project);

			expect(result).toBeNull();
		});

		it("should handle project with null environments array", () => {
			const project = {
				projectId: "proj-1",
				name: "Test Project",
				environments: null,
			} as unknown as Project;

			const result = selectAccessibleEnvironment(project);

			expect(result).toBeNull();
		});
	});
});
