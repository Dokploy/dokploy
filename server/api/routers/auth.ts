import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "../trpc";
import { lucia, validateRequest } from "@/server/auth/auth";
import {
	apiCreateAdmin,
	apiCreateUser,
	apiFindOneAuth,
	apiUpdateAuthByAdmin,
	apiLogin,
	apiUpdateAuth,
	apiVerify2FA,
	apiVerifyLogin2FA,
} from "@/server/db/schema";
import {
	createAdmin,
	createUser,
	findAuthByEmail,
	findAuthById,
	generate2FASecret,
	updateAuthById,
	verify2FA,
} from "../services/auth";
import { luciaToken } from "@/server/auth/token";

export const authRouter = createTRPCRouter({
	createAdmin: publicProcedure
		.input(apiCreateAdmin)
		.mutation(async ({ ctx, input }) => {
			try {
				const newAdmin = await createAdmin(input);
				const session = await lucia.createSession(newAdmin.id || "", {});
				ctx.res.appendHeader(
					"Set-Cookie",
					lucia.createSessionCookie(session.id).serialize(),
				);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the main admin",
					cause: error,
				});
			}
		}),
	createUser: publicProcedure
		.input(apiCreateUser)
		.mutation(async ({ ctx, input }) => {
			try {
				const newUser = await createUser(input);
				const session = await lucia.createSession(newUser?.authId || "", {});
				ctx.res.appendHeader(
					"Set-Cookie",
					lucia.createSessionCookie(session.id).serialize(),
				);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the user",
					cause: error,
				});
			}
		}),

	login: publicProcedure.input(apiLogin).mutation(async ({ ctx, input }) => {
		try {
			const auth = await findAuthByEmail(input.email);

			const correctPassword = bcrypt.compareSync(
				input.password,
				auth?.password || "",
			);

			if (!correctPassword) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Credentials do not match",
				});
			}

			if (auth?.is2FAEnabled) {
				return {
					is2FAEnabled: true,
					authId: auth.id,
				};
			}

			const session = await lucia.createSession(auth?.id || "", {});

			ctx.res.appendHeader(
				"Set-Cookie",
				lucia.createSessionCookie(session.id).serialize(),
			);
			return {
				is2FAEnabled: false,
				authId: auth?.id,
			};
		} catch (error) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Credentials do not match",
				cause: error,
			});
		}
	}),

	get: protectedProcedure.query(async ({ ctx }) => {
		const auth = await findAuthById(ctx.user.authId);
		return auth;
	}),

	logout: protectedProcedure.mutation(async ({ ctx }) => {
		const { req, res } = ctx;
		const { session } = await validateRequest(req, res);
		if (!session) return false;

		await lucia.invalidateSession(session.id);
		res.setHeader("Set-Cookie", lucia.createBlankSessionCookie().serialize());
		return true;
	}),

	update: protectedProcedure
		.input(apiUpdateAuth)
		.mutation(async ({ ctx, input }) => {
			const auth = await updateAuthById(ctx.user.authId, {
				...(input.email && { email: input.email }),
				...(input.password && {
					password: bcrypt.hashSync(input.password, 10),
				}),
				...(input.image && { image: input.image }),
			});

			return auth;
		}),

	generateToken: protectedProcedure.mutation(async ({ ctx, input }) => {
		const auth = await findAuthById(ctx.user.authId);

		if (auth.token) {
			await luciaToken.invalidateSession(auth.token);
		}
		const session = await luciaToken.createSession(auth?.id || "", {
			expiresIn: 60 * 60 * 24 * 30,
		});

		await updateAuthById(auth.id, {
			token: session.id,
		});

		return auth;
	}),

	one: adminProcedure.input(apiFindOneAuth).query(async ({ input }) => {
		const auth = await findAuthById(input.id);
		return auth;
	}),

	updateByAdmin: protectedProcedure
		.input(apiUpdateAuthByAdmin)
		.mutation(async ({ input }) => {
			const auth = await updateAuthById(input.id, {
				...(input.email && { email: input.email }),
				...(input.password && {
					password: bcrypt.hashSync(input.password, 10),
				}),
				...(input.image && { image: input.image }),
			});

			return auth;
		}),
	generate2FASecret: protectedProcedure.query(async ({ ctx }) => {
		return await generate2FASecret(ctx.user.authId);
	}),
	verify2FASetup: protectedProcedure
		.input(apiVerify2FA)
		.mutation(async ({ ctx, input }) => {
			const auth = await findAuthById(ctx.user.authId);

			await verify2FA(auth, input.secret, input.pin);
			await updateAuthById(auth.id, {
				is2FAEnabled: true,
				secret: input.secret,
			});
			return auth;
		}),

	verifyLogin2FA: publicProcedure
		.input(apiVerifyLogin2FA)
		.mutation(async ({ ctx, input }) => {
			const auth = await findAuthById(input.id);

			await verify2FA(auth, auth.secret || "", input.pin);

			const session = await lucia.createSession(auth.id, {});

			ctx.res.appendHeader(
				"Set-Cookie",
				lucia.createSessionCookie(session.id).serialize(),
			);

			return auth;
		}),
	disable2FA: protectedProcedure.mutation(async ({ ctx }) => {
		const auth = await findAuthById(ctx.user.authId);
		await updateAuthById(auth.id, {
			is2FAEnabled: false,
			secret: null,
		});
		return auth;
	}),
	verifyToken: protectedProcedure.mutation(async () => {
		return true;
	}),
});
