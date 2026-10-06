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
import { removeComposeDirectory } from "../utils/filesystem/directory";
import { removeService } from "../utils/docker/utils";
import { removeDirectoryCode } from "../utils/filesystem/directory";
import {
	ExecError,
	execAsync,
	execAsyncRemote,
} from "../utils/process/execAsync";
import { removeTraefikConfig } from "../utils/traefik/application";
import { manageDomain } from "../utils/traefik/domain";
import { findApplicationById } from "./application";
import { findComposeById, runComposeBuild } from "./compose";
import {
	createDeploymentPreview,
	removeDeploymentsByPreviewDeploymentId,
	updateDeploymentStatus,
} from "./deployment";
import { createDomain } from "./domain";
import { getRemotePublicIp, isPrivateIp } from "../utils/ip";
import {
	hasPreviewTemplateVariable,
	PREVIEW_WILDCARD_GUIDANCE,
} from "../utils/preview-wildcard";
import { getPublicIpWithFallback } from "../wss/utils";
import { getIssueComment } from "./github";
import {
	createPreviewComment,
	ensurePreviewComment,
	getPreviewCommentContext,
	updatePreviewComment,
} from "./preview-comment";
import { getWebServerSettings } from "./web-server-settings";

export type PreviewDeployment = typeof previewDeployments.$inferSelect;

