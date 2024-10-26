import {
	apiCreateAdmin,
	apiCreateUser,
	apiFindOneAuth,
	apiLogin,
	apiUpdateAuth,
	apiUpdateAuthByAdmin,
	apiVerify2FA,
	apiVerifyLogin2FA,
	auth,
} from "@/server/db/schema";
import {
	IS_CLOUD,
	createAdmin,
	createUser,
	findAuthByEmail,
	findAuthById,
	generate2FASecret,
	getUserByToken,
	lucia,
	luciaToken,
	sendEmailNotification,
	updateAuthById,
	validateRequest,
	verify2FA,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import { isBefore } from "date-fns";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "../../db";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "../trpc";

export const authRouter = createTRPCRouter({
	createAdmin: publicProcedure
		.input(apiCreateAdmin)
		.mutation(async ({ ctx, input }) => {
			try {
				if (!IS_CLOUD) {
					const admin = await db.query.admins.findFirst({});
					if (admin) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Admin already exists",
						});
					}
				}
				const newAdmin = await createAdmin(input);
				const session = await lucia.createSession(newAdmin.id || "", {});
				ctx.res.appendHeader(
					"Set-Cookie",
					lucia.createSessionCookie(session.id).serialize(),
				);
				return true;
			} catch (error) {
				throw error;
			}
		}),
	createUser: publicProcedure
		.input(apiCreateUser)
		.mutation(async ({ ctx, input }) => {
			try {
				const token = await getUserByToken(input.token);
				if (token.isExpired) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Invalid token",
					});
				}
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

			return true;
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
	sendResetPasswordEmail: publicProcedure
		.input(
			z.object({
				email: z.string().min(1).email(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "This feature is only available in the cloud version",
				});
			}
			const authR = await db.query.auth.findFirst({
				where: eq(auth.email, input.email),
			});
			if (!authR) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}
			const token = nanoid();
			await updateAuthById(authR.id, {
				resetPasswordToken: token,
				// Make resetPassword in 24 hours
				resetPasswordExpiresAt: new Date(
					new Date().getTime() + 24 * 60 * 60 * 1000,
				).toISOString(),
			});

			const email = await sendEmailNotification(
				{
					fromAddress: process.env.SMTP_FROM_ADDRESS!,
					toAddresses: [authR.email],
					smtpServer: process.env.SMTP_SERVER!,
					smtpPort: Number(process.env.SMTP_PORT),
					username: process.env.SMTP_USERNAME!,
					password: process.env.SMTP_PASSWORD!,
				},
				"Reset Password",
				`
				Reset your password by clicking the link below:
				The link will expire in 24 hours.
				<a href="http://localhost:3000/reset-password?token=${token}">
					Reset Password
				</a>
			
			`,
			);
		}),

	resetPassword: publicProcedure
		.input(
			z.object({
				resetPasswordToken: z.string().min(1),
				password: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "This feature is only available in the cloud version",
				});
			}
			const authR = await db.query.auth.findFirst({
				where: eq(auth.resetPasswordToken, input.resetPasswordToken),
			});

			if (!authR || authR.resetPasswordExpiresAt === null) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Token not found",
				});
			}

			const isExpired = isBefore(
				new Date(authR.resetPasswordExpiresAt),
				new Date(),
			);

			if (isExpired) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Token expired",
				});
			}

			await updateAuthById(authR.id, {
				resetPasswordExpiresAt: null,
				resetPasswordToken: null,
				password: bcrypt.hashSync(input.password, 10),
			});

			return true;
		}),
});
