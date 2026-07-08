import {
	createApiKey,
	createOrganizationUserWithCredentials,
	findNotificationById,
	findOrganizationById,
	findServerById,
	findUserById,
	getAccessibleServerIds,
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
	server,
	session,
	user,
} from "@dokploy/server/db/schema";
import {
	assertRoleAssignmentAllowed,
	checkPermission,
	hasPermission,
	resolvePermissions,
} from "@dokploy/server/services/permission";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { fetchWithPublicEgress } from "@dokploy/server/utils/url/network";
import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import { and, asc, eq, gt, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { assertContainerMetricsServiceAccess } from "@/server/api/utils/monitoring-access";
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

const getApiKeyOrganizationId = (apiKey: { metadata?: string | null }) => {
	if (!apiKey.metadata) {
		return null;
	}

	try {
		const metadata = JSON.parse(apiKey.metadata) as {
			organizationId?: unknown;
		};
		return typeof metadata.organizationId === "string"
			? metadata.organizationId
			: null;
	} catch {
		return null;
	}
};

const getContainerMetricsTarget = async (
	input: { serverId?: string },
	ctx: { session: Parameters<typeof getAccessibleServerIds>[0] },
) => {
	if (input.serverId) {
		const accessibleIds = await getAccessibleServerIds(ctx.session);
		if (!accessibleIds.has(input.serverId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You are not authorized to access this server",
			});
		}

		const currentServer = await findServerById(input.serverId);
		if (currentServer.organizationId !== ctx.session.activeOrganizationId) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You are not authorized to access this server",
			});
		}

		return {
			host: currentServer.ipAddress,
			port: currentServer.metricsConfig?.server?.port,
			token: currentServer.metricsConfig?.server?.token,
		};
	}

	const settings = await getWebServerSettings();
	return {
		host: settings?.serverIp,
		port: settings?.metricsConfig?.server?.port,
		token: settings?.metricsConfig?.server?.token,
	};
};

const assertAssignedServersBelongToOrganization = async (
	serverIds: string[] | undefined,
	organizationId: string,
) => {
	if (!serverIds?.length) {
		return;
	}

	const uniqueServerIds = [...new Set(serverIds)];
	const organizationServers = await db.query.server.findMany({
		where: and(
			inArray(server.serverId, uniqueServerIds),
			eq(server.organizationId, organizationId),
		),
		columns: {
			serverId: true,
		},
	});

	if (organizationServers.length !== uniqueServerIds.length) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Assigned servers must belong to the active organization",
		});
	}
};

const assertLegacyPermissionGrantsAllowed = async (
	ctx: Parameters<typeof checkPermission>[0],
	input: {
		canCreateProjects?: boolean;
		canDeleteProjects?: boolean;
		canCreateServices?: boolean;
		canDeleteServices?: boolean;
		canCreateEnvironments?: boolean;
		canDeleteEnvironments?: boolean;
		canAccessToTraefikFiles?: boolean;
		canAccessToDocker?: boolean;
		canAccessToAPI?: boolean;
		canAccessToSSHKeys?: boolean;
		canAccessToGitProviders?: boolean;
	},
) => {
	const checks: Array<
		[boolean | undefined, Parameters<typeof checkPermission>[1]]
	> = [
		[input.canCreateProjects, { project: ["create"] }],
		[input.canDeleteProjects, { project: ["delete"] }],
		[input.canCreateServices, { service: ["create"] }],
		[input.canDeleteServices, { service: ["delete"] }],
		[input.canCreateEnvironments, { environment: ["create"] }],
		[input.canDeleteEnvironments, { environment: ["delete"] }],
		[input.canAccessToTraefikFiles, { traefikFiles: ["read"] }],
		[input.canAccessToDocker, { docker: ["read"] }],
		[input.canAccessToAPI, { api: ["read"] }],
		[input.canAccessToSSHKeys, { sshKeys: ["read", "create", "delete"] }],
		[input.canAccessToGitProviders, { gitProviders: ["read"] }],
	];

	for (const [enabled, permissions] of checks) {
		if (enabled === true) {
			await checkPermission(ctx, permissions);
		}
	}
};

const buildContainerMetricsRequest = ({
	host,
	port,
	token,
	dataPoints,
	appName,
}: {
	host?: string | null;
	port?: number | string | null;
	token?: string | null;
	dataPoints: string;
	appName: string;
}) => {
	const normalizedHost = host?.trim();
	const normalizedToken = token?.trim();
	const normalizedPort = Number(port);

	if (
		!normalizedHost ||
		!Number.isInteger(normalizedPort) ||
		normalizedPort <= 0 ||
		normalizedPort > 65535 ||
		!normalizedToken
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Monitoring metrics target is not configured",
		});
	}

	const urlHost =
		normalizedHost.includes(":") && !normalizedHost.startsWith("[")
			? `[${normalizedHost}]`
			: normalizedHost;
	const url = new URL(`http://${urlHost}:${normalizedPort}/metrics/containers`);
	url.searchParams.append("limit", dataPoints);
	url.searchParams.append("appName", appName);

	return {
		url,
		token: normalizedToken,
	};
};

