import { db } from "@dokploy/server/db";
import {
	type apiCreateSnapvisor,
	type apiUpdateSnapvisor,
	applications,
	deployments,
	snapvisorIntegration,
} from "@dokploy/server/db/schema";
import {
	createSnapvisorClient,
	type SnapvisorBuild,
	type SnapvisorClient,
} from "@dokploy/server/utils/snapvisor/client";
import { snapvisorWebBaseUrl } from "@dokploy/server/utils/snapvisor/urls";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import type { z } from "zod";
import { findApplicationById } from "./application";
import {
	findPreviewDeploymentById,
	updatePreviewDeployment,
} from "./preview-deployment";

export type SnapvisorIntegration = typeof snapvisorIntegration.$inferSelect;

export const snapvisorClientFor = (
	integration: Pick<SnapvisorIntegration, "accessToken" | "baseUrl">,
): SnapvisorClient =>
	createSnapvisorClient({
		accessToken: integration.accessToken,
		baseUrl: integration.baseUrl,
	});

/** Masks a stored access token down to its last four characters. */
export const maskSnapvisorAccessToken = (accessToken: string) =>
	accessToken.length > 4 ? `••••${accessToken.slice(-4)}` : "••••";

/**
 * Deep link to a build review in the Snapvisor dashboard. Path shape
 * `/{owner}/{project}/builds/{buildNumber}`, confirmed against the Snapvisor
 * frontend routes (`apps/frontend/src/pages/Build/BuildParams.ts`,
 * `apps/frontend/src/pages/Project/Builds.tsx`).
 */
export const snapvisorBuildReviewUrl = (
	integration: Pick<SnapvisorIntegration, "baseUrl" | "accountSlug">,
	projectName: string,
	buildNumber: number | string,
) =>
	`${snapvisorWebBaseUrl(integration.baseUrl)}/${encodeURIComponent(
		integration.accountSlug,
	)}/${encodeURIComponent(projectName)}/builds/${buildNumber}`;

// ---------------------------------------------------------------------------
// Integration CRUD (one row per organization)
// ---------------------------------------------------------------------------

export const findSnapvisorByOrganizationId = async (organizationId: string) => {
	const result = await db.query.snapvisorIntegration.findFirst({
		where: eq(snapvisorIntegration.organizationId, organizationId),
	});
	return result ?? null;
};

export const createSnapvisor = async (
	input: z.infer<typeof apiCreateSnapvisor>,
	organizationId: string,
) => {
	const existing = await findSnapvisorByOrganizationId(organizationId);
	if (existing) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"This organization already has a Snapvisor integration. Edit it instead.",
		});
	}
	const created = await db
		.insert(snapvisorIntegration)
		.values({
			name: input.name,
			accessToken: input.accessToken,
			accountSlug: input.accountSlug,
			baseUrl: input.baseUrl,
			organizationId,
		})
		.returning()
		.then((rows) => rows[0]);
	if (!created) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the Snapvisor integration",
		});
	}
	return created;
};

export const updateSnapvisor = async (
	organizationId: string,
	input: z.infer<typeof apiUpdateSnapvisor>,
) => {
	const values: Partial<SnapvisorIntegration> = {};
	if (input.name !== undefined) values.name = input.name;
	if (input.accessToken !== undefined) values.accessToken = input.accessToken;
	if (input.accountSlug !== undefined) values.accountSlug = input.accountSlug;
	if (input.baseUrl !== undefined) values.baseUrl = input.baseUrl;
	const updated = await db
		.update(snapvisorIntegration)
		.set(values)
		.where(eq(snapvisorIntegration.organizationId, organizationId))
		.returning()
		.then((rows) => rows[0]);
	if (!updated) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Snapvisor integration not found",
		});
	}
	return updated;
};

export const removeSnapvisor = async (organizationId: string) => {
	const removed = await db
		.delete(snapvisorIntegration)
		.where(eq(snapvisorIntegration.organizationId, organizationId))
		.returning()
		.then((rows) => rows[0]);
	return removed ?? null;
};

// ---------------------------------------------------------------------------
// Connection test + project picker
// ---------------------------------------------------------------------------

export const testSnapvisorConnection = async (params: {
	accessToken: string;
	baseUrl: string;
}) => {
	const client = snapvisorClientFor(params);
	const me = await client.getMe();
	return { accounts: me.accounts };
};

export const listSnapvisorProjects = async (
	integration: SnapvisorIntegration,
) => snapvisorClientFor(integration).listProjects(integration.accountSlug);

