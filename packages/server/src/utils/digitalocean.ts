const DIGITALOCEAN_BASE = "https://api.digitalocean.com/v2";
const DROPLET_IMAGE = "ubuntu-24-04-x64";

export interface DokployPlan {
	id: string;
	name: string;
	priceCents: number;
	doSize: string;
	cpus: number;
	memoryGb: number;
	storageGb: number;
}

// Sized by RAM since builds are the main consumer. Region availability differs per size family; "-intel" covers the widest set (incl. fra1).
export const DOKPLOY_PLANS: DokployPlan[] = [
	{
		id: "hobby",
		name: "Hobby",
		priceCents: 1999,
		doSize: "s-1vcpu-2gb-intel",
		cpus: 1,
		memoryGb: 2,
		storageGb: 50,
	},
	{
		id: "starter",
		name: "Starter",
		priceCents: 3999,
		doSize: "s-2vcpu-4gb-intel",
		cpus: 2,
		memoryGb: 4,
		storageGb: 80,
	},
	{
		id: "pro",
		name: "Pro",
		priceCents: 7999,
		doSize: "s-4vcpu-8gb-intel",
		cpus: 4,
		memoryGb: 8,
		storageGb: 160,
	},
	{
		id: "business",
		name: "Business",
		priceCents: 15999,
		doSize: "s-8vcpu-16gb-amd",
		cpus: 8,
		memoryGb: 16,
		storageGb: 320,
	},
];

function getHeaders() {
	const token = process.env.DIGITALOCEAN_TOKEN;
	if (!token) throw new Error("DIGITALOCEAN_TOKEN is not set");
	return {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
		Accept: "application/json",
	};
}

async function digitalOceanFetch<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const res = await fetch(`${DIGITALOCEAN_BASE}${path}`, {
		...options,
		headers: { ...getHeaders(), ...(options.headers ?? {}) },
	}).catch((err: unknown) => {
		throw new Error(
			"Couldn't reach DigitalOcean, check the network connection and try again",
			{ cause: err },
		);
	});

	if (!res.ok) {
		let body: unknown;
		try {
			body = await res.json();
		} catch {
			body = await res.text();
		}
		const detail =
			typeof body === "object" && body && "message" in body
				? String(body.message)
				: JSON.stringify(body);
		const err = new Error(
			`DigitalOcean ${options.method ?? "GET"} ${path.split("?")[0]} failed (${res.status}): ${detail}`,
		) as Error & { response: { status: number; data: unknown } };
		err.response = { status: res.status, data: body };
		throw err;
	}

	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

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
	const data = await digitalOceanFetch<{
		regions: {
			slug: string;
			name: string;
			available: boolean;
			sizes: string[];
		}[];
	}>("/regions?per_page=200");

	return data.regions
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

export interface DigitalOceanDroplet {
	id: number;
	name: string;
	status: "new" | "active" | "off" | "archive";
	created_at: string;
	region: { slug: string; name: string };
	image: { distribution: string; name: string };
	size_slug: string;
	vpc_uuid: string;
	networks: {
		v4: Array<{ ip_address: string; type: "public" | "private" }>;
	};
}

export async function createDigitalOceanSshKey(params: {
	name: string;
	publicKey: string;
}): Promise<number> {
	const data = await digitalOceanFetch<{ ssh_key: { id: number } }>(
		"/account/keys",
		{
			method: "POST",
			body: JSON.stringify({ name: params.name, public_key: params.publicKey }),
		},
	);
	return data.ssh_key.id;
}

export async function deleteDigitalOceanSshKey(id: number): Promise<void> {
	await digitalOceanFetch(`/account/keys/${id}`, { method: "DELETE" });
}

export async function createDigitalOceanVpc(params: {
	name: string;
	region: string;
}): Promise<string> {
	const data = await digitalOceanFetch<{ vpc: { id: string } }>("/vpcs", {
		method: "POST",
		body: JSON.stringify({
			name: params.name,
			region: params.region,
			description: "Dokploy cloud servers",
		}),
	});
	return data.vpc.id;
}

// DO makes the first VPC created in a region its default, and a default VPC can never be deleted.
export async function ensureDigitalOceanDefaultVpc(region: string) {
	const data = await digitalOceanFetch<{
		vpcs: { region: string; default: boolean }[];
	}>("/vpcs?per_page=200");
	if (data.vpcs.some((v) => v.region === region && v.default)) return;
	await createDigitalOceanVpc({ name: `default-${region}`, region });
}

export async function deleteDigitalOceanVpc(id: string): Promise<void> {
	await digitalOceanFetch(`/vpcs/${id}`, { method: "DELETE" });
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
	const data = await digitalOceanFetch<{ droplet: DigitalOceanDroplet }>(
		"/droplets",
		{
			method: "POST",
			body: JSON.stringify({
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
			}),
		},
	);
	return data.droplet;
}

