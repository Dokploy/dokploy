import {
	apiCreateAdmin,
	apiCreateUser,
	apiFindOneAuth,
	apiLogin,
	apiUpdateAuth,
	apiVerify2FA,
	apiVerifyLogin2FA,
	auth,
} from "@/server/db/schema";
import { WEBSITE_URL } from "@/server/utils/stripe";
import {
	type Auth,
	IS_CLOUD,
	createAdmin,
	createUser,
	findAuthByEmail,
	findAuthById,
	generate2FASecret,
	getUserByToken,
	lucia,
	luciaToken,
	removeAdminByAuthId,
	removeUserByAuthId,
	sendDiscordNotification,
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

				if (IS_CLOUD) {
					await sendDiscordNotificationWelcome(newAdmin);
					await sendVerificationEmail(newAdmin.id);
					return {
						status: "success",
						type: "cloud",
					};
				}
				const session = await lucia.createSession(newAdmin.id || "", {});
				ctx.res.appendHeader(
					"Set-Cookie",
					lucia.createSessionCookie(session.id).serialize(),
				);
				return {
					status: "success",
					type: "selfhosted",
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					// @ts-ignore
					message: `Error: ${error?.code === "23505" ? "Email already exists" : "Error creating admin"}`,
					cause: error,
				});
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

				if (IS_CLOUD) {
					await sendVerificationEmail(token.authId);
					return true;
				}
				const session = await lucia.createSession(newUser?.authId || "", {});
				ctx.res.appendHeader(
					"Set-Cookie",
					lucia.createSessionCookie(session.id).serialize(),
				);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the user",
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

			if (auth?.confirmationToken && IS_CLOUD) {
				await sendVerificationEmail(auth.id);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Email not confirmed, we have sent you a confirmation email please check your inbox.",
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
				message: `Error: ${error instanceof Error ? error.message : "Login error"}`,
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
			const currentAuth = await findAuthByEmail(ctx.user.email);

			if (input.currentPassword || input.password) {
				const correctPassword = bcrypt.compareSync(
					input.currentPassword || "",
					currentAuth?.password || "",
				);
				if (!correctPassword) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Current password is incorrect",
					});
				}
			}
			const auth = await updateAuthById(ctx.user.authId, {
				...(input.email && { email: input.email.toLowerCase() }),
				...(input.password && {
					password: bcrypt.hashSync(input.password, 10),
				}),
				...(input.image && { image: input.image }),
			});

			return auth;
		}),
	removeSelfAccount: protectedProcedure
		.input(
			z.object({
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
			const currentAuth = await findAuthByEmail(ctx.user.email);

			const correctPassword = bcrypt.compareSync(
				input.password,
				currentAuth?.password || "",
			);

			if (!correctPassword) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Password is incorrect",
				});
			}
			const { req, res } = ctx;
			const { session } = await validateRequest(req, res);
			if (!session) return false;

			await lucia.invalidateSession(session.id);
			res.setHeader("Set-Cookie", lucia.createBlankSessionCookie().serialize());

			if (ctx.user.rol === "admin") {
				await removeAdminByAuthId(ctx.user.authId);
			} else {
				await removeUserByAuthId(ctx.user.authId);
			}

			return true;
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
	verifyToken: protectedProcedure.mutation(async () => {
		return true;
	}),
	one: adminProcedure.input(apiFindOneAuth).query(async ({ input }) => {
		const auth = await findAuthById(input.id);
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

			await sendEmailNotification(
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
				<a href="${WEBSITE_URL}/reset-password?token=${token}">
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
	confirmEmail: adminProcedure
		.input(
			z.object({
				confirmationToken: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Functionality not available in cloud version",
				});
			}
			const authR = await db.query.auth.findFirst({
				where: eq(auth.confirmationToken, input.confirmationToken),
			});
			if (!authR || authR.confirmationExpiresAt === null) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Token not found",
				});
			}
			if (authR.confirmationToken !== input.confirmationToken) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Confirmation Token not found",
				});
			}

			const isExpired = isBefore(
				new Date(authR.confirmationExpiresAt),
				new Date(),
			);

			if (isExpired) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Confirmation Token expired",
				});
			}
			1;
			await updateAuthById(authR.id, {
				confirmationToken: null,
				confirmationExpiresAt: null,
			});
			return true;
		}),
});

export const sendVerificationEmail = async (authId: string) => {
	const token = nanoid();
	const result = await updateAuthById(authId, {
		confirmationToken: token,
		confirmationExpiresAt: new Date(
			new Date().getTime() + 24 * 60 * 60 * 1000,
		).toISOString(),
	});

	if (!result) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "User not found",
		});
	}
	await sendEmailNotification(
		{
			fromAddress: process.env.SMTP_FROM_ADDRESS || "",
			toAddresses: [result?.email],
			smtpServer: process.env.SMTP_SERVER || "",
			smtpPort: Number(process.env.SMTP_PORT),
			username: process.env.SMTP_USERNAME || "",
			password: process.env.SMTP_PASSWORD || "",
		},
		"Confirm your email | Dokploy",
		`
		Welcome to Dokploy!
		Please confirm your email by clicking the link below:
		<a href="${WEBSITE_URL}/confirm-email?token=${result?.confirmationToken}">
			Confirm Email
		</a>
	`,
	);

	return true;
};

export const sendDiscordNotificationWelcome = async (newAdmin: Auth) => {
	await sendDiscordNotification(
		{
			webhookUrl: process.env.DISCORD_WEBHOOK_URL || "",
		},
		{
			title: "New User Registered",
			color: 0x00ff00,
			fields: [
				{
					name: "Email",
					value: newAdmin.email,
					inline: true,
				},
			],
			timestamp: newAdmin.createdAt,
			footer: {
				text: "Dokploy User Registration Notification",
			},
		},
	);
};
