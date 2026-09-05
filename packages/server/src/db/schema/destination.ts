import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
	ADDITIONAL_FLAG_ERROR,
	ADDITIONAL_FLAG_REGEX,
	FTP_CERTIFICATE_VERIFICATION_REQUIRED_ERROR,
	FTP_TLS_CONFLICT_ERROR,
	FTP_TLS_REQUIRED_ERROR,
	getFtpTlsState,
	hasDisabledFtpCertificateVerification,
	hasSftpHostKeyVerification,
	isNamedRcloneDestinationProvider,
	RCLONE_DESTINATION_PROVIDERS,
	RCLONE_REMOTE_NAME_ERROR,
	RCLONE_REMOTE_NAME_REGEX,
	SFTP_HOST_KEY_REQUIRED_ERROR,
} from "../validations/destination";
import { organization } from "./account";
import { backups } from "./backups";

export const destinations = pgTable("destination", {
	destinationId: text("destinationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	provider: text("provider"),
	accessKey: text("accessKey").notNull(),
	secretAccessKey: text("secretAccessKey").notNull(),
	bucket: text("bucket").notNull(),
	region: text("region").notNull(),
	endpoint: text("endpoint").notNull(),
	additionalFlags: text("additionalFlags").array(),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const destinationsRelations = relations(
	destinations,
	({ many, one }) => ({
		backups: many(backups),
		organization: one(organization, {
			fields: [destinations.organizationId],
			references: [organization.id],
		}),
	}),
);

const createSchema = createInsertSchema(destinations, {
	destinationId: z.string(),
	name: z.string().min(1),
	provider: z.string(),
	accessKey: z.string(),
	bucket: z.string(),
	endpoint: z.string(),
	secretAccessKey: z.string(),
	region: z.string(),
	additionalFlags: z
		.array(z.string().regex(ADDITIONAL_FLAG_REGEX, ADDITIONAL_FLAG_ERROR))
		.default([]),
});

const validateDestination = (
	data: {
		provider?: string | null;
		accessKey?: string;
		region?: string;
		endpoint?: string;
		additionalFlags?: string[] | null;
	},
	ctx: z.RefinementCtx,
) => {
	if (isNamedRcloneDestinationProvider(data.provider)) {
		const remoteName = data.endpoint?.trim() || "";
		if (!RCLONE_REMOTE_NAME_REGEX.test(remoteName)) {
			ctx.addIssue({
				code: "custom",
				path: ["endpoint"],
				message: RCLONE_REMOTE_NAME_ERROR,
			});
		}
		return;
	}

	if (
		data.provider === RCLONE_DESTINATION_PROVIDERS.FTP ||
		data.provider === RCLONE_DESTINATION_PROVIDERS.SFTP
	) {
		if (!data.endpoint?.trim()) {
			ctx.addIssue({
				code: "custom",
				path: ["endpoint"],
				message: "Host is required",
			});
		}
		if (!data.accessKey?.trim()) {
			ctx.addIssue({
				code: "custom",
				path: ["accessKey"],
				message: "Username is required",
			});
		}
		if (data.region?.trim()) {
			const port = Number(data.region);
			if (!Number.isInteger(port) || port < 1 || port > 65535) {
				ctx.addIssue({
					code: "custom",
					path: ["region"],
					message: "Port must be an integer between 1 and 65535",
				});
			}
		}
	}

	if (data.provider === RCLONE_DESTINATION_PROVIDERS.FTP) {
		const { implicitTlsEnabled, explicitTlsEnabled } = getFtpTlsState(
			data.additionalFlags,
		);

		if (!implicitTlsEnabled && !explicitTlsEnabled) {
			ctx.addIssue({
				code: "custom",
				path: ["additionalFlags"],
				message: FTP_TLS_REQUIRED_ERROR,
			});
		}
		if (implicitTlsEnabled && explicitTlsEnabled) {
			ctx.addIssue({
				code: "custom",
				path: ["additionalFlags"],
				message: FTP_TLS_CONFLICT_ERROR,
			});
		}
		if (hasDisabledFtpCertificateVerification(data.additionalFlags)) {
			ctx.addIssue({
				code: "custom",
				path: ["additionalFlags"],
				message: FTP_CERTIFICATE_VERIFICATION_REQUIRED_ERROR,
			});
		}
	}

	if (
		data.provider === RCLONE_DESTINATION_PROVIDERS.SFTP &&
		!hasSftpHostKeyVerification(data.additionalFlags)
	) {
		ctx.addIssue({
			code: "custom",
			path: ["additionalFlags"],
			message: SFTP_HOST_KEY_REQUIRED_ERROR,
		});
	}
};

export const apiCreateDestination = createSchema
	.pick({
		name: true,
		provider: true,
		accessKey: true,
		bucket: true,
		region: true,
		endpoint: true,
		secretAccessKey: true,
		additionalFlags: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	})
	.superRefine(validateDestination);

export const apiFindOneDestination = z.object({
	destinationId: z.string().min(1),
});

export const apiRemoveDestination = createSchema
	.pick({
		destinationId: true,
	})
	.required();

export const apiUpdateDestination = createSchema
	.pick({
		name: true,
		accessKey: true,
		bucket: true,
		region: true,
		endpoint: true,
		secretAccessKey: true,
		destinationId: true,
		provider: true,
		additionalFlags: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	})
	.superRefine(validateDestination);
