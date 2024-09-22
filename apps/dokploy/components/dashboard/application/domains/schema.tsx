import { UseFormGetValues } from "react-hook-form";
import { z } from "zod";

export const providersData = [
	{
		name: "S3",
		type: "s3",
		properties: [
			{
				name: "accessKey",
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
				options: ["AWS", "Ceph", "Minio", "Alibaba", "Other"],
			},
			{
				name: "storageClass",
				type: "text",
				label: "Storage Class",
				description: "S3 Storage Class, e.g., STANDARD, REDUCED_REDUNDANCY",
				required: false,
				default: "",
			},
			{
				name: "acl",
				type: "text",
				label: "ACL",
				description: "Access Control List settings for S3",
				required: false,
				default: "",
			},
		],
	},
	{
		name: "GCS",
		type: "gcs",
		properties: [
			{
				name: "serviceAccountFile",
				type: "text",
				label: "Service Account File",
				description:
					"Path to the JSON file containing your service account key",
				required: false,
				default: "",
			},
			{
				name: "clientId",
				type: "text",
				label: "Client ID",
				description:
					"Your GCS OAuth Client ID (required if Service Account File not provided)",
				required: false,
				default: "",
			},
			{
				name: "clientSecret",
				type: "password",
				label: "Client Secret",
				description:
					"Your GCS OAuth Client Secret (required if Service Account File not provided)",
				required: false,
				default: "",
			},
			{
				name: "projectNumber",
				type: "text",
				label: "Project Number",
				description:
					"Your GCS Project Number (required if Service Account File not provided)",
				required: false,
				default: "",
			},
			{
				name: "bucket",
				type: "text",
				label: "Bucket Name",
				description: "Name of the GCS bucket",
				required: true,
				default: "",
			},
			{
				name: "objectAcl",
				type: "text",
				label: "Object ACL",
				description: "Access Control List for objects uploaded to GCS",
				required: false,
				default: "",
			},
			{
				name: "bucketAcl",
				type: "text",
				label: "Bucket ACL",
				description: "Access Control List for the GCS bucket",
				required: false,
				default: "",
			},
		],
	},
	{
		name: "Azure Blob",
		type: "azureblob",
		properties: [
			{
				name: "account",
				type: "text",
				label: "Account Name",
				description: "Your Azure Storage account name",
				required: true,
				default: "",
			},
			{
				name: "key",
				type: "password",
				label: "Account Key",
				description: "Your Azure Storage account access key",
				required: true,
				default: "",
			},
			{
				name: "endpoint",
				type: "text",
				label: "Endpoint",
				description: "Custom endpoint for Azure Blob Storage (if any)",
				required: false,
				default: "",
			},
			{
				name: "container",
				type: "text",
				label: "Container Name",
				description: "Name of the Azure Blob container",
				required: true,
				default: "",
			},
		],
	},
	{
		name: "Dropbox",
		type: "dropbox",
		properties: [
			{
				name: "token",
				type: "password",
				label: "Access Token",
				description: "Your Dropbox access token",
				required: true,
				default: "",
			},
			{
				name: "path",
				type: "text",
				label: "Destination Path",
				description: "Path in Dropbox where the files will be uploaded",
				required: false,
				default: "/",
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
				label: "FTP Host",
				description: "Hostname or IP address of the FTP server",
				required: true,
				default: "",
			},
			{
				name: "port",
				type: "number",
				label: "FTP Port",
				description: "Port number of the FTP server",
				required: false,
				default: 21,
			},
			{
				name: "user",
				type: "text",
				label: "Username",
				description: "FTP username",
				required: true,
				default: "",
			},
			{
				name: "pass",
				type: "password",
				label: "Password",
				description: "FTP password",
				required: true,
				default: "",
			},
			{
				name: "secure",
				type: "checkbox",
				label: "Use FTPS",
				description: "Enable FTPS (FTP over SSL/TLS)",
				required: false,
				default: false,
			},
			{
				name: "path",
				type: "text",
				label: "Destination Path",
				description: "Remote path on the FTP server",
				required: false,
				default: "/",
			},
		],
	},
];

/**
 * S3 Provider Schema
 */
export const s3Schema = z.object({
	accessKey: z.string().nonempty({ message: "Access Key is required" }),
	secretAccessKey: z
		.string()
		.nonempty({ message: "Secret Access Key is required" }),
	region: z.string().nonempty({ message: "Region is required" }),
	endpoint: z
		.string()
		.nonempty({ message: "Endpoint is required" })
		.default("https://s3.amazonaws.com"),
	bucket: z.string().nonempty({ message: "Bucket Name is required" }),
	provider: z
		.enum(["AWS", "Ceph", "Minio", "Alibaba", "Other"])
		.optional()
		.default("AWS"),
	storageClass: z.string().optional(),
	acl: z.string().optional(),
});

/**
 * Azure Blob Storage Provider Schema
 */
export const azureBlobSchema = z.object({
	account: z.string().nonempty({ message: "Account Name is required" }),
	key: z.string().nonempty({ message: "Account Key is required" }),
	endpoint: z.string().optional(),
	container: z.string().nonempty({ message: "Container Name is required" }),
});

/**
 * Dropbox Provider Schema
 */
export const dropboxSchema = z.object({
	token: z.string().nonempty({ message: "Access Token is required" }),
	path: z.string().optional().default("/"),
});

/**
 * FTP Provider Schema
 */
export const ftpSchema = z.object({
	host: z.string().nonempty({ message: "FTP Host is required" }),
	port: z.number().optional().default(21),
	user: z.string().nonempty({ message: "Username is required" }),
	pass: z.string().nonempty({ message: "Password is required" }),
	secure: z.boolean().optional().default(false),
	path: z.string().optional().default("/"),
});

/**
 * Exporting all schemas in a single object for convenience
 */

export const providerSchemas = {
	s3: s3Schema,
	azureblob: azureBlobSchema,
	dropbox: dropboxSchema,
	ftp: ftpSchema,
};

export const getObjectSchema = (schema: z.ZodTypeAny) => {
	const initialValues: any = {};

	if (schema instanceof z.ZodObject) {
		const shape = schema._def.shape();

		for (const [key, fieldSchema] of Object.entries(shape)) {
			if ("_def" in fieldSchema && "defaultValue" in fieldSchema._def) {
				initialValues[key] = fieldSchema._def.defaultValue();
			} else {
				initialValues[key] = "";
			}
		}
	}

	return initialValues;
};

export const mergeFormValues = (
	schema: z.ZodTypeAny,
	values: Record<string, any>,
) => {
	const initialSchemaObj = getObjectSchema(schema);

	const properties: any = {};

	for (const key in values) {
		const keysMatch = Object.keys(initialSchemaObj).filter((k) => k === key);
		if (keysMatch.length === 0) {
			continue;
		}

		properties[keysMatch[0] as keyof typeof initialSchemaObj] =
			values[key] || "";
	}

	return properties;
};
