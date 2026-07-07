import { z } from "zod";
import {
	INVALID_HOSTNAME_MESSAGE,
	VALID_HOSTNAME_REGEX,
} from "../../utils/hostname-validation";

type DomainSettingsValidationInput = {
	https?: boolean | null;
	certificateType?: "letsencrypt" | "none" | "custom" | null;
	customCertResolver?: string | null;
	stripPath?: boolean | null;
	path?: string | null;
	internalPath?: string | null;
};

export const validateDomainSettings = (
	input: DomainSettingsValidationInput,
	ctx: z.RefinementCtx,
) => {
	if (input.https && !input.certificateType) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["certificateType"],
			message: "Required",
		});
	}

	if (
		input.https &&
		input.certificateType === "custom" &&
		!input.customCertResolver
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["customCertResolver"],
			message: "Required when certificate type is custom",
		});
	}

	// Validate stripPath requires a valid path
	if (input.stripPath && (!input.path || input.path === "/")) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["stripPath"],
			message:
				"Strip path can only be enabled when a path other than '/' is specified",
		});
	}

	// Validate internalPath starts with /
	if (
		input.internalPath &&
		input.internalPath !== "/" &&
		!input.internalPath.startsWith("/")
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["internalPath"],
			message: "Internal path must start with '/'",
		});
	}
};

export const domain = z
	.object({
		host: z
			.string()
			.min(1, { message: "Add a hostname" })
			.refine((val) => val === val.trim(), {
				message: "Domain name cannot have leading or trailing spaces",
			})
			.transform((val) => val.trim())
			.refine((val) => VALID_HOSTNAME_REGEX.test(val), {
				message: INVALID_HOSTNAME_MESSAGE,
			}),
		path: z.string().min(1).optional(),
		internalPath: z.string().optional(),
		stripPath: z.boolean().optional(),
		port: z
			.number()
			.min(1, { message: "Port must be at least 1" })
			.max(65535, { message: "Port must be 65535 or below" })
			.optional(),
		https: z.boolean().optional(),
		certificateType: z.enum(["letsencrypt", "none", "custom"]).optional(),
		customCertResolver: z.string().optional(),
		middlewares: z.array(z.string()).optional(),
	})
	.superRefine(validateDomainSettings);

export const domainCompose = z
	.object({
		host: z
			.string()
			.min(1, { message: "Add a hostname" })
			.refine((val) => val === val.trim(), {
				message: "Domain name cannot have leading or trailing spaces",
			})
			.transform((val) => val.trim())
			.refine((val) => VALID_HOSTNAME_REGEX.test(val), {
				message: INVALID_HOSTNAME_MESSAGE,
			}),
		path: z.string().min(1).optional(),
		internalPath: z.string().optional(),
		stripPath: z.boolean().optional(),
		port: z
			.number()
			.min(1, { message: "Port must be at least 1" })
			.max(65535, { message: "Port must be 65535 or below" })
			.optional(),
		https: z.boolean().optional(),
		certificateType: z.enum(["letsencrypt", "none", "custom"]).optional(),
		customCertResolver: z.string().optional(),
		serviceName: z.string().min(1, { message: "Service name is required" }),
		middlewares: z.array(z.string()).optional(),
	})
	.superRefine(validateDomainSettings);