export const findPreviewDeploymentById = async (
	previewDeploymentId: string,
) => {
	const application = await db.query.previewDeployments.findFirst({
		where: eq(previewDeployments.previewDeploymentId, previewDeploymentId),
		with: {
			domain: true,
			domains: true,
			application: {
				columns: {
					applicationId: true,
					serverId: true,
					buildServerId: true,
				},
			},
			compose: {
				columns: {
					composeId: true,
					serverId: true,
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

		// A single row belongs to either an application or a compose service.
		// The webhook's close loop calls this for every row of a PR, so dispatch
		// compose rows to the compose-specific teardown.
		if (previewDeployment.composeId) {
			return await removeComposePreview(previewDeploymentId);
		}

		const application = await findApplicationById(
			previewDeployment.applicationId as string,
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
			domains: true,
		},
	});
	return deploymentsList;
};

const isUniqueViolation = (error: unknown): boolean => {
	if (!error || typeof error !== "object") return false;
	const code = (error as { code?: unknown }).code;
	const cause = (error as { cause?: unknown }).cause;
	if (code === "23505") return true;
	if (
		cause &&
		typeof cause === "object" &&
		(cause as { code?: unknown }).code === "23505"
	) {
		return true;
	}
	return false;
};

const slugify = (value: string): string => {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 63);
};

export const interpolateSubdomainTemplate = (
	template: string,
	vars: {
		appName: string;
		prNumber: string;
		branchName: string;
		uniqueId: string;
	},
): string => {
	return template
		.replace(/\$\{appName\}/g, vars.appName)
		.replace(/\$\{prNumber\}/g, vars.prNumber)
		.replace(/\$\{branchName\}/g, slugify(vars.branchName))
		.replace(/\$\{uniqueId\}/g, vars.uniqueId);
};

export const createPreviewDeployment = async (
	schema: z.infer<typeof apiCreatePreviewDeployment>,
) => {
	if (!schema.applicationId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "applicationId is required to create an application preview",
		});
	}
	const applicationId = schema.applicationId;
	const application = await findApplicationById(applicationId);
	const uniqueId = generatePassword(6);
	const domainTemplate = application.previewWildcard || "*.sslip.io";

	const hasIdentifier = hasPreviewTemplateVariable(domainTemplate);

	const appName: string = `preview-${application.appName}-${uniqueId}`;
	let generateDomain: string;

	if (hasIdentifier) {
		const interpolated = interpolateSubdomainTemplate(domainTemplate, {
			appName: application.appName,
			prNumber: schema.pullRequestNumber,
			branchName: schema.branch,
			uniqueId,
		});
		generateDomain = interpolated.replace("*", application.appName);
	} else {
		const org = await db.query.organization.findFirst({
			where: eq(
				organization.id,
				application.environment.project.organizationId,
			),
		});
		generateDomain = await generatePreviewWildcardDomain(
			domainTemplate,
			appName,
			application.server?.ipAddress || "",
			org?.ownerId || "",
			application.server?.serverId,
		);
	}

	// Insert the row first (with an empty comment-id placeholder) so the unique
	// index on (applicationId, pullRequestId) is the single source of truth for
	// dedup. This closes the race where two concurrent webhooks (e.g.
	// pull_request.opened and pull_request.labeled for a PR opened with a label
	// pre-attached) both pass the "does a preview exist?" check and each insert a
	// new row. The insert loser reuses the winner's row instead of duplicating.
	let previewDeployment: typeof previewDeployments.$inferSelect | undefined;
	try {
		previewDeployment = await db
			.insert(previewDeployments)
			.values({
				...schema,
				appName: appName,
				pullRequestCommentId: "",
			})
			.returning()
			.then((value) => value[0]);
	} catch (error) {
		if (isUniqueViolation(error)) {
			const existing = await findPreviewDeploymentByApplicationId(
				applicationId,
				schema.pullRequestId,
			);
			if (existing) {
				console.log(
					`Preview deployment already exists for application=${schema.applicationId} pr=${schema.pullRequestId}; reusing ${existing.previewDeploymentId}`,
				);
				return existing;
			}
			console.error(
				"Preview deployment unique-violation without an existing row — this should not happen",
				error,
			);
		}
		throw error;
	}

	if (!previewDeployment) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the preview deployment",
		});
	}

	// Post the initial PR comment now that we hold the unique row. A comment
	// failure must not roll back the row — the deploy flow recreates a missing
	// comment on the first deploy attempt. The comment is written through the
	// provider-agnostic dispatch layer (GitHub App or Gitea/Forgejo REST).
	// GitLab previews have no comment context here; they surface status via MR
	// notes posted from the GitLab webhook handler instead.
	const commentContext = getPreviewCommentContext(application);
	if (commentContext) {
		try {
			const runningComment = getIssueComment(
				application.name,
				"initializing",
				`${application.previewHttps ? "https" : "http"}://${generateDomain}`,
			);
			const pullRequestCommentId = await createPreviewComment(commentContext, {
				issueNumber: schema.pullRequestNumber,
				body: `### Dokploy Preview Deployment\n\n${runningComment}`,
			});
			await db
				.update(previewDeployments)
				.set({ pullRequestCommentId })
				.where(
					eq(
						previewDeployments.previewDeploymentId,
						previewDeployment.previewDeploymentId,
					),
				);
			previewDeployment.pullRequestCommentId = pullRequestCommentId;
		} catch (error) {
			console.error(
				`Failed to create preview deployment PR comment for application=${schema.applicationId} pr=${schema.pullRequestId}:`,
				error,
			);
		}
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

export const generatePreviewWildcardDomain = async (
	baseDomain: string,
	appName: string,
	serverIp: string,
	_userId: string,
	serverId?: string,
): Promise<string> => {
	if (!baseDomain.startsWith("*.")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid preview domain "${baseDomain}". ${PREVIEW_WILDCARD_GUIDANCE}`,
		});
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

		if (process.env.NODE_ENV !== "development" && isPrivateIp(ip)) {
			ip = serverId
				? ((await getRemotePublicIp(serverId)) ?? ip)
				: (await getPublicIpWithFallback()) || ip;
		}

		const slugIp = ip.replaceAll(".", "-").replaceAll(":", "-");
		return baseDomain.replace(
			"*",
			`${hash}${slugIp === "" ? "" : `-${slugIp}`}`,
		);
	}

	return baseDomain.replace("*", hash);
};

// ---------------------------------------------------------------------------
// Compose preview deployments
//
// A compose preview mirrors the application preview flow but isolates an entire
// stack per PR instead of a single container. Isolation is layered:
//   1. A unique docker project name (`preview-<compose.appName>-<uniqueId>`),
//      passed as `-p` so containers/volumes/networks are namespaced by Docker.
//   2. A deterministic per-PR compose suffix that renames every service, volume
//      and network in the spec (`randomize`), so hard-coded container_names and
//      explicitly-named volumes cannot collide across previews or with the base
//      stack. Preview volumes are therefore never shared with the base stack.
// Per-service domains are cloned from the compose's existing domains with a
// templated host and injected as Traefik labels at build time.
// ---------------------------------------------------------------------------

type ComposeWithRelations = Awaited<ReturnType<typeof findComposeById>>;

// `${{preview.prNumber}}` interpolation, shared shape with the application flow.
const resolvePreviewTemplateVariables = (
	value: string,
	pullRequestNumber: string,
) => value.replaceAll("${{preview.prNumber}}", pullRequestNumber);

// Deterministic, DNS/compose-safe suffix stable across create → deploy →
// teardown (derived only from immutable row fields). Used as the compose
// `randomize` suffix so every service/volume/network name is unique per PR.
export const buildComposePreviewSuffix = (previewDeployment: {
	pullRequestNumber: string;
	previewDeploymentId: string;
}) =>
	slugify(
		`pr${previewDeployment.pullRequestNumber}-${previewDeployment.previewDeploymentId.slice(0, 8)}`,
	);

// A stored preview-domain serviceName is the base service name (which itself may
// already carry the base compose's own suffix when the base uses `randomize`).
// The preview build re-randomizes the freshly-cloned (original-named) spec with
// the preview suffix, so strip any base suffix before re-appending the preview
// suffix to land the Traefik labels on the correct suffixed service key.
const stripComposeSuffix = (serviceName: string, baseSuffix: string) =>
	baseSuffix && serviceName.endsWith(`-${baseSuffix}`)
		? serviceName.slice(0, serviceName.length - baseSuffix.length - 1)
		: serviceName;

// Re-point preview domains at the service keys the preview's `randomize` pass
// will produce, so `writeDomainsToCompose` resolves the Traefik labels onto the
// renamed services instead of throwing (the suffix-ordering guarantee).
// `baseSuffix` must only be passed when the base compose itself randomizes —
// otherwise stored serviceNames are original and must not be stripped.
export const mapPreviewDomainsToSuffixedServices = <
	T extends { serviceName: string | null },
>(
	previewDomains: T[],
	baseSuffix: string,
	previewSuffix: string,
): T[] =>
	previewDomains.map((previewDomain) => ({
		...previewDomain,
		serviceName: `${stripComposeSuffix(
			previewDomain.serviceName || "",
			baseSuffix,
		)}-${previewSuffix}`,
	}));

const postComposePreviewComment = async (
	compose: ComposeWithRelations,
	previewDeployment: PreviewDeployment,
	status: "initializing" | "running" | "success" | "error",
	previewUrl: string,
) => {
	// GitHub and Gitea/Forgejo write a status comment on the pull request;
	// GitLab and the other source types surface status via MR notes instead, so
	// they resolve to no comment context and are skipped.
	const commentContext = getPreviewCommentContext(compose);
	if (!commentContext) {
		return;
	}
	try {
		const body = getIssueComment(compose.name, status, previewUrl);
		const ensured = await ensurePreviewComment(commentContext, {
			issueNumber: previewDeployment.pullRequestNumber,
			commentId: previewDeployment.pullRequestCommentId,
			body: `### Dokploy Preview Deployment\n\n${body}`,
		});

		if (ensured.created) {
			// The freshly created comment already carries the status body, only the
			// new id has to be remembered for the next update.
			await updatePreviewDeployment(previewDeployment.previewDeploymentId, {
				pullRequestCommentId: ensured.commentId,
			});
			previewDeployment.pullRequestCommentId = ensured.commentId;
			return;
		}

		await updatePreviewComment(commentContext, {
			issueNumber: previewDeployment.pullRequestNumber,
			commentId: ensured.commentId,
			body: `### Dokploy Preview Deployment\n\n${body}`,
		});
	} catch (error) {
		console.error(
			`Failed to post compose preview PR comment for compose=${compose.composeId} pr=${previewDeployment.pullRequestId}:`,
			error,
		);
	}
};

