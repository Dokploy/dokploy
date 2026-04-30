import {
	createApiKey,
	createOrganizationUserWithCredentials,
	findNotificationById,
	findOrganizationById,
	findUserById,
	getDokployUrl,
	getUserByToken,
	getWebServerSettings,
	IS_CLOUD,
	removeUserById,
	renderInvitationEmail,
	sendEmailNotification,
	sendResendNotification,
	updateUser,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	account,
	apiAssignPermissions,
	apiFindOneToken,
	apikey,
	apiUpdateUser,
	invitation,
	member,
	user,
} from "@dokploy/server/db/schema";
import {
	hasPermission,
	resolvePermissions,
} from "@dokploy/server/services/permission";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
	withPermission,
} from "../trpc";

const apiCreateApiKey = z.object({
	name: z.string().min(1),
	prefix: z.string().optional(),
	expiresIn: z.number().optional(),
	metadata: z.object({
		organizationId: z.string(),
	}),
	// Rate limiting
	rateLimitEnabled: z.boolean().optional(),
	rateLimitTimeWindow: z.number().optional(),
	rateLimitMax: z.number().optional(),
	// Request limiting
	remaining: z.number().optional(),
	refillAmount: z.number().optional(),
	refillInterval: z.number().optional(),
});

export const userRouter = createTRPCRouter({
	all: withPermission("member", "read").query(async ({ ctx }) => {
		return await db.query.member.findMany({
			where: eq(member.organizationId, ctx.session.activeOrganizationId),
			with: {
				user: true,
			},
			orderBy: [asc(member.createdAt)],
		});
	}),
	one: protectedProcedure
		.input(
			z.object({
				userId: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const memberResult = await db.query.member.findFirst({
				where: and(
					eq(member.userId, input.userId),
					eq(member.organizationId, ctx.session?.activeOrganizationId || ""),
				),
				with: {
					user: true,
				},
			});

			// If user not found in the organization, deny access
			if (!memberResult) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found in this organization",
				});
			}

			// Allow access if:
			// 1. User is requesting their own information
			// 2. User is owner/admin
			// 3. User has member.update permission (custom roles managing permissions)
			if (
				memberResult.userId !== ctx.user.id &&
				ctx.user.role !== "owner" &&
				ctx.user.role !== "admin"
			) {
				const canUpdate = await hasPermission(ctx, { member: ["update"] });
				if (!canUpdate) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this user",
					});
				}
			}

			return memberResult;
		}),
	session: publicProcedure.query(async ({ ctx }) => {
		if (!ctx.user || !ctx.session || !ctx.session.activeOrganizationId) {
			return null;
		}
		return {
			user: {
				id: ctx.user.id,
			},
			session: {
				activeOrganizationId: ctx.session.activeOrganizationId,
			},
		};
	}),
	get: protectedProcedure.query(async ({ ctx }) => {
		const memberResult = await db.query.member.findFirst({
			where: and(
				eq(member.userId, ctx.user.id),
				eq(member.organizationId, ctx.session?.activeOrganizationId || ""),
			),
			with: {
				user: {
					with: {
						apiKeys: true,
					},
				},
			},
		});

		return memberResult;
	}),
	getPermissions: protectedProcedure.query(async ({ ctx }) => {
		return resolvePermissions(ctx);
	}),
	haveRootAccess: protectedProcedure.query(async ({ ctx }) => {
		if (!IS_CLOUD) {
			return false;
		}
		if (
			process.env.USER_ADMIN_ID === ctx.user.id ||
			ctx.session?.impersonatedBy === process.env.USER_ADMIN_ID
		) {
			return true;
		}
		return false;
	}),
	getBackups: adminProcedure.query(async ({ ctx }) => {
		const memberResult = await db.query.member.findFirst({
			where: and(
				eq(member.userId, ctx.user.id),
				eq(member.organizationId, ctx.session?.activeOrganizationId || ""),
			),
			with: {
				user: {
					with: {
						backups: {
							with: {
								destination: true,
								deployments: true,
							},
						},
						apiKeys: true,
					},
				},
			},
		});

		return memberResult?.user;
	}),
	getServerMetrics: withPermission("monitoring", "read").query(
		async ({ ctx }) => {
			const memberResult = await db.query.member.findFirst({
				where: and(
					eq(member.userId, ctx.user.id),
					eq(member.organizationId, ctx.session?.activeOrganizationId || ""),
				),
				with: {
					user: true,
				},
			});

			return memberResult?.user;
		},
	),
	update: protectedProcedure
		.input(apiUpdateUser)
		.mutation(async ({ input, ctx }) => {
			if (input.password || input.currentPassword) {
				const currentAuth = await db.query.account.findFirst({
					where: eq(account.userId, ctx.user.id),
				});
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

				if (!input.password) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "New password is required",
					});
				}
				await db
					.update(account)
					.set({
						password: bcrypt.hashSync(input.password, 10),
					})
					.where(eq(account.userId, ctx.user.id));
			}

			try {
				const result = await updateUser(ctx.user.id, input);
				await audit(ctx, {
					action: "update",
					resourceType: "user",
					resourceId: ctx.user.id,
					resourceName: ctx.user.email,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error ? error.message : "Failed to update user",
				});
			}
		}),
	getUserByToken: publicProcedure
		.input(apiFindOneToken)
		.query(async ({ input }) => {
			return await getUserByToken(input.token);
		}),
	getMetricsToken: withPermission("monitoring", "read").query(
		async ({ ctx }) => {
			const user = await findUserById(ctx.user.ownerId);
			const settings = await getWebServerSettings();
			return {
				serverIp: settings?.serverIp,
				enabledFeatures: user.enablePaidFeatures,
				metricsConfig: settings?.metricsConfig,
			};
		},
	),
	remove: protectedProcedure
		.input(
			z.object({
				userId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}

			// Ensure the acting user has admin privileges in the active organization
			if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only owners or admins can delete users",
				});
			}

			// Fetch target member within the active organization
			const targetMember = await db.query.member.findFirst({
				where: and(
					eq(member.userId, input.userId),
					eq(member.organizationId, ctx.session?.activeOrganizationId || ""),
				),
			});

			if (!targetMember) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Target user is not a member of this organization",
				});
			}

			// Never allow deleting the organization owner via this endpoint
			if (targetMember.role === "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You cannot delete the organization owner",
				});
			}

			// Admin self-protection: an admin cannot delete themselves
			if (targetMember.role === "admin" && input.userId === ctx.user.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"Admins cannot delete themselves. Ask the owner or another admin.",
				});
			}

			// Only owners can delete admins
			// Admins can only delete members
			if (ctx.user.role === "admin" && targetMember.role === "admin") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"Only the organization owner can delete admins. Admins can only delete members.",
				});
			}

			const result = await removeUserById(input.userId);
			await audit(ctx, {
				action: "delete",
				resourceType: "user",
				resourceId: input.userId,
			});
			return result;
		}),
	assignPermissions: withPermission("member", "update")
		.input(apiAssignPermissions)
		.mutation(async ({ input, ctx }) => {
			try {
				const organization = await findOrganizationById(
					ctx.session?.activeOrganizationId || "",
				);

				if (organization?.ownerId !== ctx.user.ownerId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to assign permissions",
					});
				}

				const { id, accessedGitProviders, accessedServers, ...rest } = input;

				const licensed = await hasValidLicense(
					ctx.session?.activeOrganizationId || "",
				);

				await db
					.update(member)
					.set({
						...rest,
						...(licensed && accessedGitProviders !== undefined
							? { accessedGitProviders }
							: {}),
						...(licensed && accessedServers !== undefined
							? { accessedServers }
							: {}),
					})
					.where(
						and(
							eq(member.userId, input.id),
							eq(
								member.organizationId,
								ctx.session?.activeOrganizationId || "",
							),
						),
					);
				await audit(ctx, {
					action: "update",
					resourceType: "user",
					resourceId: input.id,
					metadata: { permissions: rest },
				});
			} catch (error) {
				throw error;
			}
		}),
	getInvitations: protectedProcedure.query(async ({ ctx }) => {
		return await db.query.invitation.findMany({
			where: and(
				eq(invitation.email, ctx.user.email),
				gt(invitation.expiresAt, new Date()),
				eq(invitation.status, "pending"),
			),
			with: {
				organization: true,
			},
		});
	}),

	getContainerMetrics: withPermission("monitoring", "read")
		.input(
			z.object({
				url: z.string(),
				token: z.string(),
				appName: z.string(),
				dataPoints: z.string(),
			}),
		)
		.query(async ({ input }) => {
			try {
				if (!input.appName) {
					throw new Error(
						[
							"No Application Selected:",
							"",
							"Make Sure to select an application to monitor.",
						].join("\n"),
					);
				}
				const url = new URL(`${input.url}/metrics/containers`);
				url.searchParams.append("limit", input.dataPoints);
				url.searchParams.append("appName", input.appName);
				const response = await fetch(url.toString(), {
					headers: {
						Authorization: `Bearer ${input.token}`,
					},
				});
				if (!response.ok) {
					throw new Error(
						`Error ${response.status}: ${response.statusText}. Please verify that the application "${input.appName}" is running and this service is included in the monitoring configuration.`,
					);
				}

				const data = await response.json();
				if (!Array.isArray(data) || data.length === 0) {
					throw new Error(
						[
							`No monitoring data available for "${input.appName}". This could be because:`,
							"",
							"1. The container was recently started - wait a few minutes for data to be collected",
							"2. The container is not running - verify its status",
							"3. The service is not included in your monitoring configuration",
						].join("\n"),
					);
				}
				return data as {
					containerId: string;
					containerName: string;
					containerImage: string;
					containerLabels: string;
					containerCommand: string;
					containerCreated: string;
				}[];
			} catch (error) {
				throw error;
			}
		}),

	generateToken: protectedProcedure.mutation(async () => {
		return "token";
	}),

	deleteApiKey: protectedProcedure
		.input(
			z.object({
				apiKeyId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const apiKeyToDelete = await db.query.apikey.findFirst({
					where: eq(apikey.id, input.apiKeyId),
				});

				if (!apiKeyToDelete) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "API key not found",
					});
				}

				if (apiKeyToDelete.referenceId !== ctx.user.id) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to delete this API key",
					});
				}

				await db.delete(apikey).where(eq(apikey.id, input.apiKeyId));
				await audit(ctx, {
					action: "delete",
					resourceType: "user",
					resourceId: input.apiKeyId,
					resourceName: apiKeyToDelete.name || undefined,
				});
				return true;
			} catch (error) {
				throw error;
			}
		}),

	createApiKey: protectedProcedure
		.input(apiCreateApiKey)
		.mutation(async ({ input, ctx }) => {
			// Verify user is a member of the organization specified in metadata
			if (input.metadata?.organizationId) {
				const userMember = await db.query.member.findFirst({
					where: and(
						eq(member.organizationId, input.metadata.organizationId),
						eq(member.userId, ctx.user.id),
					),
				});

				if (!userMember) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not a member of this organization",
					});
				}
			}

			const apiKey = await createApiKey(ctx.user.id, input);
			await audit(ctx, {
				action: "create",
				resourceType: "user",
				resourceId: apiKey.id,
				resourceName: input.name,
			});
			return apiKey;
		}),

	checkUserOrganizations: protectedProcedure
		.input(
			z.object({
				userId: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			// Users can check their own organizations
			// Admins and owners can check organizations of members in their active organization
			if (input.userId !== ctx.user.id) {
				// Verify the target user is a member of the active organization
				const targetMember = await db.query.member.findFirst({
					where: and(
						eq(member.userId, input.userId),
						eq(member.organizationId, ctx.session?.activeOrganizationId || ""),
					),
				});

				if (!targetMember) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "User is not a member of your active organization",
					});
				}

				// Only admins and owners can check other users' organizations
				if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
					throw new TRPCError({
						code: "FORBIDDEN",
						message:
							"Only admins and owners can check other users' organizations",
					});
				}
			}

			const organizations = await db.query.member.findMany({
				where: eq(member.userId, input.userId),
			});

			return organizations.length;
		}),
	createUserWithCredentials: withPermission("member", "create")
		.input(
			z.object({
				email: z.string().email(),
				password: z.string().min(8),
				role: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"Creating users with initial credentials is only available in self-hosted mode",
				});
			}

			if (!ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Active organization is required",
				});
			}

			return await createOrganizationUserWithCredentials({
				organizationId: ctx.session.activeOrganizationId,
				email: input.email,
				password: input.password,
				role: input.role,
			});
		}),
	sendInvitation: withPermission("member", "create")
		.input(
			z.object({
				invitationId: z.string().min(1),
				notificationId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return;
			}

			const notification = await findNotificationById(input.notificationId);

			const email = notification.email;
			const resend = notification.resend;

			const currentInvitation = await db.query.invitation.findFirst({
				where: eq(invitation.id, input.invitationId),
			});

			if (!email && !resend) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Email provider not found",
				});
			}

			const host =
				process.env.NODE_ENV === "development"
					? "http://localhost:3000"
					: await getDokployUrl();
			const inviteLink = `${host}/invitation?token=${input.invitationId}`;

			const organization = await findOrganizationById(
				ctx.session.activeOrganizationId,
			);

			try {
				const toEmail = currentInvitation?.email || "";
				const orgName = organization?.name || "organization";
				const subject = `You've been invited to join ${orgName} on Dokploy`;
				const html = await renderInvitationEmail({
					email: toEmail,
					inviteLink,
					organizationName: orgName,
				});

				if (email) {
					await sendEmailNotification(
						{ ...email, toAddresses: [toEmail] },
						subject,
						html,
					);
				} else if (resend) {
					await sendResendNotification(
						{ ...resend, toAddresses: [toEmail] },
						subject,
						html,
					);
				}
			} catch (error) {
				console.log(error);
				throw error;
			}
			await audit(ctx, {
				action: "create",
				resourceType: "user",
				resourceId: input.invitationId,
				resourceName: currentInvitation?.email || "",
				metadata: { type: "sendInvitation" },
			});
			return inviteLink;
		}),

	getBookmarkedTemplates: protectedProcedure.query(async ({ ctx }) => {
		const result = await db.query.user.findFirst({
			where: eq(user.id, ctx.user.id),
			columns: { bookmarkedTemplates: true },
		});

		return result?.bookmarkedTemplates ?? [];
	}),

	toggleTemplateBookmark: protectedProcedure
		.input(
			z.object({
				templateId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const result = await db.query.user.findFirst({
				where: eq(user.id, ctx.user.id),
				columns: { bookmarkedTemplates: true },
			});

			const current = result?.bookmarkedTemplates ?? [];
			const isBookmarked = current.includes(input.templateId);

			const updated = isBookmarked
				? current.filter((id) => id !== input.templateId)
				: [...current, input.templateId];

			await db
				.update(user)
				.set({ bookmarkedTemplates: updated })
				.where(eq(user.id, ctx.user.id));

			return { isBookmarked: !isBookmarked };
		}),
});
