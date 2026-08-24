import {
	DescribeImagesCommand,
	DescribeInstanceTypesCommand,
	DescribeInstancesCommand,
	DescribeKeyPairsCommand,
	DescribeRegionsCommand,
	EC2Client,
	DeleteKeyPairCommand,
	ImportKeyPairCommand,
	RunInstancesCommand,
	TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import type { _InstanceType } from "@aws-sdk/client-ec2";
import {
	CloudProvider,
	type ICloudProvider,
	type Image,
	type Location,
	type ProviderCredentials,
	type ServerConfig,
	type ServerInstance,
	type ServerType,
	type SSHKey,
} from "../types";

type AwsProviderConfig = {
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
	sessionToken?: string;
};

const readConfig = (credentials: ProviderCredentials): AwsProviderConfig => {
	const config = credentials.additionalConfig as Partial<AwsProviderConfig> | undefined;

	if (!config?.accessKeyId) {
		throw new Error("AWS access key ID is required");
	}

	if (!config?.secretAccessKey) {
		throw new Error("AWS secret access key is required");
	}

	if (!config?.region) {
		throw new Error("AWS region is required");
	}

	return {
		accessKeyId: config.accessKeyId,
		secretAccessKey: config.secretAccessKey,
		region: config.region,
		sessionToken: config.sessionToken,
	};
};

const createClient = (credentials: ProviderCredentials) => {
	const config = readConfig(credentials);
	return new EC2Client({
		region: config.region,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
			sessionToken: config.sessionToken,
		},
	});
};

const paginate = async <T>(
	loadPage: (nextToken?: string) => Promise<{ items: T[]; nextToken?: string }>,
): Promise<T[]> => {
	const items: T[] = [];
	let nextToken: string | undefined;

	do {
		// eslint-disable-next-line no-await-in-loop
		const page = await loadPage(nextToken);
		items.push(...page.items);
		nextToken = page.nextToken;
	} while (nextToken);

	return items;
};

export class AwsProvider implements ICloudProvider {
	readonly name = CloudProvider.AWS;
	private readonly client: EC2Client;

	constructor(credentials: ProviderCredentials) {
		this.client = createClient(credentials);
	}

	async validateCredentials(): Promise<boolean> {
		try {
			await this.client.send(new DescribeRegionsCommand({}));
			return true;
		} catch {
			return false;
		}
	}

	async validateToken(): Promise<boolean> {
		return this.validateCredentials();
	}

	async listLocations(): Promise<Location[]> {
		const response = await this.client.send(new DescribeRegionsCommand({}));

		return (response.Regions ?? [])
			.filter((region) => region.RegionName)
			.map((region) => ({
				id: region.RegionName!,
				name: region.RegionName!,
				description: region.Endpoint
					? `AWS region endpoint ${region.Endpoint}`
					: "AWS region",
				country: "AWS",
				city: region.RegionName!,
				available: (region.OptInStatus ?? "opt-in-not-required") !== "not-opted-in",
			}));
	}

