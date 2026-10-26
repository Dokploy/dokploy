import { db } from "@dokploy/server/db";
import {
	type apiCreatePreviewDeployment,
	deployments,
	organization,
	previewDeployments,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import { generatePassword } from "../templates";
import { removeService } from "../utils/docker/utils";
import { removeDirectoryCode } from "../utils/filesystem/directory";
import { authGithub } from "../utils/providers/github";
import { removeTraefikConfig } from "../utils/traefik/application";
import { manageDomain } from "../utils/traefik/domain";
import { findApplicationById } from "./application";
import { removeDeploymentsByPreviewDeploymentId } from "./deployment";
import { createDomain } from "./domain";
import { findGithubById, getIssueComment } from "./github";
import { getWebServerSettings } from "./web-server-settings";

export type PreviewDeployment = typeof previewDeployments.$inferSelect;

export const findPreviewDeploymentById = async (
	previewDeploymentId: string,
) => {
	const application = await db.query.previewDeployments.findFirst({
		where: eq(previewDeployments.previewDeploymentId, previewDeploymentId),
		with: {
			domain: true,
			application: {
				columns: {
					applicationId: true,
					serverId: true,
					buildServerId: true,
				},
			},
		},
	});
	if (!application) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Preview Deployment not found",
		});
	}
	return application;
};

export const removePreviewDeployment = async (previewDeploymentId: string) => {
	try {
		const previewDeployment =
			await findPreviewDeploymentById(previewDeploymentId);
		const application = await findApplicationById(
			previewDeployment.applicationId,
		);

		application.appName = previewDeployment.appName;
		const cleanupOperations = [
			async () =>
				await removeService(application?.appName, application?.serverId),
			async () =>
				await removeDeploymentsByPreviewDeploymentId(
					previewDeployment,
					application?.serverId,
				),
			async () =>
				await removeDirectoryCode(application?.appName, application?.serverId),
			async () =>
				await removeTraefikConfig(application?.appName, application?.serverId),
			async () => {
				if (application.buildServerId) {
					await removeDeploymentsByPreviewDeploymentId(
						previewDeployment,
						application.buildServerId,
					);
				}
			},
			async () => {
				if (application.buildServerId) {
					await removeDirectoryCode(
						application.appName,
						application.buildServerId,
					);
				}
			},
			async () =>
				await db
					.delete(previewDeployments)
					.where(
						eq(previewDeployments.previewDeploymentId, previewDeploymentId),
					)
					.returning(),
		];
		for (const operation of cleanupOperations) {
			try {
				await operation();
			} catch (error) {
				console.error(error);
			}
		}
		return previewDeployment;
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Error deleting this preview deployment";
		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
		});
	}
};
// testing-tesoitnmg-ddq0ul-preview-ihl44o
export const updatePreviewDeployment = async (
	previewDeploymentId: string,
	previewDeploymentData: Partial<PreviewDeployment>,
) => {
	const application = await db
		.update(previewDeployments)
		.set({
			...previewDeploymentData,
		})
		.where(eq(previewDeployments.previewDeploymentId, previewDeploymentId))
		.returning();

	return application;
};

export const findPreviewDeploymentsByApplicationId = async (
	applicationId: string,
) => {
	const deploymentsList = await db.query.previewDeployments.findMany({
		where: eq(previewDeployments.applicationId, applicationId),
		orderBy: desc(previewDeployments.createdAt),
		with: {
			deployments: {
				orderBy: desc(deployments.createdAt),
			},
			domain: true,
		},
	});
	return deploymentsList;
};

