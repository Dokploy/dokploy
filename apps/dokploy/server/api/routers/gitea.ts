import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiCreateGitea,
	apiFindGiteaBranches,
	apiFindOneGitea,
	apiGiteaTestConnection,
	apiUpdateGitea,
} from "@/server/db/schema";

import { db } from "@/server/db";
import {
	createGitea,
	findGiteaById,
	getGiteaBranches,
	getGiteaRepositories,
	haveGiteaRequirements,
	testGiteaConnection,
	updateGitProvider,
	updateGitea,
} from "@dokploy/server";

import { TRPCError } from "@trpc/server";

export const giteaRouter = createTRPCRouter({
	// Create a new Gitea provider
	create: protectedProcedure
	  .input(apiCreateGitea)
	  .mutation(async ({ input, ctx }: { input: typeof apiCreateGitea._input; ctx: any }) => {
		try {
		  return await createGitea(input, ctx.session.activeOrganizationId);
		} catch (error) {
		  throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating this Gitea provider",
			cause: error,
		  });
		}
	  }),
  
	// Fetch a specific Gitea provider by ID
	one: protectedProcedure
	  .input(apiFindOneGitea)
	  .query(async ({ input, ctx }: { input: typeof apiFindOneGitea._input; ctx: any }) => {
		const giteaProvider = await findGiteaById(input.giteaId);
		if (
		  giteaProvider.gitProvider.organizationId !== ctx.session.activeOrganizationId
		) {
		  throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not allowed to access this Gitea provider",
		  });
		}
		return giteaProvider;
	  }),
  
	// Fetch all Gitea providers for the active organization
	giteaProviders: protectedProcedure.query(async ({ ctx }: { ctx: any }) => {
	  let result = await db.query.gitea.findMany({
		with: {
		  gitProvider: true,
		},
	  });
  
	  // Filter by organization ID
	  result = result.filter(
		(provider) =>
		  provider.gitProvider.organizationId === ctx.session.activeOrganizationId,
	  );
  
	  // Filter providers that meet the requirements
	  const filtered = result
		.filter((provider) => haveGiteaRequirements(provider))
		.map((provider) => {
		  return {
			giteaId: provider.giteaId,
			gitProvider: {
			  ...provider.gitProvider,
			},
		  };
		});
  
	  return filtered;
	}),
  
	// Fetch repositories from Gitea provider
	getGiteaRepositories: protectedProcedure
	  .input(apiFindOneGitea)
	  .query(async ({ input, ctx }: { input: typeof apiFindOneGitea._input; ctx: any }) => {
		const { giteaId } = input;
  
		if (!giteaId) {
		  throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Gitea provider ID is required.",
		  });
		}
  
		const giteaProvider = await findGiteaById(giteaId);
		if (
		  giteaProvider.gitProvider.organizationId !== ctx.session.activeOrganizationId
		) {
		  throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not allowed to access this Gitea provider",
		  });
		}
  
		try {
		  return await getGiteaRepositories(giteaId);
		} catch (error) {
		  console.error("Error fetching Gitea repositories:", error);
		  throw new TRPCError({
			code: "BAD_REQUEST",
			message: error instanceof Error ? error.message : String(error),
		  });
		}
	  }),
  
	// Fetch branches of a specific Gitea repository
	getGiteaBranches: protectedProcedure
	  .input(apiFindGiteaBranches)
	  .query(async ({ input, ctx }: { input: typeof apiFindGiteaBranches._input; ctx: any }) => {
		const { giteaId, owner, repositoryName } = input;
  
		if (!giteaId || !owner || !repositoryName) {
		  throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Gitea provider ID, owner, and repository name are required.",
		  });
		}
  
		const giteaProvider = await findGiteaById(giteaId);
		if (
		  giteaProvider.gitProvider.organizationId !== ctx.session.activeOrganizationId
		) {
		  throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not allowed to access this Gitea provider",
		  });
		}
  
		try {
		  return await getGiteaBranches({
			giteaId,
			owner,
			repo: repositoryName,
			id: 0, // Provide a default value for the optional id
		  });
		} catch (error) {
		  console.error("Error fetching Gitea branches:", error);
		  throw new TRPCError({
			code: "BAD_REQUEST",
			message: error instanceof Error ? error.message : String(error),
		  });
		}
	  }),
  
	// Test connection to Gitea provider
	testConnection: protectedProcedure
	  .input(apiGiteaTestConnection)
	  .mutation(async ({ input, ctx }: { input: typeof apiGiteaTestConnection._input; ctx: any }) => {
		const giteaId = input.giteaId ?? "";
  
		try {
		  const giteaProvider = await findGiteaById(giteaId);
		  if (
			giteaProvider.gitProvider.organizationId !== ctx.session.activeOrganizationId
		  ) {
			throw new TRPCError({
			  code: "UNAUTHORIZED",
			  message: "You are not allowed to access this Gitea provider",
			});
		  }
  
		  const result = await testGiteaConnection({
			giteaId,
		  });
  
		  return `Found ${result} repositories`;
		} catch (error) {
		  console.error("Gitea connection test error:", error);
		  throw new TRPCError({
			code: "BAD_REQUEST",
			message: error instanceof Error ? error.message : String(error),
		  });
		}
	  }),
  
	// Update an existing Gitea provider
	update: protectedProcedure
	  .input(apiUpdateGitea)
	  .mutation(async ({ input, ctx }: { input: typeof apiUpdateGitea._input; ctx: any }) => {
		const giteaProvider = await findGiteaById(input.giteaId);
		if (
		  giteaProvider.gitProvider.organizationId !== ctx.session.activeOrganizationId
		) {
		  throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not allowed to access this Gitea provider",
		  });
		}
  
		console.log("Updating Gitea provider:", input);
  
		if (input.name) {
		  await updateGitProvider(input.gitProviderId, {
			name: input.name,
			organizationId: ctx.session.activeOrganizationId,
		  });
  
		  await updateGitea(input.giteaId, {
			...input,
		  });
		} else {
		  await updateGitea(input.giteaId, {
			...input,
		  });
		}
  
		return { success: true };
	  }),
  });  