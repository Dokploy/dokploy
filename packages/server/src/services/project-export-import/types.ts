import { serviceType } from "@dokploy/server/db/schema";
import { APP_NAME_REGEX } from "@dokploy/server/db/schema/utils";
import { z } from "zod";

export const BUNDLE_FORMAT = "dokploy-project-export" as const;
export const BUNDLE_FORMAT_VERSION = 1 as const;
export const BUNDLE_EXTENSION = ".dokploy";
export const MIN_PASSPHRASE_LENGTH = 12;
export const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;

export const serviceTypeSchema = z.enum(serviceType.enumValues);
export type ServiceType = z.infer<typeof serviceTypeSchema>;

export type Row = Record<string, unknown>;

export const bundlePayloadSchema = z.object({
	project: z.record(z.string(), z.unknown()),
	tags: z.array(z.object({ name: z.string(), color: z.string().nullable() })),
	environments: z.array(
		z
			.object({ environmentId: z.string(), name: z.string() })
			.catchall(z.unknown()),
	),
	services: z.array(
		z
			.object({
				kind: serviceTypeSchema,
				environmentId: z.string(),
				// App names become directory names on the server, so "." and ".." would escape them.
				appName: z
					.string()
					.min(1)
					.regex(APP_NAME_REGEX)
					.refine((name) => name !== "." && name !== ".."),
				name: z.string(),
			})
			.catchall(z.unknown()),
	),
	warnings: z.array(z.string()),
});
export type BundlePayload = z.infer<typeof bundlePayloadSchema>;

export const envelopeSchema = z.object({
	format: z.literal(BUNDLE_FORMAT),
	formatVersion: z.number().int().min(1),
	exportedAt: z.string(),
	projectName: z.string(),
	kdf: z.object({ salt: z.string() }),
	iv: z.string(),
	tag: z.string(),
	data: z.string(),
});
export type Envelope = z.infer<typeof envelopeSchema>;

export type BundlePreview = {
	projectName: string;
	exportedAt: string;
	environments: { name: string; services: { name: string; type: string }[] }[];
	warnings: string[];
};