export const createPreviewDeployment = async (
	schema: z.infer<typeof apiCreatePreviewDeployment>,
) => {
	const application = await findApplicationById(schema.applicationId);
	const appName = `preview-${application.appName}-${generatePassword(6)}`;

	const org = await db.query.organization.findFirst({
		where: eq(organization.id, application.environment.project.organizationId),
	});
	const generateDomain = await generateWildcardDomain(
		application.previewWildcard || "*.sslip.io",
		appName,
		application.server?.ipAddress || "",
		org?.ownerId || "",
	);

	if (!application.githubId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Github Account not configured correctly",
		});
	}

	// `findApplicationById` redacts `githubPrivateKey` from the `github`
	// relation, so the provider must be refetched to authenticate.
	const githubProvider = await findGithubById(application.githubId);
	const octokit = authGithub(githubProvider);

	const runningComment = getIssueComment(
		application.name,
		"initializing",
		`${application.previewHttps ? "https" : "http"}://${generateDomain}`,
	);

	const issue = await octokit.rest.issues.createComment({
		owner: application?.owner || "",
		repo: application?.repository || "",
		issue_number: Number.parseInt(schema.pullRequestNumber),
		body: `### Dokploy Preview Deployment\n\n${runningComment}`,
	});

	const previewDeployment = await db
		.insert(previewDeployments)
		.values({
			...schema,
			appName: appName,
			pullRequestCommentId: `${issue.data.id}`,
		})
		.returning()
		.then((value) => value[0]);

	if (!previewDeployment) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the preview deployment",
		});
	}

	const newDomain = await createDomain({
		host: generateDomain,
		path: application.previewPath,
		port: application.previewPort,
		https: application.previewHttps,
		certificateType: application.previewCertificateType,
		customCertResolver: application.previewCustomCertResolver,
		domainType: "preview",
		previewDeploymentId: previewDeployment.previewDeploymentId,
	});

	application.appName = appName;

	await manageDomain(application, newDomain);

	await db
		.update(previewDeployments)
		.set({
			domainId: newDomain.domainId,
		})
		.where(
			eq(
				previewDeployments.previewDeploymentId,
				previewDeployment.previewDeploymentId,
			),
		);

	return previewDeployment;
};

export const findPreviewDeploymentsByPullRequestId = async (
	pullRequestId: string,
) => {
	const previewDeploymentResult = await db.query.previewDeployments.findMany({
		where: eq(previewDeployments.pullRequestId, pullRequestId),
	});

	return previewDeploymentResult;
};

export const findPreviewDeploymentByApplicationId = async (
	applicationId: string,
	pullRequestId: string,
) => {
	const previewDeploymentResult = await db.query.previewDeployments.findFirst({
		where: and(
			eq(previewDeployments.applicationId, applicationId),
			eq(previewDeployments.pullRequestId, pullRequestId),
		),
	});

	return previewDeploymentResult;
};

const previewCreationLocks = new Map<string, Promise<void>>();

/**
 * Runs `fn` after every earlier caller for the same application has finished.
 * GitHub delivers one `pull_request` event per label a pull request is opened
 * with, all within a few seconds, and each webhook handler would otherwise
 * find no preview yet and create its own; the preview limit is also only
 * exact when nothing else creates a preview between the count and the insert.
 */
const withPreviewCreationLock = async <T>(
	applicationId: string,
	fn: () => Promise<T>,
): Promise<T> => {
	const previous = previewCreationLocks.get(applicationId) ?? Promise.resolve();
	let release = () => {};
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	const chained = previous.then(() => current);
	previewCreationLocks.set(applicationId, chained);
	await previous;
	try {
		return await fn();
	} finally {
		release();
		if (previewCreationLocks.get(applicationId) === chained) {
			previewCreationLocks.delete(applicationId);
		}
	}
};

/**
 * The preview deployment for a pull request, created when it does not exist
 * yet. Returns `null` when a new preview would exceed `previewLimit`; an
 * existing preview is returned whatever the limit, so an updated pull request
 * can still be redeployed.
 */
export const findOrCreatePreviewDeployment = async (
	schema: z.infer<typeof apiCreatePreviewDeployment>,
	previewLimit: number,
): Promise<{ previewDeployment: PreviewDeployment | null; created: boolean }> =>
	withPreviewCreationLock(schema.applicationId, async () => {
		const existing = await findPreviewDeploymentByApplicationId(
			schema.applicationId,
			schema.pullRequestId,
		);
		if (existing) {
			return { previewDeployment: existing, created: false };
		}

		const total = await db.$count(
			previewDeployments,
			eq(previewDeployments.applicationId, schema.applicationId),
		);
		if (total >= previewLimit) {
			return { previewDeployment: null, created: false };
		}

		const previewDeployment = await createPreviewDeployment(schema);
		return { previewDeployment, created: true };
	});

const generateWildcardDomain = async (
	baseDomain: string,
	appName: string,
	serverIp: string,
	_userId: string,
): Promise<string> => {
	if (!baseDomain.startsWith("*.")) {
		throw new Error('The base domain must start with "*."');
	}
	const hash = `${appName}`;
	if (baseDomain.includes("sslip.io")) {
		let ip = "";

		if (process.env.NODE_ENV === "development") {
			ip = "127.0.0.1";
		}

		if (serverIp) {
			ip = serverIp;
		}

		if (!ip) {
			const settings = await getWebServerSettings();
			ip = settings?.serverIp || "";
		}

		const slugIp = ip.replaceAll(".", "-");
		return baseDomain.replace(
			"*",
			`${hash}${slugIp === "" ? "" : `-${slugIp}`}`,
		);
	}

	return baseDomain.replace("*", hash);
};
