import {
	CloudProvider,
	type ServerConfig,
	type Location,
	type ServerType,
	type Image,
} from "./types";

export type CloudProviderIconKey =
	| "hetzner"
	| "aws"
	| "digitalocean"
	| "vultr"
	| "linode";
export type CloudProviderAvailability = "supported" | "planned";
export type CloudProviderCatalogId = CloudProvider | "vultr" | "linode";

export type CloudProviderCredentialField = {
	name: string;
	label: string;
	placeholder: string;
	helpText: string;
	type: "text" | "password";
	storage: "apiToken" | "config";
	required?: boolean;
	autoComplete?: string;
};

export type CloudProviderDefinition = {
	id: CloudProviderCatalogId;
	label: string;
	description: string;
	icon: CloudProviderIconKey;
	availability: CloudProviderAvailability;
	apiTokenLabel: string;
	apiTokenPlaceholder: string;
	apiTokenHelpText: string;
	apiTokenHelpUrl?: string;
	credentialFields: CloudProviderCredentialField[];
};

const cloudProviderDefinitions = [
	{
		id: CloudProvider.HETZNER,
		label: "Hetzner",
		description: "Provision servers with Hetzner Cloud.",
		icon: "hetzner",
		availability: "supported",
		apiTokenLabel: "API Token",
		apiTokenPlaceholder: "hetzner-api-token",
		apiTokenHelpText:
			"Create a Hetzner Cloud API token with read and write permissions.",
		apiTokenHelpUrl:
			"https://docs.hetzner.com/cloud/api/getting-started/generating-api-token/",
		credentialFields: [
			{
				name: "apiToken",
				label: "API Token",
				placeholder: "hetzner-api-token",
				helpText:
					"Create a Hetzner Cloud API token with read and write permissions.",
				type: "password",
				storage: "apiToken",
				required: true,
				autoComplete: "off",
			},
		],
	},
	{
		id: CloudProvider.AWS,
		label: "AWS",
		description: "Provision EC2 instances with AWS.",
		icon: "aws",
		availability: "supported",
		apiTokenLabel: "Secret Access Key",
		apiTokenPlaceholder: "aws-secret-access-key",
		apiTokenHelpText:
			"Provide an access key ID, secret access key, and region for EC2.",
		apiTokenHelpUrl:
			"https://docs.aws.amazon.com/IAM/latest/UserGuide/security-creds.html",
		credentialFields: [
			{
				name: "accessKeyId",
				label: "Access Key ID",
				placeholder: "AKIA...",
				helpText: "The AWS access key ID used to authenticate EC2 requests.",
				type: "text",
				storage: "config",
				required: true,
				autoComplete: "off",
			},
			{
				name: "secretAccessKey",
				label: "Secret Access Key",
				placeholder: "aws-secret-access-key",
				helpText:
					"The secret access key paired with the access key ID. This is stored securely.",
				type: "password",
				storage: "apiToken",
				required: true,
				autoComplete: "off",
			},
			{
				name: "region",
				label: "Default Region",
				placeholder: "us-east-1",
				helpText:
					"The AWS region Dokploy should use when listing and provisioning EC2 resources.",
				type: "text",
				storage: "config",
				required: true,
				autoComplete: "off",
			},
			{
				name: "sessionToken",
				label: "Session Token",
				placeholder: "optional-session-token",
				helpText:
					"Optional temporary credentials token for STS-issued access keys.",
				type: "password",
				storage: "config",
				required: false,
				autoComplete: "off",
			},
		],
	},
	{
		id: CloudProvider.DIGITALOCEAN,
		label: "DigitalOcean",
		description: "Provision Droplets with DigitalOcean.",
		icon: "digitalocean",
		availability: "supported",
		apiTokenLabel: "Personal Access Token",
		apiTokenPlaceholder: "digitalocean-pat",
		apiTokenHelpText:
			"Create a personal access token with write access to Droplets and SSH keys.",
		apiTokenHelpUrl:
			"https://docs.digitalocean.com/reference/api/create-personal-access-token/",
		credentialFields: [
			{
				name: "apiToken",
				label: "Personal Access Token",
				placeholder: "digitalocean-pat",
				helpText:
					"Create a personal access token with write access to Droplets and SSH keys.",
				type: "password",
				storage: "apiToken",
				required: true,
				autoComplete: "off",
			},
		],
	},
	{
		id: "vultr",
		label: "Vultr",
		description: "Provision instances with Vultr's API.",
		icon: "vultr",
		availability: "planned",
		apiTokenLabel: "API Token",
		apiTokenPlaceholder: "vultr-api-token",
		apiTokenHelpText:
			"Vultr exposes a v2 API for creating and managing instances.",
		apiTokenHelpUrl: "https://www.vultr.com/api/",
		credentialFields: [
			{
				name: "apiToken",
				label: "API Token",
				placeholder: "vultr-api-token",
				helpText: "Create a Vultr API token with instance permissions.",
				type: "password",
				storage: "apiToken",
				required: true,
				autoComplete: "off",
			},
		],
	},
	{
		id: "linode",
		label: "Linode",
		description: "Provision Linode instances via the Akamai API.",
		icon: "linode",
		availability: "planned",
		apiTokenLabel: "Personal Access Token",
		apiTokenPlaceholder: "linode-pat",
		apiTokenHelpText:
			"Linode API v4 supports creating and managing compute instances.",
		apiTokenHelpUrl: "https://techdocs.akamai.com/linode-api/reference/post-linode-instance",
		credentialFields: [
			{
				name: "apiToken",
				label: "Personal Access Token",
				placeholder: "linode-pat",
				helpText: "Create a Linode personal access token with compute access.",
				type: "password",
				storage: "apiToken",
				required: true,
				autoComplete: "off",
			},
		],
	},
] as const satisfies readonly CloudProviderDefinition[];

export const supportedCloudProviderIds = [
	CloudProvider.HETZNER,
	CloudProvider.AWS,
	CloudProvider.DIGITALOCEAN,
] as const;

export const cloudProviderCatalogDefinitions = cloudProviderDefinitions.slice();

export const provisionableCloudProviderDefinitions = cloudProviderDefinitions.filter(
	(provider) => provider.availability === "supported",
);

export const plannedCloudProviderDefinitions = cloudProviderDefinitions.filter(
	(provider) => provider.availability === "planned",
);

export type ProvisionableCloudProviderDefinition =
	(typeof provisionableCloudProviderDefinitions)[number];

export type PlannedCloudProviderDefinition =
	(typeof plannedCloudProviderDefinitions)[number];

export const getCloudProviderDefinition = (providerId: string) =>
	cloudProviderCatalogDefinitions.find((provider) => provider.id === providerId);

export const getProviderCredentialFieldDefaults = (
	providerId: string,
): Record<string, string> => {
	const definition = getCloudProviderDefinition(providerId);

	if (!definition) {
		return {};
	}

	return definition.credentialFields.reduce<Record<string, string>>(
		(accumulator, field) => {
			accumulator[field.name] = "";
			return accumulator;
		},
		{},
	);
};

export type ProviderProvisioningMetadata = Pick<
	ServerConfig,
	"name" | "location" | "serverType" | "image" | "sshKeyIds"
> & {
	provider: string;
	region?: string;
	instanceType?: string;
	imageId?: string;
	locationId?: string;
};

export type ProviderListLocation = Location;
export type ProviderListServerType = ServerType;
export type ProviderListImage = Image;
