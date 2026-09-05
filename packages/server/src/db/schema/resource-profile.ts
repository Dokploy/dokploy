import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { compose } from "./compose";

export const resourceGroup = pgTable(
	"resource_group",
	{
		groupId: text("groupId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text("name").notNull(),
		description: text("description"),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		createdAt: timestamp("createdAt").notNull().defaultNow(),
	},
	(table) => [
		unique("resource_group_org_name_unique").on(
			table.organizationId,
			table.name,
		),
	],
);

export const resourceProfile = pgTable(
	"resource_profile",
	{
		profileId: text("profileId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text("name").notNull(),
		memoryReservation: text("memoryReservation"),
		memoryLimit: text("memoryLimit"),
		cpuReservation: text("cpuReservation"),
		cpuLimit: text("cpuLimit"),
		groupId: text("groupId")
			.notNull()
			.references(() => resourceGroup.groupId, { onDelete: "cascade" }),
		createdAt: timestamp("createdAt").notNull().defaultNow(),
	},
	(table) => [
		index("resourceProfile_groupId_idx").on(table.groupId),
		unique("resource_profile_group_name_unique").on(table.groupId, table.name),
	],
);

export const composeServiceResourceProfile = pgTable(
	"compose_service_resource_profile",
	{
		composeServiceId: text("composeServiceId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		composeId: text("composeId")
			.notNull()
			.references(() => compose.composeId, { onDelete: "cascade" }),
		serviceName: text("serviceName").notNull(),
		profileId: text("profileId").references(() => resourceProfile.profileId, {
			onDelete: "set null",
		}),
		memoryReservation: text("memoryReservation"),
		memoryLimit: text("memoryLimit"),
		cpuReservation: text("cpuReservation"),
		cpuLimit: text("cpuLimit"),
	},
	(table) => [
		unique("compose_service_unique").on(table.composeId, table.serviceName),
		index("composeServiceProfile_profileId_idx").on(table.profileId),
	],
);

export const resourceGroupRelations = relations(
	resourceGroup,
	({ many, one }) => ({
		profiles: many(resourceProfile),
		organization: one(organization, {
			fields: [resourceGroup.organizationId],
			references: [organization.id],
		}),
	}),
);

export const resourceProfileRelations = relations(
	resourceProfile,
	({ one }) => ({
		group: one(resourceGroup, {
			fields: [resourceProfile.groupId],
			references: [resourceGroup.groupId],
		}),
	}),
);

const resourceFields = {
	memoryReservation: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v === "" ? null : v)),
	memoryLimit: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v === "" ? null : v)),
	cpuReservation: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v === "" ? null : v)),
	cpuLimit: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v === "" ? null : v)),
};

export const apiCreateResourceGroup = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
});

export const apiUpdateResourceGroup = z.object({
	groupId: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
});

export const apiFindOneResourceGroup = z.object({
	groupId: z.string().min(1),
});

export const apiRemoveResourceGroup = z.object({
	groupId: z.string().min(1),
});

export const apiCreateResourceProfile = z.object({
	name: z.string().min(1),
	groupId: z.string().min(1),
	...resourceFields,
});

export const apiUpdateResourceProfile = z.object({
	profileId: z.string().min(1),
	name: z.string().optional(),
	...resourceFields,
});

export const apiFindOneResourceProfile = z.object({
	profileId: z.string().min(1),
});

export const apiRemoveResourceProfile = z.object({
	profileId: z.string().min(1),
});

export const apiAssignComposeServiceProfile = z.object({
	composeId: z.string().min(1),
	serviceName: z.string().min(1),
	profileId: z.string().nullable().optional(),
	...resourceFields,
});

export const apiRemoveComposeServiceProfile = z.object({
	composeServiceId: z.string().min(1),
});
