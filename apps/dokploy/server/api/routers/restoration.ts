import path from "node:path";
import {
	findApplicationById,
	findComposeById,
	findLibsqlById,
	findMariadbById,
	findMongoById,
	findMySqlById,
	findPostgresById,
	IS_CLOUD,
	restoreVolume,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	apiRestoreBackup,
	restorations,
	VOLUME_NAME_MESSAGE,
	VOLUME_NAME_REGEX,
} from "@dokploy/server/db/schema";
import { findDestinationById } from "@dokploy/server/services/destination";
import {
	checkPermission,
	checkServicePermissionAndAccess,
	findMemberByUserId,
	hasPermission,
} from "@dokploy/server/services/permission";
import {
	execAsyncRemote,
	execAsyncStream,
} from "@dokploy/server/utils/process/execAsync";
import {
	restoreComposeBackup,
	restoreLibsqlBackup,
	restoreMariadbBackup,
	restoreMongoBackup,
	restoreMySqlBackup,
	restorePostgresBackup,
	restoreWebServerBackup,
} from "@dokploy/server/utils/restore";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { z } from "zod";
import {
	collectRestorationSecrets,
	readRestorationLog,
	recoverRestorationHistory,
	startTrackedRestoration,
} from "@/server/utils/restoration-history";
import { createTRPCRouter, protectedProcedure } from "../trpc";

type Context = Parameters<typeof checkPermission>[0] & {
	user: { id: string; role?: string | null };
};
const isPlatformAdmin = (ctx: Context) =>
	ctx.user.role === "owner" || ctx.user.role === "admin";

async function getVisibleKinds(ctx: Context) {
	const kinds: ("database" | "volume" | "dokploy")[] = [];
	if (await hasPermission(ctx, { backup: ["read"] })) {
		kinds.push("database");
		if (!IS_CLOUD && isPlatformAdmin(ctx)) kinds.push("dokploy");
	}
	if (await hasPermission(ctx, { volumeBackup: ["read"] }))
		kinds.push("volume");
	return kinds;
}

async function scope(ctx: Context) {
	const kinds = await getVisibleKinds(ctx);
	const member = await findMemberByUserId(
		ctx.user.id,
		ctx.session.activeOrganizationId,
	);
	const org = eq(restorations.organizationId, ctx.session.activeOrganizationId);
	const access =
		member.role === "owner" || member.role === "admin"
			? undefined
			: inArray(restorations.serviceId, member.accessedServices);
	return or(
		and(
			org,
			inArray(
				restorations.kind,
				kinds.filter((kind) => kind !== "dokploy"),
			),
			access,
		),
		kinds.includes("dokploy")
			? and(
					eq(restorations.kind, "dokploy"),
					isNull(restorations.organizationId),
				)
			: undefined,
	);
}

export async function getAccessibleRestoration(
	ctx: Context,
	restorationId: string,
) {
	const row = await db.query.restorations.findFirst({
		where: and(await scope(ctx), eq(restorations.restorationId, restorationId)),
	});
	if (!row)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Restoration not found",
		});
	return row;
}

function assertOrganization(organizationId: string, ctx: Context) {
	if (organizationId !== ctx.session.activeOrganizationId)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Restore destination or service not found",
		});
}

const serviceMetadata = (
	service: {
		name: string;
		environment: {
			environmentId: string;
			project: { projectId: string; organizationId: string };
		};
	},
	id: string,
	type: string,
) => ({
	serviceId: id,
	serviceType: type,
	serviceName: service.name,
	serviceHref: `/dashboard/project/${service.environment.project.projectId}/environment/${service.environment.environmentId}/services/${type}/${id}?tab=backups`,
});

