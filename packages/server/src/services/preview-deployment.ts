import { db } from "@dokploy/server/db";
import {
	type apiCreatePreviewDeployment,
	type apiDeployPreviewFromImage,
	applications,
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
import { manageDomain, removeDomain } from "../utils/traefik/domain";
import { removeForwardAuthMiddleware } from "../utils/traefik/forward-auth";
import { findApplicationById } from "./application";
import { removeDeploymentsByPreviewDeploymentId } from "./deployment";
import { createDomain, findDomainById, updateDomainById } from "./domain";
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
			async () => {
				if (previewDeployment.domain) {
					await removeDomain(
						application,
						previewDeployment.domain.uniqueConfigKey,
					);
				}
			},
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

	// Image previews are created through the API, not by a GitHub webhook; the
	// deploy step comments on the pull request if a GitHub provider is linked.
	let pullRequestCommentId = "";
	if (application.sourceType === "github") {
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
		pullRequestCommentId = `${issue.data.id}`;
	}

	const previewDeployment = await db
		.insert(previewDeployments)
		.values({
			...schema,
			appName: appName,
			pullRequestCommentId,
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
		forwardAuthEnabled: application.previewForwardAuthEnabled,
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

	// The SSO toggle skips previews without a linked domain, so catch a change made while this one was being created.
	const current = await db.query.applications.findFirst({
		where: eq(applications.applicationId, schema.applicationId),
		columns: { previewForwardAuthEnabled: true },
	});
	if (
		current &&
		current.previewForwardAuthEnabled !== newDomain.forwardAuthEnabled
	) {
		await applyPreviewForwardAuth(
			application,
			newDomain.domainId,
			current.previewForwardAuthEnabled,
		);
	}

	return previewDeployment;
};

export const applyPreviewForwardAuth = async (
	previewApp: Awaited<ReturnType<typeof findApplicationById>>,
	domainId: string,
	enabled: boolean,
) => {
	await updateDomainById(domainId, { forwardAuthEnabled: enabled });
	const domain = await findDomainById(domainId);
	await manageDomain(previewApp, domain);
	if (!enabled) {
		await removeForwardAuthMiddleware(previewApp, domain.uniqueConfigKey);
	}
};

export const findPreviewDeploymentsByPullRequestId = async (
	pullRequestId: string,
) => {
	const previewDeploymentResult = await db.query.previewDeployments.findMany({
		where: eq(previewDeployments.pullRequestId, pullRequestId),
	});

	return previewDeploymentResult;
};

export const findPreviewDeploymentsByPullRequestIdForGithub = async (
	pullRequestId: string,
	githubId: string,
) => {
	const rows = await db.query.previewDeployments.findMany({
		where: eq(previewDeployments.pullRequestId, pullRequestId),
		with: { application: { columns: { githubId: true } } },
	});
	return rows.filter((row) => row.application?.githubId === githubId);
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

export const findPreviewDeploymentByPullRequestNumber = async (
	applicationId: string,
	pullRequestNumber: string,
) => {
	return await db.query.previewDeployments.findFirst({
		where: and(
			eq(previewDeployments.applicationId, applicationId),
			eq(previewDeployments.pullRequestNumber, pullRequestNumber),
		),
	});
};

export const getImageRepository = (image: string) => {
	const [withoutDigest = ""] = image.split("@");
	const tagSeparator = withoutDigest.lastIndexOf(":");
	// A colon before the last slash is a registry port, not a tag.
	return tagSeparator > withoutDigest.lastIndexOf("/")
		? withoutDigest.slice(0, tagSeparator)
		: withoutDigest;
};

export const upsertPreviewDeploymentFromImage = async (
	input: z.infer<typeof apiDeployPreviewFromImage>,
) => {
	const application = await findApplicationById(input.applicationId);

	if (application.sourceType !== "docker") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Only applications with a Docker source can deploy previews from an image",
		});
	}
	if (!application.isPreviewDeploymentsActive) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Preview deployments are disabled for this application",
		});
	}
	// The preview is pulled with the application's registry credentials, so it
	// is limited to the repository the application already runs.
	const repository = getImageRepository(application.dockerImage || "");
	if (!repository || getImageRepository(input.dockerImage) !== repository) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `The preview image must be a tag or digest of ${repository || "the application's Docker image"}`,
		});
	}

	const existing = await findPreviewDeploymentByPullRequestNumber(
		application.applicationId,
		input.pullRequestNumber,
	);
	if (existing) {
		await updatePreviewDeployment(existing.previewDeploymentId, {
			dockerImage: input.dockerImage,
			...(input.pullRequestTitle && {
				pullRequestTitle: input.pullRequestTitle,
			}),
			...(input.pullRequestURL && { pullRequestURL: input.pullRequestURL }),
			...(input.branch && { branch: input.branch }),
		});
		return await findPreviewDeploymentById(existing.previewDeploymentId);
	}

	const previewLimit = application.previewLimit ?? 3;
	if (application.previewDeployments.length >= previewLimit) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Preview deployment limit (${previewLimit}) reached for this application`,
		});
	}

	const previewDeployment = await createPreviewDeployment({
		applicationId: application.applicationId,
		dockerImage: input.dockerImage,
		branch: input.branch || "",
		pullRequestId: "",
		pullRequestNumber: input.pullRequestNumber,
		pullRequestTitle:
			input.pullRequestTitle || `Pull Request #${input.pullRequestNumber}`,
		pullRequestURL: input.pullRequestURL || "",
	});
	return await findPreviewDeploymentById(previewDeployment.previewDeploymentId);
};

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