export const findPreviewDeploymentsByComposeId = async (composeId: string) => {
	const deploymentsList = await db.query.previewDeployments.findMany({
		where: eq(previewDeployments.composeId, composeId),
		orderBy: desc(previewDeployments.createdAt),
		with: {
			deployments: {
				orderBy: desc(deployments.createdAt),
			},
			domain: true,
			domains: true,
		},
	});
	return deploymentsList;
};

export const findPreviewDeploymentByComposeId = async (
	composeId: string,
	pullRequestId: string,
) => {
	const previewDeploymentResult = await db.query.previewDeployments.findFirst({
		where: and(
			eq(previewDeployments.composeId, composeId),
			eq(previewDeployments.pullRequestId, pullRequestId),
		),
	});

	return previewDeploymentResult;
};

export const createComposePreview = async (
	schema: z.infer<typeof apiCreatePreviewDeployment>,
) => {
	if (!schema.composeId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "composeId is required to create a compose preview",
		});
	}
	const composeId = schema.composeId;
	const compose = await findComposeById(composeId);
	const uniqueId = generatePassword(6);
	const appName = `preview-${compose.appName}-${uniqueId}`;

	// Insert-first dedupe on (composeId, pullRequestId) — same race-close as the
	// application flow: two concurrent webhooks both pass the "exists?" check and
	// each try to insert; the unique index makes the loser reuse the winner's row.
	let previewDeployment: typeof previewDeployments.$inferSelect | undefined;
	try {
		previewDeployment = await db
			.insert(previewDeployments)
			.values({
				composeId,
				branch: schema.branch,
				pullRequestId: schema.pullRequestId,
				pullRequestNumber: schema.pullRequestNumber,
				pullRequestURL: schema.pullRequestURL,
				pullRequestTitle: schema.pullRequestTitle,
				appName,
				pullRequestCommentId: "",
			})
			.returning()
			.then((value) => value[0]);
	} catch (error) {
		if (isUniqueViolation(error)) {
			const existing = await findPreviewDeploymentByComposeId(
				composeId,
				schema.pullRequestId,
			);
			if (existing) {
				console.log(
					`Compose preview already exists for compose=${composeId} pr=${schema.pullRequestId}; reusing ${existing.previewDeploymentId}`,
				);
				return existing;
			}
			console.error(
				"Compose preview unique-violation without an existing row — this should not happen",
				error,
			);
		}
		throw error;
	}

	if (!previewDeployment) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the compose preview deployment",
		});
	}

	// Post the initializing PR comment (GitHub or Gitea/Forgejo) now that we hold
	// the row.
	const composeCommentContext = getPreviewCommentContext(compose);
	if (composeCommentContext) {
		try {
			const runningComment = getIssueComment(compose.name, "initializing", "");
			const pullRequestCommentId = await createPreviewComment(
				composeCommentContext,
				{
					issueNumber: schema.pullRequestNumber,
					body: `### Dokploy Preview Deployment\n\n${runningComment}`,
				},
			);
			await db
				.update(previewDeployments)
				.set({ pullRequestCommentId })
				.where(
					eq(
						previewDeployments.previewDeploymentId,
						previewDeployment.previewDeploymentId,
					),
				);
			previewDeployment.pullRequestCommentId = pullRequestCommentId;
		} catch (error) {
			console.error(
				`Failed to create compose preview PR comment for compose=${composeId} pr=${schema.pullRequestId}:`,
				error,
			);
		}
	}

	// Clone the compose's existing per-service domains into templated preview
	// domains (one Traefik host per service). Each service gets a distinct host so
	// multi-service stacks route correctly.
	const domainTemplate = compose.previewWildcard || "*.sslip.io";
	const hasIdentifier = hasPreviewTemplateVariable(domainTemplate);

	let ownerId = "";
	if (!hasIdentifier) {
		const org = await db.query.organization.findFirst({
			where: eq(organization.id, compose.environment.project.organizationId),
		});
		ownerId = org?.ownerId || "";
	}

	for (const baseDomain of compose.domains) {
		const serviceName = baseDomain.serviceName || "";
		const serviceSlug = slugify(serviceName || "app");
		const hostAppName = `${compose.appName}-${serviceSlug}`;
		let host: string;
		if (hasIdentifier) {
			const interpolated = interpolateSubdomainTemplate(domainTemplate, {
				appName: hostAppName,
				prNumber: schema.pullRequestNumber,
				branchName: schema.branch,
				uniqueId,
			});
			host = interpolated.replace("*", hostAppName);
		} else {
			host = await generatePreviewWildcardDomain(
				domainTemplate,
				`${appName}-${serviceSlug}`,
				compose.server?.ipAddress || "",
				ownerId,
				compose.serverId ?? undefined,
			);
		}

		await createDomain({
			host,
			path: baseDomain.path || compose.previewPath || "/",
			port: baseDomain.port || 3000,
			https: compose.previewHttps,
			certificateType: compose.previewCertificateType,
			customCertResolver: compose.previewCustomCertResolver,
			domainType: "preview",
			serviceName,
			composeId,
			previewDeploymentId: previewDeployment.previewDeploymentId,
			internalPath: baseDomain.internalPath,
			stripPath: baseDomain.stripPath,
		});
	}

	return previewDeployment;
};

