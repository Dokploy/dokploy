import { db } from "@dokploy/server/db";
import {
	type apiCreatePreviewDeployment,
	deployments,
	organization,
	previewDeployments,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { generatePassword } from "../templates";
import { removeService } from "../utils/docker/utils";
import { removeDirectoryCode } from "../utils/filesystem/directory";
import { authGithub } from "../utils/providers/github";
import { removeTraefikConfig } from "../utils/traefik/application";
import { manageDomain } from "../utils/traefik/domain";
import { findUserById } from "./admin";
import { findApplicationById } from "./application";
import { removeDeploymentsByPreviewDeploymentId } from "./deployment";
import { createDomain } from "./domain";
import { type Github, getIssueComment } from "./github";

export type PreviewDeployment = typeof previewDeployments.$inferSelect;

export const findPreviewDeploymentById = async (
	previewDeploymentId: string,
) => {
	const application = await db.query.previewDeployments.findFirst({
		where: eq(previewDeployments.previewDeploymentId, previewDeploymentId),
		with: {
			domain: true,
			application: {
				with: {
					server: true,
					project: true,
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

export const findApplicationByPreview = async (applicationId: string) => {
	const application = await db.query.applications.findFirst({
		with: {
			previewDeployments: {
				where: eq(previewDeployments.applicationId, applicationId),
			},
			project: true,
			domains: true,
			deployments: true,
			mounts: true,
			redirects: true,
			security: true,
			ports: true,
			registry: true,
			gitlab: true,
			github: true,
			bitbucket: true,
			gitea: true,
			server: true,
		},
	});

	if (!application) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Application not found",
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
	schema: typeof apiCreatePreviewDeployment._type,
) => {
	const application = await findApplicationById(schema.applicationId);
	const appName = `preview-${application.appName}-${generatePassword(6)}`;

	const org = await db.query.organization.findFirst({
		where: eq(organization.id, application.project.organizationId),
	});
	const generateDomain = await generateWildcardDomain(
		application.previewWildcard || "*.traefik.me",
		appName,
		application.server?.ipAddress || "",
		org?.ownerId || "",
	);

	const octokit = authGithub(application?.github as Github);

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

const generateWildcardDomain = async (
	baseDomain: string,
	appName: string,
	serverIp: string,
	userId: string,
): Promise<string> => {
	if (!baseDomain.startsWith("*.")) {
		throw new Error('The base domain must start with "*."');
	}
	const hash = `${appName}`;
	if (baseDomain.includes("traefik.me")) {
		let ip = "";

		if (process.env.NODE_ENV === "development") {
			ip = "127.0.0.1";
		}

		if (serverIp) {
			ip = serverIp;
		}

		if (!ip) {
			const admin = await findUserById(userId);
			ip = admin?.serverIp || "";
		}

		const slugIp = ip.replaceAll(".", "-");
		return baseDomain.replace(
			"*",
			`${hash}${slugIp === "" ? "" : `-${slugIp}`}`,
		);
	}

	return baseDomain.replace("*", hash);
};
