import {
    apiCreateDestination,
    apiUpdateDestination,
} from "@dokploy/server/db/schema";
import { execFileSync } from "node:child_process";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { findDestinationById } from "./destination";

const obscureRclonePassword = (password: string) => {
    try {
        return execFileSync("rclone", ["obscure", password], {
            encoding: "utf8",
        }).trim();
    } catch {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Error obscuring destination password",
        });
    }
};

const ftpCredentialsSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    host: z.string().min(1),
    port: z.string().min(1),
    path: z.string().min(1),
});

const ftpCredentialsUpdateSchema = ftpCredentialsSchema.extend({
    password: z.string().optional(),
});

const s3CredentialsSchema = z.object({
    provider: z.string().optional().nullable(),
    accessKey: z.string().min(1),
    secretAccessKey: z.string().min(1),
    bucket: z.string().min(1),
    region: z.string(),
    endpoint: z.string().min(1),
});

const apiCreateFtpOrSftpDestination = z.object({
    ...apiCreateDestination.shape,
    type: z.literal("ftp").or(z.literal("sftp")),
    ...ftpCredentialsSchema.shape,
});

const apiCreateS3AnyDestination = z.object({
    ...apiCreateDestination.shape,
    type: z.literal("s3"),
    ...s3CredentialsSchema.shape,
});

const apiUpdateFtpOrSftpDestination = z.object({
    ...apiUpdateDestination.shape,
    type: z.literal("ftp").or(z.literal("sftp")),
    ...ftpCredentialsUpdateSchema.shape,
});

const apiUpdateS3AnyDestination = z.object({
    ...apiUpdateDestination.shape,
    type: z.literal("s3"),
    ...s3CredentialsSchema.shape,
});

export const apiCreateAnyDestination = z.discriminatedUnion("type", [
    apiCreateFtpOrSftpDestination,
    apiCreateS3AnyDestination,
]);

export const apiUpdateAnyDestination = z.discriminatedUnion("type", [
    apiUpdateFtpOrSftpDestination,
    apiUpdateS3AnyDestination,
]);

export type DestinationRcloneConfig = {
    flags: string[];
    destinationPrefix: string;
    destinationPathPrefix: string;
};

export type DestinationCredentials = Record<string, unknown>;

type DestinationType = z.infer<typeof apiCreateAnyDestination>["type"];
type AnyCreateInput = z.infer<typeof apiCreateAnyDestination>;
type AnyUpdateInput = z.infer<typeof apiUpdateAnyDestination>;
type FtpOrSftpCreateInput = Extract<AnyCreateInput, { type: "ftp" | "sftp" }>;
type S3CreateInput = Extract<AnyCreateInput, { type: "s3" }>;
type FtpOrSftpUpdateInput = Extract<AnyUpdateInput, { type: "ftp" | "sftp" }>;
type S3UpdateInput = Extract<AnyUpdateInput, { type: "s3" }>;

type FtpCredentials = z.infer<typeof ftpCredentialsSchema>;
type S3Credentials = z.infer<typeof s3CredentialsSchema>;

type DestinationAdapter<TType extends DestinationType, TDetails> = {
    type: TType;
    create: (
        input: Extract<AnyCreateInput, { type: TType }>,
        destinationId: string,
    ) => Promise<void>;
    testCommand: (
        input: Extract<AnyCreateInput, { type: TType }>,
    ) => Promise<string>;
    update: (
        destinationId: string,
        input: Extract<AnyUpdateInput, { type: TType }>,
    ) => Promise<void>;
    getRcloneConfig: (credentials: TDetails) => DestinationRcloneConfig;
    extractCredentials: (
        input: Extract<AnyCreateInput | AnyUpdateInput, { type: TType }>,
    ) => DestinationCredentials;
};