export const restorationRouter = createTRPCRouter({
	list: protectedProcedure
		.input(
			z
				.object({
					serviceId: z.string().optional(),
					offset: z.number().int().min(0).default(0),
					limit: z.number().int().min(1).max(100).default(50),
					search: z.string().max(200).default(""),
					status: z
						.enum(["all", "running", "done", "error", "cancelled"])
						.default("all"),
					kind: z.enum(["all", "database", "volume", "dokploy"]).default("all"),
				})
				.default({
					offset: 0,
					limit: 50,
					search: "",
					status: "all",
					kind: "all",
				}),
		)
		.query(async ({ ctx, input }) => {
			const search = input.search.trim();
			const where = and(
				await scope(ctx),
				input.serviceId
					? eq(restorations.serviceId, input.serviceId)
					: undefined,
				input.status !== "all"
					? eq(restorations.status, input.status)
					: undefined,
				input.kind !== "all" ? eq(restorations.kind, input.kind) : undefined,
				search
					? or(
							ilike(restorations.serviceName, `%${search}%`),
							ilike(restorations.targetName, `%${search}%`),
							ilike(restorations.backupFile, `%${search}%`),
						)
					: undefined,
			);
			const [rows, totals] = await Promise.all([
				db
					.select()
					.from(restorations)
					.where(where)
					.orderBy(desc(restorations.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ total: count() }).from(restorations).where(where),
			]);
			return { rows, total: totals[0]?.total ?? 0 };
		}),
	logs: protectedProcedure
		.input(z.object({ restorationId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const restoration = await getAccessibleRestoration(
				ctx,
				input.restorationId,
			);
			try {
				return {
					restoration,
					...(await readRestorationLog(input.restorationId)),
					missing: false,
				};
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				return { restoration, text: "", truncated: false, missing: true };
			}
		}),
	startVolume: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				serviceType: z.enum(["application", "compose"]),
				destinationId: z.string().min(1),
				volumeName: z
					.string()
					.min(1)
					.regex(VOLUME_NAME_REGEX, VOLUME_NAME_MESSAGE),
				backupFileName: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await checkServicePermissionAndAccess(ctx, input.id, {
				volumeBackup: ["restore"],
			});
			const service =
				input.serviceType === "application"
					? await findApplicationById(input.id)
					: await findComposeById(input.id);
			assertOrganization(service.environment.project.organizationId, ctx);
			const destination = await findDestinationById(input.destinationId);
			assertOrganization(destination.organizationId, ctx);
			return startTrackedRestoration(
				{
					organizationId: ctx.session.activeOrganizationId,
					kind: "volume",
					...serviceMetadata(service, input.id, input.serviceType),
					targetName: input.volumeName,
					backupFile: input.backupFileName,
					destinationName: destination.name,
				},
				async (append) => {
					append(`Restoring volume: ${input.volumeName}\n`);
					const command = await restoreVolume(
						input.id,
						input.destinationId,
						input.volumeName,
						input.backupFileName,
						service.serverId || "",
						input.serviceType,
					);
					if (service.serverId)
						await execAsyncRemote(service.serverId, command, append);
					else await execAsyncStream(command, append);
				},
				collectRestorationSecrets(destination),
			);
		}),
	startDatabase: protectedProcedure
		.input(apiRestoreBackup)
		.mutation(async ({ ctx, input }) => {
			const destination = await findDestinationById(input.destinationId);
			assertOrganization(destination.organizationId, ctx);
			if (input.databaseType === "web-server") {
				if (input.backupType !== "database")
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Invalid Dokploy restoration type",
					});
				await checkPermission(ctx, { backup: ["restore"] });
				if (IS_CLOUD || !isPlatformAdmin(ctx))
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Only platform administrators can restore Dokploy",
					});
				return startTrackedRestoration(
					{
						organizationId: null,
						kind: "dokploy",
						serviceId: "web-server",
						serviceType: "web-server",
						serviceName: "Dokploy",
						serviceHref: "/dashboard/settings?tab=web-server",
						targetName: "Dokploy",
						backupFile: input.backupFile,
						destinationName: destination.name,
					},
					async (append) =>
						restoreWebServerBackup(destination, input.backupFile, (log) =>
							append(`${log}\n`),
						),
					collectRestorationSecrets(destination),
					async () => {
						await migrate(db, {
							migrationsFolder: path.join(process.cwd(), "drizzle"),
						});
						await recoverRestorationHistory();
					},
				);
			}
			await checkServicePermissionAndAccess(ctx, input.databaseId, {
				backup: ["restore"],
			});
			const onType =
				input.backupType === "compose" ? "compose" : input.databaseType;
			const service =
				onType === "compose"
					? await findComposeById(input.databaseId)
					: onType === "postgres"
						? await findPostgresById(input.databaseId)
						: onType === "mysql"
							? await findMySqlById(input.databaseId)
							: onType === "mariadb"
								? await findMariadbById(input.databaseId)
								: onType === "mongo"
									? await findMongoById(input.databaseId)
									: await findLibsqlById(input.databaseId);
			assertOrganization(service.environment.project.organizationId, ctx);
			return startTrackedRestoration(
				{
					organizationId: ctx.session.activeOrganizationId,
					kind: "database",
					...serviceMetadata(service, input.databaseId, onType),
					targetName: input.databaseName,
					backupFile: input.backupFile,
					destinationName: destination.name,
				},
				async (append) => {
					const log = (text: string) => append(`${text}\n`);
					if (onType === "compose")
						await restoreComposeBackup(
							await findComposeById(input.databaseId),
							destination,
							input,
							log,
						);
					else if (onType === "postgres")
						await restorePostgresBackup(
							await findPostgresById(input.databaseId),
							destination,
							input,
							log,
						);
					else if (onType === "mysql")
						await restoreMySqlBackup(
							await findMySqlById(input.databaseId),
							destination,
							input,
							log,
						);
					else if (onType === "mariadb")
						await restoreMariadbBackup(
							await findMariadbById(input.databaseId),
							destination,
							input,
							log,
						);
					else if (onType === "mongo")
						await restoreMongoBackup(
							await findMongoById(input.databaseId),
							destination,
							input,
							log,
						);
					else
						await restoreLibsqlBackup(
							await findLibsqlById(input.databaseId),
							destination,
							input,
							log,
						);
				},
				[
					...collectRestorationSecrets(destination),
					...collectRestorationSecrets(service),
					...collectRestorationSecrets(input.metadata),
				],
			);
		}),
});
