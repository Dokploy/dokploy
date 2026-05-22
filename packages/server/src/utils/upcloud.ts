import { defaultCommand } from "../setup/server-setup";

const UPCLOUD_BASE = "https://api.upcloud.com/1.3";
const UBUNTU_22_TEMPLATE_UUID = "01000000-0000-4000-8000-000030220200";

export { UBUNTU_22_TEMPLATE_UUID };

export interface DokployPlan {
	id: string;
	name: string;
	priceCents: number;
	upcloudPlan: string;
	cpus: number;
	memoryGb: number;
	storageGb: number;
}

export const DOKPLOY_PLANS: DokployPlan[] = [
	{
		id: "hobby",
		name: "Hobby",
		priceCents: 2499,
		upcloudPlan: "1xCPU-2GB",
		cpus: 1,
		memoryGb: 2,
		storageGb: 50,
	},
	{
		id: "starter",
		name: "Starter",
		priceCents: 4900,
		upcloudPlan: "2xCPU-4GB",
		cpus: 2,
		memoryGb: 4,
		storageGb: 80,
	},
	{
		id: "pro",
		name: "Pro",
		priceCents: 9900,
		upcloudPlan: "4xCPU-8GB",
		cpus: 4,
		memoryGb: 8,
		storageGb: 160,
	},
	{
		id: "business",
		name: "Business",
		priceCents: 19900,
		upcloudPlan: "HIMEM-4xCPU-16GB",
		cpus: 4,
		memoryGb: 16,
		storageGb: 320,
	},
];

function getHeaders() {
	const token = process.env.UPCLOUD_TOKEN;
	if (!token) throw new Error("UPCLOUD_TOKEN is not set");
	return {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
		Accept: "application/json",
	};
}

async function upcloudFetch<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const res = await fetch(`${UPCLOUD_BASE}${path}`, {
		...options,
		headers: { ...getHeaders(), ...(options.headers ?? {}) },
	});

	if (!res.ok) {
		let body: unknown;
		try {
			body = await res.json();
		} catch {
			body = await res.text();
		}
		const err = new Error(
			`UpCloud API error ${res.status}: ${JSON.stringify(body)}`,
		) as Error & { response: { status: number; data: unknown } };
		err.response = { status: res.status, data: body };
		throw err;
	}

	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

export interface UpCloudZone {
	id: string;
	description: string;
	public: "yes" | "no";
}

export type UpCloudZoneContinent = "Europe" | "Americas" | "Asia-Pacific";

export interface UpCloudZoneWithContinent extends UpCloudZone {
	continent: UpCloudZoneContinent;
}

const ZONE_CONTINENT: Record<string, UpCloudZoneContinent> = {
	"fi-hel1": "Europe",
	"fi-hel2": "Europe",
	"de-fra1": "Europe",
	"nl-ams1": "Europe",
	"uk-lon1": "Europe",
	"se-sto1": "Europe",
	"dk-cph1": "Europe",
	"no-svg1": "Europe",
	"pl-waw1": "Europe",
	"es-mad1": "Europe",
	"us-nyc1": "Americas",
	"us-chi1": "Americas",
	"us-sjo1": "Americas",
	"sg-sin1": "Asia-Pacific",
	"au-syd1": "Asia-Pacific",
};

export async function getUpCloudZones(): Promise<UpCloudZoneWithContinent[]> {
	const data = await upcloudFetch<{ zones: { zone: UpCloudZone[] } }>("/zone");
	return data.zones.zone
		.filter((z) => z.public === "yes" && z.id in ZONE_CONTINENT)
		.map((z) => ({ ...z, continent: ZONE_CONTINENT[z.id]! }))
		.sort(
			(a, b) =>
				a.continent.localeCompare(b.continent) ||
				a.description.localeCompare(b.description),
		);
}

export interface UpCloudServer {
	uuid: string;
	hostname: string;
	title: string;
	state: "started" | "stopped" | "maintenance" | "error";
	zone: string;
	plan: string;
	core_number: string;
	memory_amount: string;
	ip_addresses: {
		ip_address: Array<{
			access: "public" | "utility" | "private";
			address: string;
			family: "IPv4" | "IPv6";
		}>;
	};
}

export async function createUpCloudServer(params: {
	hostname: string;
	upcloudPlan: string;
	zone: string;
	sshKey: string;
}): Promise<UpCloudServer> {
	const userDataScript = `#!/bin/bash\n${defaultCommand(false)}`;

	const body = {
		server: {
			zone: params.zone,
			title: params.hostname,
			hostname: params.hostname,
			plan: params.upcloudPlan,
			firewall: "on",
			metadata: "yes",
			user_data: userDataScript,
			login_user: {
				username: "root",
				ssh_keys: {
					ssh_key: [params.sshKey],
				},
				create_password: "no",
			},
			storage_devices: {
				storage_device: [
					{
						action: "clone",
						storage: UBUNTU_22_TEMPLATE_UUID,
						title: `${params.hostname}-disk`,
						tier: "maxiops",
					},
				],
			},
		},
	};

	const data = await upcloudFetch<{ server: UpCloudServer }>("/server", {
		method: "POST",
		body: JSON.stringify(body),
	});
	return data.server;
}

export async function getUpCloudServer(uuid: string): Promise<UpCloudServer> {
	const data = await upcloudFetch<{ server: UpCloudServer }>(`/server/${uuid}`);
	return data.server;
}

export async function stopUpCloudServer(uuid: string): Promise<void> {
	await upcloudFetch(`/server/${uuid}/stop`, {
		method: "POST",
		body: JSON.stringify({ stop_server: { stop_type: "hard", timeout: "60" } }),
	});
}

export async function deleteUpCloudServer(uuid: string): Promise<void> {
	await upcloudFetch(`/server/${uuid}?storages=1&backups=delete`, {
		method: "DELETE",
	});
}

export function getPublicIPv4(server: UpCloudServer): string | undefined {
	return server.ip_addresses.ip_address.find(
		(ip) => ip.access === "public" && ip.family === "IPv4",
	)?.address;
}
