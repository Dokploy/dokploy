import { createTRPCRouter } from "../trpc";

export const authRouter = createTRPCRouter({
	// createAdmin: publicProcedure.mutation(async ({ input }) => {
	// 	try {
	// 		if (!IS_CLOUD) {
	// 			const admin = await db.query.admins.findFirst({});
	// 			if (admin) {
	// 				throw new TRPCError({
	// 					code: "BAD_REQUEST",
	// 					message: "Admin already exists",
	// 				});
	// 			}
	// 		}
	// 		const newAdmin = await createAdmin(input);
	// 		if (IS_CLOUD) {
	// 			await sendDiscordNotificationWelcome(newAdmin);
	// 			await sendVerificationEmail(newAdmin.id);
	// 			return {
	// 				status: "success",
	// 				type: "cloud",
	// 			};
	// 		}
	// 		// const session = await lucia.createSession(newAdmin.id || "", {});
	// 		// ctx.res.appendHeader(
	// 		// 	"Set-Cookie",
	// 		// 	lucia.createSessionCookie(session.id).serialize(),
	// 		// );
	// 		return {
	// 			status: "success",
	// 			type: "selfhosted",
	// 		};
	// 	} catch (error) {
	// 		throw new TRPCError({
	// 			code: "BAD_REQUEST",
	// 			// @ts-ignore
	// 			message: `Error: ${error?.code === "23505" ? "Email already exists" : "Error creating admin"}`,
	// 			cause: error,
	// 		});
	// 	}
	// }),
	// createUser: publicProcedure.mutation(async ({ input }) => {
	// 	try {
	// 		const _token = await getUserByToken(input.token);
	// 		// if (token.isExpired) {
	// 		// 	throw new TRPCError({
	// 		// 		code: "BAD_REQUEST",
	// 		// 		message: "Invalid token",
	// 		// 	});
	// 		// }
	// 		// const newUser = await createUser(input);
	// 		// if (IS_CLOUD) {
	// 		// 	await sendVerificationEmail(token.authId);
	// 		// 	return true;
	// 		// }
	// 		// const session = await lucia.createSession(newUser?.authId || "", {});
	// 		// ctx.res.appendHeader(
	// 		// 	"Set-Cookie",
	// 		// 	lucia.createSessionCookie(session.id).serialize(),
	// 		// );
	// 		return true;
	// 	} catch (error) {
	// 		throw new TRPCError({
	// 			code: "BAD_REQUEST",
	// 			message: "Error creating the user",
	// 			cause: error,
	// 		});
	// 	}
	// }),
	// login: publicProcedure.mutation(async ({ input }) => {
	// 	try {
	// 		const auth = await findAuthByEmail(input.email);
	// 		const correctPassword = bcrypt.compareSync(
	// 			input.password,
	// 			auth?.password || "",
	// 		);
	// 		if (!correctPassword) {
	// 			throw new TRPCError({
	// 				code: "BAD_REQUEST",
	// 				message: "Credentials do not match",
	// 			});
	// 		}
	// 		if (auth?.confirmationToken && IS_CLOUD) {
	// 			await sendVerificationEmail(auth.id);
	// 			throw new TRPCError({
	// 				code: "BAD_REQUEST",
	// 				message:
	// 					"Email not confirmed, we have sent you a confirmation email please check your inbox.",
	// 			});
	// 		}
	// 		if (auth?.is2FAEnabled) {
	// 			return {
	// 				is2FAEnabled: true,
	// 				authId: auth.id,
	// 			};
	// 		}
	// 		// const session = await lucia.createSession(auth?.id || "", {});
	// 		// ctx.res.appendHeader(
	// 		// 	"Set-Cookie",
	// 		// 	lucia.createSessionCookie(session.id).serialize(),
	// 		// );
	// 		return {
	// 			is2FAEnabled: false,
	// 			authId: auth?.id,
	// 		};
	// 	} catch (error) {
	// 		throw new TRPCError({
	// 			code: "BAD_REQUEST",
	// 			message: `Error: ${error instanceof Error ? error.message : "Login error"}`,
	// 			cause: error,
	// 		});
	// 	}
	// }),
	// get: protectedProcedure.query(async ({ ctx }) => {
	// 	const memberResult = await db.query.member.findFirst({
	// 		where: and(
	// 			eq(member.userId, ctx.user.id),
	// 			eq(member.organizationId, ctx.session?.activeOrganizationId || ""),
	// 		),
	// 		with: {
	// 			user: true,
	// 		},
	// 	});
	// 	return memberResult;
	// }),
	// logout: protectedProcedure.mutation(async ({ ctx }) => {
	// 	const { req } = ctx;
	// 	const { session } = await validateRequest(req);
	// 	if (!session) return false;
	// 	// await lucia.invalidateSession(session.id);
	// 	// res.setHeader("Set-Cookie", lucia.createBlankSessionCookie().serialize());
	// 	return true;
	// }),
	// update: protectedProcedure.mutation(async ({ ctx, input }) => {
	// 	const currentAuth = await findAuthByEmail(ctx.user.email);
	// 	if (input.currentPassword || input.password) {
	// 		const correctPassword = bcrypt.compareSync(
	// 			input.currentPassword || "",
	// 			currentAuth?.password || "",
	// 		);
	// 		if (!correctPassword) {
	// 			throw new TRPCError({
	// 				code: "BAD_REQUEST",
	// 				message: "Current password is incorrect",
	// 			});
	// 		}
	// 	}
	// 	// const auth = await updateAuthById(ctx.user.authId, {
	// 	// 	...(input.email && { email: input.email.toLowerCase() }),
	// 	// 	...(input.password && {
	// 	// 		password: bcrypt.hashSync(input.password, 10),
	// 	// 	}),
	// 	// 	...(input.image && { image: input.image }),
	// 	// });
	// 	return auth;
	// }),
	// removeSelfAccount: protectedProcedure
	// 	.input(
	// 		z.object({
	// 			password: z.string().min(1),
	// 		}),
	// 	)
	// 	.mutation(async ({ ctx, input }) => {
	// 		if (!IS_CLOUD) {
	// 			throw new TRPCError({
	// 				code: "NOT_FOUND",
	// 				message: "This feature is only available in the cloud version",
	// 			});
	// 		}
	// 		const currentAuth = await findAuthByEmail(ctx.user.email);
	// 		const correctPassword = bcrypt.compareSync(
	// 			input.password,
	// 			currentAuth?.password || "",
	// 		);
	// 		if (!correctPassword) {
	// 			throw new TRPCError({
	// 				code: "BAD_REQUEST",
	// 				message: "Password is incorrect",
	// 			});
	// 		}
	// 		const { req } = ctx;
	// 		const { session } = await validateRequest(req);
	// 		if (!session) return false;
	// 		// await lucia.invalidateSession(session.id);
	// 		// res.setHeader("Set-Cookie", lucia.createBlankSessionCookie().serialize());
	// 		// if (ctx.user.rol === "owner") {
	// 		// 	await removeAdminByAuthId(ctx.user.authId);
	// 		// } else {
	// 		// 	await removeUserByAuthId(ctx.user.authId);
	// 		// }
	// 		return true;
	// 	}),
	// generateToken: protectedProcedure.mutation(async ({ ctx }) => {
	// 	const auth = await findUserById(ctx.user.id);
	// 	console.log(auth);
	// 	// if (auth.token) {
	// 	// 	await luciaToken.invalidateSession(auth.token);
	// 	// }
	// 	// const session = await luciaToken.createSession(auth?.id || "", {
	// 	// 	expiresIn: 60 * 60 * 24 * 30,
	// 	// });
	// 	// await updateUser(auth.id, {
	// 	// 	token: session.id,
	// 	// });
	// 	return auth;
	// }),
	// verifyToken: protectedProcedure.mutation(async () => {
	// 	return true;
	// }),
	// one: adminProcedure
	// 	.input(z.object({ userId: z.string().min(1) }))
	// 	.query(async ({ input }) => {
	// 		// TODO: Check if the user is admin or member
	// 		const user = await findUserById(input.userId);
	// 		return user;
	// 	}),
	// sendResetPasswordEmail: publicProcedure
	// 	.input(
	// 		z.object({
	// 			email: z.string().min(1).email(),
	// 		}),
	// 	)
	// 	.mutation(async ({ input }) => {
	// 		if (!IS_CLOUD) {
	// 			throw new TRPCError({
	// 				code: "NOT_FOUND",
	// 				message: "This feature is only available in the cloud version",
	// 			});
	// 		}
	// 		const authR = await db.query.auth.findFirst({
	// 			where: eq(auth.email, input.email),
	// 		});
	// 		if (!authR) {
	// 			throw new TRPCError({
	// 				code: "NOT_FOUND",
	// 				message: "User not found",
	// 			});
	// 		}
	// 		const token = nanoid();
	// 		await updateAuthById(authR.id, {
	// 			resetPasswordToken: token,
	// 			// Make resetPassword in 24 hours
	// 			resetPasswordExpiresAt: new Date(
	// 				new Date().getTime() + 24 * 60 * 60 * 1000,
	// 			).toISOString(),
	// 		});
	// 		await sendEmailNotification(
	// 			{
	// 				fromAddress: process.env.SMTP_FROM_ADDRESS!,
	// 				toAddresses: [authR.email],
	// 				smtpServer: process.env.SMTP_SERVER!,
	// 				smtpPort: Number(process.env.SMTP_PORT),
	// 				username: process.env.SMTP_USERNAME!,
	// 				password: process.env.SMTP_PASSWORD!,
	// 			},
	// 			"Reset Password",
	// 			`
	// 			Reset your password by clicking the link below:
	// 			The link will expire in 24 hours.
	// 			<a href="${WEBSITE_URL}/reset-password?token=${token}">
	// 				Reset Password
	// 			</a>
	// 		`,
	// 		);
	// 	}),
});

