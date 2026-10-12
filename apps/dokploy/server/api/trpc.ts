/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

// import { getServerAuthSession } from "@/server/auth";
import { db } from "@dokploy/server/db";
import { hasValidLicense } from "@dokploy/server/index";
import type { statements } from "@dokploy/server/lib/access-control";
import { validateRequest } from "@dokploy/server/lib/auth";
import { checkPermission } from "@dokploy/server/services/permission";
import { isTwoFactorSetupPendingForUserId } from "@dokploy/server/services/two-factor-policy";
import type { OpenApiMeta } from "@dokploy/trpc-openapi";
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import type { Session, User } from "better-auth";
import superjson from "superjson";
import { ZodError } from "zod";
import { TWO_FACTOR_SETUP_REQUIRED } from "@/lib/two-factor";

type Resource = keyof typeof statements;
type ActionOf<R extends Resource> = (typeof statements)[R][number];

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 */

interface CreateContextOptions {
	user:
		| (User & {
				role: "member" | "admin" | "owner";
				ownerId: string;
				enableEnterpriseFeatures: boolean;
				isValidEnterpriseLicense: boolean;
				twoFactorSetupRequired?: boolean;
		  })
		| null;
	session:
		| (Session & { activeOrganizationId: string; impersonatedBy?: string })
		| null;
	req: CreateNextContextOptions["req"];
	res: CreateNextContextOptions["res"];
	longLived?: boolean;
}

/**
 * This helper generates the "internals" for a tRPC context. If you need to use it, you can export
 * it from here.
 *
 * Examples of things you may need it for:
 * - testing, so we don't have to mock Next.js' req/res
 * - tRPC's `createSSGHelpers`, where we don't have req/res
 *
 * @see https://create.t3.gg/en/usage/trpc#-serverapitrpcts
 */
const createInnerTRPCContext = (opts: CreateContextOptions) => {
	return {
		session: opts.session,
		db,
		req: opts.req,
		res: opts.res,
		user: opts.user,
		...(opts.longLived && { longLived: true }),
	};
};

/**
 * This is the actual context you will use in your router. It will be used to process every request
 * that goes through your tRPC endpoint.
 *
 * @see https://trpc.io/docs/context
 */
export const createTRPCContext = async (
	opts: CreateNextContextOptions,
	{ longLived = false }: { longLived?: boolean } = {},
) => {
	const { req, res } = opts;

	// Get from the request
	const { session, user } = await validateRequest(req, {
		allowPending: true,
	});

	return createInnerTRPCContext({
		req,
		res,
		longLived,
		// @ts-ignore
		session: session
			? {
					...session,
					activeOrganizationId: session.activeOrganizationId || "",
				}
			: null,
		// @ts-ignore
		user: user
			? {
					...user,
					email: user.email,
					role: user.role as "owner" | "member" | "admin",
					id: user.id,
					ownerId: user.ownerId,
				}
			: null,
	});
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get type safety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */

const t = initTRPC
	.meta<OpenApiMeta>()
	.context<typeof createTRPCContext>()
	.create({
		transformer: superjson,
		errorFormatter({ shape, error }) {
			return {
				...shape,
				data: {
					...shape.data,
					zodError:
						error.cause instanceof ZodError ? error.cause.flatten() : null,
				},
			};
		},
	});

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure;

/**
 * What a user who must enable 2FA can still call: enough for the
 * /two-factor-setup page to render and enroll.
 */
export const TWO_FACTOR_SETUP_ALLOWED_PATHS = new Set([
	"user.get",
	"user.session",
	"organization.all",
]);

/**
 * A WebSocket connection keeps the context it was opened with, so its
 * twoFactorSetupRequired can be stale: re-read the policy on every call.
 */
const isTwoFactorSetupPendingNow = async (ctx: {
	user: { id: string; twoFactorSetupRequired?: boolean };
	longLived?: boolean;
}) => {
	if (!ctx.longLived) return !!ctx.user.twoFactorSetupRequired;
	const pending = await isTwoFactorSetupPendingForUserId(ctx.user.id);
	if (pending === null) {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
	return pending;
};

const requireAuth = t.middleware(async ({ ctx, next, path }) => {
	if (!ctx.session || !ctx.user) {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
	if (
		!TWO_FACTOR_SETUP_ALLOWED_PATHS.has(path) &&
		(await isTwoFactorSetupPendingNow({
			user: ctx.user,
			longLived: ctx.longLived,
		}))
	) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: TWO_FACTOR_SETUP_REQUIRED,
		});
	}
	return next({
		ctx: {
			// infers the `session` as non-nullable
			session: ctx.session,
			user: ctx.user,
		},
	});
});

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure.use(requireAuth);

const ownerOrAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
	if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
	return next();
});

export const cliProcedure = ownerOrAdminProcedure;

export const adminProcedure = ownerOrAdminProcedure;

/**
 * Requires admin/owner role AND enterprise enabled with a license key in DB.
 * Does NOT call the license server on every request; full validation (haveValidLicenseKey)
 * is used in the UI gate and when activating/validating keys.
 */
export const enterpriseProcedure = ownerOrAdminProcedure.use(
	async ({ ctx, next }) => {
		const hasValidLicenseResult = await hasValidLicense(
			ctx.session.activeOrganizationId,
		);

		if (!hasValidLicenseResult) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Valid enterprise license required",
			});
		}

		return next();
	},
);

/**
 * Permission-checked procedure factory.
 *
 * Verifies the caller has the required resource+action permission before the
 * handler runs. Works for all role types:
 * - owner / admin  → always granted (static roles, no license needed)
 * - member         → legacy boolean fields (no license needed)
 * - custom role    → enterprise license verified automatically inside resolveRole
 *
 * Usage:
 *   create: withPermission("project", "create")
 *     .input(...)
 *     .mutation(async ({ ctx, input }) => { ... })
 */
export const withPermission = <R extends Resource>(
	resource: R,
	action: ActionOf<R>,
) =>
	protectedProcedure.use(async ({ ctx, next }) => {
		await checkPermission(ctx, { [resource]: [action] } as any);
		return next();
	});
