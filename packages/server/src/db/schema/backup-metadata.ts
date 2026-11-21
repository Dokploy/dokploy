import { z } from "zod";
import { isAllowedBackupArgument, parseBackupCommand } from "./backup-command";

export const customNameSchema = z
	.string()
	.trim()
	.max(100, "Custom name must be 100 characters or less")
	.regex(
		/^([a-zA-Z0-9][a-zA-Z0-9._-]*)?$/,
		"Must start with a letter or number; only letters, numbers, dots, hyphens and underscores are allowed",
	)
	.optional();

const shellValue = z
	.string()
	.max(16_384)
	.refine(
		(value) => !value.includes("\0"),
		"Must not contain a null character",
	);
const optionalConnectionValue = shellValue
	.transform((value) => (value === "" ? undefined : value))
	.optional();
const connection = z.object({
	databaseHost: optionalConnectionValue,
	databasePort: z.number().int().min(1).max(65535).optional(),
	databaseUser: optionalConnectionValue,
	databasePassword: optionalConnectionValue,
	additionalArgs: z
		.array(
			shellValue
				.regex(
					/^--[a-zA-Z][a-zA-Z0-9-]*(?:=[\s\S]*)?$/,
					"Use --option or --option=value, one per line",
				)
				.refine(
					(value) =>
						!/^--(?:file|format|out|archive|gzip|result-file|tab|directory)(?:=|$)/i.test(
							value,
						),
					"Dokploy manages the output format and destination",
				),
		)
		.max(100)
		.optional(),
});

const uri = (protocol: RegExp) =>
	shellValue
		.refine(
			(value) => !value || protocol.test(value),
			"Enter a connection URI with the database protocol",
		)
		.transform((value) => (value === "" ? undefined : value))
		.optional();

export const backupMetadataSchema = z
	.object({
		backupMode: z.enum(["default", "custom"]).optional(),
		postgres: connection
			.extend({
				connectionUri: uri(/^postgres(?:ql)?:\/\//),
			})
			.optional(),
		mysql: connection
			.extend({ databaseRootPassword: optionalConnectionValue })
			.optional(),
		mariadb: connection.optional(),
		mongo: connection
			.extend({
				connectionUri: uri(/^mongodb(?:\+srv)?:\/\//),
				authenticationDatabase: optionalConnectionValue,
			})
			.optional(),
		custom: z
			.object({
				script: shellValue.optional(),
			})
			.optional(),
	})
	.superRefine((metadata, ctx) => {
		for (const engine of ["postgres", "mysql", "mariadb", "mongo"] as const) {
			metadata[engine]?.additionalArgs?.forEach((argument) => {
				if (!isAllowedBackupArgument(engine, argument))
					ctx.addIssue({
						code: "custom",
						path: [engine, "additionalArgs"],
						message:
							"Unsupported dump option. Connection settings and output are managed by Dokploy.",
					});
			});
		}
	});

export type BackupMetadata = z.infer<typeof backupMetadataSchema>;

export const validateBackupConfiguration = (
	data: {
		databaseType?: string;
		backupType?: string;
		serviceName?: string | null;
		metadata?: BackupMetadata | null;
	},
	ctx: z.RefinementCtx,
) => {
	if (
		data.backupType === "compose" &&
		!["postgres", "mysql", "mariadb", "mongo"].includes(data.databaseType ?? "")
	) {
		ctx.addIssue({
			code: "custom",
			path: ["databaseType"],
			message: "Select a supported Compose database type",
		});
	}
	if (data.backupType === "compose" && !data.serviceName?.trim()) {
		ctx.addIssue({
			code: "custom",
			path: ["serviceName"],
			message: "Select a service to run the backup in",
		});
	}
	if (data.metadata?.backupMode === "custom") {
		if (data.backupType === "database") {
			ctx.addIssue({
				code: "custom",
				path: ["metadata", "backupMode"],
				message: "Custom commands require a Compose service",
			});
		}
		if (!data.metadata?.custom?.script?.trim()) {
			ctx.addIssue({
				code: "custom",
				path: ["metadata", "custom", "script"],
				message: "Enter a backup script",
			});
		} else {
			const engine = data.databaseType;
			if (
				engine !== "postgres" &&
				engine !== "mysql" &&
				engine !== "mariadb" &&
				engine !== "mongo"
			) {
				ctx.addIssue({
					code: "custom",
					path: ["databaseType"],
					message: "Select a supported database type",
				});
			} else {
				try {
					parseBackupCommand(data.metadata.custom.script, engine);
				} catch (error) {
					ctx.addIssue({
						code: "custom",
						path: ["metadata", "custom", "script"],
						message:
							error instanceof Error ? error.message : "Invalid backup command",
					});
				}
			}
		}
	}
};
