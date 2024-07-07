/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Session, User } from "lucia";
import { db } from "@/server/db";
// import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import { validateBearerToken } from "../auth/token";
import { validateRequest } from "../auth/auth";
import {
	type NextRequest,
	NextResponse,
	type NextFetchEvent,
} from "next/server";
/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */

interface CreateContextOptions {
	user: (User & { authId: string }) | null;
	session: Session | null;
	req: NextRequest;
	res: NextResponse;
}
// export const createTRPCContext = async (opts: { headers: Headers }) => {
// 	return {
// 		db,
// 		...opts,
// 	};
// };

const createInnerTRPCContext = (opts: CreateContextOptions) => {
	return {
		session: opts.session,
		db,
		req: opts.req,
		res: opts.res,
		user: opts.user,
	};
};

export const createTRPCContext = async (opts: any) => {
	const { req, res } = opts;

	let { session, user } = await validateBearerToken(req);

	if (!session) {
		const cookieResult = await validateRequest(req, res);
		session = cookieResult.session;
		user = cookieResult.user;
	}

	return createInnerTRPCContext({
		req,
		res,
		session: session,
		...((user && {
			user: {
				authId: user.id,
				email: user.email,
				rol: user.rol,
				id: user.id,
				secret: user.secret,
			},
		}) || {
			user: null,
		}),
	});
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
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
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

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

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.session || !ctx.user) {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
	return next({
		ctx: {
			// infers the `session` as non-nullable
			session: ctx.session,
			user: ctx.user,
			// session: { ...ctx.session, user: ctx.user },
		},
	});
});

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.session || !ctx.user || ctx.user.rol !== "admin") {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
	return next({
		ctx: {
			// infers the `session` as non-nullable
			session: ctx.session,
			user: ctx.user,
			// session: { ...ctx.session, user: ctx.user },
		},
	});
});

export const cliProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.session || !ctx.user || ctx.user.rol !== "admin") {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
	return next({
		ctx: {
			// infers the `session` as non-nullable
			session: ctx.session,
			user: ctx.user,
			// session: { ...ctx.session, user: ctx.user },
		},
	});
});