	async listServerTypes(): Promise<ServerType[]> {
		const instanceTypes = await paginate(async (nextToken) => {
			const response = await this.client.send(
				new DescribeInstanceTypesCommand({
					NextToken: nextToken,
					MaxResults: 100,
				}),
			);

			return {
				items: response.InstanceTypes ?? [],
				nextToken: response.NextToken,
			};
		});

		return instanceTypes
			.filter(
				(instanceType) =>
					instanceType.ProcessorInfo?.SupportedArchitectures?.includes("x86_64") ??
					false,
			)
			.filter((instanceType) => instanceType.InstanceType)
			.map((instanceType) => {
				const vcpu = instanceType.VCpuInfo?.DefaultVCpus ?? 0;
				const memory = instanceType.MemoryInfo?.SizeInMiB
					? Number((instanceType.MemoryInfo.SizeInMiB / 1024).toFixed(1))
					: 0;
				const disk = instanceType.InstanceStorageInfo?.TotalSizeInGB ?? 0;

				return {
					id: instanceType.InstanceType!,
					name: instanceType.InstanceType!,
					description:
						instanceType.InstanceType ??
						instanceType.VCpuInfo?.DefaultVCpus?.toString() ??
						"AWS instance type",
					cores: vcpu,
					memory,
					disk,
					priceMonthly: 0,
					priceHourly: 0,
					available: true,
				};
			})
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	async listImages(): Promise<Image[]> {
		const images = await paginate(async (nextToken) => {
			const response = await this.client.send(
				new DescribeImagesCommand({
					Owners: ["amazon"],
					NextToken: nextToken,
					MaxResults: 100,
					Filters: [
						{ Name: "state", Values: ["available"] },
						{ Name: "architecture", Values: ["x86_64"] },
					],
				}),
			);

			return {
				items: response.Images ?? [],
				nextToken: response.NextToken,
			};
		});

		return images
			.filter((image) => image.ImageId)
			.sort((left, right) =>
				(left.CreationDate ?? "").localeCompare(right.CreationDate ?? ""),
			)
			.reverse()
			.slice(0, 100)
			.map((image) => ({
				id: image.ImageId!,
				name: image.Name || image.Description || image.ImageId!,
				description: image.Description || image.Name || image.ImageId!,
				type: image.ImageType || "machine",
				osType: image.PlatformDetails || image.Architecture || "linux",
				osVersion: undefined,
			}));
	}

	async ensureSSHKey(name: string, publicKey: string): Promise<SSHKey> {
		try {
			const existing = await this.client.send(
				new DescribeKeyPairsCommand({
					KeyNames: [name],
				}),
			);

			const existingKey = (existing.KeyPairs ?? [])[0];
			if (existingKey?.KeyName) {
				return {
					id: existingKey.KeyName,
					name: existingKey.KeyName,
					publicKey,
					fingerprint: existingKey.KeyFingerprint ?? existingKey.KeyName,
				};
			}
		} catch {
			// Fall through and import a fresh key if the named one does not exist yet.
		}

		return this.createSSHKey(name, publicKey);
	}

	async createSSHKey(name: string, publicKey: string): Promise<SSHKey> {
		const response = await this.client.send(
			new ImportKeyPairCommand({
				KeyName: name,
				PublicKeyMaterial: new TextEncoder().encode(publicKey),
			}),
		);

		return {
			id: name,
			name,
			publicKey,
			fingerprint: response.KeyFingerprint ?? name,
		};
	}

	async deleteSSHKey(id: string): Promise<void> {
		await this.client.send(
			new DeleteKeyPairCommand({
				KeyName: id,
			}),
		);
	}

	async createServer(config: ServerConfig): Promise<ServerInstance> {
		const response = await this.client.send(
			new RunInstancesCommand({
				ImageId: config.image,
				InstanceType: config.serverType as _InstanceType,
				KeyName: config.sshKeyIds?.[0],
				MinCount: 1,
				MaxCount: 1,
				TagSpecifications: [
					{
						ResourceType: "instance",
						Tags: [
							{ Key: "Name", Value: config.name },
							{ Key: "created_by", Value: "dokploy" },
						],
					},
				],
			}),
		);

		const instance = response.Instances?.[0];
		if (!instance?.InstanceId) {
			throw new Error("AWS did not return an instance ID");
		}

		return {
			id: instance.InstanceId,
			name: config.name,
			status: instance.State?.Name ?? "pending",
			ipv4: instance.PublicIpAddress,
			ipv6: instance.NetworkInterfaces?.[0]?.Ipv6Addresses?.[0]?.Ipv6Address,
			created: new Date(),
		};
	}

	async getServer(id: string): Promise<ServerInstance> {
		const response = await this.client.send(
			new DescribeInstancesCommand({
				InstanceIds: [id],
			}),
		);

		const instance = response.Reservations?.[0]?.Instances?.[0];
		if (!instance?.InstanceId) {
			throw new Error(`AWS instance ${id} not found`);
		}

		return {
			id: instance.InstanceId,
			name:
				instance.Tags?.find((tag) => tag.Key === "Name")?.Value ?? instance.InstanceId,
			status: instance.State?.Name ?? "unknown",
			ipv4: instance.PublicIpAddress,
			ipv6: instance.NetworkInterfaces?.[0]?.Ipv6Addresses?.[0]?.Ipv6Address,
			created: instance.LaunchTime ?? new Date(),
		};
	}

	async waitForServer(
		id: string,
		timeout = 300000,
		onProgress?: (status: string) => void,
	): Promise<ServerInstance> {
		const startTime = Date.now();
		const pollInterval = 5000;

		while (Date.now() - startTime < timeout) {
			const server = await this.getServer(id);
			onProgress?.(server.status);

			if (server.status === "running") {
				return server;
			}

			if (server.status === "terminated" || server.status === "shutting-down") {
				throw new Error(`Server entered terminal state: ${server.status}`);
			}

			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}

		throw new Error(`Server failed to start within ${timeout}ms`);
	}

	async deleteServer(id: string): Promise<void> {
		await this.client.send(
			new TerminateInstancesCommand({
				InstanceIds: [id],
			}),
		);
	}
}
