import { z } from "zod";

const TRAEFIK_RULE_UNSAFE_HOST_CHARS = /[\s`"'(){}[\]|&!;,:/\\]/;
const TRAEFIK_RULE_UNSAFE_PATH_CHARS = /[\s`"'(){}[\]|&!;\\]/;
const HOST_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const TRAEFIK_IDENTIFIER_REGEX = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/i;
const TRAEFIK_MIDDLEWARE_REFERENCE_REGEX =
	/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?(?:@file)?$/i;

const isValidTraefikHost = (host: string) => {
	if (host !== host.trim() || TRAEFIK_RULE_UNSAFE_HOST_CHARS.test(host)) {
		return false;
	}

	const isWildcard = host.startsWith("*.");
	const hostToParse = isWildcard ? host.slice(2) : host;
	if (!hostToParse || hostToParse.includes("*")) {
		return false;
	}

	try {
		const asciiHost = new URL(`http://${hostToParse}`).hostname;
		if (!asciiHost || asciiHost.length > 253 || asciiHost.endsWith(".")) {
			return false;
		}

		if (asciiHost === "localhost") {
			return true;
		}

		return asciiHost.split(".").every((label) => HOST_LABEL_REGEX.test(label));
	} catch {
		return false;
	}
};

const isValidTraefikPath = (path: string | null | undefined) => {
	if (path === null || path === undefined) {
		return true;
	}

	return (
		path.startsWith("/") &&
		path === path.trim() &&
		!TRAEFIK_RULE_UNSAFE_PATH_CHARS.test(path)
	);
};

export const domainHostSchema = z
	.string()
	.min(1, { message: "Add a hostname" })
	.refine((val) => val === val.trim(), {
		message: "Domain name cannot have leading or trailing spaces",
	})
	.refine(isValidTraefikHost, {
		message: "Invalid hostname",
	})
	.transform((val) => val.trim());

const pathSchema = z
	.string()
	.min(1)
	.refine(isValidTraefikPath, {
		message: "Path must start with '/' and cannot contain Traefik rule syntax",
	})
	.nullable()
	.optional();

const nullableTraefikIdentifierSchema = (fieldName: string) =>
	z.preprocess(
		(value) =>
			typeof value === "string" && value.trim() === "" ? null : value,
		z
			.string()
			.refine((value) => value === value.trim(), {
				message: `${fieldName} cannot have leading or trailing spaces`,
			})
			.refine((value) => TRAEFIK_IDENTIFIER_REGEX.test(value), {
				message: `${fieldName} must be a valid Traefik identifier`,
			})
			.nullable()
			.optional(),
	);

const nullableTraefikMiddlewareReferencesSchema = z.preprocess(
	(value) =>
		Array.isArray(value)
			? value.filter(
					(item) => !(typeof item === "string" && item.trim() === ""),
				)
			: value,
	z
		.array(
			z
				.string()
				.refine((value) => value === value.trim(), {
					message:
						"Middleware reference cannot have leading or trailing spaces",
				})
				.refine((value) => TRAEFIK_MIDDLEWARE_REFERENCE_REGEX.test(value), {
					message:
						"Middleware reference must be a valid Traefik identifier or @file reference",
				}),
		)
		.nullable()
		.optional(),
);

export const domain = z
	.object({
		host: domainHostSchema,
		path: pathSchema,
		internalPath: pathSchema,
		stripPath: z.boolean().optional(),
		customEntrypoint: nullableTraefikIdentifierSchema("Entrypoint"),
		port: z
			.number()
			.min(1, { message: "Port must be at least 1" })
			.max(65535, { message: "Port must be 65535 or below" })
			.nullable()
			.optional(),
		https: z.boolean().optional(),
		certificateType: z.enum(["letsencrypt", "none", "custom"]).optional(),
		customCertResolver: nullableTraefikIdentifierSchema("Certificate resolver"),
		middlewares: nullableTraefikMiddlewareReferencesSchema,
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
	});

export const domainCompose = z
	.object({
		host: domainHostSchema,
		path: pathSchema,
		internalPath: pathSchema,
		stripPath: z.boolean().optional(),
		customEntrypoint: nullableTraefikIdentifierSchema("Entrypoint"),
		port: z
			.number()
			.min(1, { message: "Port must be at least 1" })
			.max(65535, { message: "Port must be 65535 or below" })
			.nullable()
			.optional(),
		https: z.boolean().optional(),
		certificateType: z.enum(["letsencrypt", "none", "custom"]).optional(),
		customCertResolver: nullableTraefikIdentifierSchema("Certificate resolver"),
		serviceName: z.string().min(1, { message: "Service name is required" }),
		middlewares: nullableTraefikMiddlewareReferencesSchema,
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
	});
