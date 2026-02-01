import {
	TRAEFIK_PAGE_STATUSES,
	applyTraefikPagesConfig,
	canAccessToTraefikFiles,
	findServerById,
	readTraefikPagesConfig,
	renderTraefikErrorPage,
	type TraefikPagesConfig,
	type TraefikPageStatus,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const actionSchema = z.object({
	label: z.string().max(120),
	href: z.string().max(2048),
});

const pageSchema = z.object({
	enabled: z.boolean(),
	mode: z.enum(["builder", "custom"]),
	title: z.string().max(200),
	subtitle: z.string().max(200),
	message: z.string().max(1200),
	hint: z.string().max(1200),
	primaryAction: actionSchema,
	secondaryAction: actionSchema,
	showRequestId: z.boolean(),
	showTimestamp: z.boolean(),
	showHost: z.boolean(),
	showPath: z.boolean(),
	customHtml: z.string().max(60000),
	customCss: z.string().max(20000),
});

const themeSchema = z.object({
	brandName: z.string().max(120),
	logoUrl: z.string().max(2048),
	fontFamily: z.string().max(200),
	fontUrl: z.string().max(2048),
	palette: z.object({
		background: z.string().max(32),
		surface: z.string().max(32),
		card: z.string().max(32),
		text: z.string().max(32),
		muted: z.string().max(32),
		accent: z.string().max(32),
		border: z.string().max(64),
	}),
	gradient: z.object({
		enabled: z.boolean(),
		from: z.string().max(32),
		via: z.string().max(32),
		to: z.string().max(32),
		angle: z.number().min(0).max(360),
	}),
	layout: z.object({
		alignment: z.enum(["center", "left"]),
		maxWidth: z.number().min(320).max(1600),
		padding: z.number().min(12).max(120),
		card: z.boolean(),
		glass: z.boolean(),
	}),
	buttons: z.object({
		radius: z.number().min(0).max(32),
		primaryBackground: z.string().max(32),
		primaryText: z.string().max(32),
		secondaryBackground: z.string().max(32),
		secondaryText: z.string().max(32),
		secondaryBorder: z.string().max(64),
	}),
	effects: z.object({
		glow: z.boolean(),
		grid: z.boolean(),
		noise: z.boolean(),
	}),
});

const configSchema = z.object({
	version: z.literal(1),
	enabled: z.boolean(),
	entryPoints: z.array(z.string().min(1)),
	updatedAt: z.string().optional(),
	updatedBy: z
		.object({
			id: z.string().min(1),
			email: z.string().optional(),
			name: z.string().optional(),
		})
		.optional(),
	theme: themeSchema,
	pages: z.object({
		"401": pageSchema,
		"404": pageSchema,
		"503": pageSchema,
	}),
});

const serverSchema = z.object({
	serverId: z.string().optional(),
});

const previewSchema = z.object({
	config: configSchema,
	status: z.enum(TRAEFIK_PAGE_STATUSES),
	context: z
		.object({
			requestId: z.string().optional(),
			host: z.string().optional(),
			path: z.string().optional(),
			method: z.string().optional(),
			protocol: z.string().optional(),
		})
		.optional(),
});

export const traefikPagesRouter = createTRPCRouter({
	getConfig: protectedProcedure
		.input(serverSchema.optional())
		.query(async ({ ctx, input }) => {
			if (ctx.user.role === "member") {
				const canAccess = await canAccessToTraefikFiles(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
				if (!canAccess) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}

			if (input?.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this server",
					});
				}
			}

			return readTraefikPagesConfig(input?.serverId);
		}),
	updateConfig: protectedProcedure
		.input(
			z.object({
				serverId: z.string().optional(),
				config: configSchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.role === "member") {
				const canAccess = await canAccessToTraefikFiles(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
				if (!canAccess) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}

			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this server",
					});
				}
			}

			const current = await readTraefikPagesConfig(input.serverId);
			const nextConfig: TraefikPagesConfig = {
				...current,
				...input.config,
				theme: { ...current.theme, ...input.config.theme },
				pages: {
					...current.pages,
					...input.config.pages,
				},
				updatedBy: {
					id: ctx.user.id,
					email: ctx.user.email || undefined,
					name: `${ctx.user.firstName || ""} ${ctx.user.lastName || ""}`.trim(),
				},
			};

			const result = await applyTraefikPagesConfig({
				config: nextConfig,
				serverId: input.serverId,
			});

			return {
				...result,
			};
		}),
	preview: protectedProcedure.input(previewSchema).mutation(async ({ input }) => {
		const context = {
			status: input.status as TraefikPageStatus,
			requestId: input.context?.requestId,
			host: input.context?.host,
			path: input.context?.path,
			method: input.context?.method,
			protocol: input.context?.protocol,
			timestamp: new Date().toISOString(),
		};

		const html = renderTraefikErrorPage(
			input.config,
			input.status as TraefikPageStatus,
			context,
		);

		return {
			html,
		};
	}),
});

