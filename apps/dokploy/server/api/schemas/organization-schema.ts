import { z } from "zod";

export const organizationNameSchema = z
	.string()
	.min(1, {
		message: "Organization name is required",
	})
	.max(50, {
		message: "Organization name must be less than 50 characters",
	});

export const createOrganizationSchema = z.object({
	name: organizationNameSchema,
	logo: z.string().optional(),
});

export const updateOrganizationSchema = z.object({
	organizationId: z.string(),
	name: organizationNameSchema,
	logo: z.string().optional(),
	defaultRole: z.string().min(1).nullable().optional(),
});
