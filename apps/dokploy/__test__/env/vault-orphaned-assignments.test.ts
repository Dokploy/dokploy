import { describe, expect, it } from "vitest";

interface VaultProviderAssignment {
	projectId: string;
	environmentIds: string[];
}

interface VaultProvider {
	vaultProviderId: string;
	name: string;
	organizationId: string;
	assignments: VaultProviderAssignment[];
}

interface ProjectWithEnvironments {
	projectId: string;
	organizationId: string;
	environments: { environmentId: string }[];
}

// Logic implementations mirroring packages/server/src/services/vault-provider.ts
const removeProjectFromAssignments = (
	providers: VaultProvider[],
	deletedProjectId: string,
): VaultProvider[] => {
	return providers.map((provider) => {
		const assignments = provider.assignments || [];
		if (!assignments.some((a) => a.projectId === deletedProjectId)) {
			return provider;
		}
		return {
			...provider,
			assignments: assignments.filter((a) => a.projectId !== deletedProjectId),
		};
	});
};

const removeEnvironmentFromAssignments = (
	providers: VaultProvider[],
	deletedEnvironmentId: string,
): VaultProvider[] => {
	return providers.map((provider) => {
		const assignments = provider.assignments || [];
		return {
			...provider,
			assignments: assignments.map((a) => ({
				...a,
				environmentIds: (a.environmentIds || []).filter(
					(envId) => envId !== deletedEnvironmentId,
				),
			})),
		};
	});
};

const sanitizeVaultAssignments = (
	assignments: VaultProviderAssignment[],
	orgProjects: ProjectWithEnvironments[],
): VaultProviderAssignment[] => {
	const validAssignments: VaultProviderAssignment[] = [];
	for (const assignment of assignments) {
		const project = orgProjects.find(
			(p) => p.projectId === assignment.projectId,
		);
		if (!project) {
			continue; // strip orphaned deleted projects
		}
		const validEnvironmentIds = new Set(
			project.environments.map((e) => e.environmentId),
		);
		const sanitizedEnvironmentIds = (assignment.environmentIds || []).filter(
			(envId) => validEnvironmentIds.has(envId),
		);
		validAssignments.push({
			projectId: assignment.projectId,
			environmentIds: sanitizedEnvironmentIds,
		});
	}
	return validAssignments;
};

const validateAssignments = (
	assignments: VaultProviderAssignment[],
	orgProjects: ProjectWithEnvironments[],
) => {
	for (const assignment of assignments) {
		const project = orgProjects.find(
			(p) => p.projectId === assignment.projectId,
		);
		if (!project) {
			throw new Error("Assignment references a project outside this organization");
		}
		const environmentIds = new Set(
			project.environments.map((e) => e.environmentId),
		);
		for (const envId of assignment.environmentIds) {
			if (!environmentIds.has(envId)) {
				throw new Error("Assignment references an environment outside the selected project");
			}
		}
	}
};

describe("Vault Orphaned Assignments Resolution (Fixes #5425)", () => {
	it("removes deleted project from all vault provider assignments", () => {
		const providers: VaultProvider[] = [
			{
				vaultProviderId: "vp-1",
				name: "Infisical Prod",
				organizationId: "org-1",
				assignments: [
					{ projectId: "demo-project", environmentIds: ["env-prod"] },
					{ projectId: "active-project", environmentIds: ["env-stage"] },
				],
			},
			{
				vaultProviderId: "vp-2",
				name: "HashiCorp Staging",
				organizationId: "org-1",
				assignments: [
					{ projectId: "demo-project", environmentIds: [] },
				],
			},
		];

		const updated = removeProjectFromAssignments(providers, "demo-project");

		// demo-project assignment is completely removed from vp-1
		expect(updated[0].assignments).toHaveLength(1);
		expect(updated[0].assignments[0].projectId).toBe("active-project");

		// demo-project assignment is completely removed from vp-2
		expect(updated[1].assignments).toHaveLength(0);
	});

	it("removes deleted environmentId from vault provider assignments", () => {
		const providers: VaultProvider[] = [
			{
				vaultProviderId: "vp-1",
				name: "Doppler",
				organizationId: "org-1",
				assignments: [
					{
						projectId: "proj-1",
						environmentIds: ["env-deleted", "env-keep-1", "env-keep-2"],
					},
				],
			},
		];

		const updated = removeEnvironmentFromAssignments(providers, "env-deleted");

		expect(updated[0].assignments[0].environmentIds).toEqual([
			"env-keep-1",
			"env-keep-2",
		]);
	});

	it("sanitizes assignments by stripping projects that no longer exist in the organization", () => {
		const orgProjects: ProjectWithEnvironments[] = [
			{
				projectId: "active-project",
				organizationId: "org-1",
				environments: [
					{ environmentId: "env-1" },
					{ environmentId: "env-2" },
				],
			},
		];

		// Stale form submission or legacy DB state with deleted project reference
		const incomingAssignments: VaultProviderAssignment[] = [
			{ projectId: "deleted-demo-project", environmentIds: ["old-env"] },
			{ projectId: "active-project", environmentIds: ["env-1", "stale-env-3"] },
		];

		const sanitized = sanitizeVaultAssignments(incomingAssignments, orgProjects);

		expect(sanitized).toHaveLength(1);
		expect(sanitized[0].projectId).toBe("active-project");
		// Stale environment 'stale-env-3' was also purged
		expect(sanitized[0].environmentIds).toEqual(["env-1"]);

		// Sanitized assignments pass validation without throwing "Assignment references a project outside this organization"
		expect(() => validateAssignments(sanitized, orgProjects)).not.toThrow();
	});

	it("prevents UI lock-out by allowing update after project deletion", () => {
		const orgProjects: ProjectWithEnvironments[] = [
			{
				projectId: "main-app",
				organizationId: "org-1",
				environments: [{ environmentId: "env-main" }],
			},
		];

		// User deleted 'demo-project', now opening Vault Settings and clicking Save:
		const staleClientData: VaultProviderAssignment[] = [
			{ projectId: "demo-project", environmentIds: [] },
			{ projectId: "main-app", environmentIds: ["env-main"] },
		];

		// Without sanitization, validateAssignments throws and blocks the user
		expect(() => validateAssignments(staleClientData, orgProjects)).toThrow(
			"Assignment references a project outside this organization",
		);

		// With our fix (sanitizing first), it succeeds and safely saves the updated configuration
		const safeData = sanitizeVaultAssignments(staleClientData, orgProjects);
		expect(() => validateAssignments(safeData, orgProjects)).not.toThrow();
		expect(safeData).toEqual([
			{ projectId: "main-app", environmentIds: ["env-main"] },
		]);
	});
});
