import createClient from "openapi-fetch";
import type { components, paths } from "./digitalocean-api";

const DROPLET_IMAGE = "ubuntu-24-04-x64";

export interface DokployPlan {
	id: string;
	name: string;
	priceCents: number;
	doSize: string;
	cpus: number;
	memoryGb: number;
	storageGb: number;
	transferTb: number;
}

// Sized by RAM since builds are the main consumer. Region availability differs per size family; "-intel" covers the widest set (incl. fra1).
export const EXTRA_BANDWIDTH_CENTS_PER_GB = 3;

export const DOKPLOY_PLANS: DokployPlan[] = [
	{
		id: "hobby",
		name: "Hobby",
		priceCents: 1999,
		doSize: "s-1vcpu-2gb-intel",
		cpus: 1,
		memoryGb: 2,
		storageGb: 50,
		transferTb: 2,
	},
	{
		id: "starter",
		name: "Starter",
		priceCents: 3999,
		doSize: "s-2vcpu-4gb-intel",
		cpus: 2,
		memoryGb: 4,
		storageGb: 80,
		transferTb: 4,
	},
	{
		id: "pro",
		name: "Pro",
		priceCents: 7999,
		doSize: "s-4vcpu-8gb-intel",
		cpus: 4,
		memoryGb: 8,
		storageGb: 160,
		transferTb: 5,
	},
	{
		id: "business",
		name: "Business",
		priceCents: 15999,
		doSize: "s-8vcpu-16gb-amd",
		cpus: 8,
		memoryGb: 16,
		storageGb: 320,
		transferTb: 6,
	},
];

const digitalOcean = createClient<paths>({
	baseUrl: "https://api.digitalocean.com",
	fetch: (request) => fetch(request),
});

digitalOcean.use({
	onRequest({ request }) {
		const token = process.env.DIGITALOCEAN_TOKEN;
		if (!token) throw new Error("DIGITALOCEAN_TOKEN is not set");
		request.headers.set("Authorization", `Bearer ${token}`);
		return request;
	},
	onError: ({ error }) =>
		new Error(
			"Couldn't reach DigitalOcean, check the network connection and try again",
			{ cause: error },
		),
	async onResponse({ request, response }) {
		if (response.ok) return;
		const data = await response.json().catch(() => null);
		const { pathname } = new URL(request.url);
		throw Object.assign(
			new Error(
				`DigitalOcean ${request.method} ${pathname} failed (${response.status}): ${data?.message ?? response.statusText}`,
			),
			{ response: { status: response.status, data } },
		);
	},
});

export type DigitalOceanRegionContinent =
	| "Europe"
	| "Americas"
	| "Asia-Pacific";

export interface DigitalOceanRegion {
	id: string;
	description: string;
	continent: DigitalOceanRegionContinent;
	countryCode: string;
	plans: string[];
}

const REGIONS: Record<
	string,
	{ continent: DigitalOceanRegionContinent; countryCode: string; name: string }
> = {
	ams3: { continent: "Europe", countryCode: "NL", name: "Amsterdam 3" },
	fra1: { continent: "Europe", countryCode: "DE", name: "Frankfurt 1" },
	lon1: { continent: "Europe", countryCode: "GB", name: "London 1" },
	nyc1: { continent: "Americas", countryCode: "US", name: "New York 1" },
	nyc2: { continent: "Americas", countryCode: "US", name: "New York 2" },
	nyc3: { continent: "Americas", countryCode: "US", name: "New York 3" },
	sfo2: { continent: "Americas", countryCode: "US", name: "San Francisco 2" },
	sfo3: { continent: "Americas", countryCode: "US", name: "San Francisco 3" },
	tor1: { continent: "Americas", countryCode: "CA", name: "Toronto 1" },
	atl1: { continent: "Americas", countryCode: "US", name: "Atlanta 1" },
	sgp1: { continent: "Asia-Pacific", countryCode: "SG", name: "Singapore 1" },
	blr1: { continent: "Asia-Pacific", countryCode: "IN", name: "Bangalore 1" },
	syd1: { continent: "Asia-Pacific", countryCode: "AU", name: "Sydney 1" },
};

export function getRegionInfo(slug: string) {
	return REGIONS[slug] ?? null;
}

export async function getDigitalOceanRegions(): Promise<DigitalOceanRegion[]> {
	const { data } = await digitalOcean.GET("/v2/regions", {
		params: { query: { per_page: 200 } },
	});

	return data!.regions
		.filter((r) => r.available && r.slug in REGIONS)
		.map((r) => ({
			id: r.slug,
			description: r.name,
			continent: REGIONS[r.slug]!.continent,
			countryCode: REGIONS[r.slug]!.countryCode,
			plans: DOKPLOY_PLANS.filter((p) => r.sizes.includes(p.doSize)).map(
				(p) => p.id,
			),
		}))
		.filter((r) => r.plans.length > 0)
		.sort(
			(a, b) =>
				a.continent.localeCompare(b.continent) ||
				a.description.localeCompare(b.description),
		);
}

