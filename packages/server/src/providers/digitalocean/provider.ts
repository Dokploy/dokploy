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

type DigitalOceanConfig = {
	baseUrl?: string;
};

type DigitalOceanRegion = {
	slug: string;
	name: string;
	available: boolean;
	sizes: string[];
};

type DigitalOceanSize = {
	slug: string;
	memory: number;
	vcpus: number;
	disk: number;
	price_monthly: number;
	price_hourly: number;
	regions: string[];
	available: boolean;
	transfer: number;
};

type DigitalOceanImage = {
	id: number;
	name: string;
	distribution?: string;
	description?: string;
	type: string;
	slug?: string;
	status?: string;
	regions?: string[];
};

type DigitalOceanKey = {
	id: number;
	name: string;
	public_key: string;
	fingerprint: string;
};

type DigitalOceanDroplet = {
	id: number;
	name: string;
	status: string;
	networks?: {
		v4?: Array<{ ip_address: string; type: string }>;
		v6?: Array<{ ip_address: string; type: string }>;
	};
	created_at: string;
};

const readConfig = (credentials: ProviderCredentials) => {
	if (!credentials.apiToken) {
		throw new Error("DigitalOcean token is required");
	}

	return {
		baseUrl: "https://api.digitalocean.com",
		...(credentials.additionalConfig as DigitalOceanConfig | undefined),
	};
};

export class DigitalOceanProvider implements ICloudProvider {
	readonly name = CloudProvider.DIGITALOCEAN;
	private readonly apiToken: string;
	private readonly baseUrl: string;

	constructor(credentials: ProviderCredentials) {
		const config = readConfig(credentials);
		this.apiToken = credentials.apiToken;
		this.baseUrl = config.baseUrl ?? "https://api.digitalocean.com";
	}

	private async request<T>(
		path: string,
		options: RequestInit = {},
	): Promise<T> {
		const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
		const response = await fetch(url, {
			...options,
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
				"Content-Type": "application/json",
				...options.headers,
			},
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(
				`DigitalOcean API error: ${response.status} - ${JSON.stringify(error)}`,
			);
		}

		return response.json() as Promise<T>;
	}

	private async paginate<TItem>(
		path: string,
		key: string,
	): Promise<TItem[]> {
		const items: TItem[] = [];
		let nextPath: string | undefined = path;

		while (nextPath) {
			// eslint-disable-next-line no-await-in-loop
			const page: any = await this.request(nextPath);
			items.push(...((page[key] as TItem[] | undefined) ?? []));
			nextPath = page.links?.pages?.next;
		}

		return items;
	}

	async validateCredentials(): Promise<boolean> {
		try {
			await this.request("/v2/account");
			return true;
		} catch {
			return false;
		}
	}

	async validateToken(): Promise<boolean> {
		return this.validateCredentials();
	}

	async listLocations(): Promise<Location[]> {
		const regions = await this.paginate<DigitalOceanRegion>(
			"/v2/regions?per_page=200",
			"regions",
		);

		return regions.map((region) => ({
			id: region.slug,
			name: region.name,
			description: `DigitalOcean region ${region.name}`,
			country: "DigitalOcean",
			city: region.slug,
			available: region.available,
		}));
	}

	async listServerTypes(): Promise<ServerType[]> {
		const sizes = await this.paginate<DigitalOceanSize>(
			"/v2/sizes?per_page=200",
			"sizes",
		);

		return sizes.map((size) => ({
			id: size.slug,
			name: size.slug,
			description: `${size.vcpus} vCPU, ${size.memory} MB RAM, ${size.disk} GB disk`,
			cores: size.vcpus,
			memory: Number((size.memory / 1024).toFixed(1)),
			disk: size.disk,
			priceMonthly: size.price_monthly,
			priceHourly: size.price_hourly,
			available: size.available,
		}));
	}

	async listImages(): Promise<Image[]> {
		const images = await this.paginate<DigitalOceanImage>(
			"/v2/images?type=distribution&per_page=200",
			"images",
		);

		return images
			.filter((image) => image.status !== "archive")
			.map((image) => ({
				id: image.slug ?? String(image.id),
				name: image.name || image.slug || String(image.id),
				description: image.description || image.distribution || image.name,
				type: image.type,
				osType: image.distribution || "linux",
				osVersion: undefined,
			}));
	}

	async ensureSSHKey(name: string, publicKey: string): Promise<SSHKey> {
		const keys = await this.paginate<DigitalOceanKey>(
			"/v2/account/keys?per_page=200",
			"ssh_keys",
		);
		const existing = keys.find((key) => key.public_key === publicKey);

		if (existing) {
			return {
				id: String(existing.id),
				name: existing.name,
				publicKey: existing.public_key,
				fingerprint: existing.fingerprint,
			};
		}

		return this.createSSHKey(name, publicKey);
	}

	async createSSHKey(name: string, publicKey: string): Promise<SSHKey> {
		const response = await this.request<{ ssh_key: DigitalOceanKey }>(
			"/v2/account/keys",
			{
				method: "POST",
				body: JSON.stringify({
					name,
					public_key: publicKey,
				}),
			},
		);

		const sshKey = response.ssh_key;
		return {
			id: String(sshKey.id),
			name: sshKey.name,
			publicKey: sshKey.public_key,
			fingerprint: sshKey.fingerprint,
		};
	}

	async deleteSSHKey(id: string): Promise<void> {
		await this.request(`/v2/account/keys/${id}`, {
			method: "DELETE",
		});
	}

	async createServer(config: ServerConfig): Promise<ServerInstance> {
		const response = await this.request<{ droplet: DigitalOceanDroplet }>(
			"/v2/droplets",
			{
				method: "POST",
				body: JSON.stringify({
					name: config.name,
					region: config.location,
					size: config.serverType,
					image: config.image,
					ssh_keys: config.sshKeyIds ?? [],
					monitoring: true,
					tags: ["dokploy"],
				}),
			},
		);

		const droplet = response.droplet;
		return {
			id: String(droplet.id),
			name: droplet.name,
			status: droplet.status,
			ipv4:
				droplet.networks?.v4?.find((network) => network.type === "public")
					?.ip_address,
			ipv6:
				droplet.networks?.v6?.find((network) => network.type === "public")
					?.ip_address,
			created: new Date(droplet.created_at),
		};
	}

	async getServer(id: string): Promise<ServerInstance> {
		const response = await this.request<{ droplet: DigitalOceanDroplet }>(
			`/v2/droplets/${id}`,
		);
		const droplet = response.droplet;

		return {
			id: String(droplet.id),
			name: droplet.name,
			status: droplet.status,
			ipv4:
				droplet.networks?.v4?.find((network) => network.type === "public")
					?.ip_address,
			ipv6:
				droplet.networks?.v6?.find((network) => network.type === "public")
					?.ip_address,
			created: new Date(droplet.created_at),
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

			if (server.status === "active") {
				return server;
			}

			if (server.status === "off" || server.status === "errored") {
				throw new Error(`Server entered terminal state: ${server.status}`);
			}

			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}

		throw new Error(`Server failed to start within ${timeout}ms`);
	}

	async deleteServer(id: string): Promise<void> {
		await this.request(`/v2/droplets/${id}`, {
			method: "DELETE",
		});
	}
}