export async function getDigitalOceanDroplet(
	id: string,
): Promise<DigitalOceanDroplet> {
	const data = await digitalOceanFetch<{ droplet: DigitalOceanDroplet }>(
		`/droplets/${id}`,
	);
	return data.droplet;
}

export async function deleteDigitalOceanDroplet(id: string): Promise<void> {
	await digitalOceanFetch(`/droplets/${id}`, { method: "DELETE" });
}

export function getCloudServerTag(cloudServerId: string) {
	return `dokploy-cs:${cloudServerId}`;
}

export async function deleteDigitalOceanDropletsByTag(
	tag: string,
): Promise<void> {
	await digitalOceanFetch(`/droplets?tag_name=${encodeURIComponent(tag)}`, {
		method: "DELETE",
	});
}

export function getPrivateIPv4(
	droplet: DigitalOceanDroplet,
): string | undefined {
	return droplet.networks.v4.find((ip) => ip.type === "private")?.ip_address;
}

export function getPublicIPv4(
	droplet: DigitalOceanDroplet,
): string | undefined {
	return droplet.networks.v4.find((ip) => ip.type === "public")?.ip_address;
}

export type DropletPowerAction =
	| "reboot"
	| "shutdown"
	| "power_on"
	| "power_off";

export interface DigitalOceanAction {
	id: number;
	status: "in-progress" | "completed" | "errored";
	type: string;
}

export async function runDigitalOceanDropletAction(
	dropletId: string,
	type: DropletPowerAction,
): Promise<DigitalOceanAction> {
	const data = await digitalOceanFetch<{ action: DigitalOceanAction }>(
		`/droplets/${dropletId}/actions`,
		{ method: "POST", body: JSON.stringify({ type }) },
	);
	return data.action;
}

export async function getDigitalOceanDropletAction(
	dropletId: string,
	actionId: number,
): Promise<DigitalOceanAction> {
	const data = await digitalOceanFetch<{ action: DigitalOceanAction }>(
		`/droplets/${dropletId}/actions/${actionId}`,
	);
	return data.action;
}

// disk: true also grows the disk to match the plan; DO can't shrink it back, so plans can only go up.
export async function resizeDigitalOceanDroplet(
	dropletId: string,
	size: string,
): Promise<DigitalOceanAction> {
	const data = await digitalOceanFetch<{ action: DigitalOceanAction }>(
		`/droplets/${dropletId}/actions`,
		{
			method: "POST",
			body: JSON.stringify({ type: "resize", size, disk: true }),
		},
	);
	return data.action;
}

type FirewallProtocol = "tcp" | "udp" | "icmp";

export interface DigitalOceanInboundRule {
	protocol: FirewallProtocol;
	ports?: string;
	sources: { addresses?: string[] };
}

const ALLOW_ALL_OUTBOUND = (["tcp", "udp", "icmp"] as const).map(
	(protocol) => ({
		protocol,
		...(protocol === "icmp" ? {} : { ports: "all" }),
		destinations: { addresses: ["0.0.0.0/0", "::/0"] },
	}),
);

const firewallBody = (params: {
	name: string;
	tag: string;
	inboundRules: DigitalOceanInboundRule[];
}) =>
	JSON.stringify({
		name: params.name,
		tags: [params.tag],
		inbound_rules: params.inboundRules,
		outbound_rules: ALLOW_ALL_OUTBOUND,
	});

// DO only creates a tag implicitly when a droplet uses it; firewalls reject tags that don't exist yet.
async function ensureDigitalOceanTag(name: string) {
	await digitalOceanFetch("/tags", {
		method: "POST",
		body: JSON.stringify({ name }),
	});
}

export async function createDigitalOceanFirewall(params: {
	name: string;
	tag: string;
	inboundRules: DigitalOceanInboundRule[];
}): Promise<string> {
	await ensureDigitalOceanTag(params.tag);
	const data = await digitalOceanFetch<{ firewall: { id: string } }>(
		"/firewalls",
		{ method: "POST", body: firewallBody(params) },
	);
	return data.firewall.id;
}

export async function getDigitalOceanFirewall(id: string) {
	const data = await digitalOceanFetch<{
		firewall: {
			id: string;
			name: string;
			status: "waiting" | "succeeded" | "failed";
			inbound_rules: DigitalOceanInboundRule[];
		};
	}>(`/firewalls/${id}`);
	return data.firewall;
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
	await digitalOceanFetch(`/firewalls/${id}`, {
		method: "PUT",
		body: firewallBody(params),
	});
}

export async function deleteDigitalOceanFirewall(id: string): Promise<void> {
	await digitalOceanFetch(`/firewalls/${id}`, { method: "DELETE" });
}