const destinationAdapters = {
    ftp: {
        type: "ftp",
        create: async () => {},
        testCommand: async (input: FtpOrSftpCreateInput) => {
            const obscuredPassword = obscureRclonePassword(input.password);
            const rcloneFlags = [
                `--ftp-host="${input.host}"`,
                `--ftp-port="${input.port}"`,
                `--ftp-user="${input.username}"`,
                `--ftp-pass="${obscuredPassword}"`,
            ];
            if (input.additionalFlags?.length) {
                rcloneFlags.push(...input.additionalFlags);
            }
            return `rclone lsd ${rcloneFlags.join(" ")} :ftp:${input.path || "/"}`;
        },
        update: async () => {},
        getRcloneConfig: (credentials: FtpCredentials) => {
            const obscuredPassword = obscureRclonePassword(credentials.password);
            return {
                flags: [
                    `--ftp-host="${credentials.host}"`,
                    `--ftp-port="${credentials.port}"`,
                    `--ftp-user="${credentials.username}"`,
                    `--ftp-pass="${obscuredPassword}"`,
                ],
                destinationPrefix: "ftp",
                destinationPathPrefix: credentials.path,
            };
        },
        extractCredentials: (input: FtpOrSftpCreateInput | FtpOrSftpUpdateInput) => {
            const password = input.password?.trim();

            return {
                username: input.username,
                host: input.host,
                port: input.port,
                path: input.path,
                ...(password ? { password: obscureRclonePassword(password) } : {}),
            };
        },
    } satisfies DestinationAdapter<"ftp", FtpCredentials>,
    sftp: {
        type: "sftp",
        create: async () => {},
        testCommand: async (input: FtpOrSftpCreateInput) => {
            const obscuredPassword = obscureRclonePassword(input.password);
            const rcloneFlags = [
                `--sftp-host="${input.host}"`,
                `--sftp-port="${input.port}"`,
                `--sftp-user="${input.username}"`,
                `--sftp-pass="${obscuredPassword}"`,
            ];
            if (input.additionalFlags?.length) {
                rcloneFlags.push(...input.additionalFlags);
            }
            return `rclone lsd ${rcloneFlags.join(" ")} :sftp:${input.path || "/"}`;
        },
        update: async () => {},
        getRcloneConfig: (credentials: FtpCredentials) => {
            const obscuredPassword = obscureRclonePassword(credentials.password);
            return {
                flags: [
                    `--sftp-host="${credentials.host}"`,
                    `--sftp-port="${credentials.port}"`,
                    `--sftp-user="${credentials.username}"`,
                    `--sftp-pass="${obscuredPassword}"`,
                ],
                destinationPrefix: "sftp",
                destinationPathPrefix: credentials.path,
            };
        },
        extractCredentials: (input: FtpOrSftpCreateInput | FtpOrSftpUpdateInput) => {
            const password = input.password?.trim();

            return {
                username: input.username,
                host: input.host,
                port: input.port,
                path: input.path,
                ...(password ? { password: obscureRclonePassword(password) } : {}),
            };
        },
    } satisfies DestinationAdapter<"sftp", FtpCredentials>,
    s3: {
        type: "s3",
        create: async () => {},
        testCommand: async (input: S3CreateInput) => {
            const flags = [
                `--s3-access-key-id="${input.accessKey}"`,
                `--s3-secret-access-key="${input.secretAccessKey}"`,
                `--s3-region="${input.region}"`,
                `--s3-endpoint="${input.endpoint}"`,
                "--s3-no-check-bucket",
                "--s3-force-path-style",
                "--retries 1",
                "--low-level-retries 1",
                "--timeout 10s",
                "--contimeout 5s",
            ];

            if (input.provider) {
                flags.unshift(`--s3-provider="${input.provider}"`);
            }
            if (input.additionalFlags?.length) {
                flags.push(...input.additionalFlags);
            }

            return `rclone ls ${flags.join(" ")} ":s3:${input.bucket}"`;
        },
        update: async () => {},
        getRcloneConfig: (credentials: S3Credentials) => {
            const flags = [
                `--s3-access-key-id="${credentials.accessKey}"`,
                `--s3-secret-access-key="${credentials.secretAccessKey}"`,
                `--s3-region="${credentials.region}"`,
                `--s3-endpoint="${credentials.endpoint}"`,
                "--s3-no-check-bucket",
                "--s3-force-path-style",
            ];

            if (credentials.provider) {
                flags.unshift(`--s3-provider="${credentials.provider}"`);
            }

            return {
                flags,
                destinationPrefix: "s3",
                destinationPathPrefix: credentials.bucket,
            };
        },
        extractCredentials: (input: S3CreateInput | S3UpdateInput) => ({
            provider: input.provider,
            accessKey: input.accessKey,
            secretAccessKey: input.secretAccessKey,
            bucket: input.bucket,
            region: input.region,
            endpoint: input.endpoint,
        }),
    } satisfies DestinationAdapter<"s3", S3Credentials>,
};

export type SupportedDestinationType = keyof typeof destinationAdapters;
export type DestinationDetails = {
    destination: Awaited<ReturnType<typeof findDestinationById>>;
} & Record<string, unknown>;

export const getDestinationAdapter = <TType extends SupportedDestinationType>(type: TType) => {
    const adapter = destinationAdapters[type];
    if (!adapter) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unsupported destination type: ${type}`,
        });
    }
    return adapter;
};

export const getDestinationRcloneConfig = (
    type: SupportedDestinationType,
    credentials: Record<string, unknown>,
) => {
    const adapter = getDestinationAdapter(type);
    return adapter.getRcloneConfig(credentials as never);
};
