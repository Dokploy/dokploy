import { db } from "@dokploy/server/db";
import {
	type apiCreateTemplateRegistry,
	type apiUpdateTemplateRegistry,
	templateRegistry,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { fetchTemplatesList } from "../templates/github";

export type TemplateRegistry = typeof templateRegistry.$inferSelect;

const DEFAULT_REGISTRY_URL = "https://templates.dokploy.com";
const DEFAULT_REGISTRY_NAME = "Dokploy Official";

export const createTemplateRegistry = async (
	input: typeof apiCreateTemplateRegistry._type,
	organizationId: string,
) => {
	// Validate the registry URL by trying to fetch templates
	try {
		const templates = await fetchTemplatesList(input.baseUrl);
		const templateCount = templates.length.toString();

		const newRegistry = await db
			.insert(templateRegistry)
			.values({
				...input,
				organizationId,
				templateCount,
				lastSyncAt: new Date().toISOString(),
			})
			.returning()
			.then((value) => value[0]);

		if (!newRegistry) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating template registry",
			});
		}

		return newRegistry;
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to validate registry URL: ${(error as Error).message}`,
		});
	}
};

export const findTemplateRegistryById = async (templateRegistryId: string) => {
	const result = await db.query.templateRegistry.findFirst({
		where: eq(templateRegistry.templateRegistryId, templateRegistryId),
	});

	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Template registry not found",
		});
	}

	return result;
};

export const findTemplateRegistriesByOrganizationId = async (
	organizationId: string,
) => {
	const registries = await db.query.templateRegistry.findMany({
		where: eq(templateRegistry.organizationId, organizationId),
		orderBy: (tr, { desc }) => [desc(tr.isDefault), desc(tr.createdAt)],
	});

	return registries;
};

export const findEnabledTemplateRegistries = async (organizationId: string) => {
	const registries = await db.query.templateRegistry.findMany({
		where: and(
			eq(templateRegistry.organizationId, organizationId),
			eq(templateRegistry.isEnabled, true),
		),
		orderBy: (tr, { desc }) => [desc(tr.isDefault), desc(tr.createdAt)],
	});

	return registries;
};

export const updateTemplateRegistry = async (
	input: typeof apiUpdateTemplateRegistry._type,
) => {
	const { templateRegistryId, ...rest } = input;

	const registry = await findTemplateRegistryById(templateRegistryId);

	// If updating baseUrl, validate it
	if (rest.baseUrl && rest.baseUrl !== registry.baseUrl) {
		try {
			await fetchTemplatesList(rest.baseUrl);
		} catch (error) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Failed to validate registry URL: ${(error as Error).message}`,
			});
		}
	}

	const result = await db
		.update(templateRegistry)
		.set(rest)
		.where(eq(templateRegistry.templateRegistryId, templateRegistryId))
		.returning()
		.then((res) => res[0]);

	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Template registry not found",
		});
	}

	return result;
};

export const removeTemplateRegistry = async (templateRegistryId: string) => {
	const registry = await findTemplateRegistryById(templateRegistryId);

	if (registry.isDefault) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Cannot delete the default registry",
		});
	}

	const result = await db
		.delete(templateRegistry)
		.where(eq(templateRegistry.templateRegistryId, templateRegistryId))
		.returning()
		.then((res) => res[0]);

	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Template registry not found",
		});
	}

	return result;
};

export const toggleTemplateRegistry = async (
	templateRegistryId: string,
	isEnabled: boolean,
) => {
	const result = await db
		.update(templateRegistry)
		.set({ isEnabled })
		.where(eq(templateRegistry.templateRegistryId, templateRegistryId))
		.returning()
		.then((res) => res[0]);

	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Template registry not found",
		});
	}

	return result;
};

export const syncTemplateRegistry = async (templateRegistryId: string) => {
	const registry = await findTemplateRegistryById(templateRegistryId);

	try {
		const templates = await fetchTemplatesList(registry.baseUrl);

		const result = await db
			.update(templateRegistry)
			.set({
				templateCount: templates.length.toString(),
				lastSyncAt: new Date().toISOString(),
			})
			.where(eq(templateRegistry.templateRegistryId, templateRegistryId))
			.returning()
			.then((res) => res[0]);

		return result;
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to sync registry: ${(error as Error).message}`,
		});
	}
};

export const ensureDefaultRegistry = async (organizationId: string) => {
	// Check if default registry exists
	const existingDefault = await db.query.templateRegistry.findFirst({
		where: and(
			eq(templateRegistry.organizationId, organizationId),
			eq(templateRegistry.isDefault, true),
		),
	});

	if (existingDefault) {
		return existingDefault;
	}

	// Create default registry
	try {
		const templates = await fetchTemplatesList(DEFAULT_REGISTRY_URL);

		const newRegistry = await db
			.insert(templateRegistry)
			.values({
				name: DEFAULT_REGISTRY_NAME,
				description: "Official Dokploy template registry",
				baseUrl: DEFAULT_REGISTRY_URL,
				isDefault: true,
				isEnabled: true,
				organizationId,
				templateCount: templates.length.toString(),
				lastSyncAt: new Date().toISOString(),
			})
			.returning()
			.then((value) => value[0]);

		return newRegistry;
	} catch (error) {
		// If we can't fetch templates, still create the registry but without count
		const newRegistry = await db
			.insert(templateRegistry)
			.values({
				name: DEFAULT_REGISTRY_NAME,
				description: "Official Dokploy template registry",
				baseUrl: DEFAULT_REGISTRY_URL,
				isDefault: true,
				isEnabled: true,
				organizationId,
			})
			.returning()
			.then((value) => value[0]);

		return newRegistry;
	}
};