// export const sendVerificationEmail = async (authId: string) => {
// 	const token = nanoid();
// 	const result = await updateAuthById(authId, {
// 		confirmationToken: token,
// 		confirmationExpiresAt: new Date(
// 			new Date().getTime() + 24 * 60 * 60 * 1000,
// 		).toISOString(),
// 	});

// 	if (!result) {
// 		throw new TRPCError({
// 			code: "BAD_REQUEST",
// 			message: "User not found",
// 		});
// 	}
// 	await sendEmailNotification(
// 		{
// 			fromAddress: process.env.SMTP_FROM_ADDRESS || "",
// 			toAddresses: [result?.email],
// 			smtpServer: process.env.SMTP_SERVER || "",
// 			smtpPort: Number(process.env.SMTP_PORT),
// 			username: process.env.SMTP_USERNAME || "",
// 			password: process.env.SMTP_PASSWORD || "",
// 		},
// 		"Confirm your email | Dokploy",
// 		`
// 		Welcome to Dokploy!
// 		Please confirm your email by clicking the link below:
// 		<a href="${WEBSITE_URL}/confirm-email?token=${result?.confirmationToken}">
// 			Confirm Email
// 		</a>
// 	`,
// 	);

// 	return true;
// };

// export const sendDiscordNotificationWelcome = async (newAdmin: Auth) => {
// 	await sendDiscordNotification(
// 		{
// 			webhookUrl: process.env.DISCORD_WEBHOOK_URL || "",
// 		},
// 		{
// 			title: "New User Registered",
// 			color: 0x00ff00,
// 			fields: [
// 				{
// 					name: "Email",
// 					value: newAdmin.email,
// 					inline: true,
// 				},
// 			],
// 			timestamp: newAdmin.createdAt,
// 			footer: {
// 				text: "Dokploy User Registration Notification",
// 			},
// 		},
// 	);
// };
