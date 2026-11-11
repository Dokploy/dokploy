import { db } from "@dokploy/server/db";
import {
	type apiCreateAzureDevops,
	type apiUpdateAzureDevops,
	applications,
	azureDevops,
	compose,
	gitProvider,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import {
	AzureDevopsClient,
	normalizeAzureDevopsUrl,
} from "../utils/providers/azure-devops-client";
import {
	assertGitProviderAccess,
	canEditDeployGitSource,
	canViewGitProviderSecrets,
} from "./git-provider";

export const findAzureDevopsById = async (id: string) => {
	const provider = await db.query.azureDevops.findFirst({
		where: eq(azureDevops.azureDevopsId, id),
		with: { gitProvider: true },
	});
	if (!provider)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Azure DevOps provider not found",
		});
	return provider;
};

export const safeAzureDevops = (
	provider: Awaited<ReturnType<typeof findAzureDevopsById>>,
) => {
	const { personalAccessToken: _, ...safe } = provider;
	return { ...safe, isConfigured: !!provider.personalAccessToken };
};

export const azureDevopsClient = async (id: string) => {
	const provider = await findAzureDevopsById(id);
	return new AzureDevopsClient(provider.baseUrl, provider.personalAccessToken);
};

export const createAzureDevops = async (
	input: z.infer<typeof apiCreateAzureDevops>,
	organizationId: string,
	userId: string,
) => {
	const baseUrl = normalizeAzureDevopsUrl(input.baseUrl);
	try {
		return await db.transaction(async (tx) => {
			const [parent] = await tx
				.insert(gitProvider)
				.values({
					name: input.name,
					organizationId,
					userId,
					providerType: "azureDevops",
				})
				.returning();
			if (!parent) throw new Error();
			const [created] = await tx
				.insert(azureDevops)
				.values({
					gitProviderId: parent.gitProviderId,
					baseUrl,
					personalAccessToken: input.personalAccessToken,
				})
				.returning({ azureDevopsId: azureDevops.azureDevopsId });
			if (!created) throw new Error();
			return { ...created, baseUrl, gitProvider: parent, isConfigured: true };
		});
	} catch {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Could not create Azure DevOps provider",
		});
	}
};

export const updateAzureDevops = async (
	input: z.infer<typeof apiUpdateAzureDevops>,
	session: { userId: string; activeOrganizationId: string },
) => {
	const provider = await findAzureDevopsById(input.azureDevopsId);
	await assertGitProviderAccess(session, provider.gitProvider);
	if (!(await canViewGitProviderSecrets(session, provider.gitProvider)))
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"Only the provider owner or an organization owner/admin can manage this provider",
		});
	const baseUrl = input.baseUrl
		? normalizeAzureDevopsUrl(input.baseUrl)
		: provider.baseUrl;

	try {
		await db.transaction(async (tx) => {
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtextextended(${`azure-provider:${provider.azureDevopsId}`}, 0))`,
			);
			if (baseUrl !== provider.baseUrl) {
				const [app, stack] = await Promise.all([
					tx.query.applications.findFirst({
						where: eq(applications.azureDevopsId, provider.azureDevopsId),
						columns: { applicationId: true },
					}),
					tx.query.compose.findFirst({
						where: eq(compose.azureDevopsId, provider.azureDevopsId),
						columns: { composeId: true },
					}),
				]);
				if (app || stack)
					throw new TRPCError({
						code: "CONFLICT",
						message:
							"Create a new provider for another organization or collection while services are connected",
					});
			}
			if (input.baseUrl || input.personalAccessToken) {
				await tx
					.update(azureDevops)
					.set({
						...(input.baseUrl ? { baseUrl } : {}),
						...(input.personalAccessToken
							? { personalAccessToken: input.personalAccessToken }
							: {}),
					})
					.where(eq(azureDevops.azureDevopsId, provider.azureDevopsId));
			}
			if (input.name)
				await tx
					.update(gitProvider)
					.set({ name: input.name })
					.where(eq(gitProvider.gitProviderId, provider.gitProviderId));
		});
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Could not update Azure DevOps provider",
		});
	}
	const { reconcileAzureDevopsProvider } = await import("./azure-devops-hooks");
	await reconcileAzureDevopsProvider(provider.azureDevopsId);
	return { success: true };
};

export const assertAzureDevopsSourceAccess = async (
	session: { userId: string; activeOrganizationId: string },
	current: {
		azureDevopsId: string | null;
		sourceType: string;
		github?: { gitProviderId: string } | null;
		gitlab?: { gitProviderId: string } | null;
		bitbucket?: { gitProviderId: string } | null;
		gitea?: { gitProviderId: string } | null;
	},
	nextId?: string | null,
) => {
	if (current.sourceType === "azureDevops" && current.azureDevopsId) {
		const previous = await findAzureDevopsById(current.azureDevopsId);
		await assertGitProviderAccess(session, previous.gitProvider);
		if (!(await canEditDeployGitSource(previous.gitProviderId, session)))
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "You cannot edit this service's Git source",
			});
	}
	if (nextId)
		await assertGitProviderAccess(
			session,
			(await findAzureDevopsById(nextId)).gitProvider,
		);
	if (nextId && current.sourceType !== "azureDevops") {
		const previous =
			current.sourceType === "github"
				? current.github
				: current.sourceType === "gitlab"
					? current.gitlab
					: current.sourceType === "bitbucket"
						? current.bitbucket
						: current.sourceType === "gitea"
							? current.gitea
							: null;
		if (
			previous &&
			!(await canEditDeployGitSource(previous.gitProviderId, session))
		)
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "You cannot replace this service's Git source",
			});
	}
};
