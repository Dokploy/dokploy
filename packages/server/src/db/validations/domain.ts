import { z } from "zod";

export const domainAccessRule = z
	.object({
		ruleId: z.string().optional(),
		enabled: z.boolean().optional().default(true),
		name: z.string().trim().optional(),
		priority: z.number().int().min(1).max(1000).optional().default(100),
		path: z.string().trim().optional(),
		pathType: z
			.enum(["exact", "prefix", "regexp"])
			.optional()
			.default("prefix"),
		matcherExpression: z.string().trim().optional(),
		basicAuthUsername: z.string().trim().optional(),
		basicAuthPassword: z.string().optional(),
		basicAuthPasswordHash: z.string().optional(),
		basicAuthConfigured: z.boolean().optional(),
		ipAllowList: z.array(z.string().trim().min(1)).optional().default([]),
		ipStrategyDepth: z.number().int().min(0).optional(),
		excludedIPs: z.array(z.string().trim().min(1)).optional().default([]),
	})
	.superRefine((input, ctx) => {
		if (
			input.path &&
			input.pathType !== "regexp" &&
			!input.path.startsWith("/")
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["path"],
				message: "Rule path must start with '/'",
			});
		}

		if (input.pathType === "regexp" && input.path) {
			try {
				new RegExp(input.path);
			} catch {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["path"],
					message: "Rule path must be a valid regular expression",
				});
			}
		}

		const hasUsername = !!input.basicAuthUsername?.trim();
		const hasPassword = !!input.basicAuthPassword?.trim();
		const hasConfiguredBasicAuth =
			hasUsername &&
			(!!input.basicAuthPasswordHash?.trim() ||
				input.basicAuthConfigured === true);
		const hasIpAllowList = (input.ipAllowList || []).length > 0;

		if (hasPassword && !hasUsername) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["basicAuthUsername"],
				message: "Username is required when basic auth is enabled",
			});
		}

		if (hasUsername && !hasPassword && !hasConfiguredBasicAuth) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["basicAuthPassword"],
				message: "Password is required when basic auth is enabled",
			});
		}

		if (!hasUsername && !hasPassword && !hasIpAllowList) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["basicAuthUsername"],
				message: "Add basic auth and/or IP allow list",
			});
		}

		if (!hasIpAllowList && input.ipStrategyDepth !== undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["ipStrategyDepth"],
				message: "IP strategy depth requires IP allow list entries",
			});
		}

		if (!hasIpAllowList && (input.excludedIPs || []).length > 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["excludedIPs"],
				message: "Excluded IPs require IP allow list entries",
			});
		}
	});

export type DomainAccessRule = z.infer<typeof domainAccessRule>;

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
		middlewares: z.array(z.string()).optional(),
		accessRules: z.array(domainAccessRule).optional(),
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
		middlewares: z.array(z.string()).optional(),
		accessRules: z.array(domainAccessRule).optional(),
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
	});