export type DigitalOceanDroplet = components["schemas"]["droplet"];

export async function createDigitalOceanSshKey(params: {
	name: string;
	publicKey: string;
}): Promise<number> {
	const { data } = await digitalOcean.POST("/v2/account/keys", {
		body: { name: params.name, public_key: params.publicKey },
	});
	return data!.ssh_key!.id!;
}

export async function deleteDigitalOceanSshKey(id: number): Promise<void> {
	await digitalOcean.DELETE("/v2/account/keys/{ssh_key_identifier}", {
		params: { path: { ssh_key_identifier: id } },
	});
}

export async function createDigitalOceanVpc(params: {
	name: string;
	region: string;
}): Promise<string> {
	const { data } = await digitalOcean.POST("/v2/vpcs", {
		body: {
			name: params.name,
			region: params.region,
			description: "Dokploy cloud servers",
		},
	});
	return data!.vpc!.id!;
}

// DO makes the first VPC created in a region its default, and a default VPC can never be deleted.
export async function ensureDigitalOceanDefaultVpc(region: string) {
	const perPage = 200;
	for (let page = 1; ; page++) {
		const { data } = await digitalOcean.GET("/v2/vpcs", {
			params: { query: { per_page: perPage, page } },
		});
		const vpcs = data?.vpcs ?? [];
		if (vpcs.some((v) => v.region === region && v.default)) return;
		if (vpcs.length < perPage) break;
	}
	await createDigitalOceanVpc({ name: `default-${region}`, region });
}

export async function getDigitalOceanVpcRange(id: string): Promise<string> {
	const { data } = await digitalOcean.GET("/v2/vpcs/{vpc_id}", {
		params: { path: { vpc_id: id } },
	});
	return data!.vpc!.ip_range!;
}

export async function deleteDigitalOceanVpc(id: string): Promise<void> {
	await digitalOcean.DELETE("/v2/vpcs/{vpc_id}", {
		params: { path: { vpc_id: id } },
	});
}

export async function createDigitalOceanDroplet(params: {
	name: string;
	size: string;
	region: string;
	vpcId: string;
	sshKeyId: number;
	organizationId: string;
	cloudServerId: string;
}): Promise<DigitalOceanDroplet> {
	const { data } = await digitalOcean.POST("/v2/droplets", {
		body: {
			name: params.name,
			region: params.region,
			size: params.size,
			image: DROPLET_IMAGE,
			vpc_uuid: params.vpcId,
			ssh_keys: [params.sshKeyId],
			monitoring: true,
			tags: [
				"dokploy-managed",
				`org:${params.organizationId}`,
				getCloudServerTag(params.cloudServerId),
			],
		},
	});
	const { droplet } = data as { droplet: DigitalOceanDroplet };
	await assignDropletToProject(droplet.id);
	return droplet;
}

async function assignDropletToProject(dropletId: number) {
	const projectId = process.env.DIGITALOCEAN_PROJECT_ID;
	if (!projectId) return;
	await digitalOcean
		.POST("/v2/projects/{project_id}/resources", {
			params: { path: { project_id: projectId } },
			body: { resources: [`do:droplet:${dropletId}`] },
		})
		.catch((err) =>
			console.error("[cloud-server] failed to assign droplet to project:", err),
		);
}

export async function getDigitalOceanDroplet(
	id: string,
): Promise<DigitalOceanDroplet> {
	const { data } = await digitalOcean.GET("/v2/droplets/{droplet_id}", {
		params: { path: { droplet_id: Number(id) } },
	});
	return data!.droplet!;
}

export async function getDigitalOceanDropletCount(): Promise<number> {
	const { data } = await digitalOcean.GET("/v2/droplets", {
		params: { query: { per_page: 1 } },
	});
	return data!.meta.total!;
}

export async function deleteDigitalOceanDroplet(id: string): Promise<void> {
	await digitalOcean.DELETE("/v2/droplets/{droplet_id}", {
		params: { path: { droplet_id: Number(id) } },
	});
}

export async function getDigitalOceanDropletOutboundBytes(
	dropletId: string,
	start: Date,
	end: Date,
) {
	const { data } = await digitalOcean.GET(
		"/v2/monitoring/metrics/droplet/bandwidth",
		{
			params: {
				query: {
					host_id: dropletId,
					interface: "public",
					direction: "outbound",
					start: String(Math.floor(start.getTime() / 1000)),
					end: String(Math.floor(end.getTime() / 1000)),
				},
			},
		},
	);
	const samples = data!.data.result[0]?.values ?? [];
	let megabits = 0;
	for (let i = 1; i < samples.length; i++) {
		const seconds = Number(samples[i]![0]) - Number(samples[i - 1]![0]);
		megabits += Number(samples[i]![1]) * seconds;
	}
	return Math.round((megabits * 1_000_000) / 8);
}