const executeComposePreview = async ({
	composeId,
	previewDeploymentId,
	titleLog,
	descriptionLog,
}: {
	composeId: string;
	previewDeploymentId: string;
	titleLog: string;
	descriptionLog: string;
}) => {
	const compose = await findComposeById(composeId);
	const previewDeployment =
		await findPreviewDeploymentById(previewDeploymentId);

	const deployment = await createDeploymentPreview({
		title: titleLog,
		description: descriptionLog,
		previewDeploymentId,
	});

	await updatePreviewDeployment(previewDeploymentId, {
		createdAt: new Date().toISOString(),
	});

	const previewSuffix = buildComposePreviewSuffix(previewDeployment);
	const previewDomains = previewDeployment.domains ?? [];
	const firstHost = previewDomains[0]?.host;
	const previewUrl = firstHost
		? `${compose.previewHttps ? "https" : "http"}://${firstHost}`
		: "";

	try {
		await postComposePreviewComment(
			compose,
			previewDeployment,
			"running",
			previewUrl,
		);

		const transformedDomains = mapPreviewDomainsToSuffixedServices(
			previewDomains,
			compose.randomize ? compose.suffix : "",
			previewSuffix,
		);

		const entity = {
			...compose,
			type: "compose" as const,
			appName: previewDeployment.appName,
			branch: previewDeployment.branch,
			gitlabBranch: previewDeployment.branch,
			// Gitea clones read `giteaBranch`, so the preview must override it too
			// or the base branch would be built instead of the pull request tip.
			giteaBranch: previewDeployment.branch,
			suffix: previewSuffix,
			randomize: true,
			isolatedDeployment: false,
			isolatedDeploymentsVolume: false,
			env: resolvePreviewTemplateVariables(
				`${compose.previewEnv || ""}${
					previewUrl ? `\nDOKPLOY_DEPLOY_URL=${previewUrl}` : ""
				}`,
				previewDeployment.pullRequestNumber,
			),
			domains: transformedDomains,
		};

		// Previews always re-clone (latest PR tip on every synchronize) and never
		// apply patches (patch paths key off the base compose appName).
		await runComposeBuild(entity, deployment, { applyPatches: false });

		await postComposePreviewComment(
			compose,
			previewDeployment,
			"success",
			previewUrl,
		);
		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updatePreviewDeployment(previewDeploymentId, {
			previewStatus: "done",
		});
	} catch (error) {
		let command = "";
		if (!(error instanceof ExecError)) {
			const message = error instanceof Error ? error.message : String(error);
			command += `echo "${message.replace(/"/g, '\\"')}" >> "${deployment.logPath}";`;
		}
		command += `echo "\nError occurred ❌, check the logs for details." >> ${deployment.logPath};`;
		try {
			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, command);
			} else {
				await execAsync(command);
			}
		} catch (logError) {
			console.error(logError);
		}

		await postComposePreviewComment(
			compose,
			previewDeployment,
			"error",
			previewUrl,
		);
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updatePreviewDeployment(previewDeploymentId, {
			previewStatus: "error",
		});
		throw error;
	}

	return true;
};