// ---------------------------------------------------------------------------
// Per-application project link
// ---------------------------------------------------------------------------

export const setApplicationSnapvisorProject = async (
	applicationId: string,
	projectName: string | null,
) => {
	const updated = await db
		.update(applications)
		.set({ snapvisorProjectName: projectName })
		.where(eq(applications.applicationId, applicationId))
		.returning()
		.then((rows) => rows[0]);
	if (!updated) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
	}
	return updated;
};

// ---------------------------------------------------------------------------
// Preview-deployment build linkage
// ---------------------------------------------------------------------------

/**
 * The commit sha of the code a preview deployment last built, read back from
 * the `Commit: <sha>` marker `deployPreviewApplication`/`rebuildPreviewApplication`
 * write onto the deployment row's `description` on success (the same
 * convention `deployApplication` uses for regular deploys).
 */
export const findLatestPreviewCommitSha = async (previewDeploymentId: string) => {
	const deployment = await db.query.deployments.findFirst({
		where: eq(deployments.previewDeploymentId, previewDeploymentId),
		orderBy: desc(deployments.createdAt),
	});
	// Snapvisor's `headSha` filter matches on the full SHA1, so a short/abbreviated
	// hash would silently return zero builds; require all 40 hex characters.
	const match = deployment?.description?.match(/Commit:\s*([0-9a-f]{40})/i);
	return match?.[1] ?? null;
};

export interface SnapvisorPreviewLinkResult {
	registered: boolean;
	reason?: string;
	build?: SnapvisorBuild;
}

/**
 * Looks up the Snapvisor build that already exists for a preview
 * deployment's latest commit and stores the linkage. Snapvisor's own
 * "Deployment" API (`createDeployment`/`finalizeDeployment` in
 * `apps/backend/src/api/handlers/{createDeployment,finalizeDeployment}.ts`)
 * is a static-hosting feature: it requires uploading every file with its
 * content hash and a *project* token, and returns a Snapvisor-hosted URL —
 * it has no field for an externally-hosted preview URL, so it cannot be used
 * to "register" a Dokploy preview. The only resource that actually carries
 * visual-diff state for a commit is a Build
 * (`apps/backend/src/api/handlers/listBuilds.ts`, filterable by `headSha`),
 * created by the user's own CI via the Snapvisor CLI. This function is
 * therefore the same lookup used by `refreshPreviewBuild`; the "register"
 * step is finding (not creating) the build for the commit Dokploy just
 * deployed.
 */
export const registerPreviewDeployment = async (params: {
	previewDeploymentId: string;
}): Promise<SnapvisorPreviewLinkResult> => {
	const previewDeployment = await findPreviewDeploymentById(
		params.previewDeploymentId,
	);
	if (!previewDeployment.applicationId) {
		return { registered: false, reason: "Not an application preview" };
	}
	const application = await findApplicationById(previewDeployment.applicationId);
	if (!application.snapvisorProjectName) {
		return { registered: false, reason: "Visual testing is off" };
	}
	const integration = await findSnapvisorByOrganizationId(
		application.environment.project.organizationId,
	);
	if (!integration) {
		return { registered: false, reason: "Snapvisor is not connected" };
	}
	const commitSha = await findLatestPreviewCommitSha(params.previewDeploymentId);
	if (!commitSha) {
		return { registered: false, reason: "No commit sha recorded yet" };
	}

	const client = snapvisorClientFor(integration);
	const builds = await client.listBuilds({
		accountSlug: integration.accountSlug,
		projectName: application.snapvisorProjectName,
		headSha: commitSha,
		perPage: 1,
	});
	const build = builds[0];
	if (!build) {
		return { registered: false, reason: "No Snapvisor build for this commit yet" };
	}

	await updatePreviewDeployment(params.previewDeploymentId, {
		snapvisorDeploymentId: build.id,
		snapvisorBuildId: String(build.number),
		snapvisorBuildStatus: build.status,
	});

	return { registered: true, build };
};

/**
 * Re-runs the Snapvisor build lookup for a preview deployment and refreshes
 * the stored status. Used by the manual refresh action on the preview card,
 * and functionally identical to `registerPreviewDeployment` (see its
 * docstring for why there is nothing to "create" on Snapvisor).
 */
export const refreshPreviewBuild = async (params: {
	previewDeploymentId: string;
}): Promise<SnapvisorPreviewLinkResult> => registerPreviewDeployment(params);