const metricsFetchOptions = {
	allowPrivateNetwork: true,
	fieldName: "Monitoring metrics URL",
} as const;

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
		if (!ctx.user || !ctx.session?.activeOrganizationId) {
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
					columns: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						image: true,
						allowImpersonation: true,
						twoFactorEnabled: true,
						stripeCustomerId: true,
						stripeSubscriptionId: true,
						serversQuantity: true,
						isEnterpriseCloud: true,
						sendInvoiceNotifications: true,
					},
					with: {
						apiKeys: {
							columns: {
								id: true,
								name: true,
								prefix: true,
								enabled: true,
								expiresAt: true,
								createdAt: true,
								metadata: true,
							},
						},
					},
				},
			},
		});

		if (!memberResult) {
			return memberResult;
		}

		return {
			...memberResult,
			user: {
				...memberResult.user,
				apiKeys: memberResult.user.apiKeys
					.filter(
						(apiKey) =>
							getApiKeyOrganizationId(apiKey) ===
							ctx.session.activeOrganizationId,
					)
					.map(({ metadata, ...apiKey }) => apiKey),
			},
		};
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
			const { password, currentPassword, ...profileUpdate } = input;
			if (password || currentPassword) {
				const currentAuth = await db.query.account.findFirst({
					where: eq(account.userId, ctx.user.id),
				});
				const correctPassword = bcrypt.compareSync(
					currentPassword || "",
					currentAuth?.password || "",
				);

				if (!correctPassword) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Current password is incorrect",
					});
				}

				if (!password) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "New password is required",
					});
				}
				await db
					.update(account)
					.set({
						password: bcrypt.hashSync(password, 10),
					})
					.where(eq(account.userId, ctx.user.id));

				await db
					.delete(session)
					.where(
						and(
							eq(session.userId, ctx.user.id),
							ne(session.id, ctx.session.id),
						),
					);
			}

			try {
				const result = await updateUser(ctx.user.id, profileUpdate);
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
				metricsConfig: settings?.metricsConfig
					? {
							server: {
								port: settings.metricsConfig.server.port,
							},
						}
					: undefined,
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
			const activeOrganizationId = ctx.session?.activeOrganizationId || "";

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
					eq(member.organizationId, activeOrganizationId),
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

			const targetMemberships = await db.query.member.findMany({
				where: eq(member.userId, input.userId),
				columns: {
					organizationId: true,
				},
			});

			if (
				targetMemberships.some(
					(targetMembership) =>
						targetMembership.organizationId !== activeOrganizationId,
				)
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Cannot delete a user that belongs to another organization",
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
				await assertLegacyPermissionGrantsAllowed(ctx, rest);

				const licensed = await hasValidLicense(
					ctx.session?.activeOrganizationId || "",
				);
				if (licensed && accessedServers !== undefined) {
					await assertAssignedServersBelongToOrganization(
						accessedServers,
						ctx.session?.activeOrganizationId || "",
					);
				}

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
			z
				.object({
					serverId: z.string().optional(),
					appName: z.string(),
					dataPoints: z.string(),
				})
				.strict(),
		)
		.query(async ({ ctx, input }) => {
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
				await assertContainerMetricsServiceAccess(
					ctx,
					input.appName,
					input.serverId,
				);
				const target = await getContainerMetricsTarget(input, ctx);
				const request = buildContainerMetricsRequest({
					...target,
					dataPoints: input.dataPoints,
					appName: input.appName,
				});
				const response = await fetchWithPublicEgress(
					request.url.toString(),
					{
						headers: {
							Authorization: `Bearer ${request.token}`,
						},
					},
					metricsFetchOptions,
				);
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
				await checkPermission(ctx, { api: ["read"] });
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

				if (
					getApiKeyOrganizationId(apiKeyToDelete) !==
					ctx.session.activeOrganizationId
				) {
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
			const targetOrganizationId =
				input.metadata?.organizationId ?? ctx.session.activeOrganizationId;

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

			const targetOrganizationCtx = {
				...ctx,
				session: {
					...ctx.session,
					activeOrganizationId: targetOrganizationId,
				},
			};
			await checkPermission(targetOrganizationCtx, { api: ["read"] });

			const apiKey = await createApiKey(ctx.user.id, input);
			await audit(targetOrganizationCtx, {
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

			if (input.role === "owner" || input.role === "admin") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Cannot create a user with a privileged static role",
				});
			}

			await assertRoleAssignmentAllowed(ctx, input.role);

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
			if (notification.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this notification",
				});
			}

			const email = notification.email;
			const resend = notification.resend;

			const currentInvitation = await db.query.invitation.findFirst({
				where: and(
					eq(invitation.id, input.invitationId),
					eq(invitation.organizationId, ctx.session.activeOrganizationId),
				),
			});

			if (!currentInvitation) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Invitation not found",
				});
			}

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