export function getCloudServerTag(cloudServerId: string) {
	return `dokploy-cs:${cloudServerId}`;
}

export async function deleteDigitalOceanDropletsByTag(
	tag: string,
): Promise<void> {
	await digitalOcean.DELETE("/v2/droplets", {
		params: { query: { tag_name: tag } },
	});
}

export function getPrivateIPv4(
	droplet: DigitalOceanDroplet,
): string | undefined {
	return droplet.networks.v4?.find((ip) => ip.type === "private")?.ip_address;
}

export function getPublicIPv4(
	droplet: DigitalOceanDroplet,
): string | undefined {
	return droplet.networks.v4?.find((ip) => ip.type === "public")?.ip_address;
}

export type DropletPowerAction =
	| "reboot"
	| "shutdown"
	| "power_on"
	| "power_off";

const toAction = (action: components["schemas"]["action"]) => ({
	...action,
	id: action.id!,
});

const postDropletAction = async (
	dropletId: string,
	body: { type: DropletPowerAction | "resize"; size?: string; disk?: boolean },
) => {
	const { data } = await digitalOcean.POST(
		"/v2/droplets/{droplet_id}/actions",
		{
			params: { path: { droplet_id: Number(dropletId) } },
			// The generated type loses the action types the spec maps through a discriminator (reboot, resize...).
			body: body as never,
		},
	);
	return toAction(data!.action!);
};

export const runDigitalOceanDropletAction = (
	dropletId: string,
	type: DropletPowerAction,
) => postDropletAction(dropletId, { type });

export async function getDigitalOceanDropletAction(
	dropletId: string,
	actionId: number,
) {
	const { data } = await digitalOcean.GET(
		"/v2/droplets/{droplet_id}/actions/{action_id}",
		{
			params: {
				path: { droplet_id: Number(dropletId), action_id: actionId },
			},
		},
	);
	return toAction(data!.action!);
}

// disk: true also grows the disk to match the plan; DO can't shrink it back, so plans can only go up.
export const resizeDigitalOceanDroplet = (dropletId: string, size: string) =>
	postDropletAction(dropletId, { type: "resize", size, disk: true });

export type DigitalOceanInboundRule = NonNullable<
	components["schemas"]["firewall_rules"]["inbound_rules"]
>[number];

const ALLOW_ALL_OUTBOUND = (["tcp", "udp", "icmp"] as const).map(
	(protocol) => ({
		protocol,
		ports: protocol === "icmp" ? "0" : "all",
		destinations: { addresses: ["0.0.0.0/0", "::/0"] },
	}),
);

const firewallBody = (params: {
	name: string;
	tag: string;
	inboundRules: DigitalOceanInboundRule[];
}) => ({
	name: params.name,
	tags: [params.tag],
	inbound_rules: params.inboundRules,
	outbound_rules: ALLOW_ALL_OUTBOUND,
});

// DO only creates a tag implicitly when a droplet uses it; firewalls reject tags that don't exist yet.
async function ensureDigitalOceanTag(name: string) {
	await digitalOcean.POST("/v2/tags", { body: { name } });
}

export async function createDigitalOceanFirewall(params: {
	name: string;
	tag: string;
	inboundRules: DigitalOceanInboundRule[];
}): Promise<string> {
	await ensureDigitalOceanTag(params.tag);
	const { data } = await digitalOcean.POST("/v2/firewalls", {
		body: firewallBody(params),
	});
	return data!.firewall!.id!;
}

export async function getDigitalOceanFirewall(id: string) {
	const { data } = await digitalOcean.GET("/v2/firewalls/{firewall_id}", {
		params: { path: { firewall_id: id } },
	});
	return data!.firewall!;
}

// DO replaces the whole firewall on PUT, so name, tags and outbound rules have to be sent again.
export async function updateDigitalOceanFirewall(
	id: string,
	params: {
		name: string;
		tag: string;
		inboundRules: DigitalOceanInboundRule[];
	},
) {
	await digitalOcean.PUT("/v2/firewalls/{firewall_id}", {
		params: { path: { firewall_id: id } },
		body: firewallBody(params),
	});
}

export async function deleteDigitalOceanFirewall(id: string): Promise<void> {
	await digitalOcean.DELETE("/v2/firewalls/{firewall_id}", {
		params: { path: { firewall_id: id } },
	});
}
