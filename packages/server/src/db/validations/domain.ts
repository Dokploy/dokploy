import { z } from "zod";

export const domain = z
	.object({
		host: z
			.string()
			.min(1, { message: "Add a hostname" })
			.refine((val) => val === val.trim(), {
				message: "Domain name cannot have leading or trailing spaces",
			})
			.transform((val) => val.trim()),
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
		customCertResolver: z.string(),
	})
	.superRefine((input, ctx) => {
		if (input.https && !input.certificateType) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["certificateType"],
				message: "Required",
			});
		}

		if (input.certificateType === "custom" && !input.customCertResolver) {
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

		// Validate wildcard domain format
		if (input.host.includes("*")) {
			// Check if wildcard is only at the beginning of a subdomain
			if (!input.host.match(/^\*\./)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["host"],
					message:
						"Wildcard domains must start with '*.' (e.g., '*.example.com' or '*.sub.example.com')",
				});
			}
			// Check if there are multiple wildcards
			if ((input.host.match(/\*/g) || []).length > 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["host"],
					message: "Only one wildcard is allowed per domain",
				});
			}
			// Check if wildcard is in the middle or end (not at start of subdomain)
			if (input.host.includes("*") && !input.host.match(/^\*\./)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["host"],
					message:
						"Wildcard must be at the beginning of a subdomain (e.g., '*.example.com' or '*.sub.example.com')",
				});
			}
		}
	});

export const domainCompose = z
	.object({
		host: z
			.string()
			.min(1, { message: "Add a hostname" })
			.refine((val) => val === val.trim(), {
				message: "Domain name cannot have leading or trailing spaces",
			})
			.transform((val) => val.trim()),
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
		customCertResolver: z.string(),
		serviceName: z.string().min(1, { message: "Service name is required" }),
	})
	.superRefine((input, ctx) => {
		if (input.https && !input.certificateType) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["certificateType"],
				message: "Required",
			});
		}

		if (input.certificateType === "custom" && !input.customCertResolver) {
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

		// Validate wildcard domain format
		if (input.host.includes("*")) {
			// Check if wildcard is only at the beginning of a subdomain
			if (!input.host.match(/^\*\./)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["host"],
					message:
						"Wildcard domains must start with '*.' (e.g., '*.example.com' or '*.sub.example.com')",
				});
			}
			// Check if there are multiple wildcards
			if ((input.host.match(/\*/g) || []).length > 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["host"],
					message: "Only one wildcard is allowed per domain",
				});
			}
			// Check if wildcard is in the middle or end (not at start of subdomain)
			if (input.host.includes("*") && !input.host.match(/^\*\./)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["host"],
					message:
						"Wildcard must be at the beginning of a subdomain (e.g., '*.example.com' or '*.sub.example.com')",
				});
			}
		}
	});
