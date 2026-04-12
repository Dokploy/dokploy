import { S3_PROVIDERS } from "./constants";

export type DestinationType = "s3" | "ftp" | "sftp";

export type DestinationProperty = {
    name: string;
    type: "text" | "password" | "number" | "select";
    label: string;
    description: string;
    required: boolean;
    default: string;
    hideOnEdit?: boolean;
    skipUpdateIfEmpty?: boolean;
    options?: Array<{
        key: string;
        name: string;
    }>;
};

export type DestinationSchema = {
    name: string;
    type: DestinationType;
    properties: DestinationProperty[];
};

export const DESTINATION_SCHEMAS: DestinationSchema[] = [
    {
        name: "S3",
        type: "s3",
        properties: [
            {
                name: "accessKeyId",
                type: "text",
                label: "Access Key",
                description: "Your S3 Access Key",
                required: true,
                default: "",
            },
            {
                name: "secretAccessKey",
                type: "password",
                label: "Secret Access Key",
                description: "Your S3 Secret Access Key",
                required: true,
                default: "",
            },
            {
                name: "region",
                type: "text",
                label: "Region",
                description: "AWS Region, e.g., us-east-1",
                required: true,
                default: "",
            },
            {
                name: "endpoint",
                type: "text",
                label: "Endpoint",
                description: "S3 Endpoint URL",
                required: true,
                default: "https://s3.amazonaws.com",
            },
            {
                name: "bucket",
                type: "text",
                label: "Bucket Name",
                description: "Name of the S3 bucket",
                required: true,
                default: "",
            },
            {
                name: "provider",
                type: "select",
                label: "S3 Provider",
                description: "Select your S3 provider",
                required: false,
                default: "AWS",
                options: S3_PROVIDERS,
            },
        ],
    },
    {
        name: "FTP",
        type: "ftp",
        properties: [
            {
                name: "host",
                type: "text",
                label: "Host",
                description: "FTP server hostname",
                required: true,
                default: "",
            },
            {
                name: "port",
                type: "number",
                label: "Port",
                description: "FTP server port",
                required: true,
                default: "21",
            },
            {
                name: "username",
                type: "text",
                label: "Username",
                description: "FTP username",
                required: true,
                default: "",
            },
            {
                name: "password",
                type: "password",
                label: "Password",
                description: "FTP password",
                required: true,
                default: "",
                hideOnEdit: true,
                skipUpdateIfEmpty: true,
            },
            {
                name: "path",
                type: "text",
                label: "Path",
                description: "Remote backup path",
                required: true,
                default: "/",
            },
        ],
    },
    {
        name: "SFTP",
        type: "sftp",
        properties: [
            {
                name: "host",
                type: "text",
                label: "Host",
                description: "SFTP server hostname",
                required: true,
                default: "",
            },
            {
                name: "port",
                type: "number",
                label: "Port",
                description: "SFTP server port",
                required: true,
                default: "22",
            },
            {
                name: "username",
                type: "text",
                label: "Username",
                description: "SFTP username",
                required: true,
                default: "",
            },
            {
                name: "password",
                type: "password",
                label: "Password",
                description: "SFTP password",
                required: true,
                default: "",
                hideOnEdit: true,
                skipUpdateIfEmpty: true,
            },
            {
                name: "path",
                type: "text",
                label: "Path",
                description: "Remote backup path",
                required: true,
                default: "/",
            },
        ],
    },
];