export const deployComposePreview = async (args: {
	composeId: string;
	previewDeploymentId: string;
	titleLog: string;
	descriptionLog: string;
}) => executeComposePreview(args);

export const rebuildComposePreview = async (args: {
	composeId: string;
	previewDeploymentId: string;
	titleLog: string;
	descriptionLog: string;
}) => executeComposePreview(args);

export const removeComposePreview = async (previewDeploymentId: string) => {
	try {
		const previewDeployment =
			await findPreviewDeploymentById(previewDeploymentId);

		if (!previewDeployment.composeId) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Preview deployment is not a compose preview",
			});
		}

		const compose = await findComposeById(previewDeployment.composeId);
		const appName = previewDeployment.appName;
		const serverId = compose.serverId;

		const runQuiet = async (rawCommand: string) => {
			if (serverId) {
				await execAsyncRemote(serverId, rawCommand);
			} else {
				await execAsync(rawCommand);
			}
		};

		// Each op is individually try/caught so a partial failure (e.g. the stack
		// is already gone) still lets the rest of the teardown proceed.
		const cleanupOperations = [
			async () => {
				if (compose.composeType === "stack") {
					await runQuiet(`docker stack rm ${appName} 2>&1 || true;`);
				} else {
					await runQuiet(
						`env -i PATH="$PATH" docker compose -p ${appName} down --volumes 2>&1 || true;`,
					);
				}
			},
			async () => {
				await runQuiet(`docker network rm ${appName} 2>&1 || true;`);
			},
			async () =>
				await removeDeploymentsByPreviewDeploymentId(
					previewDeployment,
					serverId,
				),
			async () => await removeComposeDirectory(appName, serverId),
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
				: "Error deleting this compose preview deployment";
		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
		});
	}
};
