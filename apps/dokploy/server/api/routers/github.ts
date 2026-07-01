import {
	assertGitProviderAccess,
	findGithubById,
	findGithubGitProviderId,
	getAccessibleGitProviderIds,
	getGithubBranches,
	getGithubRepositories,
	haveGithubRequirements,
	redactGithubProvider,
	updateGithub,
	updateGitProvider,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	buildGithubAppSetupStateProviderId,
	canManageGitProviderOAuth,
	GITHUB_APP_INIT_STATE_PROVIDER_ID,
	signGitProviderOAuthState,
} from "@dokploy/server/utils/providers/oauth-state";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiFindGithubBranches,
	apiFindOneGithub,
	apiUpdateGithub,
} from "@/server/db/schema";

const getHeaderValue = (header: string | string[] | undefined) =>
	Array.isArray(header) ? header[0] : header;

const getRequestOrigin = (req: {
	headers: Record<string, string | string[] | undefined>;
}) => {
	const host =
		getHeaderValue(req.headers["x-forwarded-host"]) ??
		getHeaderValue(req.headers.host);
	const protocol =
		getHeaderValue(req.headers["x-forwarded-proto"]) ??
		(host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
			? "http"
			: "https");

	return host ? `${protocol}://${host}` : "";
};

const getGithubAppCallbackUrl = (req: {
	headers: Record<string, string | string[] | undefined>;
}) => {
	const origin = getRequestOrigin(req);
	return origin
		? `${origin}/api/providers/github/setup`
		: "/api/providers/github/setup";
};

const apiGithubAppSetupState = z.discriminatedUnion("action", [
	z.object({ action: z.literal("init") }),
	z.object({ action: z.literal("setup"), githubId: z.string().min(1) }),
]);
const GITHUB_APP_SETUP_STATE_TTL_MS = 60 * 60 * 1000;

export const githubRouter = createTRPCRouter({
	appSetupState: withPermission("gitProviders", "create")
		.input(apiGithubAppSetupState)
		.query(async ({ input, ctx }) => {
			if (
				!ctx.session.id ||
				!ctx.session.userId ||
				!ctx.session.activeOrganizationId
			) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}

			let providerId = GITHUB_APP_INIT_STATE_PROVIDER_ID;
			if (input.action === "setup") {
				const githubProvider = await findGithubById(input.githubId);
				if (!canManageGitProviderOAuth(githubProvider, ctx.session, ctx.user)) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
				providerId = buildGithubAppSetupStateProviderId(input.githubId);
			}

			return {
				state: signGitProviderOAuthState({
					providerType: "github-app",
					providerId,
					redirectUri: getGithubAppCallbackUrl(ctx.req),
					sessionId: ctx.session.id,
					userId: ctx.session.userId,
					organizationId: ctx.session.activeOrganizationId,
					ttlMs: GITHUB_APP_SETUP_STATE_TTL_MS,
				}),
			};
		}),
	one: protectedProcedure
		.input(apiFindOneGithub)
		.query(async ({ input, ctx }) => {
			const gitProviderId = await findGithubGitProviderId(input.githubId);
			await assertGitProviderAccess(gitProviderId, ctx.session);

			return redactGithubProvider(await findGithubById(input.githubId));
		}),
	getGithubRepositories: protectedProcedure
		.input(apiFindOneGithub)
		.query(async ({ input, ctx }) => {
			const gitProviderId = await findGithubGitProviderId(input.githubId);
			await assertGitProviderAccess(gitProviderId, ctx.session);

			return await getGithubRepositories(input.githubId);
		}),
	getGithubBranches: protectedProcedure
		.input(apiFindGithubBranches)
		.query(async ({ input, ctx }) => {
			if (input.githubId) {
				const gitProviderId = await findGithubGitProviderId(input.githubId);
				await assertGitProviderAccess(gitProviderId, ctx.session);
			}

			return await getGithubBranches(input);
		}),
	githubProviders: protectedProcedure.query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleGitProviderIds(ctx.session);

		let result = await db.query.github.findMany({
			with: {
				gitProvider: true,
			},
		});

		result = result.filter(
			(provider) =>
				provider.gitProvider.organizationId ===
					ctx.session.activeOrganizationId &&
				accessibleIds.has(provider.gitProvider.gitProviderId),
		);

		const filtered = result
			.filter((provider) => haveGithubRequirements(provider))
			.map((provider) => {
				return {
					githubId: provider.githubId,
					gitProvider: {
						...provider.gitProvider,
					},
				};
			});

		return filtered;
	}),

	testConnection: protectedProcedure
		.input(apiFindOneGithub)
		.mutation(async ({ input, ctx }) => {
			const gitProviderId = await findGithubGitProviderId(input.githubId);
			await assertGitProviderAccess(gitProviderId, ctx.session);

			try {
				const result = await getGithubRepositories(input.githubId);
				return `Found ${result.length} repositories`;
			} catch (err) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: err instanceof Error ? err?.message : `Error: ${err}`,
				});
			}
		}),
	update: withPermission("gitProviders", "create")
		.input(apiUpdateGithub)
		.mutation(async ({ input, ctx }) => {
			const gitProviderId = await findGithubGitProviderId(input.githubId);
			if (gitProviderId !== input.gitProviderId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this Git provider",
				});
			}
			await assertGitProviderAccess(gitProviderId, ctx.session);

			await updateGitProvider(gitProviderId, {
				name: input.name,
				organizationId: ctx.session.activeOrganizationId,
			});

			await updateGithub(input.githubId, {
				...input,
				gitProviderId,
			});

			await audit(ctx, {
				action: "update",
				resourceType: "gitProvider",
				resourceId: gitProviderId,
				resourceName: input.name,
			});
		}),
});
